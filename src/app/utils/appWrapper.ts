// ════════════════════════════════════════════════════════════════════════════
// 네이티브 앱 래퍼(TWA/WebView) 감지 — 스토어 결제 수수료(IAP 30%) 우회용
//
//   넷플릭스/스포티파이식 "리더 앱" 구조: 앱 안에서는 구독 결제 UI를 노출/실행하지
//   않고, 외부 브라우저의 웹(creaite.net)에서 Toss로 결제하도록 유도한다.
//
//   래퍼는 다음 중 하나로 "앱 안"임을 신호한다 (래퍼 빌드 시 설정):
//     1) UserAgent 에 "CreaiteApp" 토큰 포함 (가장 권장 — TWA/WebView UA 커스터마이즈)
//     2) URL ?app=1 로 첫 진입 (localStorage 에 저장해 이후에도 유지)
//     3) localStorage.creaite_app === "1"
//     4) Android TWA: document.referrer 가 "android-app://" 로 시작
//     5) window.__CREAITE_NATIVE__ === true (래퍼 JS 주입)
//
//   일반 웹 브라우저·설치형 PWA 에서는 항상 false → 웹 결제 흐름 그대로(영향 없음).
// ════════════════════════════════════════════════════════════════════════════

const WEB_SUBSCRIBE_URL = "https://www.creaite.net/?tab=subscription";

export function isAppWrapper(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const ua = navigator.userAgent || "";
    if (/CreaiteApp/i.test(ua)) return true;

    const params = new URLSearchParams(window.location.search);
    if (params.get("app") === "1") {
      try { localStorage.setItem("creaite_app", "1"); } catch { /* ignore */ }
      return true;
    }
    try { if (localStorage.getItem("creaite_app") === "1") return true; } catch { /* ignore */ }

    if (document.referrer && document.referrer.startsWith("android-app://")) return true;
    if ((window as any).__CREAITE_NATIVE__ === true) return true;
  } catch { /* ignore */ }
  return false;
}

/** 앱에서 웹 구독 페이지를 외부 브라우저로 연다 (Toss 결제창이 WebView에 막히지 않게). */
export function openWebSubscribe(): void {
  try {
    window.open(WEB_SUBSCRIBE_URL, "_blank", "noopener,noreferrer");
  } catch {
    window.location.href = WEB_SUBSCRIBE_URL;
  }
}
