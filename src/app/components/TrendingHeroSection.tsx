// 급상승랭킹 섹션 — 1위 히어로 카드 + 2~10위 네온 글로우 캐러셀 (2026-05-27)
// 디자인: A-4 (TrendingCardPreview 에서 선정)
// 사용처: Cinema.tsx 의 trending 행 자리
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Play, ChevronLeft, ChevronRight, Plus, ThumbsUp } from "lucide-react";
import type { CarouselVideo } from "./VideoRowCarousel";
import { formatCompactNumber } from "../i18n/numberFormat";
import { getCategoryLabel, getGenreLabel } from "../i18n/categoryLabels";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";

interface Props {
  title: string;
  subtitle?: string;
  videos: CarouselVideo[];
  onVideoClick: (video: CarouselVideo) => void;
  onAddToCart?: (video: CarouselVideo) => void;
  emptyMessage?: string;
}

function fmtDuration(s?: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// 네온 글로우 색상 — 순위별 (1위 gold / 2위 amber / 3위 cyan / 4위 pink / 그 이하 violet)
function neonStyle(rank: number): { color: string; glow: string } {
  if (rank === 1) return { color: "#fde047", glow: "0 0 8px #fde047, 0 0 18px #facc15, 0 0 34px #f59e0b" };
  if (rank === 2) return { color: "#fbbf24", glow: "0 0 8px #fbbf24, 0 0 16px #fbbf24, 0 0 32px #fbbf24" };
  if (rank === 3) return { color: "#22d3ee", glow: "0 0 8px #22d3ee, 0 0 16px #22d3ee, 0 0 32px #22d3ee" };
  if (rank === 4) return { color: "#f472b6", glow: "0 0 8px #f472b6, 0 0 16px #f472b6, 0 0 32px #f472b6" };
  return { color: "#a78bfa", glow: "0 0 6px #a78bfa, 0 0 14px #a78bfa, 0 0 24px #a78bfa" };
}

export function TrendingHeroSection({ title, subtitle, videos, onVideoClick, onAddToCart, emptyMessage }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const restScrollRef = useRef<HTMLDivElement>(null);

  // 좋아요 토글 (2~10위 카드용)
  const handleLikeClick = async (e: React.MouseEvent, v: CarouselVideo) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.info(t("video.signInRequired", "로그인 후 이용해주세요"));
      return;
    }
    try {
      const { error } = await supabase
        .from("video_likes")
        .insert({ video_id: v.id, user_id: user.id });
      if (error) {
        if ((error as any).code === "23505") {
          await supabase
            .from("video_likes")
            .delete()
            .match({ video_id: v.id, user_id: user.id });
          toast.info(t("video.unliked", "좋아요 취소"));
        } else {
          throw error;
        }
      } else {
        toast.success(t("video.liked", "♥ 좋아요"));
      }
    } catch (err: any) {
      console.error("[TrendingHeroSection] like toggle error:", err);
      toast.error(t("video.likeFailed", "좋아요 처리 실패"));
    }
  };

  const handleCartClick = (e: React.MouseEvent, v: CarouselVideo) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAddToCart) onAddToCart(v);
  };

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
          <h2 className="text-base md:text-xl font-bold">{title}</h2>
          {subtitle && <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
      </section>
    );
  }

  const ranked = videos.slice(0, 10);  // 1위~10위 (모두 같은 크기 세로형)

  return (
    <section className="mb-8">
      {/* 섹션 제목 */}
      <div className="px-4 md:px-6 mb-3">
        <h2 className="text-base md:text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-xs md:text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>

      {/* 1~10위 — 같은 크기 세로형 네온 글로우 가로 캐러셀 */}
      {ranked.length > 0 && (
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
            {ranked.map((v, i) => {
            const rank = i + 1;
            const n = neonStyle(rank);
            return (
              <button
                key={v.id}
                onClick={() => onVideoClick(v)}
                className="flex-shrink-0 w-[42vw] md:w-[15vw] cursor-pointer group/card text-left"
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-card">
                  {v.thumbnail && (
                    <img
                      src={v.thumbnail}
                      alt={v.title}
                      className="w-full h-full object-cover group-hover/card:scale-105 transition-transform"
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
                  {/* hover 시 액션 버튼 오버레이 (마우스 디바이스만) */}
                  <div className="flex absolute inset-x-0 top-0 p-2 items-center gap-1.5 bg-gradient-to-b from-black/95 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity">
                    <span
                      role="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onVideoClick(v); }}
                      className="w-7 h-7 rounded-full bg-white flex items-center justify-center hover:bg-white/90 transition-colors"
                      aria-label={t("videoRow.play", "재생")}
                    >
                      <Play className="w-3.5 h-3.5 text-black fill-black" />
                    </span>
                    <span
                      role="button"
                      onClick={(e) => handleCartClick(e, v)}
                      className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm border border-white/40 flex items-center justify-center hover:border-white transition-colors"
                      aria-label={t("videoRow.addToCart", "장바구니")}
                    >
                      <Plus className="w-3.5 h-3.5 text-white" />
                    </span>
                    <span
                      role="button"
                      onClick={(e) => handleLikeClick(e, v)}
                      className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm border border-white/40 flex items-center justify-center hover:border-white transition-colors"
                      aria-label={t("videoRow.like", "좋아요")}
                    >
                      <ThumbsUp className="w-3.5 h-3.5 text-white" />
                    </span>
                  </div>
                </div>
                <p className="text-xs md:text-base font-bold text-white mt-2 line-clamp-1">{v.title}</p>
                <p className="text-[11px] md:text-xs text-muted-foreground line-clamp-1">
                  {v.creator_display_name || v.creator || ""}
                  {typeof v.views === "number" && v.views > 0
                    ? ` · ${t("videoRow.viewsPrefix")} ${formatCompactNumber(v.views)}`
                    : ""}
                  {typeof v.likes === "number" && v.likes > 0
                    ? ` · ♥ ${formatCompactNumber(v.likes)}`
                    : ""}
                </p>
                {/* 카테고리 · 장르 인라인 배지 */}
                {v.category || v.genre ? (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {v.category && (
                      <span className="text-[9px] md:text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {getCategoryLabel(v.category, t)}
                      </span>
                    )}
                    {v.genre && (
                      <span className="text-[9px] md:text-[11px] px-1.5 py-0.5 rounded bg-[#6366f1]/15 text-[#a5b4fc]">
                        {getGenreLabel(v.genre, t)}
                      </span>
                    )}
                  </div>
                ) : null}
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
