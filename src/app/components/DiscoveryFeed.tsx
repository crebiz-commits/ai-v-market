import { useState, useRef, useEffect, memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Share2, ShoppingCart, Volume2, VolumeX, Loader2, Play, MessageCircle, MessageSquare, Send, ChevronRight, ChevronLeft, ExternalLink, Maximize2, Search } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { CommentPanel } from "./CommentPanel";
import { ShareModal } from "./ShareModal";
import { useBlockedUsers } from "../hooks/useBlockedUsers";
import { FollowButton } from "./FollowButton";
import { mergeShowcase, shouldShowShowcase, handleShowcaseClick } from "../utils/showcase";
import type { ShowcaseVideo } from "../data/showcaseVideos";
import { AgeBadge, shouldBlur } from "./AgeBadge";
import { Lock } from "lucide-react";
import { VideoFullscreen } from "./VideoFullscreen";
import { CreatorAvatar } from "./CreatorAvatar";
import { useCreatorInfo } from "../hooks/useCreatorInfo";
import { useBackButton } from "../hooks/useBackButton";
import { toast } from "sonner";

interface Ad {
  id: string;
  title: string;
  advertiser: string;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  link_url: string;
  cta_text: string;
  interval_count: number;
}

type FeedItem =
  | ({ kind: "video" } & Video)
  | ({ kind: "ad"; adIndex?: number } & Ad);

interface Video {
  // 기본 정보
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  creatorId?: string;
  likes: number;
  price: number;
  duration: string;
  durationSeconds?: number;   // 페이월 게이트용 (Phase 4)
  resolution?: string;
  tool: string;
  category?: string;
  genre?: string;
  videoUrl: string;
  description?: string;
  tags?: string[];
  // Phase 26: 연령 등급
  age_rating?: "all" | "13" | "15" | "19";

  // 라이선스 (All-in-One 단일가)
  priceStandard?: number;

  // AI 제작 증빙
  aiModelVersion?: string;
  prompt?: string;
  seed?: string;

  // 시네마 메타데이터
  director?: string;
  writer?: string;
  composer?: string;
  castCredits?: string;
  productionYear?: number;
  language?: string;
  subtitleLanguage?: string;

  // 공개 설정 + 하이라이트
  visibility?: "public" | "unlisted" | "private";
  highlightStart?: number;
  highlightEnd?: number;
}

interface DiscoveryFeedProps {
  onVideoClick: (video: Video) => void;
  onSignInClick?: () => void;
  onViewCreator?: (creatorId: string) => void;
  onOpenSearch?: (query?: string) => void;   // 데스크탑 홈 검색 진입 → SearchPage (검색어 전달)
}

// 홈 칩 필터 — get_home_feed 의 p_filter 와 1:1. (전체 외엔 CREAITE 고유 분류)
const HOME_CHIPS: { key: string; ko: string; en: string }[] = [
  { key: "all", ko: "전체", en: "All" },
  { key: "popular", ko: "🔥 인기", en: "🔥 Popular" },
  { key: "new", ko: "✨ 최신", en: "✨ New" },
  { key: "free", ko: "🆓 무료시청", en: "🆓 Free" },
  { key: "paid", ko: "💎 소장가능", en: "💎 For sale" },
  { key: "cinema", ko: "🎬 시네마급", en: "🎬 Long-form" },
];

// 📢 Ad Card Component
const AdCard = memo(({ ad, onImpression }: { ad: Ad; onImpression: (id: string) => void }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const impressionTracked = useRef(false);

  useEffect(() => {
    if (!cardRef.current || impressionTracked.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          onImpression(ad.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [ad.id, onImpression]);

  const handleClick = async () => {
    try {
      try { await supabase.rpc("increment_ad_clicks", { ad_id: ad.id }); } catch {}
    } catch {}
    window.open(ad.link_url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      ref={cardRef}
      className="discovery-section relative overflow-hidden cursor-pointer group"
      onClick={handleClick}
    >
      {/* 배경: 이미지 우선, 없으면 영상, 없으면 썸네일 fallback */}
      {ad.image_url ? (
        <img
          src={ad.image_url}
          alt={ad.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : ad.video_url ? (
        // 영상 광고: 자동 재생 + 무한 루프 + 음소거 (TikTok 스타일)
        <video
          src={ad.video_url}
          poster={ad.thumbnail_url || undefined}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          loop
          muted
          playsInline
        />
      ) : ad.thumbnail_url ? (
        <img
          src={ad.thumbnail_url}
          alt={ad.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        // 비주얼 자료가 전혀 없으면 그라디언트 배경
        <div className="absolute inset-0 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6]" />
      )}
      {/* 그라디언트 오버레이 — 하단 텍스트 영역만 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

      {/* 광고 배지 */}
      <div className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-black/50 backdrop-blur-sm border border-white/20 rounded-full text-[10px] font-bold text-white/70 tracking-widest">
        AD
      </div>

      {/* 콘텐츠 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
        {ad.advertiser && (
          <p className="text-xs text-white/60 font-medium mb-1">{ad.advertiser}</p>
        )}
        <p className="text-white font-bold text-base leading-snug mb-3">{ad.title}</p>
        <button
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-white/90 transition-colors"
          onClick={handleClick}
        >
          {ad.cta_text}
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

// ✨ 액션 버튼 (글래스 + 글로우 스타일)
const ActionButtons = memo(({ video, isLiked, onToggleLike, onComment, onShare, commentCount = 0 }: {
  video: Video;
  isLiked: boolean;
  onToggleLike: (id: string, currentlyLiked: boolean) => void;
  onComment: (video: Video) => void;
  onShare: (video: Video) => void;
  commentCount?: number;
}) => {
  const { t } = useTranslation();
  const [showRipple, setShowRipple] = useState(false);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLiked) {
      setShowRipple(true);
      setTimeout(() => setShowRipple(false), 600);
    }
    onToggleLike(video.id, isLiked);
  };

  return (
    <div className="absolute right-2 bottom-[60px] z-40 flex flex-col gap-2.5 items-center pointer-events-auto">
      {/* 좋아요 — ripple + glow */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={handleLike}
        className="flex flex-col items-center relative"
        aria-label={t("common.like")}
      >
        <AnimatePresence>
          {showRipple && (
            <motion.div
              initial={{ scale: 1, opacity: 0.7 }}
              animate={{ scale: 2.2, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute top-0 left-0 right-0 mx-auto w-10 h-10 rounded-full bg-red-500 pointer-events-none"
            />
          )}
        </AnimatePresence>
        <div
          className={`relative w-10 h-10 rounded-full backdrop-blur-xl flex items-center justify-center border-2 transition-all ${
            isLiked
              ? "bg-red-500/30 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.6)]"
              : "bg-white/10 border-white/30"
          }`}
        >
          <Heart
            className={`w-[18px] h-[18px] ${isLiked ? "fill-red-400 text-red-400" : "text-white"}`}
            strokeWidth={1.8}
          />
        </div>
        <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
          {video.likes.toLocaleString()}
        </span>
      </motion.button>

      {/* 댓글 — 부드러운 pulse + purple glow */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        onClick={(e) => { e.stopPropagation(); onComment(video); }}
        className="flex flex-col items-center"
        aria-label={t("common.comment")}
      >
        <div className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.4)]">
          <MessageCircle className="w-[18px] h-[18px] text-white" strokeWidth={1.8} />
        </div>
        <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
          {commentCount > 0 ? commentCount.toLocaleString() : t("common.comment")}
        </span>
      </motion.button>

      {/* 공유 — hover 회전 + cyan glow */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        whileHover={{ rotate: 15 }}
        onClick={(e) => { e.stopPropagation(); onShare(video); }}
        className="flex flex-col items-center"
        aria-label={t("common.share")}
      >
        <div className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
          <Send className="w-[18px] h-[18px] text-white -rotate-12" strokeWidth={1.8} />
        </div>
        <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">{t("common.share")}</span>
      </motion.button>
    </div>
  );
});
ActionButtons.displayName = "ActionButtons";

// 🎬 Movie Section Component (2 per screen)
const MovieSection = memo(({
  video,
  isActive,
  isMuted,
  onToggleMute,
  onVideoClick,
  isLiked,
  onToggleLike,
  onSetActive,
  onComment,
  onShare,
  onFullscreen,
  commentCount = 0,
  creatorAvatar = null,
  creatorName = null,
  onViewCreator,
  onSignInClick,
}: {
  video: Video;
  isActive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onVideoClick: (video: Video) => void;
  isLiked: boolean;
  onToggleLike: (id: string, currentlyLiked: boolean) => void;
  onSetActive: (id: string) => void;
  onComment: (video: Video) => void;
  onShare: (video: Video) => void;
  onFullscreen: (video: Video) => void;
  commentCount?: number;
  creatorAvatar?: string | null;
  creatorName?: string | null;
  onViewCreator?: (creatorId: string) => void;
  onSignInClick?: () => void;
}) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const retryCountRef = useRef(0);  // 자동 재시도 카운터 (최대 2회)
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  // Phase 26: 19+ 연령 잠금 여부 (본인 영상은 게이트 제외)
  const { profile, user } = useAuth();
  const ageVerified = profile?.age_verified ?? false;
  const isMyVideo = !!user?.id && !!video.creatorId && user.id === video.creatorId;
  const isAgeLocked = !isMyVideo && shouldBlur(video.age_rating, ageVerified);

  // Effect 1: 플레이어 생성/삭제 — video 소스가 바뀔 때만 (isActive 제외!)
  // isActive를 deps에 넣으면 dispose()가 <video> DOM을 제거해 videoRef가 죽은 요소를 참조하게 됨
  useEffect(() => {
    if (!videoRef.current || !video.videoUrl) return;

    setIsPlaying(false);

    const player = videojs(videoRef.current, {
      autoplay: false,
      controls: false,
      loop: true,
      muted: true,
      fill: true,
      responsive: true,
      playsinline: true,
      preload: "metadata",
      crossOrigin: 'anonymous',
      sources: [{
        src: video.videoUrl,
        type: video.videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
      }]
    });

    playerRef.current = player;
    retryCountRef.current = 0;
    player.muted(isMuted);
    player.ready(() => setPlayerReady(true));

    player.on('playing', () => {
      setIsPlaying(true);
      retryCountRef.current = 0;  // 재생 성공 시 카운터 초기화
    });
    player.on('pause',   () => setIsPlaying(false));
    player.on('waiting', () => setIsPlaying(false));
    player.on('ended',   () => setIsPlaying(false));
    player.on('error',   () => {
      setIsPlaying(false);
      const err = player.error();
      // MEDIA_ERR_NETWORK(2) 또는 MEDIA_ERR_SRC_NOT_SUPPORTED(4) 시 자동 재시도 (최대 2회)
      if (err && (err.code === 4 || err.code === 2)) {
        if (retryCountRef.current < 2) {
          retryCountRef.current += 1;
          // 1.5초 후 src 재설정 + 재생 시도 (네트워크 회복 / CDN 캐시 안정 대기)
          setTimeout(() => {
            const p = playerRef.current;
            if (!p || p.isDisposed()) return;
            try {
              p.src({
                src: video.videoUrl,
                type: video.videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4',
              });
              p.load();
              p.play()?.catch(() => {});
            } catch { /* 무시 */ }
          }, 1500);
        } else {
          // 2회 재시도 실패 → 사용자에게 에러 표시
          setHasError(true);
        }
      }
    });

    player.on('timeupdate', () => {
      const s = video.highlightStart || 0;
      let e = video.highlightEnd || (s + 30);
      const d = player.duration();
      if (typeof d === 'number' && d > 0 && e > d) e = d; // 30초 미만이면 전체 재생
      const t = player.currentTime();
      if (typeof t === 'number' && t >= e) {
        player.currentTime(s);
        player.play()?.catch(() => {});
      }
    });

    return () => {
      setPlayerReady(false);
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [video.id, video.videoUrl]); // ← isActive 없음

  // Effect 2: 활성/비활성 전환
  // playerReady를 deps에 포함 → isActive=true일 때 플레이어가 아직 준비 안 됐으면
  // playerReady가 true로 바뀌는 순간 자동으로 이 effect가 재실행돼 재생됨
  useEffect(() => {
    if (!isActive) {
      const player = playerRef.current;
      // 전체화면 중인 영상은 일시정지/리셋하지 않음
      if (player && !player.isDisposed() && !player.isFullscreen()) {
        player.pause();
        player.currentTime(video.highlightStart || 0);
        setIsPlaying(false);
      }
      return;
    }

    if (!playerReady) return;

    const player = playerRef.current;
    if (!player || player.isDisposed()) return;

    player.currentTime(video.highlightStart || 0);
    player.muted(isMuted);
    const playPromise = player.play();
    if (playPromise) {
      playPromise.catch(() => {
        if (!player.isDisposed()) {
          player.muted(true);
          player.play()?.catch(() => {});
        }
      });
    }
  }, [isActive, playerReady]);

  // Effect 3: 뮤트 상태 반영
  useEffect(() => {
    if (playerRef.current && !playerRef.current.isDisposed()) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

  return (
    <div
      className="discovery-section snap-start w-full relative bg-black overflow-hidden"
      data-video-id={video.id}
    >
      {/* 🎬 Video — 전체 높이 */}
      <div className="absolute inset-0">
        <img
          src={video.thumbnail}
          alt=""
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 z-[15] pointer-events-none ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
        />
        <div className="relative w-full h-full z-10 pointer-events-none">
          <video
            ref={videoRef}
            className="video-js vjs-big-play-centered w-full h-full"
            playsInline
            poster={video.thumbnail}
          />
          {hasError && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-center pointer-events-auto">
              <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin mb-2" />
              <p className="text-white text-xs">영상 처리 중...</p>
            </div>
          )}
        </div>
      </div>

      {/* 클릭 재생/정지 */}
      <div
        className="absolute inset-0 z-20 cursor-pointer pointer-events-auto"
        onClick={() => {
          if (!isActive) {
            // 비활성 카드 탭 → 이 카드를 활성화 (스크롤과 동일한 효과)
            onSetActive(video.id);
            return;
          }
          // 활성 카드 탭 → 재생/정지 토글
          if (playerRef.current && !playerRef.current.isDisposed()) {
            if (playerRef.current.paused()) playerRef.current.play().catch(() => {});
            else playerRef.current.pause();
          }
        }}
      />

      {/* 상단 레이블 + 음소거 + 전체화면 (좌상단 세로 정렬) */}
      <div className="absolute top-3 left-3 z-30 flex flex-col gap-2 items-start">
        <span className="px-2.5 py-1 bg-black/60 backdrop-blur-md rounded-md text-white font-bold text-[10px] border border-white/10 uppercase tracking-tight pointer-events-none">
          {video.tool}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white pointer-events-auto"
          aria-label={isMuted ? "음소거 해제" : "음소거"}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            // 모든 영상 즉시 일시정지 (다중 소리 방지)
            document.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
              v.pause();
              v.muted = true;
            });
            onFullscreen(video);
          }}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white pointer-events-auto"
          aria-label={t("videoFullscreen.fullscreen")}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      </div>

      {/* 재생 아이콘 */}
      {!isPlaying && isActive && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-25">
          <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/20">
            <Play className="w-5 h-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}

      {/* Phase 26: 19+ 잠금 오버레이 (본인 영상 제외) — 클릭 시 ProductDetail 진입 → 거기서 자동 게이트 */}
      {isAgeLocked && (
        <button
          onClick={(e) => { e.stopPropagation(); onVideoClick(video); }}
          className="absolute inset-0 z-30 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center text-center p-4 cursor-pointer hover:bg-black/85 transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <p className="text-base font-black text-white mb-1">{t("video.ageGateLockTitle")}</p>
          <p className="text-xs text-gray-300 underline">{t("video.ageGateLockHint")}</p>
        </button>
      )}

      {/* 우측 액션 버튼 (글래스 + 글로우 스타일) */}
      <ActionButtons
        video={video}
        isLiked={isLiked}
        onToggleLike={onToggleLike}
        onComment={onComment}
        onShare={onShare}
        commentCount={commentCount}
      />

      {/* 🔻 하단 그라디언트 오버레이 + 정보 */}
      <div className="absolute bottom-0 left-0 right-0 z-30 pointer-events-none"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.6) 50%, transparent 100%)" }}
      >
        <div className="px-3 pt-8 pb-3 pointer-events-auto">
          {/* 제목 + 크리에이터 + 팔로우 */}
          <div className="flex items-center gap-2 mb-1.5">
            {video.creatorId && onViewCreator ? (
              <button
                onClick={(e) => { e.stopPropagation(); onViewCreator(video.creatorId!); }}
                className="flex items-center gap-2 hover:text-white transition-colors"
              >
                <CreatorAvatar avatarUrl={creatorAvatar} name={creatorName ?? video.creator} size="xs" />
                <span className="text-[13px] font-semibold text-white/80 hover:text-white">{creatorName ?? video.creator}</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <CreatorAvatar avatarUrl={creatorAvatar} name={creatorName ?? video.creator} size="xs" />
                <span className="text-[13px] font-semibold text-white/80">{creatorName ?? video.creator}</span>
              </div>
            )}
            {video.creatorId && (
              <FollowButton creatorId={video.creatorId} onSignInClick={onSignInClick} size="sm" />
            )}
            <AgeBadge rating={(video as any).age_rating} size="xs" />
          </div>
          <h3 className="text-sm font-bold text-white leading-tight line-clamp-1 mb-2 pr-16">{video.title}</h3>

          {/* 가격 + 버튼 — ₩0 영상은 "무료 시청 / 라이선스 미판매" 로 표시 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                {video.price > 0 ? (
                  <>
                    <span className="text-[10px] text-white/50 font-medium leading-none mb-1">{t("video.downloadCommercial")}</span>
                    <span className="text-sm font-black text-[#f87171]">₩{video.price.toLocaleString()}</span>
                  </>
                ) : (
                  <>
                    <span className="text-[10px] text-white/50 font-medium leading-none mb-1">{t("video.freeWatch")}</span>
                    <span className="text-sm font-black text-gray-400">{t("video.notForSaleShort")}</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onVideoClick(video); }}
              className="aurora-btn h-7 px-3 text-white font-bold rounded-full text-[10px] flex items-center gap-1 border border-white/20 shadow-lg"
            >
              {t("video.movieDetail")} <ChevronRight className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

MovieSection.displayName = "MovieSection";

// DB row → Video 매핑 (초기 로드 + 무한 스크롤 페이지에서 공통 사용)
function mapVideoRow(item: any): Video {
  return {
    id: item.id,
    thumbnail: item.thumbnail,
    title: item.title,
    creator: item.creator || "AI Creator",
    creatorId: item.creator_id || undefined,
    likes: item.likes || 0,
    price: item.price_standard || 0,
    duration: item.duration || "0:00",
    durationSeconds: item.duration_seconds || 0,
    resolution: item.resolution || undefined,
    tool: item.ai_tool || "AI Tool",
    category: item.category || undefined,
    genre: item.genre || undefined,
    videoUrl: item.video_url || "",
    age_rating: item.age_rating || "all",
    description: item.description || undefined,
    tags: Array.isArray(item.tags) ? item.tags : (typeof item.tags === "string" && item.tags ? item.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : []),
    priceStandard: item.price_standard || 0,
    aiModelVersion: item.ai_model_version || undefined,
    prompt: item.prompt || undefined,
    seed: item.seed || undefined,
    director: item.director || undefined,
    writer: item.writer || undefined,
    composer: item.composer || undefined,
    castCredits: item.cast_credits || undefined,
    productionYear: item.production_year || undefined,
    language: item.language || undefined,
    subtitleLanguage: item.subtitle_language || undefined,
    visibility: item.visibility || "public",
    highlightStart: item.highlight_start || 0,
    highlightEnd: item.highlight_end || ((item.highlight_start || 0) + 30),
  } as Video;
}

// 홈 피드 한 페이지 크기 (무한 스크롤)
const FEED_PAGE_SIZE = 12;

export function DiscoveryFeed({ onVideoClick, onSignInClick, onViewCreator, onOpenSearch }: DiscoveryFeedProps) {
  const { i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const [searchInput, setSearchInput] = useState("");   // 데스크탑 홈 검색바
  const [chip, setChip] = useState("all");              // 홈 칩 필터 (전체/인기/최신/무료/소장가능/시네마급)
  const chipScrollRef = useRef<HTMLDivElement>(null);   // 칩 바 가로 스크롤 (유튜브식 화살표)
  const [chipArrows, setChipArrows] = useState({ left: false, right: false });
  const [totalCount, setTotalCount] = useState<number | null>(null);  // 현재 칩 기준 전체 영상 수 (배지)
  const [videos, setVideos] = useState<Video[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(true);
  const [commentVideo, setCommentVideo] = useState<Video | null>(null);
  const [shareTarget, setShareTarget] = useState<Video | null>(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<Video | null>(null);
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  // 무한 스크롤 — 전 영상을 페이지 단위로 끊김 없이 로드
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);          // 다음 페이지 시작 위치 (DB row 기준)
  const hasMoreRef = useRef(true);      // 클로저 stale 방지용
  const fetchingRef = useRef(false);    // 중복 호출 방지
  const chipRef = useRef("all");        // 현재 칩 필터 (loadMore stale 방지용)
  const { user, profile } = useAuth();
  const { isBlocked } = useBlockedUsers();
  const showcase = shouldShowShowcase(profile?.is_admin);

  // ShowcaseVideo → Video 변환
  const showcaseToVideo = (s: ShowcaseVideo): Video => ({
    id: s.id,
    thumbnail: s.thumbnail,
    title: s.title,
    creator: s.creator,
    creatorId: s.creatorId,
    likes: s.likes,
    price: s.price,
    duration: s.duration,
    durationSeconds: s.durationSeconds,
    resolution: s.resolution,
    tool: s.tool,
    category: s.category,
    videoUrl: "",
    tags: s.tags ? s.tags.split(",").map(t => t.trim()) : [],
    priceStandard: s.price,
    visibility: "public",
    age_rating: "all" as any,
  });
  // Phase 24: 차단 사용자 영상은 피드에서 제외
  const visibleVideos = videos.filter((v) => !v.creatorId || !isBlocked(v.creatorId));
  // Phase 6.6 — 영상별 크리에이터 아바타 매핑
  const creatorInfo = useCreatorInfo(visibleVideos.map((v) => v.creatorId));
  const containerRef = useRef<HTMLDivElement>(null);

  // 모바일 뒤로가기로 전체화면 / 댓글 패널 닫기
  useBackButton(!!fullscreenVideo, () => setFullscreenVideo(null));
  useBackButton(!!commentVideo, () => setCommentVideo(null));

  // 전체화면 모달 열렸을 때: 피드 영상 자동재생 차단 (회전/리사이즈 대응)
  useEffect(() => {
    if (!fullscreenVideo || !containerRef.current) return;
    const feedVideos = Array.from(
      containerRef.current.querySelectorAll<HTMLVideoElement>("video")
    );
    // 1) 즉시 모두 일시정지 + 음소거
    feedVideos.forEach((v) => { v.pause(); v.muted = true; });
    // 2) play 이벤트 발생 즉시 다시 pause (autoplay 재발동 차단)
    const onPlay = (e: Event) => (e.target as HTMLVideoElement).pause();
    feedVideos.forEach((v) => v.addEventListener("play", onPlay));
    // 3) 회전/리사이즈 백업 — 이벤트 시 다시 일시정지
    const pauseAll = () => feedVideos.forEach((v) => v.pause());
    window.addEventListener("resize", pauseAll);
    window.addEventListener("orientationchange", pauseAll);
    return () => {
      feedVideos.forEach((v) => v.removeEventListener("play", onPlay));
      window.removeEventListener("resize", pauseAll);
      window.removeEventListener("orientationchange", pauseAll);
    };
  }, [fullscreenVideo]);

  // 무한 스크롤: 다음 페이지 로드 — 전 영상을 우선순위(최신순) 순서대로 끊김 없이.
  // 홈 피드는 "모든 영상의 하이라이트 코너"이므로 100편이든 10000편이든 전부 노출된다.
  const loadMore = useCallback(async () => {
    if (fetchingRef.current || !hasMoreRef.current) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    const reqChip = chipRef.current;   // 요청 시점 칩 스냅샷 (변경 시 결과 폐기 — 경쟁 방지)
    try {
      const from = offsetRef.current;
      // 개인화 추천: 시청이력·좋아요·팔로우 기반 순위 (비로그인/이력없음은 인기+최신).
      // 모든 show_on_home 영상이 포함되며 우선순위만 달라짐. id 타이브레이커로 페이지 안정.
      const { data, error } = await supabase.rpc("get_home_feed", {
        p_limit: FEED_PAGE_SIZE,
        p_offset: from,
        p_filter: reqChip,
      });
      if (error) throw error;
      // 도중에 칩이 바뀌었으면 이전 칩 결과를 버린다 (초기화 로직이 새로 로드함)
      if (reqChip !== chipRef.current) return;
      const rows = data || [];
      offsetRef.current = from + rows.length;
      if (rows.length < FEED_PAGE_SIZE) { hasMoreRef.current = false; setHasMore(false); }
      if (rows.length > 0) {
        let mapped = rows.map(mapVideoRow);
        // Showcase Mode(데모)일 때만 첫 페이지에 Mock 합성 (현재 비활성)
        if (from === 0 && showcase) mapped = mergeShowcase<Video>(mapped, showcaseToVideo);
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          return [...prev, ...mapped.filter((v) => !seen.has(v.id))];
        });
        setActiveId((prev) => prev ?? mapped[0]?.id ?? null);
        // 댓글 수 — 새 페이지 영상만 조회해 누적 병합
        const ids = mapped.map((v) => v.id).filter((id) => !id.startsWith("demo-"));
        if (ids.length > 0) {
          const { data: countData } = await supabase.from("comments")
            .select("video_id").in("video_id", ids).is("parent_id", null);
          if (countData) {
            const counts: Record<string, number> = {};
            countData.forEach((c: any) => { counts[c.video_id] = (counts[c.video_id] || 0) + 1; });
            setCommentCounts((prev) => ({ ...prev, ...counts }));
          }
        }
      }
    } catch (e) {
      console.error("loadMore error:", e);
    } finally {
      fetchingRef.current = false;
      setLoadingMore(false);
    }
  }, [showcase]);

  // 초기 로드: 광고 + 좋아요 상태 + 첫 페이지 영상 (user/칩 변경 시 처음부터 재시작)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // 페이지네이션 상태 리셋 (칩 필터 반영)
      chipRef.current = chip;
      offsetRef.current = 0;
      hasMoreRef.current = true;
      fetchingRef.current = false;
      setHasMore(true);
      setVideos([]);
      setActiveId(null);
      try {
        // 홈 피드 광고: feed_display 타입만 (video_preroll은 재생 직전에만 노출)
        const adResult = await supabase.from("ads")
          .select("id,title,advertiser,image_url,video_url,thumbnail_url,link_url,cta_text,interval_count,ad_type")
          .eq("is_active", true)
          .or("ad_type.eq.feed_display,ad_type.is.null")
          .or("starts_at.is.null,starts_at.lte." + new Date().toISOString())
          .or("ends_at.is.null,ends_at.gte." + new Date().toISOString());
        if (!cancelled && adResult.data && adResult.data.length > 0) setAds(adResult.data as Ad[]);

        if (!cancelled && user) {
          const { data: likesData } = await supabase.from("video_likes")
            .select("video_id").eq("user_id", user.id);
          if (!cancelled && likesData) setLikedVideos(new Set(likesData.map((l) => l.video_id)));
        }

        if (!cancelled) await loadMore();
      } catch (error) {
        console.error("Error fetching discovery data:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, chip, loadMore]);

  // 칩 바 좌우 화살표 표시 여부 (유튜브식: 넘칠 때만, 스크롤 위치 따라)
  const updateChipArrows = useCallback(() => {
    const el = chipScrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setChipArrows((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);
  useEffect(() => {
    updateChipArrows();
    const id = window.setTimeout(updateChipArrows, 100); // 레이아웃 안정 후 한 번 더
    window.addEventListener("resize", updateChipArrows);
    return () => { window.clearTimeout(id); window.removeEventListener("resize", updateChipArrows); };
  }, [updateChipArrows]);
  const scrollChips = (dir: "left" | "right") => {
    const el = chipScrollRef.current;
    if (el) el.scrollBy({ left: dir === "right" ? 180 : -180, behavior: "smooth" });
  };

  // 홈피드 전체 영상 수 (배지용) — 현재 칩 기준 전체 (로드된 수 아님)
  useEffect(() => {
    let cancelled = false;
    setTotalCount(null);
    supabase.rpc("get_home_feed_count", { p_filter: chip }).then(
      ({ data }) => { if (!cancelled && typeof data === "number") setTotalCount(data); },
      () => {},
    );
    return () => { cancelled = true; };
  }, [chip]);

  // 무한 스크롤 트리거: 피드 끝 근처 sentinel이 보이면 다음 페이지 로드
  useEffect(() => {
    if (loading) return;
    const sentinels = Array.from(document.querySelectorAll<HTMLElement>(".feed-load-sentinel"));
    if (sentinels.length === 0) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { root: null, rootMargin: "800px 0px" });
    sentinels.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, [loading, loadMore]);

  // 노출 트래킹
  const handleAdImpression = useCallback(async (adId: string) => {
    try { await supabase.rpc("increment_ad_impressions", { ad_id: adId }); } catch {}
  }, []);

  // 영상 목록에 광고를 interval_count마다 삽입하여 피드 아이템 배열 생성
  // Phase 24: 차단 사용자 영상은 visibleVideos 기준으로 제외
  const feedItems = (() => {
    if (ads.length === 0) return visibleVideos.map(v => ({ kind: "video" as const, ...v }));
    const interval = ads[0].interval_count || 4;
    const result: FeedItem[] = [];
    let adIdx = 0;
    visibleVideos.forEach((v, i) => {
      result.push({ kind: "video", ...v });
      if ((i + 1) % interval === 0 && ads.length > 0) {
        result.push({ kind: "ad", ...ads[adIdx % ads.length], adIndex: adIdx });
        adIdx++;
      }
    });
    return result;
  })();

  // 스크롤 스냅 완료 후 상단 영상 감지 및 활성화
  useEffect(() => {
    const container = containerRef.current;
    if (!container || videos.length === 0) return;

    const detectActive = () => {
      // 전체화면 중에는 active 자동 변경 금지 (전체화면 영상 유지)
      const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement;
      if (fsEl) return;
      // scrollTop + offsetHeight 기반: 뷰포트 좌표 무관, 마우스 휠/터치 모두 정확
      const wrappers = Array.from(
        container.querySelectorAll<HTMLElement>(".discovery-section-wrapper")
      );
      if (wrappers.length === 0) return;

      const sectionHeight = wrappers[0].offsetHeight;
      if (sectionHeight === 0) return;

      const scrollTop = container.scrollTop;
      const idx = Math.round(scrollTop / sectionHeight);
      const targetWrapper = wrappers[Math.min(idx, wrappers.length - 1)];
      if (!targetWrapper) return;

      // 광고 카드는 data-video-id 없음 → null → 모든 영상 정지
      const section = targetWrapper.querySelector<HTMLElement>("[data-video-id]");
      const videoId = section ? section.getAttribute("data-video-id") : null;
      setActiveId(prev => (prev !== videoId ? videoId : prev));
    };

    // scrollend: 스냅 완전히 멈춘 후 (Chrome 114+, Firefox 109+)
    container.addEventListener("scrollend", detectActive, { passive: true });

    // scroll + 디바운스: iOS Safari / 데스크탑 마우스 휠 fallback
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(detectActive, 350);
    };
    container.addEventListener("scroll", onScroll, { passive: true });

    // 초기 로드
    detectActive();

    return () => {
      container.removeEventListener("scrollend", detectActive);
      container.removeEventListener("scroll", onScroll);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [videos, loading]); // loading 포함: setVideos와 setLoading(false)가 다른 배치로 커밋돼
                         // loading=false 시점에 container가 생기므로 재실행 필요

  const toggleLike = async (videoId: string, currentlyLiked: boolean) => {
    if (handleShowcaseClick(videoId)) return;
    if (!user) {
      if (onSignInClick) onSignInClick();
      return;
    }

    setLikedVideos(prev => {
      const n = new Set(prev);
      currentlyLiked ? n.delete(videoId) : n.add(videoId);
      return n;
    });

    setVideos(prev => prev.map(v => 
      v.id === videoId ? { ...v, likes: v.likes + (currentlyLiked ? -1 : 1) } : v
    ));

    try {
      if (currentlyLiked) {
        await supabase.from("video_likes").delete().match({ video_id: videoId, user_id: user.id });
      } else {
        await supabase.from("video_likes").insert({ video_id: videoId, user_id: user.id });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      // 실패 → 낙관적 업데이트 롤백 (UI/DB 불일치 방지)
      setLikedVideos(prev => {
        const n = new Set(prev);
        currentlyLiked ? n.add(videoId) : n.delete(videoId);
        return n;
      });
      setVideos(prev => prev.map(v =>
        v.id === videoId ? { ...v, likes: v.likes + (currentlyLiked ? 1 : -1) } : v
      ));
    }
  };

  const handleShare = useCallback(async (video: Video) => {
    if (handleShowcaseClick(video.id)) return;
    const url = `${window.location.origin}?video=${video.id}`;
    const shareData = { title: video.title, text: `CREAITE: ${video.title}`, url };
    // 모바일: 네이티브 공유 시트 우선
    if (navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return;
        // AbortError 외 실패는 모달 폴백
      }
    }
    // 데스크탑 또는 네이티브 공유 미지원: ShareModal
    setShareTarget(video);
  }, []);

  if (loading) return <div className="h-full flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 text-[#6366f1] animate-spin" /></div>;
  if (videos.length === 0) return <div className="h-full flex items-center justify-center bg-background text-muted-foreground">표시할 영상이 없습니다.</div>;

  const isCommentOpen = commentVideo !== null;

  return (
    <div className="discovery-feed-wrapper h-full w-full bg-[#0a0a0a] overflow-hidden flex flex-col">
      {/* SEO + Google OAuth 브랜딩 인증용 약관 링크 (시각적 노출 X, 봇 인식 O)
          DiscoveryFeed 가 첫 화면이고 푸터가 없어서 약관 링크가 노출 안 됨 → 추가 */}
      <nav aria-label="법적 고지" className="sr-only">
        <a href="?info=privacy">개인정보처리방침</a>
        <a href="?info=terms">이용약관</a>
        <a href="?info=about">회사 소개</a>
        <a href="?info=creator-revenue">크리에이터 수익 정책</a>
      </nav>
      <div
        ref={containerRef}
        className={`mobile-feed-container h-full overflow-y-auto snap-y snap-mandatory custom-scrollbar ${isCommentOpen ? 'comments-open' : ''}`}
      >
        {feedItems.map((item) => (
          <div
            key={item.kind === "video" ? item.id : `ad-${item.id}-${item.adIndex}`}
            className={`discovery-section-wrapper ${isCommentOpen && item.kind === "video" && item.id === commentVideo?.id ? 'is-comment-active' : ''}`}
          >
            {item.kind === "ad" ? (
              <AdCard ad={item} onImpression={handleAdImpression} />
            ) : (
              <MovieSection
                video={item}
                isActive={item.id === activeId}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted(!isMuted)}
                onVideoClick={onVideoClick}
                isLiked={likedVideos.has(item.id)}
                onToggleLike={toggleLike}
                onSetActive={(id) => setActiveId(id)}
                onComment={(v) => { if (handleShowcaseClick(v.id)) return; setCommentVideo(v); }}
                onShare={handleShare}
                onFullscreen={(v) => { if (handleShowcaseClick(v.id)) return; setFullscreenVideo(v); }}
                commentCount={commentCounts[item.id] || 0}
                creatorAvatar={item.creatorId ? creatorInfo[item.creatorId]?.avatar ?? null : null}
                creatorName={item.creatorId ? creatorInfo[item.creatorId]?.name ?? null : null}
                onViewCreator={onViewCreator}
                onSignInClick={onSignInClick}
              />
            )}
          </div>
        ))}
        {/* 무한 스크롤 sentinel — 끝 근처에서 다음 페이지 자동 로드 */}
        <div className="feed-load-sentinel h-1" aria-hidden />
        {loadingMore && (
          <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" /></div>
        )}
        {!hasMore && (
          <div className="py-20 text-center text-gray-300 text-[10px] font-bold">END OF FEED</div>
        )}
      </div>

      <div className="desktop-feed-container h-full min-h-0 overflow-y-auto bg-[#0a0a0a]">
        <div className="desktop-grid-wrapper max-w-[1800px] mx-auto px-8 lg:px-12">
          {/* 상단 고정: DISCOVERY FILMS + 칩 바 + 검색 + 전체 수 — 스크롤해도 항상 노출 (2026-06-11) */}
          <div className="sticky top-0 z-20 -mx-8 lg:-mx-12 px-8 lg:px-12 py-5 bg-[#0a0a0a]/90 backdrop-blur-md relative flex items-center gap-4">
            <h2 className="text-3xl font-black text-white tracking-tighter uppercase shrink-0">DISCOVERY <span className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] bg-clip-text text-transparent">FILMS</span></h2>
            {/* 칩 바 — 가운데, 넘치면 유튜브식 좌우 화살표로 스크롤 */}
            <div className="flex-1 min-w-0 relative">
              <div
                ref={chipScrollRef}
                onScroll={updateChipArrows}
                className="flex items-center gap-2 overflow-x-auto no-scrollbar"
              >
                {HOME_CHIPS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setChip(c.key)}
                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold whitespace-nowrap transition-colors border ${
                      chip === c.key
                        ? "bg-white text-black border-white"
                        : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    {isKo ? c.ko : c.en}
                  </button>
                ))}
              </div>
              {/* 왼쪽 화살표 (스크롤 시작 이후 표시) */}
              {chipArrows.left && (
                <button
                  type="button"
                  onClick={() => scrollChips("left")}
                  aria-label={isKo ? "이전 칩" : "Previous"}
                  className="absolute left-0 top-0 bottom-0 z-10 flex items-center pr-7 pl-0.5 bg-gradient-to-r from-[#0a0a0a] via-[#0a0a0a] to-transparent"
                >
                  <span className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors">
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </span>
                </button>
              )}
              {/* 오른쪽 화살표 (더 볼 칩이 남았을 때 표시) */}
              {chipArrows.right && (
                <button
                  type="button"
                  onClick={() => scrollChips("right")}
                  aria-label={isKo ? "다음 칩" : "Next"}
                  className="absolute right-0 top-0 bottom-0 z-10 flex items-center pl-7 pr-0.5 bg-gradient-to-l from-[#0a0a0a] via-[#0a0a0a] to-transparent"
                >
                  <span className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center hover:bg-white/20 transition-colors">
                    <ChevronRight className="w-4 h-4 text-white" />
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {/* 데스크탑 홈 검색 — 입력 후 엔터 → 검색 결과 페이지 (2026-06-11) */}
              {onOpenSearch && (
                <form
                  onSubmit={(e) => { e.preventDefault(); if (searchInput.trim()) onOpenSearch(searchInput.trim()); }}
                  className="flex items-center gap-2 px-4 h-10 rounded-full bg-white/5 border border-white/10 focus-within:border-[#6366f1] transition-colors w-72 max-w-[40vw]"
                >
                  <Search className="w-4 h-4 shrink-0 text-white/40" />
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder={isKo ? "영상·크리에이터 검색" : "Search videos & creators"}
                    aria-label={isKo ? "검색" : "Search"}
                    className="bg-transparent outline-none text-sm text-white placeholder-white/40 w-full"
                  />
                </form>
              )}
              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-white/40 uppercase whitespace-nowrap shrink-0">{(totalCount ?? videos.length).toLocaleString()} VIDEOS</span>
            </div>
            {/* 네온 구분선 (모바일 피드 구분선과 동일) */}
            <div className="neon-divider absolute left-0 right-0 bottom-0" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-8 pt-8 pb-12">
            {videos.map(v => (
              <DesktopMovieCard
                key={v.id}
                video={v}
                onVideoClick={onVideoClick}
                isLiked={likedVideos.has(v.id)}
                onToggleLike={toggleLike}
                onComment={(vid) => { if (handleShowcaseClick(vid.id)) return; setCommentVideo(vid); }}
                onShare={handleShare}
                commentCount={commentCounts[v.id] || 0}
                creatorAvatar={v.creatorId ? creatorInfo[v.creatorId]?.avatar ?? null : null}
                creatorName={v.creatorId ? creatorInfo[v.creatorId]?.name ?? null : null}
                onViewCreator={onViewCreator}
                onSignInClick={onSignInClick}
              />
            ))}
          </div>
          {/* 무한 스크롤 sentinel (데스크탑) */}
          <div className="feed-load-sentinel h-1" aria-hidden />
          {loadingMore && (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" /></div>
          )}
          {!hasMore && (
            <div className="py-12 text-center text-gray-400 text-xs font-bold uppercase tracking-widest">End of Feed</div>
          )}
        </div>
      </div>

      <style>{`
        .mobile-feed-container {
          display: block;
          height: calc(100dvh - 136px);
          overflow-y: auto;
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          background: #0a0a0a; /* bg-gray-100 */
        }
        .discovery-section-wrapper {
          height: calc(50% - 1.5px) !important;
          scroll-snap-align: start;
          box-sizing: border-box;
          background: #0a0a0a;
          position: relative;
        }
        /* 카드 하단 글로우 구분선 */
        .discovery-section-wrapper::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(
            90deg,
            transparent 0%,
            #4f46e5 15%,
            #8b5cf6 40%,
            #06b6d4 65%,
            #8b5cf6 85%,
            transparent 100%
          );
          background-size: 250% 100%;
          animation: divider-sweep 6s linear infinite;
          box-shadow: 0 0 10px rgba(139, 92, 246, 0.7), 0 0 20px rgba(6, 182, 212, 0.3);
          z-index: 50;
        }
        @keyframes divider-sweep {
          0%   { background-position: 120% 0; }
          100% { background-position: -120% 0; }
        }
        .discovery-section {
          height: 100%;
          background: black;
          overflow: hidden;
        }
        /* TikTok 스타일: 댓글 열린 상태 */
        .mobile-feed-container.comments-open {
          height: 40dvh !important;
          overflow: hidden !important;
          scroll-snap-type: none !important;
        }
        .mobile-feed-container.comments-open > * {
          display: none !important;
        }
        .mobile-feed-container.comments-open .discovery-section-wrapper.is-comment-active {
          display: block !important;
          height: 40dvh !important;
          width: 100% !important;
        }
        .desktop-feed-container { display: none; background: #0a0a0a; }
        @media (min-width: 1024px) { 
          .mobile-feed-container { display: none; } 
          .desktop-feed-container { display: block; } 
        }
        .custom-scrollbar::-webkit-scrollbar { width: 0px; }
        .video-js.vjs-fill { width: 100% !important; height: 100% !important; }
        .vjs-tech { object-fit: contain !important; }
        .aurora-btn {
          background: linear-gradient(110deg, #6366f1 0%, #ec4899 50%, #06b6d4 100%);
          background-size: 200% 200%;
          animation: aurora-shift 4s ease infinite;
          transition: transform 0.2s ease;
        }
        .aurora-btn:hover { transform: scale(1.04); }
        .aurora-btn:active { transform: scale(0.96); }
        @keyframes aurora-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      {/* 모바일 댓글 패널 (TikTok 스타일: 영상 아래 영역) */}
      <AnimatePresence>
        {commentVideo && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 right-0 z-40 rounded-t-2xl overflow-hidden lg:hidden"
            style={{ top: "calc(56px + 40dvh)", bottom: "80px" }}
          >
            <CommentPanel
              videoId={commentVideo.id}
              videoCreatorId={commentVideo.creatorId}
              title={commentVideo.title}
              onClose={() => setCommentVideo(null)}
              onCommentPosted={() => setCommentCounts(prev => ({ ...prev, [commentVideo.id]: (prev[commentVideo.id] || 0) + 1 }))}
              onViewCreator={(cid) => { setCommentVideo(null); onViewCreator?.(cid); }}
              mode="sheet"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 공유 모달 (데스크탑 + 네이티브 공유 미지원 폴백) */}
      <ShareModal
        open={!!shareTarget}
        url={shareTarget ? `${window.location.origin}?video=${shareTarget.id}` : ""}
        title={shareTarget?.title || ""}
        text={shareTarget ? `CREAITE: ${shareTarget.title}` : ""}
        onClose={() => setShareTarget(null)}
      />

      {/* 데스크탑 댓글 모달 */}
      <AnimatePresence>
        {commentVideo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCommentVideo(null)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 hidden lg:flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md h-[80vh] rounded-2xl overflow-hidden"
            >
              <CommentPanel
                videoId={commentVideo.id}
                videoCreatorId={commentVideo.creatorId}
                title={commentVideo.title}
                onClose={() => setCommentVideo(null)}
                onCommentPosted={() => setCommentCounts(prev => ({ ...prev, [commentVideo.id]: (prev[commentVideo.id] || 0) + 1 }))}
                mode="sheet"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 전체화면 모드 (커스텀 — YouTube 스타일) */}
      <AnimatePresence>
        {fullscreenVideo && (
          <VideoFullscreen
            video={fullscreenVideo}
            isLiked={likedVideos.has(fullscreenVideo.id)}
            commentCount={commentCounts[fullscreenVideo.id] || 0}
            onClose={() => {
              setFullscreenVideo(null);
              // 모달 unmount 후 활성 영상 재개
              requestAnimationFrame(() => {
                if (!containerRef.current || !activeId) return;
                const v = containerRef.current.querySelector<HTMLVideoElement>(
                  `[data-video-id="${activeId}"] video`
                );
                if (v) {
                  v.muted = isMuted;
                  v.play().catch(() => {});
                }
              });
            }}
            onToggleLike={() => toggleLike(fullscreenVideo.id, likedVideos.has(fullscreenVideo.id))}
            onComment={() => {
              setCommentVideo(fullscreenVideo);
              setFullscreenVideo(null);
            }}
            onShare={() => handleShare(fullscreenVideo)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function DesktopMovieCard({ video, onVideoClick, isLiked, onToggleLike, onComment, onShare, commentCount = 0, creatorAvatar = null, creatorName = null, onViewCreator, onSignInClick }: { video: Video; onVideoClick: (video: Video) => void; isLiked: boolean; onToggleLike: (id: string, currentlyLiked: boolean) => void; onComment: (video: Video) => void; onShare: (video: Video) => void; commentCount?: number; creatorAvatar?: string | null; creatorName?: string | null; onViewCreator?: (creatorId: string) => void; onSignInClick?: () => void }) {
  const { t } = useTranslation();
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  // Video.js를 React 외부에서 생성 — removeChild 충돌 방지
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isHovered || playerRef.current) return;

    // React가 소유하지 않는 video 엘리먼트를 직접 생성
    const videoEl = document.createElement('video');
    videoEl.className = 'video-js vjs-fill';
    videoEl.setAttribute('playsinline', '');
    container.appendChild(videoEl);

    const p = videojs(videoEl, {
      autoplay: false, controls: false, loop: true, muted: true,
      fill: true, responsive: true, playsinline: true, crossOrigin: 'anonymous',
      sources: [{ src: video.videoUrl, type: video.videoUrl?.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4' }]
    });
    playerRef.current = p;
    p.ready(() => {
      if (!p || p.isDisposed()) return;
      p.currentTime(video.highlightStart || 0);
      const pp = p.play();
      if (pp) pp.catch(() => {});
    });
  }, [isHovered, video.videoUrl, video.highlightStart]);

  // 호버 해제 시 일시정지
  useEffect(() => {
    if (!isHovered && playerRef.current && !playerRef.current.isDisposed()) {
      playerRef.current.pause();
    }
  }, [isHovered]);

  // 언마운트 시에만 dispose (React DOM 정리 후 안전)
  useEffect(() => {
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);

  return (
    <motion.div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onVideoClick(video)}
      className="bg-[#141414] rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#6366f1]/50 shadow-lg hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] transition-all duration-300 cursor-pointer group"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        <img src={video.thumbnail} className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 z-10 ${isHovered ? 'opacity-0' : 'opacity-100'}`} />
        {/* React가 아닌 Video.js가 직접 관리하는 컨테이너 */}
        <div ref={containerRef} className="absolute inset-0 z-0" />
        <div className="absolute top-3 left-3 z-10">
          <span className="px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-white font-bold text-[8px] border border-white/10 uppercase tracking-tighter">
            {video.tool}
          </span>
        </div>
        {/* 호버 시 하단 그라디언트 */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`} />
      </div>
      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-extrabold text-lg text-white line-clamp-1 group-hover:bg-gradient-to-r group-hover:from-[#6366f1] group-hover:to-[#8b5cf6] group-hover:bg-clip-text group-hover:text-transparent transition-all uppercase tracking-tight">{video.title}</h3>
        </div>
        {/* min-h-9: 팔로우 버튼(h-9) 유무와 무관하게 행 높이 고정 → 카드 설명란 높이 통일 */}
        <div className="flex items-center gap-2 mb-4 min-h-9">
          {video.creatorId && onViewCreator ? (
            <button
              onClick={(e) => { e.stopPropagation(); onViewCreator(video.creatorId!); }}
              className="flex items-center gap-2 hover:text-white transition-colors"
            >
              <CreatorAvatar avatarUrl={creatorAvatar} name={creatorName ?? video.creator} size="xs" />
              <span className="text-xs font-bold text-white/40 hover:text-white">{creatorName ?? video.creator}</span>
            </button>
          ) : (
            <>
              <CreatorAvatar avatarUrl={creatorAvatar} name={creatorName ?? video.creator} size="xs" />
              <span className="text-xs font-bold text-white/40">{creatorName ?? video.creator}</span>
            </>
          )}
          {video.creatorId && (
            <FollowButton creatorId={video.creatorId} onSignInClick={onSignInClick} size="sm" />
          )}
        </div>
        <div className="flex items-end justify-between pt-4 border-t border-white/10">
          {/* 가격 — 모바일 피드와 동일: ₩0 영상은 "무료 시청 / 라이선스 미판매" */}
          <div className="flex flex-col">
            {video.price > 0 ? (
              <>
                <span className="text-[10px] text-white/50 font-medium leading-none mb-1">{t("video.downloadCommercial")}</span>
                <span className="text-lg font-black text-[#f87171]">₩{video.price.toLocaleString()}</span>
              </>
            ) : (
              <>
                <span className="text-[10px] text-white/50 font-medium leading-none mb-1">{t("video.freeWatch")}</span>
                <span className="text-lg font-black text-gray-400">{t("video.notForSaleShort")}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={(e) => { e.stopPropagation(); onToggleLike(video.id, isLiked); }} className="p-2 hover:bg-red-500/10 rounded-full transition-colors">
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white/30'}`} />
            </button>
            {/* 모바일 카드와 동일한 아이콘으로 통일: 댓글 MessageCircle, 공유 Send (2026-06-11) */}
            <button onClick={(e) => { e.stopPropagation(); onComment(video); }} className="flex items-center gap-1 p-2 hover:bg-white/10 rounded-full transition-colors">
              <MessageCircle className="w-5 h-5 text-white/30 hover:text-white transition-colors" />
              {commentCount > 0 && <span className="text-xs text-white/40">{commentCount}</span>}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onShare(video); }} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Send className="w-5 h-5 text-white/30 hover:text-white transition-colors" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); onVideoClick(video); }} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <ShoppingCart className="w-5 h-5 text-white/30 hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
