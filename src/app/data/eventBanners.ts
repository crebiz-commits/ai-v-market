// ════════════════════════════════════════════════════════════════════════════
// 이벤트/프로모 배너 데이터 (미리보기 — 추후 어드민/DB 연동)
//
// 설계:
//   - 활성 배너가 없으면 EventBanner 가 아예 렌더 안 됨(빈 플레이스홀더 금지)
//   - activeFrom/activeTo 로 기간 노출 제어
//   - link: 내부 경로("/?tab=upload") 또는 외부 URL("https://...")
//
// 베타 오픈 시 이벤트가 없으면 EVENT_BANNERS_ENABLED = false 한 줄로 전체 숨김.
// 추후: 이 BANNERS 배열을 어드민 등록 테이블(예: event_banners RPC)로 교체.
// ════════════════════════════════════════════════════════════════════════════

export interface EventBanner {
  id: string;
  emoji?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  link?: string;       // "/?tab=upload" 등 내부 경로 또는 외부 URL
  gradient?: string;   // tailwind gradient (from-... via-... to-...)
}

// 베타 오픈 시 활성 이벤트 없으면 false 로 (배너 영역 전체 숨김)
export const EVENT_BANNERS_ENABLED = true;

const BANNERS: (EventBanner & { activeFrom?: string; activeTo?: string })[] = [
  {
    id: "launch-2026",
    emoji: "🎬",
    title: "세계 최초 AI 시네마 OTT — CREAITE",
    subtitle: "AI 크리에이터의 영화를 무제한으로. 지금 구독하고 시작하세요.",
    ctaLabel: "구독 보기",
    link: "/?tab=mypage",
    gradient: "from-[#a78bfa] via-[#ec4899] to-[#f59e0b]",
  },
  {
    id: "creator-event",
    emoji: "✨",
    title: "신규 크리에이터 모집 — 업로드하고 수익 받기",
    subtitle: "당신의 AI 영상을 올리고 광고·판매 수익을 정산받으세요.",
    ctaLabel: "업로드하기",
    link: "/?tab=upload",
    gradient: "from-[#6366f1] via-[#8b5cf6] to-[#ec4899]",
  },
];

export function getActiveEventBanners(now: number = Date.now()): EventBanner[] {
  if (!EVENT_BANNERS_ENABLED) return [];
  return BANNERS.filter((b) => {
    if (b.activeFrom && new Date(b.activeFrom).getTime() > now) return false;
    if (b.activeTo && new Date(b.activeTo).getTime() < now) return false;
    return true;
  }).map(({ activeFrom, activeTo, ...rest }) => rest);
}
