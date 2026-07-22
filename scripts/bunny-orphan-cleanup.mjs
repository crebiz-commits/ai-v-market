#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// 🧹 Bunny 고아 파일 정리 (2026-07-22)
//
//   [배경] 삭제 RPC 는 SQL 이라 Bunny API 를 못 부르고, Edge 에도 삭제 호출이 없어
//     **DB 에서 지운 영상의 원본이 Bunny 에 영구 잔존**했다(실측: 3편 1.25GB,
//     본편 골드베인 1153MB 포함 — 직링크로 여전히 접근 가능).
//     이후 삭제는 Edge /video-delete 가 함께 정리하지만, ①그 이전에 쌓인 것과
//     ②Bunny 삭제만 실패한 경우를 회수할 도구가 필요하다.
//
//   [판정] Bunny 라이브러리 목록에서 **어디서도 참조되지 않는** guid 를 고아로 본다.
//     참조로 인정하는 곳(= videos 행이 없어도 정상인 것들):
//       · videos.id            본편
//       · videos.video_url     (id 와 다른 guid 를 가리키는 경우 대비)
//       · videos.hero_clip_id  히어로 클립 — videos 행이 없다
//       · ads.video_url / thumbnail_url  광고 영상 — videos 행이 없다
//     ⚠️ 이 목록을 빠뜨리면 멀쩡한 파일을 지운다. 처음 만들 때 히어로·광고를
//        빼먹어 8편으로 잡혔는데 실제 고아는 3편이었다(5편이 오탐).
//
//   사용법:
//     node scripts/bunny-orphan-cleanup.mjs           ← 조회만 (기본, 안전)
//     node scripts/bunny-orphan-cleanup.mjs --delete  ← 실제 삭제
//
//   자격증명은 .env.bulk 에서 읽는다(BUNNY_API_KEY·BUNNY_LIBRARY_ID·SUPABASE_*).
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";

const DELETE = process.argv.includes("--delete");

function loadEnv(file) {
  try {
    return Object.fromEntries(
      readFileSync(file, "utf8").split(/\r?\n/)
        .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    );
  } catch { return {}; }
}

const env = { ...loadEnv(".env"), ...loadEnv(".env.bulk"), ...process.env };
const LIB = env.BUNNY_LIBRARY_ID, KEY = env.BUNNY_API_KEY;
const SB = env.SUPABASE_URL, SRK = env.SUPABASE_SERVICE_ROLE_KEY;

if (!LIB || !KEY || !SB || !SRK) {
  console.error("❌ 자격증명 부족 — .env.bulk 에 BUNNY_API_KEY·BUNNY_LIBRARY_ID·SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function main() {
  // ── 1) Bunny 전체 목록 ──
  const bunny = new Map();
  for (let page = 1; page <= 50; page++) {
    const r = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos?page=${page}&itemsPerPage=100`,
      { headers: { AccessKey: KEY, accept: "application/json" } });
    if (!r.ok) { console.error("Bunny 목록 조회 실패:", r.status); process.exit(1); }
    const j = await r.json();
    for (const v of j.items || []) {
      bunny.set(v.guid, {
        title: v.title || "(제목 없음)",
        mb: Math.round((v.storageSize || 0) / 1048576),
        date: String(v.dateUploaded || "").slice(0, 10),
      });
    }
    if (!j.items || j.items.length < 100) break;
  }

  // ── 2) DB 에서 참조되는 guid 수집 ──
  const q = async (path) => {
    const r = await fetch(`${SB}/rest/v1/${path}`, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
    if (!r.ok) { console.error(`DB 조회 실패(${path}):`, r.status); process.exit(1); }
    return r.json();
  };
  const referenced = new Set();
  const addGuid = (val) => { const m = String(val || "").match(GUID); if (m) referenced.add(m[0]); };

  for (const v of await q("videos?select=id,video_url,hero_clip_id")) {
    referenced.add(v.id); addGuid(v.video_url); addGuid(v.hero_clip_id);
  }
  for (const a of await q("ads?select=video_url,thumbnail_url")) {
    addGuid(a.video_url); addGuid(a.thumbnail_url);
  }

  // ── 3) 대조 ──
  const orphans = [...bunny.entries()].filter(([g]) => !referenced.has(g))
    .sort((a, b) => b[1].mb - a[1].mb);
  const totalMb = orphans.reduce((s, [, v]) => s + v.mb, 0);

  console.log(`\n🧹 Bunny 고아 파일 정리   (라이브러리 ${LIB})`);
  console.log(`   Bunny ${bunny.size}편 · DB 참조 ${[...referenced].filter((g) => bunny.has(g)).length}편\n`);

  if (!orphans.length) { console.log("✅ 고아 없음 — Bunny 와 DB 가 일치합니다.\n"); return; }

  console.log(`🔴 고아 ${orphans.length}편 (${(totalMb / 1024).toFixed(2)} GB · 월 약 $${(totalMb / 1024 * 0.01).toFixed(3)})\n`);
  for (const [g, v] of orphans) {
    console.log(`   ${String(v.mb).padStart(5)}MB  ${v.date}  ${v.title.slice(0, 44)}`);
    console.log(`          ${g}`);
  }

  if (!DELETE) {
    console.log(`\n   조회만 했습니다. 실제로 지우려면:  node scripts/bunny-orphan-cleanup.mjs --delete\n`);
    return;
  }

  console.log(`\n   삭제를 시작합니다...\n`);
  let done = 0, fail = 0;
  for (const [g, v] of orphans) {
    const r = await fetch(`https://video.bunnycdn.com/library/${LIB}/videos/${g}`, {
      method: "DELETE", headers: { AccessKey: KEY, accept: "application/json" },
    }).catch(() => null);
    const ok = r && (r.ok || r.status === 404);
    console.log(`   ${ok ? "✅" : "🔴"} ${v.title.slice(0, 40)}`);
    if (ok) done++; else fail++;
  }
  console.log(`\n   완료 — 삭제 ${done}편${fail ? ` · 실패 ${fail}편` : ""} (${(totalMb / 1024).toFixed(2)} GB 회수)\n`);
}

await main();
