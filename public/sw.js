// CREAITE Service Worker (minimal — PWA 설치 가능 조건 충족용)
// 캐싱 전략은 단순 — 네트워크 우선, 실패 시 fallback 없음
const CACHE_NAME = "creaite-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 네트워크 우선, 실패 시 그냥 통과 (에러 페이지는 브라우저 기본)
self.addEventListener("fetch", (event) => {
  // GET 요청만 처리, 외부 도메인은 패스
  if (event.request.method !== "GET") return;
  // 자동 캐싱은 안 함 — Vercel CDN이 이미 처리
});
