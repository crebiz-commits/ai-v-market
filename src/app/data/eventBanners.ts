// ════════════════════════════════════════════════════════════════════════════
// 이벤트/프로모 배너 데이터 (시네마 상단 EventBannerBoard + ?preview=event-banner 공용)
//
// 설계:
//   - 활성 배너 없으면 보드 자체가 렌더 안 됨(빈 플레이스홀더 금지)
//   - activeFrom/activeTo 로 기간 노출 제어
//   - link: 내부 경로("/?tab=upload") 또는 외부 URL("https://...")
//   - image 는 임시 placeholder(picsum) — 실제 이벤트 이미지로 교체 예정.
//     image 없으면 gradient 배경 카드로 렌더.
//
// 베타 오픈 시 이벤트 없으면 EVENT_BANNERS_ENABLED = false 로 전체 숨김.
// 추후: 이 BANNERS 배열을 어드민 등록 테이블로 교체.
// ════════════════════════════════════════════════════════════════════════════
import type { BoardBanner } from "../components/EventBannerBoard";

export const EVENT_BANNERS_ENABLED = true;

const BANNERS: (BoardBanner & { activeFrom?: string; activeTo?: string })[] = [
  {
    id: "special",
    badge: "스페셜 이벤트",
    title: "내가 만든 영상이 1000만 관객!",
    subtitle: "집에서 간단하게 만든 AI영화, 너도 방구석 제임스카메론이 될 수 있다! 지금 바로 도전하세요.",
    ctaLabel: "지금 도전하기",
    link: "/?tab=upload",
    image: "https://picsum.photos/seed/creaite-robot/900/450",
    align: "left",
  },
  {
    id: "slogan",
    eyebrow: "크리에잇 슬로건",
    title: "Create. Share. Profit. With AI.",
    titleGradient: true,
    subtitle: "창작하고, 공유하고, 부자가 되다. AI로.",
    ctaLabel: "지금 바로 잇!! 하라",
    link: "/?tab=discovery",
    align: "center",
  },
  {
    id: "contest",
    title: "콘테스트 공모전 이벤트 배너",
    subtitle: "당신의 창의력을 증명할 시간. 총 상금 5,000만원의 주인공이 되세요.",
    badges: ["D-14", "진행중"],
    link: "/?tab=community",
    image: "https://picsum.photos/seed/creaite-contest/900/450",
    align: "left",
  },
  {
    id: "subscribe",
    badge: "런칭 특가",
    title: "프리미엄 첫 달 50% 할인",
    subtitle: "모든 AI 시네마·OTT를 광고 없이 무제한으로 즐기세요.",
    ctaLabel: "구독하기",
    link: "/?tab=mypage",
    image: "https://picsum.photos/seed/creaite-premium/900/450",
    align: "left",
  },
  {
    id: "ranking",
    eyebrow: "위클리 랭킹",
    title: "이번 주 TOP 크리에이터",
    subtitle: "가장 사랑받은 AI 영상과 크리에이터를 만나보세요.",
    ctaLabel: "랭킹 보기",
    link: "/?tab=ott",
    align: "left",
    gradient: "from-[#1e1b4b] via-[#3b0764] to-[#0d0d14]",
  },
];

export function getActiveEventBanners(now: number = Date.now()): BoardBanner[] {
  if (!EVENT_BANNERS_ENABLED) return [];
  return BANNERS.filter((b) => {
    if (b.activeFrom && new Date(b.activeFrom).getTime() > now) return false;
    if (b.activeTo && new Date(b.activeTo).getTime() < now) return false;
    return true;
  }).map(({ activeFrom, activeTo, ...rest }) => rest);
}
