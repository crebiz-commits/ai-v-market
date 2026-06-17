// ════════════════════════════════════════════════════════════════════════════
// 레퍼럴(초대) 캡처 유틸 — 자동 확산 엔진
//
//   초대링크(https://www.creaite.net/?ref=CODE)로 들어온 방문자의 코드를
//   localStorage에 저장해 둔다. OAuth 리다이렉트(구글/카카오)로 ?ref 가 사라져도
//   가입 직후 AuthContext가 이 값을 읽어 claim_referral RPC로 연결한다.
// ════════════════════════════════════════════════════════════════════════════

const KEY = "creaite_ref";

/** 페이지 로드 시 1회 호출 — URL ?ref 를 캡처해 저장하고, URL에서는 제거(깔끔하게). */
export function captureRefFromUrl(): void {
  try {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref");
    if (!ref) return;
    const code = ref.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,16}$/.test(code)) return;       // 형식 방어
    localStorage.setItem(KEY, code);
    // ref 만 제거(tab/video 등 다른 파라미터는 유지)
    params.delete("ref");
    const qs = params.toString();
    const url = window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash;
    window.history.replaceState(null, "", url);
  } catch {
    /* ignore */
  }
}

export function getStoredRef(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearStoredRef(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
