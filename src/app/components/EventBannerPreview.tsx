import { EventBannerBoard, type BoardBanner } from "./EventBannerBoard";

// ?preview=event-banner — 3카드 이벤트 배너 미리보기 (시네마엔 아직 미적용)
const SAMPLE: BoardBanner[] = [
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

export function EventBannerPreview() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-3">
        <p className="text-xs text-[#a78bfa] font-bold tracking-widest uppercase">Preview · 이벤트 배너</p>
        <h1 className="text-xl font-black mt-1">이벤트 배너 5종 (넓은 화면 최대 5개 / 모바일 1개 5초 슬라이드)</h1>
        <p className="text-xs text-gray-500 mt-1">
          화면 폭에 따라 1→2→3→4→5개로 채워집니다. 좁은 화면(모바일)은 1개씩 + 5초마다 우측 자동 슬라이드.
        </p>
      </div>

      {/* 실제 시네마 배치를 흉내 낸 영역 */}
      <div className="border-y border-white/5 py-4 bg-[#0c0c0e]">
        <EventBannerBoard banners={SAMPLE} />
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 text-sm text-gray-500 space-y-1">
        <p>· 카드/CTA 클릭 시 해당 탭으로 이동(미리보기에선 동작만 연결).</p>
        <p>· 문구·이미지·링크·기간은 추후 데이터/어드민에서 교체.</p>
        <p>· 이 디자인으로 시네마(또는 홈/OTT)에 넣을지 결정해 주세요.</p>
      </div>
    </div>
  );
}
