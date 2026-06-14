// 광고 과금 dedup 용 뷰어 세션키 — 로그인 안 한 사용자도 (광고,뷰어,1시간) 단위
// 중복 과금 방지에 쓰임. localStorage 에 1회 생성·보관. (서버는 로그인 시 auth.uid 우선)
export function getViewerSessionKey(): string {
  try {
    let k = localStorage.getItem("creaite_vsid");
    if (!k) {
      k = (typeof crypto !== "undefined" && crypto.randomUUID)
        ? crypto.randomUUID()
        : "vsid-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e9).toString(36);
      localStorage.setItem("creaite_vsid", k);
    }
    return k;
  } catch {
    return "";
  }
}
