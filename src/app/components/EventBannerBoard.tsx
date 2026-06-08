import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";

// ════════════════════════════════════════════════════════════════════════════
// 이벤트 배너 보드 — 3카드형 (스크린샷 기반)
//  - 넓은 데스크탑(md+): 3개 동시 노출
//  - 좁은 화면/모바일: 1개씩 노출 + 5초마다 우측 자동 슬라이드(루프) + 점 네비
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
}

const BRAND = "from-[#a78bfa] via-[#ec4899] to-[#f59e0b]";

interface Props {
  banners: BoardBanner[];
  onNavigate?: (tab: string, sub?: string) => void;
}

export function EventBannerBoard({ banners, onNavigate }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pages, setPages] = useState(1);

  // 모바일(1개 노출)일 때만 5초 자동 슬라이드. 데스크탑(3개 다 보임)은 스크롤 불필요 → 정지.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const id = setInterval(() => {
      if (el.scrollWidth <= el.clientWidth + 4) return; // 다 보이면 슬라이드 안 함
      let next = el.scrollLeft + el.clientWidth;
      if (next >= el.scrollWidth - 4) next = 0; // 끝이면 처음으로 루프
      el.scrollTo({ left: next, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(id);
  }, [banners.length]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const p = Math.max(1, Math.round(el.scrollWidth / el.clientWidth));
    setPages(p);
    setPage(Math.round(el.scrollLeft / el.clientWidth));
  };

  useEffect(() => { onScroll(); }, [banners.length]);

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

  if (banners.length === 0) return null;

  return (
    // 카드 p-2(슬롯 안 패딩)로 5개가 정확히 폭에 맞음 → 넘침 없음(데스크탑 자동슬라이드/찔끔 방지),
    // 모바일은 1개 꽉. 바깥 여백(px-1 md:px-2)만 줄여 가장자리에 더 붙임.
    <div className="px-1 md:px-2">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex overflow-x-auto scrollbar-hide snap-x snap-mandatory pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {/* 반응형: 모바일 1 / sm 2 / md 3 / lg 4 / xl+ 5 */}
        {banners.map((b) => (
          <div key={b.id} className="snap-start flex-shrink-0 w-full sm:w-1/2 md:w-1/3 lg:w-1/4 xl:w-1/5 p-2">
            <button
              onClick={() => go(b.link)}
              className="relative w-full h-44 md:h-48 rounded-2xl overflow-hidden text-left group block"
            >
              {/* 배경: 사진 또는 그라데이션 */}
              {b.image ? (
                <>
                  <img src={b.image} alt="" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className={`absolute inset-0 ${b.align === "center" ? "bg-black/55" : "bg-gradient-to-r from-black/85 via-black/55 to-black/20"}`} />
                </>
              ) : (
                <div className={`absolute inset-0 bg-gradient-to-br ${b.gradient || "from-[#1a1030] via-[#0d0d14] to-[#0d0d14]"}`} />
              )}

              {/* 좌상단 badge */}
              {b.badge && (
                <div className={`absolute top-4 left-5 z-10 px-3 py-1 rounded-full text-[11px] font-bold bg-gradient-to-r ${BRAND} text-white shadow`}>
                  {b.badge}
                </div>
              )}

              {/* 내용 */}
              <div className={`absolute inset-0 z-10 p-5 md:p-6 flex flex-col justify-center ${b.align === "center" ? "items-center text-center" : "items-start"}`}>
                {b.eyebrow && (
                  <span className="text-[11px] font-semibold text-[#c4b5fd] tracking-widest uppercase mb-1.5">{b.eyebrow}</span>
                )}
                <h3 className={`font-black leading-tight ${b.align === "center" ? "text-xl md:text-3xl" : "text-lg md:text-xl"} ${b.titleGradient ? `text-transparent bg-clip-text bg-gradient-to-r ${BRAND} italic` : "text-white"} ${b.badge ? "mt-6" : ""}`}>
                  {b.title}
                </h3>
                {b.subtitle && (
                  <p className="text-xs md:text-sm text-gray-300 mt-1.5 line-clamp-1 md:line-clamp-2 max-w-md">{b.subtitle}</p>
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
                  <span className={`inline-flex items-center gap-1 mt-3 px-4 py-2 rounded-lg text-xs font-bold transition-colors ${b.align === "center" ? "border border-[#a78bfa]/60 text-[#c4b5fd] hover:bg-[#a78bfa]/15" : "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white hover:opacity-90"}`}>
                    {b.ctaLabel}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                )}
              </div>
            </button>
          </div>
        ))}
      </div>

      {/* 점 네비 (모바일에서 1개씩 볼 때만) */}
      {pages > 1 && (
        <div className="flex md:hidden justify-center gap-1.5 mt-1">
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              onClick={() => scrollRef.current?.scrollTo({ left: i * (scrollRef.current?.clientWidth || 0), behavior: "smooth" })}
              aria-label={`배너 ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === page ? "w-4 bg-[#a78bfa]" : "w-1.5 bg-white/30"}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
