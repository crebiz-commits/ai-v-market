import { EventBannerBoard } from "./EventBannerBoard";
import { getActiveEventBanners } from "../data/eventBanners";

// ?preview=event-banner — 시네마와 동일한 데이터(eventBanners.ts) 미리보기
const SAMPLE = getActiveEventBanners();

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
