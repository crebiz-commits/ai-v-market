// 방문자 분석 — GA4(Google Analytics 4) + Vercel Web Analytics.
//
// 배경(2026-08-20): 그동안 "1일 방문자"를 볼 수단이 아예 없었다. 관리자 대시보드의 "24h 시청"은
//   video_views(영상 재생) 기준이라 둘러보다 나간 사람·비로그인 방문자는 잡히지 않는다.
//
// 설계 원칙
//  · **환경변수가 없으면 완전 no-op** — 키를 넣기 전에는 아무 스크립트도 로드되지 않는다.
//    (개인정보처리방침 개정 고지 전까지 수집이 시작되지 않게 하는 안전장치이기도 하다.)
//  · localhost 는 제외 — 개발 중 트래픽이 실지표를 오염시키지 않도록.
//  · 첫 페인트를 막지 않도록 main.tsx 에서 idle 시점에 호출한다(sentry 와 동일 패턴).
//  · **SPA 페이지뷰를 수동으로 보내지 않는다.** GA4 '향상된 측정'의 "브라우저 기록 이벤트 기반
//    페이지 변경"이 pushState/replaceState/popstate 를 자동으로 잡는다(기본 ON). 수동 page_view 를
//    같이 쏘면 이중 집계된다. 이 앱은 ?tab= 쿼리스트링 라우팅이라 history API 를 쓰므로 해당됨.

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined;

function isLocalHost(): boolean {
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
}

/** GA4(gtag.js) 로드 — VITE_GA_MEASUREMENT_ID(G-XXXXXXXXXX) 설정 시에만 동작 */
function initGA4() {
  if (!GA_ID || isLocalHost()) return;
  if (document.getElementById("ga4-src")) return;   // 중복 로드 방지(HMR·재호출 대비)

  const s = document.createElement("script");
  s.id = "ga4-src";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);

  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  // 구글 표준 스니펫과 동일하게 arguments 객체를 push 해야 한다(배열로 바꾸면 gtag 가 못 읽는 경우가 있음).
  w.gtag = function gtag() { w.dataLayer.push(arguments); };
  w.gtag("js", new Date());
  w.gtag("config", GA_ID);
}

/** Vercel Web Analytics — 배포 환경에서만. 대시보드에서 Analytics 를 Enable 해야 수집된다. */
function initVercelAnalytics() {
  if (isLocalHost()) return;
  void import("@vercel/analytics").then((m) => m.inject()).catch(() => {});
}

export function initAnalytics() {
  try { initGA4(); } catch { /* 분석 실패가 서비스에 영향 주지 않도록 무시 */ }
  try { initVercelAnalytics(); } catch { /* 위와 동일 */ }
}
