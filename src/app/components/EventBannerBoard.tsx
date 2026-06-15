import { useRef, useEffect } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";

// ════════════════════════════════════════════════════════════════════════════
// 이벤트 배너 보드 — 스크롤-스냅 캐러셀 (2026-06-16 재작성)
//  - 모바일: 손가락 스와이프(네이티브 가로 스크롤), 카드가 화면 폭에 맞게 넓어 글자 안 잘림
//  - 데스크탑: 좌우 화살표 버튼으로 수동 이동
//  - 자동 흐름: 4초마다 한 칸씩 부드럽게 이동(끝에서 처음으로). 마우스 호버/터치 중엔 일시정지
//  - 카드 변형: image(사진+badge), center(슬로건 중앙), badges(D-14/진행중)
// ════════════════════════════════════════════════════════════════════════════

export interface BoardBanner {
  id: string;
  title: string;
  subtitle?: string;
  eyebrow?: string;        // 상단 작은 라벨 (예: "크리에잇 슬로건")
  badge?: string;          // 좌상단 pill (예: "스페셜 이벤트")
  badges?: string[];       // 하단 pill 묶음 (예: ["D-14","진행중"])
  ctaLabel?: string;
  link?: string;           // "/?tab=upload" 등 내부 경로 또는 외부 URL
  image?: string;          // 배경 사진
  align?: "left" | "center";
  titleGradient?: boolean; // 제목을 브랜드 그라데이션으로
  gradient?: string;       // 카드 배경 그라데이션 (이미지 없을 때)
  dark?: boolean;          // 밝은 배경(노란색 등)용 — 글씨/뱃지/버튼을 어둡게
}

const BRAND = "from-[#a78bfa] via-[#ec4899] to-[#f59e0b]";

interface Props {
  banners: BoardBanner[];
  onNavigate?: (tab: string, sub?: string) => void;
}

export function EventBannerBoard({ banners, onNavigate }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const go = (link?: string) => {
    if (!link) return;
    if (/^https?:\/\//i.test(link)) { window.open(link, "_blank", "noopener"); return; }
    try {
      const params = new URL(link, window.location.origin).searchParams;
      const tab = params.get("tab");
      const sub = params.get("sub");
      if (tab) onNavigate?.(tab, sub || undefined);
    } catch { /* ignore */ }
  };

  // 한 카드(+gap) 만큼 좌우 이동
  const scrollByCard = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>("[data-banner-card]");
    const amount = card ? card.offsetWidth + 12 : el.clientWidth * 0.85;
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  // 자동 흐름 — 4초마다 한 칸. 호버/터치 중엔 일시정지.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || banners.length <= 1) return;
    let paused = false;
    const pause = () => { paused = true; };
    const resume = () => { paused = false; };
    el.addEventListener("pointerenter", pause);
    el.addEventListener("pointerleave", resume);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", resume, { passive: true });
    const id = window.setInterval(() => {
      if (paused) return;
      const card = el.querySelector<HTMLElement>("[data-banner-card]");
      const amount = card ? card.offsetWidth + 12 : el.clientWidth;
      if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) {
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else {
        el.scrollBy({ left: amount, behavior: "smooth" });
      }
    }, 4000);
    return () => {
      window.clearInterval(id);
      el.removeEventListener("pointerenter", pause);
      el.removeEventListener("pointerleave", resume);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", resume);
    };
  }, [banners.length]);

  if (banners.length === 0) return null;

  return (
    <div className="relative px-1 md:px-2">
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {banners.map((b) => (
          <div key={b.id} data-banner-card className="snap-start shrink-0 w-[86vw] max-w-[360px] md:w-[360px]">
            <button
              onClick={() => go(b.link)}
              className="relative w-full h-44 md:h-48 rounded-2xl overflow-hidden text-left group block"
            >
              {/* 배경: 사진 또는 그라데이션 */}
              {b.image ? (
                <>
                  <img src={b.image} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  {/* dark(밝은 이미지 + 어두운 글씨)일 땐 밝은 오버레이로 글씨 가독성 확보 */}
                  <div className={`absolute inset-0 ${
                    b.dark
                      ? (b.align === "center" ? "bg-white/45" : "bg-gradient-to-r from-white/80 via-white/45 to-white/5")
                      : (b.align === "center" ? "bg-black/55" : "bg-gradient-to-r from-black/85 via-black/55 to-black/20")
                  }`} />
                </>
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${b.gradient || "from-[#1a1030] via-[#0d0d14] to-[#0d0d14]"}`} />
              )}

              {/* 좌상단 badge — dark(밝은 배경)일 땐 어두운 pill */}
              {b.badge && (
                <div className={`absolute top-4 left-5 z-10 px-3 py-1 rounded-full text-[11px] font-bold shadow ${b.dark ? "bg-[#1a1a1a] text-[#FFD200]" : `bg-gradient-to-r ${BRAND} text-white`}`}>
                  {b.badge}
                </div>
              )}

              {/* 내용 */}
              <div className={`absolute inset-0 z-10 p-4 md:p-6 flex flex-col justify-center ${b.align === "center" ? "items-center text-center" : "items-start"}`}>
                {b.eyebrow && (
                  <span className={`text-[11px] font-semibold tracking-widest uppercase mb-1.5 ${b.dark ? "text-[#5a4500]" : "text-[#c4b5fd]"}`}>{b.eyebrow}</span>
                )}
                <h3 className={`font-black leading-tight line-clamp-2 ${b.align === "center" ? "text-xl md:text-3xl" : "text-lg md:text-xl"} ${b.titleGradient ? `text-transparent bg-clip-text bg-gradient-to-r ${BRAND} italic` : b.dark ? "text-[#1a1a1a]" : "text-white"} ${b.badge ? "mt-6" : ""}`}>
                  {b.title}
                </h3>
                {b.subtitle && (
                  <p className={`text-xs md:text-sm mt-1.5 line-clamp-2 max-w-md ${b.dark ? "text-[#3a2e00] font-medium" : "text-gray-300"}`}>{b.subtitle}</p>
                )}

                {b.badges && b.badges.length > 0 && (
                  <div className="flex gap-2 mt-3">
                    {b.badges.map((bg, i) => (
                      <span key={i} className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${i === 0 ? "bg-white text-black" : "bg-[#8b5cf6]/30 text-[#c4b5fd] border border-[#8b5cf6]/40"}`}>
                        {bg}
                      </span>
                    ))}
                  </div>
                )}

                {b.ctaLabel && (
                  <span className={`inline-flex items-center gap-1 mt-3 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${b.dark ? "bg-[#1a1a1a] text-white hover:bg-[#000]" : b.align === "center" ? "border border-[#a78bfa]/60 text-[#c4b5fd] hover:bg-[#a78bfa]/15" : "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:opacity-90"}`}>
                    {b.ctaLabel}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* 데스크탑 좌우 이동 버튼 — 배너 2개 초과일 때만 */}
      {banners.length > 1 && (
        <>
          <button
            type="button"
            aria-label="이전 배너"
            onClick={() => scrollByCard(-1)}
            className="hidden md:flex absolute left-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm border border-white/10 shadow-lg transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            aria-label="다음 배너"
            onClick={() => scrollByCard(1)}
            className="hidden md:flex absolute right-1 top-1/2 -translate-y-1/2 z-20 w-9 h-9 items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-sm border border-white/10 shadow-lg transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </>
      )}
    </div>
  );
}
