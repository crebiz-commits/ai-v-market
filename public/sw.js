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

// ── 알림 클릭 → 해당 페이지로 이동(이미 열려있으면 포커스) ────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) { try { client.navigate(url); } catch {} }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
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
