#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// ✅ Bunny CDN 보호 설정 합격 판정기 (2026-07-22)
//
//   목표 상태(A안): **판매되는 mp4 만 토큰을 요구**하고, 재생용 파일은 면제한다.
//     · play_*.mp4          → 토큰 필수 (구매자만 받을 수 있어야 함)
//     · playlist.m3u8 / {화질}/video.m3u8 / video*.ts → 면제 (재생이 깨지면 안 됨)
//     · thumbnail.jpg / preview.webp                  → 면제 (썸네일·OG 이미지)
//
//   설정 방법:
//     1) Stream > creaite_market > Security → CDN token authentication ON
//     2) 그 풀존의 Edge Rules 에 규칙 1개 추가
//          Action  : Disable Token Authentication
//          Trigger : URL 이 아래 중 **아무거나** 일치 (Match Any)
//              https://vz-6e85411f-96a.b-cdn.net/*.m3u8
//              https://vz-6e85411f-96a.b-cdn.net/*.ts
//              https://vz-6e85411f-96a.b-cdn.net/*.jpg
//              https://vz-6e85411f-96a.b-cdn.net/*.webp
//     3) node scripts/bunny-cdn-verify.mjs
//
//   ▣ 모든 요청에 Referer 를 보낸다 — `Block direct url file access` 가 켜져 있으면
//     리퍼러 없는 요청은 토큰과 무관하게 403 이라, 안 보내면 판정이 오염된다.
//     리퍼러 의존성 자체는 맨 끝에서 따로 측정한다(다운로드가 여기 걸리므로).
// ════════════════════════════════════════════════════════════════════════════
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const KEY = process.argv[2] || process.env.BUNNY_TOKEN_AUTH_KEY || (() => {
  for (const f of [".env.local", ".env"]) {
    try {
      const m = readFileSync(f, "utf8").match(/^\s*BUNNY_TOKEN_AUTH_KEY\s*=\s*(.+)$/m);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    } catch { /* 다음 후보 */ }
  }
  return "";
})();

const HOST = process.env.BUNNY_HOSTNAME || "vz-6e85411f-96a.b-cdn.net";
const ID = process.argv[3] || process.env.PROBE_VIDEO_ID || "669b092e-74eb-488f-a789-f6dc6632217d";
const REFERER = "https://www.creaite.net/";

if (!KEY) {
  console.error("❌ 토큰 키가 필요합니다 (.env 의 BUNNY_TOKEN_AUTH_KEY 또는 인자).");
  process.exit(1);
}

const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
const dir = `/${ID}/`;
const expires = Math.floor(Date.now() / 1000) + 3600;
const token = b64url(createHash("md5").update(KEY + dir + expires).digest());
const q = `?token=${token}&expires=${expires}&token_path=${encodeURIComponent(dir)}`;

const hit = async (path, { signed = false, referer = true } = {}) => {
  const url = `https://${HOST}${dir}${path}${signed ? q : ""}`;
  try {
    const r = await fetch(url, { method: "HEAD", redirect: "manual", headers: referer ? { Referer: REFERER } : {} });
    return r.status;
  } catch { return 0; }
};

// [경로, 설명, 무토큰 기대값, 토큰 기대값]
//   403 = 막혀야 함 / 200 = 통과해야 함
const CASES = [
  ["play_720p.mp4",   "판매 파일(mp4)",       403, 200],
  ["playlist.m3u8",   "HLS 마스터",           200, 200],
  ["720p/video.m3u8", "HLS 화질별",           200, 200],
  ["720p/video0.ts",  "HLS 세그먼트",         200, 200],
  ["thumbnail.jpg",   "썸네일",               200, 200],
  ["preview.webp",    "애니메이션 미리보기",  200, 200],
];

async function main() {
  console.log(`\n✅ Bunny CDN 보호 설정 판정   (host ${HOST} / video ${ID})\n`);
  console.log("   파일                     무토큰      토큰있음");
  console.log("   ─────────────────────────────────────────────");

  let fail = 0;
  for (const [path, label, wantBare, wantSigned] of CASES) {
    const bare = await hit(path);
    const signed = await hit(path, { signed: true });
    const okBare = bare === wantBare;
    const okSigned = signed === wantSigned;
    if (!okBare || !okSigned) fail++;
    const f = (got, want) => `${got}${got === want ? "" : `(≠${want})`}`.padEnd(10);
    console.log(`   ${(okBare && okSigned ? "✅" : "🔴")} ${label.padEnd(20)} ${f(bare, wantBare)} ${f(signed, wantSigned)}`);
  }

  // 다운로드는 새 탭 이동이라 리퍼러가 안 갈 수 있다 → 토큰만으로 통과하는지 별도 확인
  const noRef = await hit("play_720p.mp4", { signed: true, referer: false });
  console.log("");
  console.log(`   ${noRef === 200 ? "✅" : "⚠️ "} 리퍼러 없이 토큰만으로 mp4 접근: ${noRef}`);
  if (noRef !== 200) {
    console.log("      → `Block direct url file access` 가 켜져 있어 리퍼러도 요구합니다.");
    console.log("        다운로드 버튼이 실제로 되는지 브라우저에서 꼭 확인하세요.");
    console.log("        안 되면 그 설정을 끄면 됩니다(mp4 는 토큰이 지키므로 안전).");
  }

  console.log("");
  if (fail === 0) {
    console.log("🎉 합격 — 판매 파일만 토큰으로 잠기고 재생용 파일은 정상입니다.");
  } else {
    console.log(`🔴 ${fail}건 불합격 — 위 표에서 (≠기대값) 표시된 줄을 보세요.`);
    console.log("   · mp4 가 무토큰 200 이면 → 토큰 인증이 꺼져 있거나 Edge Rule 이 mp4 까지 면제 중");
    console.log("   · m3u8/ts/jpg 가 403 이면 → Edge Rule 이 아직 적용 안 됨(반영에 몇 분)");
  }
  console.log("");
}

await main();
