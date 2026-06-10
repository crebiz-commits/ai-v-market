// CREAITE Service Worker (PWA 설치 + 웹 푸시)
// 캐싱 전략은 단순 — 네트워크 우선, 실패 시 fallback 없음
const CACHE_NAME = "creaite-v2";

// ── 웹 푸시 수신 → 알림 표시 ──────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "CREAITE", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "CREAITE";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
    tag: data.tag || undefined,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// ── 알림 클릭 → 해당 페이지로 이동(이미 열려있으면 포커스 + SPA 네비게이션) ──
// 주의(2026-06-11 수정): client.navigate() 는 SW 가 제어하지 않는 클라이언트에서
// 조용히 reject 되어 "창만 포커스되고 이동은 안 되는" 버그가 있었음.
// → postMessage 로 앱에 URL 을 전달해 SPA 내부 네비게이션으로 처리 (App.tsx 가 수신).
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        try {
          if ("focus" in client) await client.focus();
          client.postMessage({ type: "push-navigate", url });
          return;
        } catch (e) {
          // 이 클라이언트 실패 → 다음 클라이언트 시도
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(url);
    })()
  );
});

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
