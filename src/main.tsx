
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";

  createRoot(document.getElementById("root")!).render(<App />);

  // 에러 모니터링 — 첫 페인트를 막지 않도록 idle 시 동적 import 로 지연 초기화.
  // (@sentry/react 를 초기 번들에서 분리 → 초기 로딩 속도 개선. VITE_SENTRY_DSN 설정 시에만 실제 활성)
  {
    const initLater = () => { import("./app/utils/sentry").then(m => m.initSentry()).catch(() => {}); };
    const ric: any = (window as any).requestIdleCallback;
    if (ric) ric(initLater, { timeout: 5000 });
    else setTimeout(initLater, 3000);
  }

  // PWA — Service Worker 등록 (localhost 제외, 즉 프로덕션에서만 활성)
  if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[SW] register failed:", err);
      });
    });
  }
