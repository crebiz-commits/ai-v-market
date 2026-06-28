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

export function TrendingHeroSection({ title, subtitle, videos, onVideoClick, onAddToCart, emptyMessage }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const restScrollRef = useRef<HTMLDivElement>(null);
  const likingRef = useRef<Set<string>>(new Set());  // 영상별 좋아요 in-flight 가드(더블클릭 경합 방지)

  // 좋아요 토글 (2~10위 카드용)
  const handleLikeClick = async (e: React.MouseEvent, v: CarouselVideo) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.info(t("video.signInRequired", "로그인 후 이용해주세요"));
      return;
    }
    if (likingRef.current.has(v.id)) return;
    likingRef.current.add(v.id);
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
    } finally {
      likingRef.current.delete(v.id);
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
        <div className="mb-2 h-7 flex items-end gap-2 overflow-hidden">
          <h2 className="text-base md:text-xl font-bold">{title}</h2>
          {subtitle && <p className="text-xs md:text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <p className="text-sm text-muted-foreground py-4">{emptyMessage}</p>
      </section>
    );
  }

  const ranked = videos.slice(0, 10);  // 1위~10위 (모두 같은 크기 세로형)

  return (
    <section className="mb-8">
      {/* 섹션 제목 — VideoRowCarousel 과 동일하게 한 줄(설명 인라인) + mb-2 로 간격 통일 */}
      <div className="px-4 md:px-6 mb-2 h-7 flex items-end gap-2 overflow-hidden">
        <h2 className="text-base md:text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-xs md:text-sm text-muted-foreground">{subtitle}</p>}
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
            const twoDigit = rank >= 10;  // "10" 은 두 자리라 폭이 넓음 → 폰트 축소·자간 좁힘으로 한 자리와 비슷하게
            return (
              <button
                key={v.id}
                onClick={() => onVideoClick(v)}
                className="flex-shrink-0 cursor-pointer group/card text-left pl-[14vw] md:pl-[5vw]"
              >
                <div className="w-[30vw] md:w-[11vw]">
                  {/* 포스터+숫자 래퍼 — 숫자를 포스터 높이 안에만 두어 제목/세부내역을 가리지 않음 */}
                  <div className="relative">
                  {/* 거대 브랜드 그라데이션 순위 숫자 — 포스터 왼쪽 하단에 겹쳐 배치(포스터 뒤) */}
                  <span className={`absolute right-full bottom-0 -mr-[6vw] md:-mr-[2.2vw] z-0 pointer-events-none select-none font-black italic leading-[0.7] text-transparent bg-clip-text bg-gradient-to-b from-[#a78bfa] via-[#ec4899] to-[#f59e0b] drop-shadow-[0_4px_12px_rgba(236,72,153,0.45)] text-[44vw] md:text-[16vw] ${twoDigit ? "scale-x-[0.65] origin-right tracking-[-0.06em]" : ""}`}>
                    {rank}
                  </span>
                  {/* 포스터 */}
                  <div className="relative z-10 aspect-[2/3] rounded-lg overflow-hidden bg-card">
                    {v.thumbnail && (
                      <img
                        src={v.thumbnail}
                        alt={v.title}
                        className="w-full h-full object-cover group-hover/card:scale-105 transition-transform"
                      />
                    )}
                  {/* 길이 배지 (우하단) */}
                  {v.duration_seconds ? (
                    <span className="absolute bottom-1.5 right-1.5 px-1 py-0.5 bg-black/80 rounded text-[10px] font-semibold text-white">
                      {fmtDuration(v.duration_seconds)}
                    </span>
                  ) : null}
                  {/* hover 시 액션 버튼 오버레이 — hover 가능한 기기(마우스)에서만 렌더.
                      터치 기기(폰/앱)에선 hidden: opacity-0 만으론 영역이 남아 탭을 가로채므로 display:none. */}
                  <div className="hidden [@media(hover:hover)]:flex absolute inset-x-0 top-0 p-2 items-center gap-1.5 bg-gradient-to-b from-black/95 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity">
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
                </div>
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
