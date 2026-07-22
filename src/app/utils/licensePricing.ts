// ════════════════════════════════════════════════════════════════════════════
// 라이선스 가격 정책 — 토스 PG 한도 대응
//   토스페이먼츠는 ₩1,000만 이상 상품의 사이트 직접 결제를 허용하지 않음.
//   → ₩1,000만 이상 라이선스는 "1:1 협의 판매"로 전환 (영화 배급 등 고가 라이선스).
//     구매자는 직접 결제 대신 운영팀에 라이선스 문의 → 협의 후 별도 판매.
// ════════════════════════════════════════════════════════════════════════════

/** 사이트 직접 결제 가능 상한(미만). 이 값 이상은 1:1 협의 판매. */
export const LICENSE_DIRECT_MAX = 10_000_000;

/** ₩1,000만 이상 → 직접 구매 불가, 협의 판매 대상 */
export function isNegotiationOnly(price?: number | null): boolean {
  return typeof price === "number" && price >= LICENSE_DIRECT_MAX;
}

/** 고가 라이선스 1:1 문의 메일 링크 (영상 정보 프리필) */
export function licenseInquiryMailto(title: string, price?: number | null): string {
  const subject = `[라이선스 문의] ${title}`;
  const body =
    `■ 콘텐츠: ${title}\n` +
    `■ 표시가: ${typeof price === "number" ? "₩" + price.toLocaleString() : "-"}\n\n` +
    `위 콘텐츠의 라이선스 구매(또는 배급)를 문의드립니다.\n` +
    `희망 용도·범위·예산을 적어주시면 운영팀이 안내드리겠습니다.`;
  return `mailto:support@creaite.net?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ── 라이선스 종류 표시명 ──────────────────────────────────────────────────────
//   orders.license_type CHECK 허용값 5종(orders_table.sql:49). 기본값은 'all-in-one'.
//   상품 등급명이라 번역하지 않고 양쪽 로케일에서 같은 표기를 쓴다(카트와 동일 방침).
//
//   ⚠️ 미등록 값은 **원문을 그대로** 돌려준다. 맵을 직접 인덱싱하면 새 등급이 생겼을 때
//     화면에 빈칸이 뜬다 — 실제로 CartPanel 의 지역 맵이 'exclusive'·'all-in-one' 을
//     빠뜨려 기본 등급 주문의 라벨이 공백이었다(2026-07-22 구매 탭 감사).
const LICENSE_LABELS: Record<string, string> = {
  standard: "Standard",
  commercial: "Commercial",
  extended: "Extended",
  exclusive: "Exclusive",
  "all-in-one": "All-in-One",
};

export function licenseLabel(type?: string | null): string {
  if (!type) return "—";
  return LICENSE_LABELS[type] ?? type;
}
