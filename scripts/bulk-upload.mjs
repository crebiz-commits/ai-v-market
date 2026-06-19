// ════════════════════════════════════════════════════════════════════════════
// CREAITE 영상 일괄 업로드 (2026-06-20)
//
// 카테고리/장르 폴더에 영상을 넣고 한 번에 Bunny 업로드 + DB 등록까지.
// 웹 업로드와 100% 동일한 경로(Edge Function)를 그대로 탄다 → Bunny 키 불필요(서버 보관).
//
//   폴더 구조:  videos/<카테고리>/<장르>/<제목>.mp4
//               videos/<카테고리>/<장르>/<제목>.txt   ← TopView 프롬프트(선택, 제목/설명 단서)
//   예:         videos/영화/SF/도시침몰.mp4 + 도시침몰.txt
//
//   제목·설명·태그·등급은 videos/manifest.json 에서 읽음(Claude가 .txt 보고 작성).
//   manifest 항목이 없으면 → 파일명을 제목으로, 옆 .txt를 설명/프롬프트로 폴백.
//
//   카테고리(형식 6): 영화 드라마 애니메이션 다큐멘터리 뮤직비디오 기타
//   장르(분위기 11):  SF 액션 로맨스 공포 판타지 스릴러 드라마 코미디 자연·풍경 추상 기타
//   등급:             all 13 15 19   (13 = 화면표기 12+)
//
// 사용:
//   1) .env.bulk 작성 (.env.bulk.example 복사)
//   2) videos/ 에 영상+txt 배치
//   3) (선택) Claude에게 "manifest 만들어줘" → videos/manifest.json 생성
//   4) npm run bulk-upload            (실제 업로드)
//      npm run bulk-upload -- --dry-run   (미리보기, 네트워크 X)
//
// 멱등: videos/.uploaded.json 에 완료분 기록 → 재실행 시 건너뜀.
// ════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DRY_RUN = process.argv.includes("--dry-run");

// ── 설정 로드 (.env.bulk — 간단 파서) ────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(ROOT, ".env.bulk");
  const env = { ...process.env };
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      env[m[1]] = v;
    }
  }
  return env;
}
const ENV = loadEnv();

const SUPABASE_URL = ENV.SUPABASE_URL || "https://tvbpiuwmvrccfnplhwer.supabase.co";
const ANON_KEY = ENV.SUPABASE_ANON_KEY || "";
const FN_BASE = `${SUPABASE_URL}/functions/v1/server`;
const VIDEOS_DIR = path.resolve(ROOT, ENV.VIDEOS_DIR || "videos");
const BUNNY_HOSTNAME = ENV.BUNNY_HOSTNAME || ""; // 없으면 vz-<libraryId>.b-cdn.net 폴백
const DEFAULT_AI_TOOL = ENV.DEFAULT_AI_TOOL || "Seedance 2.0";

const VALID_CATEGORIES = ["영화", "드라마", "애니메이션", "다큐멘터리", "뮤직비디오", "기타"];
const VALID_GENRES = ["SF", "액션", "로맨스", "공포", "판타지", "스릴러", "드라마", "코미디", "자연·풍경", "추상", "기타"];
const VALID_AGES = ["all", "13", "15", "19"];
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

// ── 유틸 ─────────────────────────────────────────────────────────────────────
const c = {
  g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`,
  y: (s) => `\x1b[33m${s}\x1b[0m`, dim: (s) => `\x1b[2m${s}\x1b[0m`, b: (s) => `\x1b[1m${s}\x1b[0m`,
};
function fail(msg) { console.error(c.r("✗ " + msg)); process.exit(1); }
// Windows 에디터가 붙이는 BOM 제거 후 읽기
function readText(p) { return fs.readFileSync(p, "utf8").replace(/^﻿/, ""); }
function fmtDur(sec) {
  if (!sec || sec <= 0) return "0:00";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ffprobe 로 길이·해상도 (없으면 0 — OTT 자동분류엔 길이가 필요하므로 ffmpeg 설치 권장)
let ffprobeWarned = false;
function probe(file) {
  const res = spawnSync("ffprobe", [
    "-v", "error", "-select_streams", "v:0",
    "-show_entries", "stream=width,height:format=duration",
    "-of", "json", file,
  ], { encoding: "utf8" });
  if (res.error || res.status !== 0) {
    if (!ffprobeWarned) {
      console.warn(c.y("⚠ ffprobe 없음 → 영상 길이/해상도 미설정(0). OTT 자동분류·길이배지엔 ffmpeg 설치 권장."));
      ffprobeWarned = true;
    }
    return { durationSeconds: 0, resolution: "" };
  }
  try {
    const j = JSON.parse(res.stdout);
    const dur = Math.round(parseFloat(j.format?.duration || "0")) || 0;
    const w = j.streams?.[0]?.width, h = j.streams?.[0]?.height;
    return { durationSeconds: dur, resolution: w && h ? `${w}x${h}` : "" };
  } catch { return { durationSeconds: 0, resolution: "" }; }
}

// 재귀로 영상 파일 수집
function walkVideos(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) out.push(...walkVideos(full));
    else if (VIDEO_EXT.has(path.extname(name).toLowerCase())) out.push(full);
  }
  return out;
}

// ── Supabase 인증 (이메일/비번 권장 — 토큰 자동 갱신) ─────────────────────────
// anon key 있을 때만 생성(dry-run은 키 없이도 동작) — createClient 는 빈 키에서 throw
const supabase = ANON_KEY
  ? createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  : null;
let _session = null;
async function authenticate() {
  if (ENV.BULK_EMAIL && ENV.BULK_PASSWORD) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: ENV.BULK_EMAIL, password: ENV.BULK_PASSWORD,
    });
    if (error) fail(`로그인 실패(이메일/비번): ${error.message}`);
    _session = data.session;
    console.log(c.g(`✓ 로그인: ${data.user.email}`));
  } else if (ENV.BULK_ACCESS_TOKEN) {
    const { data, error } = await supabase.auth.setSession({
      access_token: ENV.BULK_ACCESS_TOKEN,
      refresh_token: ENV.BULK_REFRESH_TOKEN || "",
    });
    if (error || !data.session) fail(`토큰 설정 실패: ${error?.message || "세션 없음"}. 만료됐을 수 있음 → 이메일/비번 권장.`);
    _session = data.session;
    const { data: u } = await supabase.auth.getUser();
    console.log(c.g(`✓ 토큰 인증: ${u?.user?.email || "(이메일 미확인)"}`));
  } else {
    fail("인증 정보 없음. .env.bulk 에 BULK_EMAIL+BULK_PASSWORD (권장) 또는 BULK_ACCESS_TOKEN 설정.");
  }
}
// 만료 임박 시 갱신 후 토큰 반환
async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_session?.expires_at && _session.expires_at - now < 120 && _session.refresh_token) {
    const { data, error } = await supabase.auth.refreshSession({ refresh_token: _session.refresh_token });
    if (!error && data.session) _session = data.session;
  }
  return _session?.access_token;
}
function fnHeaders(token) {
  return { "Authorization": `Bearer ${token}`, "apikey": ANON_KEY, "Content-Type": "application/json" };
}

// ── Bunny TUS 업로드 (bunnyUpload.ts 와 동일 흐름) ────────────────────────────
const TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
async function tusUpload(file, auth) {
  const buf = fs.readFileSync(file);
  const authHeaders = {
    AuthorizationSignature: auth.tusSignature,
    AuthorizationExpire: String(auth.tusExpire),
    VideoId: auth.videoId,
    LibraryId: auth.libraryId,
    "Tus-Resumable": "1.0.0",
  };
  const createRes = await fetch(TUS_ENDPOINT, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Upload-Length": String(buf.length),
      "Upload-Metadata": `filetype ${Buffer.from("video/mp4").toString("base64")}`,
    },
  });
  if (createRes.status !== 201) {
    throw new Error(`TUS 세션 생성 실패 (${createRes.status}) ${await createRes.text().catch(() => "")}`);
  }
  const location = createRes.headers.get("Location");
  if (!location) throw new Error("TUS Location 헤더 없음");
  const uploadUrl = new URL(location, TUS_ENDPOINT).toString();

  const patchRes = await fetch(uploadUrl, {
    method: "PATCH",
    headers: { ...authHeaders, "Upload-Offset": "0", "Content-Type": "application/offset+octet-stream" },
    body: buf,
  });
  if (patchRes.status !== 204 && patchRes.status !== 200) {
    throw new Error(`TUS 업로드 실패 (${patchRes.status})`);
  }
}

// ── 시리즈 캐시(이름→id) ────────────────────────────────────────────────────
const seriesIdByTitle = new Map();
async function ensureSeries(title, genre) {
  if (seriesIdByTitle.has(title)) return seriesIdByTitle.get(title);
  // 기존 시리즈 재사용
  const { data: mine } = await supabase.rpc("get_my_series");
  const found = (mine || []).find((s) => s.title === title);
  if (found) { seriesIdByTitle.set(title, found.id); return found.id; }
  // 새로 생성
  const { data: newId, error } = await supabase.rpc("create_series", { p_title: title, p_genre: genre || null });
  if (error || !newId) throw new Error(`시리즈 생성 실패(${title}): ${error?.message || "no id"}`);
  seriesIdByTitle.set(title, newId);
  return newId;
}

// ── 메인 ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(c.b("\n━━ CREAITE 일괄 업로드 ━━") + (DRY_RUN ? c.y("  [DRY-RUN 미리보기]") : ""));

  const files = walkVideos(VIDEOS_DIR);
  if (files.length === 0) fail(`영상 없음: ${VIDEOS_DIR}  (videos/<카테고리>/<장르>/*.mp4 구조로 넣어주세요)`);

  // manifest 로드
  const manifestPath = path.join(VIDEOS_DIR, "manifest.json");
  let manifest = {};
  if (fs.existsSync(manifestPath)) {
    const raw = JSON.parse(readText(manifestPath));
    const items = Array.isArray(raw) ? raw : raw.items || [];
    for (const it of items) if (it.file) manifest[it.file.replace(/\\/g, "/")] = it;
    console.log(c.dim(`manifest: ${Object.keys(manifest).length}개 항목`));
  } else {
    console.log(c.y("manifest.json 없음 → 파일명/옆 .txt 폴백으로 진행"));
  }

  // 완료 기록
  const uploadedPath = path.join(VIDEOS_DIR, ".uploaded.json");
  const uploaded = fs.existsSync(uploadedPath) ? JSON.parse(readText(uploadedPath)) : {};
  const saveUploaded = () => fs.writeFileSync(uploadedPath, JSON.stringify(uploaded, null, 2));

  // 항목 구성
  const plan = [];
  for (const file of files) {
    const rel = path.relative(VIDEOS_DIR, file).replace(/\\/g, "/");
    const seg = rel.split("/");
    const category = seg.length >= 3 ? seg[0] : (seg.length === 2 ? seg[0] : "");
    const genre = seg.length >= 3 ? seg[1] : "";
    const base = path.basename(file, path.extname(file));
    const txtPath = path.join(path.dirname(file), base + ".txt");
    const promptTxt = fs.existsSync(txtPath) ? readText(txtPath).trim() : "";

    const m = manifest[rel] || {};
    const item = {
      file, rel,
      title: m.title || base,
      description: m.description || promptTxt.split(/\r?\n/)[0] || "",
      tags: m.tags || "",
      category: m.category || category,
      genre: m.genre || genre,
      age_rating: VALID_AGES.includes(m.age_rating) ? m.age_rating : "all",
      aiTool: m.aiTool || DEFAULT_AI_TOOL,
      prompt: m.prompt || promptTxt,
      series: m.series || null, // { title, season?, episode? }
    };
    plan.push(item);
  }

  // 검증 리포트
  let warned = 0;
  for (const it of plan) {
    const probs = [];
    if (!VALID_CATEGORIES.includes(it.category)) probs.push(`카테고리'${it.category || "?"}'`);
    if (!VALID_GENRES.includes(it.genre)) probs.push(`장르'${it.genre || "?"}'`);
    const done = uploaded[it.rel] ? c.g(" [완료]") : "";
    console.log(`${probs.length ? c.y("⚠") : c.g("•")} ${it.rel}${done}`);
    console.log(c.dim(`    제목: ${it.title}  | ${it.category}/${it.genre} | ${it.age_rating}${it.series ? ` | 시리즈:${it.series.title} ${it.series.episode || "?"}화` : ""}`));
    if (probs.length) { console.log(c.y(`    ↳ 확인필요: ${probs.join(", ")} — 폴더명을 정확한 분류로(아래 목록)`)); warned++; }
  }
  if (warned) {
    console.log(c.y(`\n카테고리: ${VALID_CATEGORIES.join(" ")}`));
    console.log(c.y(`장르:     ${VALID_GENRES.join(" ")}`));
  }

  if (DRY_RUN) {
    console.log(c.b(`\n총 ${plan.length}개 (완료 ${Object.keys(uploaded).length}개 제외하고 업로드 예정). --dry-run 이라 실제 업로드 안 함.`));
    return;
  }

  if (!ANON_KEY) fail("SUPABASE_ANON_KEY 미설정 (.env.bulk).");
  await authenticate();

  let ok = 0, skip = 0, errc = 0;
  for (const it of plan) {
    if (uploaded[it.rel]) { skip++; continue; }
    if (!VALID_CATEGORIES.includes(it.category) || !VALID_GENRES.includes(it.genre)) {
      console.log(c.r(`✗ 건너뜀(분류 오류): ${it.rel}`)); errc++; continue;
    }
    const sizeMB = (fs.statSync(it.file).size / 1048576).toFixed(0);
    process.stdout.write(c.dim(`↑ ${it.rel} (${sizeMB}MB) … `));
    try {
      const token = await getToken();
      // 1) Bunny 슬롯 + TUS 서명
      const cuRes = await fetch(`${FN_BASE}/videos/create-upload`, {
        method: "POST", headers: fnHeaders(token), body: JSON.stringify({ title: it.title }),
      });
      if (!cuRes.ok) throw new Error(`create-upload ${cuRes.status}: ${(await cuRes.json().catch(() => ({}))).error || ""}`);
      const { videoId, libraryId, tusSignature, tusExpire } = await cuRes.json();

      // 2) Bunny 업로드
      await tusUpload(it.file, { videoId, libraryId, tusSignature, tusExpire });

      // 3) 메타 등록
      const host = BUNNY_HOSTNAME || `vz-${libraryId}.b-cdn.net`;
      const { durationSeconds, resolution } = probe(it.file);
      const saveRes = await fetch(`${FN_BASE}/videos/save-metadata`, {
        method: "POST", headers: fnHeaders(await getToken()),
        body: JSON.stringify({
          videoId,
          title: it.title,
          description: it.description,
          tags: it.tags,
          category: it.category,
          genre: it.genre,
          age_rating: it.age_rating,
          aiTool: it.aiTool,
          prompt: it.prompt,
          duration: fmtDur(durationSeconds),
          durationSeconds,
          resolution,
          thumbnailUrl: `https://${host}/${videoId}/thumbnail.jpg`,
          hlsUrl: `https://${host}/${videoId}/playlist.m3u8`,
          standardPrice: "0",       // 무료 광고형 — 판매는 나중에 수정화면에서
          visibility: "public",
          status: "ready",
          licenseType: "original",
        }),
      });
      if (!saveRes.ok) throw new Error(`save-metadata ${saveRes.status}: ${(await saveRes.json().catch(() => ({}))).error || ""}`);

      // 4) 시리즈 연결(선택)
      if (it.series?.title) {
        const sid = await ensureSeries(it.series.title, it.genre);
        const { error: svErr } = await supabase.rpc("set_video_series", {
          p_video_id: videoId, p_series_id: sid,
          p_season_number: it.series.season || 1,
          p_episode_number: it.series.episode ?? null,
        });
        if (svErr) console.warn(c.y(` (시리즈 연결 경고: ${svErr.message})`));
      }

      uploaded[it.rel] = videoId; saveUploaded();
      console.log(c.g(`완료 → ${videoId}`));
      ok++;
    } catch (e) {
      console.log(c.r(`실패: ${e.message}`)); errc++;
    }
  }

  console.log(c.b(`\n━━ 결과 ━━  ${c.g(ok + " 업로드")}, ${skip} 건너뜀(완료분), ${errc ? c.r(errc + " 실패") : "0 실패"}`));
  console.log(c.dim("Bunny 인코딩에 몇 분 걸릴 수 있음 — 사이트엔 즉시 뜨고 재생은 인코딩 후 가능."));
}

main().catch((e) => fail(e.stack || e.message));
