/**
 * 상대 시간 표기 — "방금 전 / N분 전 / N시간 전 / N일 전 / N주 전" (한/영)
 *
 * 기존 4개 컴포넌트(Community·CommentPanel·CollabInquiryModal·NotificationPanel)에
 * 흩어져 있던 timeAgo 중복 구현을 통합한 단일 소스. (R11 정돈)
 */
export function timeAgo(iso: string | null | undefined, isKo: boolean): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return isKo ? "방금 전" : "just now";
  if (min < 60) return isKo ? `${min}분 전` : `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return isKo ? `${hr}시간 전` : `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return isKo ? `${day}일 전` : `${day}d ago`;
  const wk = Math.floor(day / 7);
  return isKo ? `${wk}주 전` : `${wk}w ago`;
}
