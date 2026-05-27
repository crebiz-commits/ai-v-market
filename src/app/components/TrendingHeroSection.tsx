// 급상승랭킹 섹션 — 1위 히어로 카드 + 2~10위 네온 글로우 캐러셀 (2026-05-27)
// 디자인: A-4 (TrendingCardPreview 에서 선정)
// 사용처: Cinema.tsx 의 trending 행 자리
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Crown, Play, Eye, ChevronLeft, ChevronRight } from "lucide-react";
import type { CarouselVideo } from "./VideoRowCarousel";
import { formatCompactNumber } from "../i18n/numberFormat";
import { getCategoryLabel } from "../i18n/categoryLabels";

interface Props {
  title: string;
  subtitle?: string;
  videos: CarouselVideo[];
  onVideoClick: (video: CarouselVideo) => void;
  emptyMessage?: string;
}

function fmtDuration(s?: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// 네온 글로우 색상 — 순위별 (2위 amber / 3위 cyan / 4위 pink / 그 이하 violet)
function neonStyle(rank: number): { color: string; glow: string } {
  if (rank === 2) return { color: "#fbbf24", glow: "0 0 8px #fbbf24, 0 0 16px #fbbf24, 0 0 32px #fbbf24" };
  if (rank === 3) return { color: "#22d3ee", glow: "0 0 8px #22d3ee, 0 0 16px #22d3ee, 0 0 32px #22d3ee" };
  if (rank === 4) return { color: "#f472b6", glow: "0 0 8px #f472b6, 0 0 16px #f472b6, 0 0 32px #f472b6" };
  return { color: "#a78bfa", glow: "0 0 6px #a78bfa, 0 0 14px #a78bfa, 0 0 24px #a78bfa" };
}

export function TrendingHeroSection({ title, subtitle, videos, onVideoClick, emptyMessage }: Props) {
  const { t } = useTranslation();
  const restScrollRef = useRef<HTMLDivElement>(null);

  const scrollRest = (dir: "left" | "right") => {
    const el = restScrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (!videos || videos.length === 0) {
    if (!emptyMessage) return null;
    return (
      <section className="px-4 md:px-6 mb-8">
        <div className="mb-3">
          <h2 className="text-base md:text-lg font-bold">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
      </section>
    );
  }

  const hero = videos[0];
  const rest = videos.slice(1);

  return (
    <section className="mb-8">
      {/* 섹션 제목 */}
      <div className="px-4 md:px-6 mb-3">
        <h2 className="text-base md:text-lg font-bold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>

      {/* 1위 — 히어로 카드 */}
      <div className="px-4 md:px-6 mb-4">
        <button
          onClick={() => onVideoClick(hero)}
          className="relative w-full aspect-[16/9] md:aspect-[21/9] rounded-2xl overflow-hidden cursor-pointer group block text-left"
        >
          {hero.thumbnail && (
            <img
              src={hero.thumbnail}
              alt={hero.title}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-8">
            <div className="flex items-center gap-2 mb-2 md:mb-3">
              <span className="px-2 py-1 rounded-md bg-gradient-to-r from-amber-500 to-orange-500 text-black text-[10px] md:text-xs font-black flex items-center gap-1">
                <Crown className="w-3 h-3" /> 1위
              </span>
              {hero.category && (
                <span className="px-2 py-0.5 rounded text-[10px] md:text-xs bg-white/10 text-white">
                  {getCategoryLabel(hero.category, t)}
                </span>
              )}
            </div>
            <h3 className="text-lg md:text-3xl font-black text-white mb-1 md:mb-2 max-w-2xl line-clamp-2">
              {hero.title}
            </h3>
            <p className="text-xs md:text-sm text-gray-300 mb-3 md:mb-4">
              {hero.creator_display_name || hero.creator || ""}
              {typeof hero.views === "number" && hero.views > 0 ? (
                <> · <Eye className="w-3 h-3 inline mb-0.5" /> {formatCompactNumber(hero.views)}</>
              ) : null}
              {hero.duration_seconds ? ` · ${fmtDuration(hero.duration_seconds)}` : ""}
            </p>
            <div className="inline-flex px-4 py-2 md:px-5 md:py-2.5 bg-white text-black rounded-lg font-bold text-xs md:text-sm items-center gap-2 group-hover:scale-105 transition-transform">
              <Play className="w-4 h-4 fill-black" /> 재생
            </div>
          </div>
        </button>
      </div>

      {/* 2~10위 — 네온 글로우 가로 캐러셀 (마우스 hover 시 좌우 화살표 표시) */}
      {rest.length > 0 && (
        <div className="relative group/row">
          {/* 좌측 화살표 */}
          <button
            onClick={() => scrollRest("left")}
            className="flex absolute left-0 top-0 bottom-0 z-10 w-12 items-center justify-center bg-gradient-to-r from-background/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
            aria-label={t("videoRow.previous")}
          >
            <ChevronLeft className="w-8 h-8 text-white" />
          </button>

          <div ref={restScrollRef} className="flex gap-3 overflow-x-auto pb-2 px-4 md:px-6 scrollbar-hide scroll-smooth">
            {rest.map((v, i) => {
            const rank = i + 2;
            const n = neonStyle(rank);
            return (
              <button
                key={v.id}
                onClick={() => onVideoClick(v)}
                className="flex-shrink-0 w-[42vw] md:w-[15vw] cursor-pointer group text-left"
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card">
                  {v.thumbnail && (
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                  )}
                  {/* 좌하단 네온 글로우 숫자 */}
                  <div className="absolute bottom-2 left-2 pointer-events-none">
                    <span
                      className="text-4xl md:text-5xl font-black leading-none italic"
                      style={{ color: n.color, textShadow: n.glow }}
                    >
                      {rank}
                    </span>
                  </div>
                  {/* 길이 배지 (우하단) */}
                  {v.duration_seconds ? (
                    <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-black/80 rounded text-[10px] font-semibold text-white">
                      {fmtDuration(v.duration_seconds)}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs md:text-sm font-bold text-white mt-2 line-clamp-1">{v.title}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-1">
                  {v.creator_display_name || v.creator || ""}
                  {typeof v.views === "number" && v.views > 0
                    ? ` · ${t("videoRow.viewsPrefix")} ${formatCompactNumber(v.views)}`
                    : ""}
                </p>
              </button>
            );
          })}
          </div>

          {/* 우측 화살표 */}
          <button
            onClick={() => scrollRest("right")}
            className="flex absolute right-0 top-0 bottom-0 z-10 w-12 items-center justify-center bg-gradient-to-l from-background/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
            aria-label={t("videoRow.next")}
          >
            <ChevronRight className="w-8 h-8 text-white" />
          </button>
        </div>
      )}
    </section>
  );
}
