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
];

export function EventBannerPreview() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white">
      <div className="max-w-7xl mx-auto px-4 pt-6 pb-3">
        <p className="text-xs text-[#a78bfa] font-bold tracking-widest uppercase">Preview · 이벤트 배너</p>
        <h1 className="text-xl font-black mt-1">3카드 이벤트 배너 (데스크탑 3개 / 모바일 1개 5초 슬라이드)</h1>
        <p className="text-xs text-gray-500 mt-1">
          화면을 좁히면(모바일) 1개씩 보이며 5초마다 자동으로 오른쪽으로 넘어갑니다. 넓히면 3개가 한 줄에 보입니다.
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
