// ════════════════════════════════════════════════════════════════════════════
// 이벤트/프로모 배너 (시네마 상단 EventBannerBoard + ?preview=event-banner 공용)
//
// 2026-06-11: 어드민 관리(event_banners 테이블)로 전환.
//   - fetchEventBanners(): DB 에서 활성 배너 로드 (실패/미적용 시 하드코딩 폴백)
//   - 아래 BANNERS 배열은 이제 "폴백" (DB 비었거나 조회 실패 시에만 사용)
//   - 활성 배너 없으면 보드 자체가 렌더 안 됨(빈 플레이스홀더 금지)
// ════════════════════════════════════════════════════════════════════════════
import type { BoardBanner } from "../components/EventBannerBoard";
import { supabase } from "../utils/supabaseClient";

export const EVENT_BANNERS_ENABLED = true;

// 폴백 — DB(event_banners) 조회 실패/미적용 환경에서만 사용. 시드와 동일하게 유지.
const BANNERS: (BoardBanner & { activeFrom?: string; activeTo?: string })[] = [
  {
    id: "special",
    badge: "스페셜 이벤트",
    title: "내가 만든 영상이 1000만 관객!",
    subtitle: "집에서 간단하게 만든 AI영화, 너도 방구석 제임스카메론이 될 수 있다! 지금 바로 도전하세요.",
    ctaLabel: "지금 도전하기",
    link: "/?tab=upload",
    image: "https://tvbpiuwmvrccfnplhwer.supabase.co/storage/v1/object/public/video-thumbnails/banners/cinema-audience.jpg",
    align: "left",
  },
  {
    id: "mega",
    badge: "메가커피 EVENT",
    title: "빅메가 업로더 가즈아! ☕",
    subtitle: "메가커피와 함께! 영화 30편 업로드마다 메가커피 상품권 3만원권을 드려요.",
    ctaLabel: "지금 업로드하기",
    link: "/?tab=upload",
    align: "left",
    dark: true,
    gradient: "from-[#FFD200] via-[#FFC400] to-[#FFB000]",
  },
  {
    id: "bug",
    badge: "버그 헌트",
    title: "버그를 잡아라! 🐛",
    subtitle: "베타 기간 버그를 발견해 제보하면, 채택된 모든 분께 커피 쿠폰을 드려요!",
    ctaLabel: "버그 제보하기",
    link: "/?tab=bug-report",
    align: "left",
    gradient: "from-[#0f2027] via-[#203a43] to-[#0d0d14]",
  },
  {
    id: "contest",
    title: "매달 열리는 AI 영상 콘테스트",
    subtitle: "이달의 테마에 도전하세요! 우승 상금 총 60만원",
    ctaLabel: "참가하기",
    link: "/?tab=community&sub=challenges",
    image: "https://tvbpiuwmvrccfnplhwer.supabase.co/storage/v1/object/public/video-thumbnails/banners/contest-award.jpg",
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

// event_banners row → BoardBanner
function rowToBanner(r: any): BoardBanner {
  return {
    id: r.id,
    title: r.title,
    subtitle: r.subtitle || undefined,
    eyebrow: r.eyebrow || undefined,
    badge: r.badge || undefined,
    badges: Array.isArray(r.badges) && r.badges.length ? r.badges : undefined,
    ctaLabel: r.cta_label || undefined,
    link: r.link || undefined,
    image: r.image || undefined,
    align: r.align === "center" ? "center" : "left",
    titleGradient: !!r.title_gradient,
    gradient: r.gradient || undefined,
    dark: !!r.dark,
  };
}

// DB 에서 활성 배너 로드. 실패/빈 결과 시 하드코딩 폴백 반환.
export async function fetchEventBanners(): Promise<BoardBanner[]> {
  if (!EVENT_BANNERS_ENABLED) return [];
  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("event_banners")
      .select("*")
      .eq("is_active", true)
      .or(`active_from.is.null,active_from.lte.${nowIso}`)
      .or(`active_to.is.null,active_to.gte.${nowIso}`)
      .order("sort_order", { ascending: true })
      .limit(20);
    if (error || !data || data.length === 0) {
      return getActiveEventBanners();   // 테이블 미적용/빈 결과 → 폴백
    }
    return data.map(rowToBanner);
  } catch {
    return getActiveEventBanners();
  }
}
