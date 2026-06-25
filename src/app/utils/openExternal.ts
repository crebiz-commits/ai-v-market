// 외부 링크 안전 열기 — http(s) 스킴만 허용(javascript:/data: 등 차단) + 새 탭 + noopener,noreferrer.
// 광고/스폰서 link_url 처럼 외부(광고주) 입력 URL 을 열 때 사용. (DiscoveryFeed.openAdLinkSafe 와 동일 정책)
export function openExternal(url: string | null | undefined): void {
  const u = (url || "").trim();
  if (!/^https?:\/\//i.test(u)) return;
  window.open(u, "_blank", "noopener,noreferrer");
}
