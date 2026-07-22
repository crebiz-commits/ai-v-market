#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// 🔎 Bunny CDN 토큰 서명 방식 실측기 (2026-07-22)
//
//   왜 필요한가: CDN token authentication 을 켤 때 쓸 **서명 형식**이 공개 문서마다
//   다르다(Basic MD5 / Advanced HMAC-SHA256+HS256- / SHA256+token_ver=2 / Stream 임베드식).
//   틀린 형식으로 배선하면 전 영상이 403 이 된다. 그래서 추측하지 않고,
//   후보를 전부 만들어 **실제 CDN 에 쏴보고 200 이 나오는 것을 정답으로 확정**한다.
//
//   ▣ 키는 인자·환경변수로만 받는다(코드·로그에 남기지 않음).
//   ▣ ★ 모든 요청에 Referer 를 **보낸다.** 이 라이브러리는 `Block direct url file access`
//     가 ON 이라 리퍼러가 없으면 **토큰과 무관하게 전부 403** 이 된다(실측 확인).
//     그러면 "토큰이 틀려서 403" 인지 "리퍼러가 없어서 403" 인지 구분할 수 없다.
//     → 리퍼러를 붙여 핫링크 규칙을 통과시킨 뒤, **토큰만이 통과 여부를 가르게** 한다.
//   ▣ 대조군(토큰 없음 + 리퍼러 있음)의 의미:
//        403 → 토큰 인증이 **켜져 있다**(토큰을 요구함) = 실측 가능한 상태
//        200 → 토큰 인증이 아직 **꺼져 있다** = 켜고 다시 실행해야 함
//
//   사용법:
//     1) Bunny 패널 → Stream → creaite_market → Security 에서
//        **CDN token authentication 을 잠시 ON** (테스트 끝나면 되돌리면 됨)
//     2) node scripts/bunny-token-probe.mjs <TOKEN_KEY> [videoId]
//        또는  BUNNY_TOKEN_AUTH_KEY=... node scripts/bunny-token-probe.mjs
//
//   결과 해석:
//     · 어떤 후보가 200  → 그 방식이 정답. 그대로 Edge 에 구현하면 된다.
//     · 전부 403         → 토큰 인증이 아직 반영 안 됐거나(수 분 소요) 키가 다름
//     · 전부 200         → 토큰 인증이 아직 꺼져 있음(=서명과 무관하게 통과)
//                          → 이 경우 "무토큰" 줄도 200 으로 같이 뜬다
// ════════════════════════════════════════════════════════════════════════════
import { createHash, createHmac } from "node:crypto";

const KEY = process.argv[2] || process.env.BUNNY_TOKEN_AUTH_KEY || "";
const VIDEO_ID = process.argv[3] || process.env.PROBE_VIDEO_ID || "669b092e-74eb-488f-a789-f6dc6632217d";
const HOST = process.env.BUNNY_HOSTNAME || "vz-6e85411f-96a.b-cdn.net";
const FILE = "play_720p.mp4";

if (!KEY) {
  console.error("❌ 토큰 키가 필요합니다.\n   node scripts/bunny-token-probe.mjs <TOKEN_KEY> [videoId]");
  process.exit(1);
}

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

const expires = Math.floor(Date.now() / 1000) + 3600;
const filePath = `/${VIDEO_ID}/${FILE}`;   // 서명 대상(단일 파일)
const dirPath = `/${VIDEO_ID}/`;           // 서명 대상(디렉터리 — HLS 세그먼트까지 커버)
const base = `https://${HOST}${filePath}`;

// ── 후보들 ────────────────────────────────────────────────────────────────────
const candidates = [
  {
    name: "① Basic (MD5, 파일경로)",
    url: `${base}?token=${b64url(createHash("md5").update(KEY + filePath + expires).digest())}&expires=${expires}`,
  },
  {
    name: "② Advanced (HMAC-SHA256 + HS256-, 파일경로)",
    url: `${base}?token=${"HS256-" + b64url(createHmac("sha256", KEY).update(`${filePath}${expires}`).digest())}&expires=${expires}`,
  },
  {
    name: "③ Advanced 디렉터리 (HMAC + token_path)",
    url: `${base}?token=${"HS256-" + b64url(createHmac("sha256", KEY).update(`${dirPath}${expires}token_path=${dirPath}`).digest())}&expires=${expires}&token_path=${encodeURIComponent(dirPath)}`,
  },
  {
    name: "④ SHA256 평문해시 + token_ver=2 (레퍼런스 예제식)",
    url: `${base}?token=${b64url(createHash("sha256").update(`${KEY}${dirPath}${expires}token_path=${dirPath}`).digest())}&expires=${expires}&token_path=${encodeURIComponent(dirPath)}&token_ver=2`,
  },
  {
    name: "⑤ Stream 임베드식 (sha256hex(key+videoId+expires))",
    url: `${base}?token=${createHash("sha256").update(`${KEY}${VIDEO_ID}${expires}`).digest("hex")}&expires=${expires}`,
  },
  {
    name: "⑥ Basic 변형 (MD5, 디렉터리경로)",
    url: `${base}?token=${b64url(createHash("md5").update(KEY + dirPath + expires).digest())}&expires=${expires}&token_path=${encodeURIComponent(dirPath)}`,
  },
];

// 대조군 — 리퍼러만 있고 토큰 없음. 403 이어야 "토큰 인증 ON" 이 확인된다.
const control = { name: "⚪ 대조군: 토큰 없음(+리퍼러)", url: base };

// ── 실행 ──────────────────────────────────────────────────────────────────────
console.log(`\n🔎 Bunny CDN 토큰 형식 실측`);
console.log(`   host    : ${HOST}`);
console.log(`   video   : ${VIDEO_ID}`);
console.log(`   expires : ${expires} (1시간 뒤)\n`);

async function main() {
const REFERER = "https://www.creaite.net/";
const hit = async (url) => {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "manual", headers: { Referer: REFERER } });
    return String(res.status);
  } catch (e) {
    return `ERR(${String(e?.message).slice(0, 30)})`;
  }
};

// ── 1) 대조군 먼저 — 지금 토큰 인증이 켜져 있는 상태인지 확인 ──
const controlCode = await hit(control.url);
console.log(`${controlCode === "403" ? "✅" : "⚠️ "} ${controlCode.padEnd(4)} ${control.name}`);

if (controlCode === "200") {
  console.log("\n⚠️  대조군이 200 입니다 → CDN token authentication 이 아직 **꺼져 있습니다.**");
  console.log("   (토큰 없이도 통과 = 토큰을 요구하지 않는 상태)");
  console.log("   패널에서 켜고 몇 분 기다린 뒤 다시 실행하세요.\n");
  return;
}
if (controlCode !== "403") {
  console.log(`\n⚠️  대조군이 ${controlCode} 입니다 — 영상 ID 나 호스트를 확인하세요.\n`);
  return;
}

console.log("   → 토큰을 요구하는 상태 확인. 후보를 검사합니다.\n");

// ── 2) 후보 검사 ──
let winner = null;
for (const c of candidates) {
  const code = await hit(c.url);
  const mark = code === "200" ? "✅" : code === "403" ? "🔴" : "⚠️ ";
  console.log(`${mark} ${code.padEnd(4)} ${c.name}`);
  if (code === "200") winner ??= c;
}

console.log("");
if (winner) {
  console.log(`✅ 정답: ${winner.name}`);
  // 리퍼러 없이도 통과하는지 — 다운로드(새 탭 이동)는 리퍼러가 안 갈 수 있어 이게 중요하다
  const noRef = await fetch(winner.url, { method: "HEAD", redirect: "manual" })
    .then((r) => String(r.status)).catch(() => "ERR");
  console.log(`   리퍼러 없이도 통과하는가: ${noRef === "200" ? "✅ 예 (다운로드 안전)" : `🔴 아니오(${noRef}) — 리퍼러도 필요`}`);
  console.log("   → 이 형식으로 Edge 서명을 구현하면 됩니다.");
} else {
  console.log("🔴 후보 전부 403 — 키가 다르거나(Stream 임베드 키 ≠ CDN 키) 형식이 또 다릅니다.");
  console.log("   결과를 알려주시면 변형을 더 만들어 재시도하겠습니다.");
}
console.log("");
}

await main();
