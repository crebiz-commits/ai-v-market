// ════════════════════════════════════════════════════════════════════════════
// U-M1 고아 Bunny 영상 리퍼 — DB 행 없는 Bunny Stream 파일 정리
//
//   배경: create-upload 로 Bunny 영상을 만든 뒤 save-metadata(=videos 행 생성) 를
//         하기 전에 사용자가 이탈하면, Bunny 에는 파일이 남지만 DB videos 행은 없다
//         (고아 파일 = 스토리지 비용). 이 스크립트가 그런 고아를 찾아 정리한다.
//
//   안전장치(오삭제 방지 — 스토리지 삭제라 신중):
//     · DB 영상 id 를 '누락 없이' 읽어야 함(숨김영상 누락 시 오탐→오삭제).
//       → SUPABASE_SERVICE_ROLE_KEY 우선(전 행 열람), 없으면 BULK 토큰 폴백.
//     · AGE_HOURS(기본 24) 보다 오래된 Bunny 파일만 대상(진행중 업로드 보호).
//     · 기본 DRY-RUN. --go 로만 실삭제. --go 시 1회 삭제 상한(MAX_DELETE, 기본 100)
//       초과하면 중단(DB 조회 이상으로 인한 대량삭제 방지 — --force 로 해제).
//
//   사용(.env.bulk 에 BUNNY_API_KEY 필요; SERVICE_ROLE_KEY 권장):
//     node scripts/reap-orphan-bunny.mjs                 (DRY-RUN, 고아 목록만)
//     node scripts/reap-orphan-bunny.mjs --hours 48      (48h+ 만 대상)
//     node scripts/reap-orphan-bunny.mjs --go --limit 1  (실삭제 1건 테스트)
//     node scripts/reap-orphan-bunny.mjs --go            (전체 실삭제, 상한 내)
// ════════════════════════════════════════════════════════════════════════════
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv;
const GO = argv.includes("--go");
const FORCE = argv.includes("--force");
const arg = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const AGE_HOURS = parseInt(arg("--hours", "24"), 10);
const LIMIT = arg("--limit", null) ? parseInt(arg("--limit", null), 10) : Infinity;
const MAX_DELETE = parseInt(arg("--max", "100"), 10);

const env = {};
for (const l of fs.readFileSync(path.join(ROOT, ".env.bulk"), "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].trim();
}
const LIBRARY_ID = env.BUNNY_LIBRARY_ID || "615810";
const BUNNY_KEY = env.BUNNY_API_KEY;
if (!BUNNY_KEY) { console.error("✗ .env.bulk 에 BUNNY_API_KEY 없음 (Bunny Stream 라이브러리 API Key). 추가 후 재실행."); process.exit(1); }

// ── DB 클라이언트: service role 우선(전 행 열람), 없으면 BULK 토큰 폴백 ──
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
let sb, dbMode;
if (SERVICE_KEY) {
  sb = createClient(env.SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  dbMode = "service_role(전 행)";
} else {
  sb = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await sb.auth.setSession({ access_token: env.BULK_ACCESS_TOKEN, refresh_token: env.BULK_REFRESH_TOKEN || "" });
  dbMode = "BULK 토큰(RLS 적용 — 숨김영상 누락 위험, service key 권장)";
}

// ── 1) 참조 guid 전량 수집: videos.id(=Bunny guid) + ads.video_url(광고 인트로/프리롤) ──
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const refIds = new Set();

// 1a) videos.id
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from("videos").select("id").range(from, from + 999);
  if (error) { console.error("✗ videos 조회 실패:", error.message, "\n  (service role 키가 없으면 RLS로 막힐 수 있음 — .env.bulk 에 SUPABASE_SERVICE_ROLE_KEY 추가 권장)"); process.exit(1); }
  data.forEach((r) => refIds.add(String(r.id)));
  if (data.length < 1000) break;
}
const dbVideoCount = refIds.size;

// 1b) ads.video_url 에서 Bunny guid 추출(프리롤/하우스 광고 인트로는 videos 가 아니라 ads 에 있음)
let adRefCount = 0;
{
  const { data, error } = await sb.from("ads").select("video_url");
  if (error) {
    console.warn("⚠ ads 조회 실패(광고 인트로 제외 불가):", error.message, "\n  → --go 전 반드시 목록에 광고 영상이 없는지 육안 확인할 것.");
  } else {
    for (const r of (data || [])) {
      const m = String(r.video_url || "").match(UUID_RE);
      if (m && !refIds.has(m[0].toLowerCase())) { refIds.add(m[0].toLowerCase()); adRefCount++; }
    }
  }
}
const dbIds = refIds;  // 이하 로직 호환(참조 집합)

// ── 2) Bunny 라이브러리 영상 전량 수집(페이지네이션) ──
const bunnyVideos = [];
for (let page = 1; ; page++) {
  const res = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos?page=${page}&itemsPerPage=100&orderBy=date`, {
    headers: { AccessKey: BUNNY_KEY, accept: "application/json" },
  });
  if (!res.ok) { console.error(`✗ Bunny 목록 조회 실패 page ${page}: ${res.status} ${await res.text().catch(() => "")}`); process.exit(1); }
  const j = await res.json();
  const items = j.items || [];
  bunnyVideos.push(...items);
  if (page * 100 >= (j.totalItems || 0) || items.length === 0) break;
}

// ── 3) 고아 판별: DB에 없고 + AGE_HOURS 초과된 것만 ──
const cutoff = Date.now() - AGE_HOURS * 3600_000;
let orphans = bunnyVideos.filter((v) => {
  if (dbIds.has(String(v.guid).toLowerCase())) return false; // DB/광고에서 참조 = 정상
  const uploaded = new Date(v.dateUploaded || v.dateCreated || 0).getTime();
  return uploaded > 0 && uploaded < cutoff;                  // 24h+ 지난 것만(진행중 보호)
});
if (LIMIT !== Infinity) orphans = orphans.slice(0, LIMIT);

console.log(`\n━━ 고아 Bunny 영상 리퍼 ━━ ${GO ? "🔴 실삭제" : "🟡 DRY-RUN"}`);
console.log(`  DB 클라이언트: ${dbMode}`);
console.log(`  참조 ${dbIds.size}건(영상 ${dbVideoCount}+광고 ${adRefCount})· Bunny 영상 ${bunnyVideos.length}편 · ${AGE_HOURS}h+ 고아 ${orphans.length}편 (라이브러리 ${LIBRARY_ID})\n`);

if (!orphans.length) { console.log("정리할 고아 없음."); process.exit(0); }

orphans.slice(0, 10).forEach((v, i) => console.log(`  ${i + 1}. ${v.title || "(제목없음)"}  guid=${v.guid}  업로드=${v.dateUploaded}`));
if (orphans.length > 10) console.log(`  … 외 ${orphans.length - 10}편`);

if (!GO) { console.log(`\n실제로 지우려면 --go 추가. (미리 --limit 1 로 1건 테스트 권장)`); process.exit(0); }

if (orphans.length > MAX_DELETE && !FORCE) {
  console.error(`\n✗ 고아 ${orphans.length}편이 1회 삭제 상한(${MAX_DELETE})을 초과. DB 조회 이상일 수 있어 중단.\n  확실하면 --max ${orphans.length} 또는 --force 로 재실행.`);
  process.exit(1);
}

let ok = 0, notFound = 0, err = 0; const failures = [];
for (let i = 0; i < orphans.length; i++) {
  const v = orphans[i]; const tag = `[${i + 1}/${orphans.length}] ${v.title || v.guid}`;
  try {
    const res = await fetch(`https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${v.guid}`, {
      method: "DELETE", headers: { AccessKey: BUNNY_KEY, accept: "application/json" },
    });
    if (res.ok) { ok++; console.log(`✓ ${tag} → 삭제됨`); }
    else if (res.status === 404) { notFound++; console.log(`· ${tag} → 이미없음`); }
    else { err++; const d = `${res.status} ${await res.text().catch(() => "")}`; failures.push({ guid: v.guid, title: v.title, detail: d }); console.log(`✗ ${tag} → ${d}`); }
  } catch (e) { err++; failures.push({ guid: v.guid, title: v.title, detail: e.message }); console.log(`✗ ${tag} → 예외 ${e.message}`); }
}

console.log(`\n━━ 결과 ━━  삭제 ${ok} · 이미없음 ${notFound} · 실패 ${err}`);
if (failures.length) { fs.writeFileSync(path.join(ROOT, "scripts", "_reap-failures.json"), JSON.stringify(failures, null, 2)); console.log(`  ⚠ 실패 ${failures.length}건 → scripts/_reap-failures.json`); }
