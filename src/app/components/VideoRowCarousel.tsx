// ════════════════════════════════════════════════════════════════════════════
// 영상 가로 행 캐러셀 (Phase 13) — Netflix 스타일
//
// 사용법:
//   <VideoRowCarousel
//     title="🎬 당신을 위한 추천"
//     videos={recommendedList}
//     onVideoClick={(v) => setSelected(v)}
//     showProgress={true}  // 이어 보기 행은 진행률 바 표시
//   />
// ════════════════════════════════════════════════════════════════════════════
import { useRef } from "react";
import { ChevronLeft, ChevronRight, Play, Crown, Lock, Plus, ThumbsUp } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getCategoryLabel, getGenreLabel } from "../i18n/categoryLabels";
import { formatCompactNumber } from "../i18n/numberFormat";
import { AgeBadge, shouldBlur } from "./AgeBadge";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { supabase } from "../utils/supabaseClient";

export interface CarouselVideo {
  id: string;
  title: string;
  thumbnail: string | null;
  creator?: string | null;
  creator_id?: string | null;
  creator_display_name?: string | null;
  creator_avatar?: string | null;
  category?: string | null;
  genre?: string | null;       // Phase 31 — RPC 마이그레이션 후 채워짐
  ai_tool?: string | null;
  duration?: string | null;
  duration_seconds?: number | null;
  views?: number | null;
  likes?: number | null;        // Phase 31 — RPC 마이그레이션 후 채워짐
  price_standard?: number | null;
  highlight_start?: number | null;
  highlight_end?: number | null;
  // 행별 특수 필드
  last_watched_ratio?: number;
  recent_views?: number;
  is_ott?: boolean;  // OTT 영상은 PREMIUM 배지 표시
}

interface Props {
  title: string;
  subtitle?: string;
  videos: CarouselVideo[];
  onVideoClick: (video: CarouselVideo) => void;
  onAddToCart?: (video: CarouselVideo) => void;  // Phase 31.2 — 카드 hover + 버튼 클릭
  showProgress?: boolean;  // 이어 보기 행
  showRank?: boolean;      // Top 10 행 (좌측에 큰 숫자)
  emptyMessage?: string;
  // Phase 26 보강: 영상 id → age_rating 매핑 (부모가 useAgeRatings로 일괄 조회)
  ageRatings?: Record<string, string>;
}

function fmtDuration(s?: number | null) {
  if (!s) return "";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const fmtViews = formatCompactNumber;

// ────────────────────────────────────────────────────────────────────────────
// VideoCard (옵션 C — 인라인 미니 정보)
// - 카드 본체에 등급·장르 메타 항상 표시
// - 데스크탑 hover 시 썸네일 하단에 액션 버튼 오버레이 (재생/+/좋아요)
// - 모바일: 카드 탭 → ProductDetail (모달 없음, 안정적)
// ────────────────────────────────────────────────────────────────────────────
interface VideoCardProps {
  video: CarouselVideo;
  idx: number;
  onVideoClick: (v: CarouselVideo) => void;
  onAddToCart?: (v: CarouselVideo) => void;
  showProgress?: boolean;
  showRank?: boolean;
  rating: string | undefined;
  isAgeLocked: boolean;
  isOttBadge: boolean;
}

function VideoCard({ video, idx, onVideoClick, onAddToCart, showProgress, showRank, rating, isAgeLocked, isOttBadge }: VideoCardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();

  // 좋아요 토글 — supabase video_likes 직접 처리 (ProductDetail 패턴 재사용)
  const handleLikeClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      toast.info(t("video.signInRequired", "로그인 후 이용해주세요"));
      return;
    }
    try {
      const { error } = await supabase
        .from("video_likes")
        .insert({ video_id: video.id, user_id: user.id });
      if (error) {
        if ((error as any).code === "23505") {
          // 이미 좋아요 → 취소
          await supabase
            .from("video_likes")
            .delete()
            .match({ video_id: video.id, user_id: user.id });
          toast.info(t("video.unliked", "좋아요 취소"));
        } else {
          throw error;
        }
      } else {
        toast.success(t("video.liked", "♥ 좋아요"));
      }
    } catch (err: any) {
      console.error("[VideoCard] like toggle error:", err);
      toast.error(t("video.likeFailed", "좋아요 처리 실패"));
    }
  };

  // 장바구니 추가 — 부모 콜백 호출 (App.tsx의 addToCart)
  const handleCartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onAddToCart) onAddToCart(video);
  };

  return (
    <motion.button
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => onVideoClick(video)}
      className="flex-shrink-0 snap-start w-[42vw] md:w-[15vw] text-left group/card"
    >
      <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
        {showRank && (
          <div className="absolute top-1 left-1 z-10 w-8 h-8 rounded bg-black/70 backdrop-blur-sm flex items-center justify-center">
            <span className="text-lg font-black text-white">{idx + 1}</span>
          </div>
        )}
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={video.title}
            loading="lazy"
            className={`w-full h-full object-cover ${isAgeLocked ? "blur-xl scale-110" : ""}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#6366f1]/20 to-[#8b5cf6]/20">
            <Play className="w-8 h-8 text-white/50" />
          </div>
        )}

        {/* Phase 26: 19+ 잠금 오버레이 */}
        {isAgeLocked && (
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center text-center px-2 pointer-events-none">
            <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center mb-1.5">
              <Lock className="w-4 h-4 text-white" />
            </div>
            <p className="text-[10px] font-black text-white">{t("video.ageGateLockTitle")}</p>
          </div>
        )}

        {/* 진행률 바 */}
        {showProgress && typeof video.last_watched_ratio === "number" && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
            <div className="h-full bg-red-500" style={{ width: `${Math.round(video.last_watched_ratio * 100)}%` }} />
          </div>
        )}

        {/* 영상 길이 (우하단) */}
        {video.duration_seconds && (
          <div className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/70 text-white text-[10px] font-mono">
            {fmtDuration(video.duration_seconds)}
          </div>
        )}

        {/* OTT 배지 (살짝 투명, 우상단) */}
        {isOttBadge && (
          <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500/40 to-orange-500/40 backdrop-blur-sm text-white text-[9px] font-bold flex items-center gap-0.5">
            <Crown className="w-2.5 h-2.5" />
            OTT
          </div>
        )}

        {/* 연령 등급 배지 (OTT 옆 또는 우상단) */}
        {rating && rating !== "all" && (
          <div className={`absolute ${isOttBadge ? "top-1 right-12" : "top-1 right-1"}`}>
            <AgeBadge rating={rating} size="xs" />
          </div>
        )}

        {/* hover 시 액션 버튼 오버레이 (마우스 디바이스만 — 모바일은 hover 없어 자동 숨김) */}
        {!isAgeLocked && (
          <div className="flex absolute inset-x-0 bottom-0 p-2 items-center gap-1.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity">
            <span
              role="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onVideoClick(video); }}
              className="w-7 h-7 rounded-full bg-white flex items-center justify-center hover:bg-white/90 transition-colors"
              aria-label={t("videoRow.play", "재생")}
            >
              <Play className="w-3.5 h-3.5 text-black fill-black" />
            </span>
            <span
              role="button"
              onClick={handleCartClick}
              className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm border border-white/40 flex items-center justify-center hover:border-white transition-colors"
              aria-label={t("videoRow.addToCart", "장바구니")}
            >
              <Plus className="w-3.5 h-3.5 text-white" />
            </span>
            <span
              role="button"
              onClick={handleLikeClick}
              className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm border border-white/40 flex items-center justify-center hover:border-white transition-colors"
              aria-label={t("videoRow.like", "좋아요")}
            >
              <ThumbsUp className="w-3.5 h-3.5 text-white" />
            </span>
          </div>
        )}
      </div>

      {/* 메타 정보 (카드 외부) — 인라인 미니 (옵션 C) */}
      <div className="mt-1.5 px-0.5">
        <p className="text-xs md:text-base font-semibold line-clamp-2 leading-tight">{video.title}</p>
        <p className="text-[10px] md:text-xs text-muted-foreground mt-0.5 md:mt-1 truncate">
          {video.creator_display_name || video.creator || t("videoRow.nameless")}
          {video.views ? ` · ${t("videoRow.viewsPrefix")} ${fmtViews(video.views)}` : ""}
          {typeof video.likes === "number" && video.likes > 0 ? ` · ♥ ${fmtViews(video.likes)}` : ""}
        </p>
        {/* 가격 — 판매 중이면 ₩가격, 아니면 라이선스 미판매 (홈피드와 동일) */}
        <p className="text-[11px] md:text-sm font-black mt-0.5 md:mt-1">
          {typeof video.price_standard === "number" && video.price_standard > 0 ? (
            <span className="text-[#f87171]">₩{video.price_standard.toLocaleString()}</span>
          ) : (
            <span className="text-gray-500">{t("video.notForSaleShort")}</span>
          )}
        </p>
        {/* 등급 · 카테고리 · 장르 인라인 배지 */}
        {rating || video.category || video.genre ? (
          <div className="flex items-center gap-1.5 mt-1 md:mt-1.5 flex-wrap">
            {rating && (
              <span className="text-[9px] md:text-[11px] px-1.5 py-0.5 rounded border border-white/20 text-gray-300 font-semibold">
                {rating === "all" ? "전체" : rating === "19" ? "19+" : `${rating}+`}
              </span>
            )}
            {video.category && (
              <span className="text-[9px] md:text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {getCategoryLabel(video.category, t)}
              </span>
            )}
            {video.genre && (
              <span className="text-[9px] md:text-[11px] px-1.5 py-0.5 rounded bg-[#6366f1]/15 text-[#a5b4fc]">
                {getGenreLabel(video.genre, t)}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </motion.button>
  );
}

export function VideoRowCarousel({
  title,
  subtitle,
  videos,
  onVideoClick,
  onAddToCart,
  showProgress = false,
  showRank = false,
  emptyMessage,
  ageRatings,
}: Props) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const settings = useSettings();
  // 콘텐츠 정책 v2: 영상 길이가 OTT 임계값 이상이면 자동으로 OTT 배지 표시
  const ottMin = settings.ottMinSeconds || 600;
  const ageVerified = profile?.age_verified ?? false;
  const scrollRef = useRef<HTMLDivElement>(null);
  const emptyText = emptyMessage ?? t("videoRow.empty");

  const scroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.8;
    el.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  if (videos.length === 0) {
    return (
      <div className="mb-6">
        <div className="px-4 md:px-6 mb-2 h-7 flex items-end gap-2 overflow-hidden">
          <h2 className="text-base md:text-xl font-bold">{title}</h2>
          {/* 설명은 제목 오른쪽 옆에 인라인 → 모든 섹션 헤더가 한 줄 높이로 통일(빈 공간 X) */}
          {subtitle && <p className="text-xs md:text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="px-4 md:px-6">
          <p className="text-sm text-muted-foreground/60 italic">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 group/row">
      {/* 헤더 — 설명을 제목 오른쪽 옆에 인라인 배치 → 모든 섹션 한 줄 높이로 통일 */}
      <div className="px-4 md:px-6 mb-2 h-7 flex items-end gap-2 overflow-hidden">
        <h2 className="text-base md:text-xl font-bold">{title}</h2>
        {subtitle && <p className="text-xs md:text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {/* 캐러셀 컨테이너 */}
      <div className="relative">
        {/* 좌측 화살표 (데스크톱) */}
        <button
          onClick={() => scroll("left")}
          className="flex absolute left-0 top-0 bottom-0 z-10 w-12 items-center justify-center bg-gradient-to-r from-background/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
          aria-label={t("videoRow.previous")}
        >
          <ChevronLeft className="w-8 h-8 text-white" />
        </button>

        {/* 가로 스크롤 영역 */}
        <div
          ref={scrollRef}
          className="flex items-start gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-4 md:px-6 pb-2 scrollbar-hide"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          {videos.map((video, idx) => {
            const rating = ageRatings?.[video.id];
            const isMyVideo = !!user?.id && !!video.creator_id && user.id === video.creator_id;
            const isAgeLocked = !isMyVideo && shouldBlur(rating, ageVerified);
            const isOttBadge = video.is_ott || (typeof video.duration_seconds === "number" && video.duration_seconds >= ottMin);
            return (
              <VideoCard
                key={video.id}
                video={video}
                idx={idx}
                onVideoClick={onVideoClick}
                onAddToCart={onAddToCart}
                showProgress={showProgress}
                showRank={showRank}
                rating={rating}
                isAgeLocked={isAgeLocked}
                isOttBadge={isOttBadge}
              />
            );
          })}
        </div>

        {/* 우측 화살표 (데스크톱) */}
        <button
          onClick={() => scroll("right")}
          className="flex absolute right-0 top-0 bottom-0 z-10 w-12 items-center justify-center bg-gradient-to-l from-background/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity"
          aria-label={t("videoRow.next")}
        >
          <ChevronRight className="w-8 h-8 text-white" />
        </button>
      </div>
    </div>
  );
}
