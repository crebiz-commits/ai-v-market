// ════════════════════════════════════════════════════════════════════════════
// Phase 36 — Vercel Edge Middleware (OG 동적 메타용 라우팅)
//
// 동작:
//   - / 요청에 ?video= 가 있으면 /api/og 로 rewrite (URL 유지)
//   - vercel.json rewrites 가 Vite SPA 루트 경로에 안 먹는 문제 우회
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
  return next();
}
