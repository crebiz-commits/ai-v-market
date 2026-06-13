
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { initSentry } from "./app/utils/sentry";

  // 에러 모니터링 초기화 (VITE_SENTRY_DSN 설정 시에만 활성)
  initSentry();

  createRoot(document.getElementById("root")!).render(<App />);

  // PWA — Service Worker 등록 (localhost 제외, 즉 프로덕션에서만 활성)
  if ("serviceWorker" in navigator && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.warn("[SW] register failed:", err);
      });
    });
  }
