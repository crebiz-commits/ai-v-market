// CREAITE Service Worker (PWA 설치 + 웹 푸시 + 앱셸 캐싱)
// 캐싱 전략:
//   · 네비게이션(HTML) = 네트워크 우선(항상 최신 앱), 오프라인 시 캐시 폴백 → stale-app 혼란 없음
//   · 해시 자산(/assets/*.js|css) = 캐시 우선(콘텐츠 해시라 불변 → 안전) → 재방문 시 JS/CSS 즉시 로드
const CACHE_NAME = "creaite-v3";
const APP_SHELL = ["/", "/index.html"];

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

self.addEventListener("install", (event) => {
  // 앱셸 프리캐시 (오프라인/즉시 폴백용). 실패해도 설치는 진행.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL).catch(() => {}))
  );
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

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  // 외부 도메인(Supabase API·Bunny 영상·애드핏 등)은 절대 캐싱/가로채기 안 함 — 항상 네트워크
  if (url.origin !== self.location.origin) return;

  // ① 네비게이션(HTML) — 네트워크 우선(항상 최신), 오프라인 시 캐시 폴백
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put("/index.html", copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.open(CACHE_NAME).then((c) => c.match("/index.html").then((m) => m || c.match("/")))
        )
    );
    return;
  }

  // ② 해시 정적 자산(/assets/*) — 캐시 우선(불변). 재방문 시 즉시 응답.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // 그 외(아이콘·매니페스트 등)는 기본 네트워크 동작
});
