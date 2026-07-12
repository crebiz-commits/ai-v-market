// ════════════════════════════════════════════════════════════════════════════
// Phase 36 — Vercel Edge Middleware (봇/공유/크롤러용 SSR 프리렌더 라우팅)
//
// 동작:
//   - / 요청에 ?video= 가 있으면 /api/og   로 rewrite (영상 상세 OG/VideoObject)
//   - / 요청에 ?info=  가 있으면 /api/info 로 rewrite (매거진·스포트라이트 본문 SSR)
//   - URL 은 그대로 유지(rewrite). 그 외엔 통과(SPA index.html)
//   - vercel.json rewrites 는 동일 source 규칙이 여러 개면 첫 규칙만 먹으므로,
//     라우팅은 여기 미들웨어에서 코드로 명시(규칙 개수와 무관하게 정확).
// ════════════════════════════════════════════════════════════════════════════

import { rewrite, next } from "@vercel/edge";

export const config = {
  matcher: "/",
};

export default function middleware(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.has("video")) {
    const rewriteUrl = new URL("/api/og", url);
    rewriteUrl.search = url.search;
    return rewrite(rewriteUrl);
  }
  if (url.searchParams.has("info")) {
    const rewriteUrl = new URL("/api/info", url);
    rewriteUrl.search = url.search;
    return rewrite(rewriteUrl);
  }
  return next();
}
