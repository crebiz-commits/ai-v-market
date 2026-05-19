import i18n from "./index";

// 로케일별 큰 숫자 단위 포맷.
// - 한국어: 1억 / 1만 / 1천
// - 영어: 1B / 1M / 1K
export function formatCompactNumber(n: number | null | undefined): string {
  if (!n || n <= 0) return "0";
  const isKo = (i18n.language || "en").startsWith("ko");

  if (isKo) {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
    if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}천`;
    return String(n);
  }
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
