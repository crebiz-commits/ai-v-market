// ════════════════════════════════════════════════════════════════════════════
// i18n 자동 검증 — 커밋마다 pre-commit 훅으로 실행(.githooks/pre-commit).
//   빠진 번역키·비대칭을 커밋 전에 잡아 영문(en) 모드에서 키·한글 노출을 막는다.
//
//   검사 4종(전부 결정적·자동유지):
//     ① ko/en 키 대칭          — 한쪽에만 있는 키 = 실패
//     ② literal t("key")       — ko.json 에 없는 키 = 실패
//     ③ 변수/네임스페이스 리터럴 — "ns.x.y" 형태 문자열이 실제 키 아니면 실패
//                                 (t(labelKey) 처럼 변수로 넘기는 키도 값이 리터럴이면 잡힘)
//     ④ 동적 템플릿 t(`ns.${x}`) — 앞쪽 정적 네임스페이스에 하위 키가 0개면 실패
//                                 (칩·밴드처럼 통째로 빠진 네임스페이스를 잡음)
//
//   관리자(Admin*)·내부 프리뷰(*Preview 등)는 사용자 비노출이라 제외.
//   우회: git commit --no-verify (권장 X).
// 사용: node scripts/i18n-check.mjs   (실패 시 exit 1)
// ════════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = path.join(ROOT, "src/app/i18n/locales");
const APP = path.join(ROOT, "src/app");
const SKIP = /(^Admin|Preview|LogoDesigns|LogoFish|LogoPreview|OgPreview|NetflixCard|TrendingCard)/;

const ko = JSON.parse(fs.readFileSync(path.join(LOCALES, "ko.json"), "utf8"));
const en = JSON.parse(fs.readFileSync(path.join(LOCALES, "en.json"), "utf8"));
const flat = (o, p = "") => { let r = new Set(); for (const k in o) { const v = o[k], key = p ? p + "." + k : k; if (v && typeof v === "object") for (const x of flat(v, key)) r.add(x); else r.add(key); } return r; };
const KO = flat(ko), EN = flat(en);
const NS = new Set(Object.keys(ko));
const hasKey = (k) => KO.has(k);
const hasChildren = (prefix) => { for (const k of KO) if (k.startsWith(prefix + ".")) return true; return false; };

function walk(d) { let r = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) r.push(...walk(p)); else if (/\.(tsx?|ts)$/.test(e.name) && !SKIP.test(e.name)) r.push(p); } return r; }
const files = walk(APP);

const errors = [];

// ① 대칭
{
  const enMiss = [...KO].filter(k => !EN.has(k));
  const koMiss = [...EN].filter(k => !KO.has(k));
  enMiss.forEach(k => errors.push(`[대칭] en.json 에 없음: ${k}`));
  koMiss.forEach(k => errors.push(`[대칭] ko.json 에 없음: ${k}`));
}

const RE_TLIT = /\bt\(\s*(["'])([\w.]+)\1/g;                                   // t("key" ...)
const RE_TDYN = /\bt\(\s*`([^`$]*)\$\{/g;                                       // t(`prefix.${...
const RE_LIT = /["'`]([a-z][a-zA-Z0-9]*(?:\.[a-zA-Z0-9_]+){1,5})["'`]/g;        // "ns.x.y" 리터럴

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const rel = path.relative(ROOT, f).replace(/\\/g, "/");
  let m;
  // ② literal t("key")
  RE_TLIT.lastIndex = 0;
  while ((m = RE_TLIT.exec(src))) { const k = m[2]; if (/^[a-zA-Z]/.test(k) && !hasKey(k) && !hasChildren(k)) errors.push(`[t()] ${rel}: 미존재 키 "${k}"`); }
  // ④ 동적 템플릿 프리픽스
  RE_TDYN.lastIndex = 0;
  while ((m = RE_TDYN.exec(src))) { const prefix = m[1].replace(/\.$/, ""); if (prefix && NS.has(prefix.split(".")[0]) && !hasChildren(prefix) && !hasKey(prefix)) errors.push(`[동적키] ${rel}: t(\`${prefix}.\${...}\`) 프리픽스에 하위 키 없음`); }
  // ③ 네임스페이스 리터럴(변수키 값 포함)
  RE_LIT.lastIndex = 0;
  while ((m = RE_LIT.exec(src))) {
    const k = m[1];
    if (!NS.has(k.split(".")[0])) continue;
    if (/\.(tsx?|json|js|css|png|jpg|svg|m3u8|mp4|webp|gif)$/.test(k)) continue;
    if (hasKey(k) || hasChildren(k)) continue;
    errors.push(`[리터럴] ${rel}: 미존재 키 "${k}"`);
  }
}

// 중복 제거
const uniq = [...new Set(errors)];
if (uniq.length) {
  console.error(`\n✗ i18n 검증 실패 (${uniq.length}건) — 커밋 전 번역키를 채우세요:\n`);
  uniq.slice(0, 60).forEach(e => console.error("  " + e));
  if (uniq.length > 60) console.error(`  … 외 ${uniq.length - 60}건`);
  console.error(`\n  ko/en: src/app/i18n/locales/{ko,en}.json — 양쪽 같은 키로 추가.`);
  console.error(`  (긴급 우회: git commit --no-verify)\n`);
  process.exit(1);
}
console.log(`✓ i18n 검증 통과 — ${files.length}개 파일, ko/en 각 ${KO.size}키 대칭.`);
