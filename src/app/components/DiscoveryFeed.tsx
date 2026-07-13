import { useState, useRef, useEffect, memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Heart, Share2, ShoppingCart, Volume2, VolumeX, Loader2, Play, MessageCircle, MessageSquare, Send, ChevronRight, ChevronLeft, ExternalLink, Maximize2, Search, Eye } from "lucide-react";
import { formatCompactNumber } from "../i18n/numberFormat";
import { motion, AnimatePresence } from "motion/react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { sendAdEvent } from "../utils/adEvent";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { useLikes } from "../contexts/LikesContext";
import { CommentPanel } from "./CommentPanel";
import { ShareModal } from "./ShareModal";
import { useBlockedUsers } from "../hooks/useBlockedUsers";
import { FollowButton } from "./FollowButton";
import { mergeShowcase, shouldShowShowcase, handleShowcaseClick } from "../utils/showcase";
import type { ShowcaseVideo } from "../data/showcaseVideos";
import { AgeBadge, shouldBlur } from "./AgeBadge";
import { Lock } from "lucide-react";
import { VideoFullscreen } from "./VideoFullscreen";
import { ExternalAdSlot, EXTERNAL_ADS_ACTIVE } from "./ExternalAdSlot";
import { CreatorAvatar } from "./CreatorAvatar";
import { useCreatorInfo } from "../hooks/useCreatorInfo";
import { useBackButton } from "../hooks/useBackButton";
import { isNegotiationOnly } from "../utils/licensePricing";
import { toast } from "sonner";
import { BETA_MODE } from "../config/beta";
import { Sparkles, Plus } from "lucide-react";

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
  | ({ kind: "ad"; adIndex?: number } & Ad)
  | { kind: "extad"; slot: number };   // 외부 광고(애드핏/애드센스) 슬롯

// 데스크탑 그리드 전용 아이템 — 자체광고(selfad) 우선, 소진 시 애드핏(adfit) 폴백
type DesktopItem =
  | { kind: "video"; video: Video }
  | { kind: "selfad"; ad: Ad; key: string }
  | { kind: "adfit"; slot: number };

// 홈피드 광고 정책: 초반에는 직접 광고 수주가 어려워 외부 네트워크(애드핏+애드센스)로만 채움.
// 직접 광고주가 생기면 true 로 바꾸면 자체광고(feed_display) 우선 노출 + 소진분만 외부 폴백.
// (스위치 SSOT 는 config/ads.ts — AdCreateModal 의 피드광고 판매 게이트와 함께 움직임)
import { HOME_FEED_SELF_ADS } from "../config/ads";

interface Video {
  // 기본 정보
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  creatorId?: string;
  likes: number;
  views?: number;   // 유효조회수(videos.views SSOT) — 카드 조회수 통일 표시
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
  seriesId?: string;   // 시리즈(연속물) 소속 — 카드 배지용
}

interface DiscoveryFeedProps {
  onVideoClick: (video: Video) => void;
  onAddToCart?: (video: Video) => void;       // 데스크탑 카드 장바구니 버튼 → App.tsx addToCart
  onSignInClick?: () => void;
  onViewCreator?: (creatorId: string) => void;
  onOpenSearch?: (query?: string) => void;   // 데스크탑 홈 검색 진입 → SearchPage (검색어 전달)
  onNavigate?: (tab: string) => void;         // BETA_MODE 띠배너 "+ 등록하기" → 업로드 페이지
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

// 외부 광고 링크 안전 오픈 — http(s) 스킴만 허용(javascript:/data: 등 차단).
function openAdLinkSafe(rawUrl: string | null | undefined) {
  if (!rawUrl) return;
  try {
    const u = new URL(rawUrl);  // 스킴 없는 값이면 throw → 열지 않음
    if (u.protocol === "http:" || u.protocol === "https:") {
      window.open(u.href, "_blank", "noopener,noreferrer");
    }
  } catch { /* 잘못된 URL 무시 */ }
}

// 📢 Ad Card Component
// 광고 영상 미니 플레이어 — video.js 로 HLS(.m3u8)/mp4 재생.
// 일반 <video> 는 안드로이드 크롬/앱에서 Bunny HLS(.m3u8)를 못 틀어 광고가 포스터에 멈춤 → video.js 필수.
// 오프스크린 마운트 시 autoplay 가 막히므로 IntersectionObserver 로 화면 진입 시 재생을 강제한다.
const AdVideoPlayer = memo(({ src, poster }: { src: string; poster?: string | null }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !src) return;
    const videoEl = document.createElement("video");
    videoEl.className = "video-js w-full h-full";
    videoEl.setAttribute("playsinline", "");
    if (poster) videoEl.poster = poster;
    container.appendChild(videoEl);

    const player = videojs(videoEl, {
      autoplay: true, controls: false, loop: true, muted: true,
      fill: true, responsive: true, playsinline: true, preload: "metadata",
      crossOrigin: "anonymous",
      sources: [{ src, type: src.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4" }],
    });
    player.muted(true);
    playerRef.current = player;

    const io = new IntersectionObserver(
      ([e]) => {
        const p = playerRef.current;
        if (!p || p.isDisposed()) return;
        if (e.isIntersecting) p.play()?.catch(() => {});
        else p.pause();
      },
      { threshold: 0.4 },
    );
    io.observe(container);

    return () => {
      io.disconnect();
      if (playerRef.current) { playerRef.current.dispose(); playerRef.current = null; }
    };
  }, [src, poster]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full [&_.video-js]:w-full [&_.video-js]:h-full [&_.vjs-tech]:object-cover"
    />
  );
});
AdVideoPlayer.displayName = "AdVideoPlayer";

const AdCard = memo(({ ad, onImpression }: { ad: Ad; onImpression: (id: string) => void }) => {
  const { t } = useTranslation();
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

  const handleClick = () => {
    // 사용자 제스처와 동기적으로 새 탭을 먼저 연다 — Safari/팝업차단이 await 이후의 window.open 을
    // 막아 광고주 랜딩이 안 열리던 문제 방지. 클릭 집계는 fire-and-forget(keepalive).
    openAdLinkSafe(ad.link_url);
    sendAdEvent("feed_click", ad.id).catch(() => {});
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
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : ad.video_url ? (
        // 영상 광고: video.js 로 HLS(.m3u8)/mp4 재생 (일반 <video>는 안드로이드/앱서 HLS 불가 → 멈춤)
        <AdVideoPlayer src={ad.video_url} poster={ad.thumbnail_url} />
      ) : ad.thumbnail_url ? (
        <img
          src={ad.thumbnail_url}
          alt={ad.title}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
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
        {t("discoveryFeed.adBadge")}
      </div>

      {/* 콘텐츠 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
        {ad.advertiser && (
          <p className="text-xs text-white/60 font-medium mb-1">{ad.advertiser}</p>
        )}
        <p className="text-white font-bold text-base leading-snug mb-3">{ad.title}</p>
        <button
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-white/90 transition-colors"
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
        >
          {ad.cta_text}
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

// ✨ 액션 버튼 (글래스 + 글로우 스타일)
const ActionButtons = memo(({ video, onToggleLike, onComment, onShare, commentCount = 0 }: {
  video: Video;
  onToggleLike: (id: string, base: number) => void;
  onComment: (video: Video) => void;
  onShare: (video: Video) => void;
  commentCount?: number;
}) => {
  const { t } = useTranslation();
  const { isLiked: isLikedStore, displayCount, displayComments } = useLikes();
  const isLiked = isLikedStore(video.id);
  const likeCount = displayCount(video.id, video.likes);
  const commentDisplay = displayComments(video.id, commentCount);
  const [showRipple, setShowRipple] = useState(false);

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLiked) {
      setShowRipple(true);
      setTimeout(() => setShowRipple(false), 600);
    }
    onToggleLike(video.id, video.likes);
  };

  return (
    <div className="absolute right-3 bottom-[52px] z-40 flex flex-col gap-2 items-center pointer-events-auto">
      {/* 연령 등급 배지 — 액션 버튼 위(우측). right-3 + 아이콘 축소로 우측 끝 잘림 방지 */}
      {(video as any).age_rating && (
        <AgeBadge rating={(video as any).age_rating} size="xs" />
      )}
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
              className="absolute top-0 left-0 right-0 mx-auto w-9 h-9 rounded-full bg-red-500 pointer-events-none"
            />
          )}
        </AnimatePresence>
        <div
          className={`relative w-9 h-9 rounded-full backdrop-blur-xl flex items-center justify-center border-2 transition-all ${
            isLiked
              ? "bg-red-500/30 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.6)]"
              : "bg-white/10 border-white/30"
          }`}
        >
          <Heart
            className={`w-4 h-4 ${isLiked ? "fill-red-400 text-red-400" : "text-white"}`}
            strokeWidth={1.8}
          />
        </div>
        <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
          {likeCount.toLocaleString()}
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
        <div className="w-9 h-9 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center shadow-[0_0_15px_rgba(139,92,246,0.4)]">
          <MessageCircle className="w-4 h-4 text-white" strokeWidth={1.8} />
        </div>
        <span className="text-[10px] font-bold text-white mt-0.5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
          {commentDisplay > 0 ? commentDisplay.toLocaleString() : t("common.comment")}
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
        <div className="w-9 h-9 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
          <Send className="w-4 h-4 text-white -rotate-12" strokeWidth={1.8} />
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
  onToggleLike: (id: string, base: number) => void;
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
  const sectionRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);
  const retryCountRef = useRef(0);  // 자동 재시도 카운터 (최대 2회)
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  // Phase 26: 19+ 연령 잠금 여부 (본인 영상은 게이트 제외)
  const { profile, user } = useAuth();
  // 조회수(videos.views SSOT) 통일 표시 — 시네마·OTT·검색과 같은 전역 스토어 값 공유(seed-once)
  const { displayViews, seedViews } = useLikes();
  const viewCount = displayViews(video.id, video.views);
  useEffect(() => { seedViews(video.id, video.views ?? undefined); }, [video.id, video.views, seedViews]);
  const ageVerified = profile?.age_verified ?? false;
  const isMyVideo = !!user?.id && !!video.creatorId && user.id === video.creatorId;
  const isAgeLocked = !isMyVideo && shouldBlur(video.age_rating, ageVerified);

  // 지연 마운트: 섹션이 뷰포트 ±1화면 근처일 때만 플레이어 생성.
  // (비가상화 피드라 모든 섹션이 동시에 플레이어를 만들면 수십 개 누적 → 메모리 폭발/Aw Snap 크래시)
  const [inView, setInView] = useState(false);
  // getBoundingClientRect 기반 지연 마운트 — 스크롤 컨테이너 내부에서도 신뢰성 있게 동작.
  // (이전 IntersectionObserver(root:null) 가 이 피드의 내부 스크롤 레이아웃에선 항상 false 로
  //  보고해 플레이어가 아예 생성되지 않던 문제 수정. 화면 ±1화면 이내면 마운트, 멀어지면 언마운트=메모리 회수.)
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const scroller = el.closest('.mobile-feed-container') as HTMLElement | null;
    let raf = 0;
    const check = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      // 레이아웃 전/숨김(0 크기)·vh 미확정이면 판정 보류(false 로 덮지 않음 → 재시도가 잡음)
      if ((r.width === 0 && r.height === 0) || vh === 0) return;
      setInView(r.top < vh * 2 && r.bottom > -vh);   // ±1화면
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    // 초기 레이아웃 안정까지 재시도 (dvh/flex 계산 지연 대비)
    const t1 = setTimeout(check, 120);
    const t2 = setTimeout(check, 500);
    const target: any = scroller || window;
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      if (raf) cancelAnimationFrame(raf);
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  // Effect 1: 플레이어 생성/삭제 — inView && 소스 있을 때만. (isActive 제외 유지)
  // video 엘리먼트를 React 밖에서 생성해 컨테이너에 append → dispose 시 React removeChild 충돌 방지
  // (DesktopMovieCard 와 동일 패턴). inView=false 로 스크롤 벗어나면 dispose 되어 메모리 회수.
  useEffect(() => {
    const container = containerRef.current;
    // 19+ 미인증 잠금 영상은 플레이어를 만들지 않음(블러 뒤 자동재생·대역폭 소비 차단).
    // 데스크탑 호버 재생(DesktopMovieCard)과 동일한 게이트 — 인증되면 isAgeLocked 가 풀려 재실행되며 생성.
    if (!inView || !container || !video.videoUrl || isAgeLocked) return;

    setIsPlaying(false);

    const videoEl = document.createElement('video');
    videoEl.className = 'video-js vjs-big-play-centered w-full h-full';
    videoEl.setAttribute('playsinline', '');
    if (video.thumbnail) videoEl.poster = video.thumbnail;
    container.appendChild(videoEl);

    const player = videojs(videoEl, {
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
  }, [video.id, video.videoUrl, inView, isAgeLocked]); // inView: false→true 생성 / true→false dispose. isAgeLocked: 인증 시 잠금 해제되면 재생성

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
    // highlightStart 가 큰(예: 90초) 영상은 아직 버퍼 안 된 지점으로 시크하느라
    // play() 가 "interrupted by seek" 로 거부돼 멈추는 경우가 있음 →
    // 즉시 한 번 시도 + 시크/버퍼 완료(seeked·canplay) 시 재생 재시도로 보강.
    const tryPlay = () => {
      if (!player || player.isDisposed()) return;
      player.play()?.catch(() => {
        if (!player.isDisposed()) {
          player.muted(true);
          player.play()?.catch(() => {});
        }
      });
    };
    tryPlay();
    player.one('seeked', tryPlay);
    player.one('canplay', tryPlay);
    // cleanup: 비활성/언마운트 시 미발화 리스너 해제 — 빠른 스크롤 시 늦게 도착한 seeked/canplay 가
    //   이미 비활성된 영상을 재생/소리내는 것 방지(B4)
    return () => {
      if (player && !player.isDisposed()) {
        player.off('seeked', tryPlay);
        player.off('canplay', tryPlay);
      }
    };
  }, [isActive, playerReady]);

  // Effect 3: 뮤트 상태 반영
  useEffect(() => {
    if (playerRef.current && !playerRef.current.isDisposed()) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

  return (
    <div
      ref={sectionRef}
      className="discovery-section snap-start w-full relative bg-black overflow-hidden"
      data-video-id={video.id}
    >
      {/* 🎬 Video — 전체 높이 */}
      <div className="absolute inset-0">
        <img
          src={video.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 z-[15] pointer-events-none ${isPlaying ? 'opacity-0' : 'opacity-100'} ${isAgeLocked ? 'blur-xl scale-110' : ''}`}
        />
        <div className="relative w-full h-full z-10 pointer-events-none">
          <div ref={containerRef} className="w-full h-full" />
          {hasError && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-center pointer-events-auto">
              <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin mb-2" />
              <p className="text-white text-xs">{t("discoveryFeed.videoProcessing")}</p>
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
        {video.seriesId && (
          <span className="px-2.5 py-1 bg-[#6366f1]/80 backdrop-blur-md rounded-md text-white font-bold text-[10px] border border-white/20 pointer-events-none">
            {t("discoveryFeed.seriesBadge")}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }}
          className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white pointer-events-auto"
          aria-label={isMuted ? t("videoFullscreen.unmute") : t("videoFullscreen.mute")}
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
          </div>
          <h3 className="text-sm font-bold text-white leading-tight line-clamp-1 mb-1 pr-16">{video.title}</h3>
          {viewCount > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-white/55 mb-2">
              <Eye className="w-3 h-3" /> {formatCompactNumber(viewCount)}
            </div>
          )}

          {/* 가격 + 버튼 — ₩0 영상은 "무료 시청 / 라이선스 미판매" 로 표시 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                {video.price > 0 ? (
                  <>
                    <span className="text-[10px] text-white/50 font-medium leading-none mb-1">{t("video.downloadCommercial")}</span>
                    {isNegotiationOnly(video.price)
                      ? <span className="text-sm font-black text-amber-400">{t("video.negotiationOnly", "별도 협의")}</span>
                      : <span className="text-sm font-black text-[#f87171]">₩{video.price.toLocaleString()}</span>}
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
    views: Number(item.views) || 0,
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
    seriesId: item.series_id || undefined,
  } as Video;
}

// 홈 피드 한 페이지 크기 (무한 스크롤)
const FEED_PAGE_SIZE = 12;

// 탭 복귀 시 즉시 복원용 모듈 캐시(메모리, 세션 내). 키 = `${userId}:${chip}`.
// 무한스크롤로 누적된 피드를 통째로 보관 → 복귀 시 리로드/스피너 없이 직전 상태 그대로.
type HomeFeedSnapshot = { videos: Video[]; offset: number; hasMore: boolean; commentCounts: Record<string, number>; ads: Ad[]; order: string[]; ts: number };
const HOME_CACHE_TTL_MS = 90_000;   // H9: 탭복귀 캐시 신선도 — 90초 이내는 재검증 없이 즉시 복원
const HOME_STALE_TTL_MS = 30 * 60_000;  // SWR: 30분 이내 스테일 스냅샷은 "즉시 표시 후 배경 재검증"(콜드스타트 즉시 페인트)
const HOME_CACHE_MAX = 8;           // H9: 캐시 엔트리 상한(메모리 무한 증가 방지)
const HOME_LS_KEY = "aivm_homefeed_v1";
const homeFeedCache: Record<string, HomeFeedSnapshot> = {};

// 콜드 스타트(새로고침/앱 재실행) 즉시 페인트용 — 모듈 캐시를 localStorage 로 지속.
//   모듈 로드 시 1회 hydrate(첫 페이지만, 소량). 이후 restore 로직이 이 스냅샷을 SWR 로 사용.
(function hydrateHomeCacheFromLS() {
  try {
    const raw = typeof localStorage !== "undefined" && localStorage.getItem(HOME_LS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, HomeFeedSnapshot>;
    for (const k in parsed) {
      const s = parsed[k];
      if (s && Array.isArray(s.videos) && s.videos.length > 0 && typeof s.ts === "number"
          && Date.now() - s.ts < HOME_STALE_TTL_MS) {
        homeFeedCache[k] = s;
      }
    }
  } catch { /* 파싱/쿼터 오류 무시 */ }
})();

// 저장 — 최근 키 소량(첫 페이지만)만 지속해 쿼터/직렬화 비용 최소화.
function persistHomeCacheToLS() {
  try {
    if (typeof localStorage === "undefined") return;
    const keys = Object.keys(homeFeedCache).sort((a, b) => homeFeedCache[b].ts - homeFeedCache[a].ts).slice(0, 4);
    const out: Record<string, HomeFeedSnapshot> = {};
    for (const k of keys) {
      const s = homeFeedCache[k];
      const vids = s.videos.slice(0, FEED_PAGE_SIZE);   // 첫 페이지만
      const ids = new Set(vids.map((v) => v.id));
      const cc: Record<string, number> = {};
      for (const [id, n] of Object.entries(s.commentCounts)) if (ids.has(id)) cc[id] = n as number;
      out[k] = { videos: vids, offset: vids.length, hasMore: true, commentCounts: cc, ads: (s.ads || []).slice(0, 6), order: s.order || [], ts: s.ts };
    }
    localStorage.setItem(HOME_LS_KEY, JSON.stringify(out));
  } catch { /* 쿼터 초과 등 무시 */ }
}

export function DiscoveryFeed({ onVideoClick, onAddToCart, onSignInClick, onViewCreator, onOpenSearch, onNavigate }: DiscoveryFeedProps) {
  const { t } = useTranslation();
  // 댓글 패널 단일 마운트용 — 홈피드 모바일/데스크탑 분기(1024px=lg)와 일치.
  // (이전엔 모바일 시트+데스크탑 모달이 동시 마운트돼 댓글 이중 fetch·이중 구독 발생)
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const [searchInput, setSearchInput] = useState("");   // 데스크탑 홈 검색바
  const [chip, setChip] = useState("all");              // 홈 칩 필터 (전체/인기/최신/무료/소장가능/시네마급)
  const chipScrollRef = useRef<HTMLDivElement>(null);   // 칩 바 가로 스크롤 (유튜브식 화살표)
  const [chipArrows, setChipArrows] = useState({ left: false, right: false });
  const [totalCount, setTotalCount] = useState<number | null>(null);  // 현재 칩 기준 전체 영상 수 (배지)
  const [videos, setVideos] = useState<Video[]>([]);
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  // 좋아요는 전역 스토어(LikesContext)로 통일 — 모든 피드 동시 반영
  const { isLiked: isLikedStore, displayCount: likesDisplayCount, displayComments: likesDisplayComments, seedCount: seedLikeCount, seedComments: seedCommentCount, toggleLike: toggleLikeStore } = useLikes();
  const [isMuted, setIsMuted] = useState(true);
  const [commentVideo, setCommentVideo] = useState<Video | null>(null);
  const [shareTarget, setShareTarget] = useState<Video | null>(null);
  const [fullscreenVideo, setFullscreenVideo] = useState<Video | null>(null);
  // 비구독자가 장편(미리보기 초과) 풀스크린 진입 시 전체 무료재생되는 우회 차단 → 페이월(ProductDetail)로.
  // 페일세이프: 무제한 플레이어(VideoFullscreen)는 "구독자" 이거나 "길이를 확실히 아는 60초 이하 숏폼"
  // 일 때만 직접 연다. 길이 메타가 0/누락이면(durationSeconds 미확정) 알 수 없으므로 페이월로 우회
  // (ProductDetail 이 자체 previewSeconds 기준으로 컷오프/풀재생을 다시 판단 → 새는 길 차단).
  const openFullscreenGated = (v: Video) => {
    // H4: 19+ 미인증 콘텐츠는 무제한 풀스크린 직행 금지 → ProductDetail 에서 연령 게이트 재적용.
    //   (VideoFullscreen 은 자체 연령/페이월 게이트가 없으므로 진입 지점에서 막는다)
    const isMine = !!user?.id && !!v.creatorId && user.id === v.creatorId;
    if (!isMine && shouldBlur((v as any).age_rating, profile?.age_verified ?? false)) { onVideoClick(v); return; }
    const dur = v.durationSeconds || 0;
    // 프리뷰 길이는 페이월(ProductDetail)과 동일 기준(cinemaPreviewSeconds) 사용 — 60 하드코딩이면
    //   어드민이 프리뷰를 낮췄을 때 (previewSec, 60] 유료영상이 비구독자에게 무료 전체재생되던 누수.
    const previewSec = settings.cinemaPreviewSeconds || 60;
    const knownShort = dur > 0 && dur <= previewSec;
    if (!isSubscriber && !knownShort) { onVideoClick(v); return; }
    setFullscreenVideo(v);
  };
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  // 무한 스크롤 — 전 영상을 페이지 단위로 끊김 없이 로드
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedError, setFeedError] = useState(false);   // H5: 피드 로드 실패 표시(무한 재시도 방지)
  const offsetRef = useRef(0);          // 고정 순서(orderRef) 내 다음 슬라이스 시작 인덱스
  const hasMoreRef = useRef(true);      // 클로저 stale 방지용
  const fetchingRef = useRef(false);    // 중복 호출 방지
  const chipRef = useRef("all");        // 현재 칩 필터 (loadMore stale 방지용)
  const orderRef = useRef<string[]>([]); // H3: 세션 시작 시 확정한 랭킹된 video_id 전체 순서(고정)
  const sessionSeqRef = useRef(0);       // H10: 칩/유저 세션 카운터 — stale loadMore 완료가 새 세션 상태를 못 건드리게
  const stateKeyRef = useRef<string | null>(null); // 현재 videos state가 속한 캐시 키 — 세션 전환 커밋 직후
                                                   // 이전 세션 데이터가 새 키로 저장되는 캐시 오염 차단용
  const { user, profile, isSubscriber } = useAuth();
  const settings = useSettings();
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
  // Phase 24: 차단 사용자 영상은 피드에서 제외 (useMemo — 사소한 state 변경 시 전배열 재계산 방지)
  const visibleVideos = useMemo(
    () => videos.filter((v) => !v.creatorId || !isBlocked(v.creatorId)),
    [videos, isBlocked]
  );
  // Phase 6.6 — 영상별 크리에이터 아바타 매핑
  const creatorIds = useMemo(() => visibleVideos.map((v) => v.creatorId), [visibleVideos]);
  const creatorInfo = useCreatorInfo(creatorIds);
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
    const mySeq = sessionSeqRef.current;   // H10: 이 세션 스냅샷 (완료 시 세션 일치할 때만 상태 정리)
    try {
      const from = offsetRef.current;
      // H3 완전안정: 세션 시작 시 고정한 랭킹 순서(orderRef)에서 다음 페이지 id 를 잘라
      //   상세를 배치 조회 → 페이지 경계 흔들림(누락/중복) 원천 차단. offset 은 "고정 순서"
      //   기준으로 전진(반환 행수 아님 → 그 사이 숨겨진 영상도 한 번만 건너뜀).
      const order = orderRef.current;
      const pageIds = order.slice(from, from + FEED_PAGE_SIZE);
      if (pageIds.length === 0) { hasMoreRef.current = false; setHasMore(false); return; }
      const { data, error } = await supabase.rpc("get_home_feed_by_ids", { p_ids: pageIds });
      if (error) throw error;
      // 도중에 칩 또는 세션(유저 전환 포함)이 바뀌었으면 이전 결과를 버린다 (초기화 로직이 새로 로드함)
      // — 칩만 비교하면 "유저 전환 + 같은 칩" 케이스에서 stale 응답이 새 세션 offset 을 오염시킴
      if (reqChip !== chipRef.current || mySeq !== sessionSeqRef.current) return;
      setFeedError(false);   // 성공 → 에러 상태 해제
      const rows = data || [];
      offsetRef.current = from + pageIds.length;
      if (offsetRef.current >= order.length) { hasMoreRef.current = false; setHasMore(false); }
      if (rows.length > 0) {
        let mapped = rows.map(mapVideoRow);
        // Showcase Mode(데모)일 때만 첫 페이지에 Mock 합성 (현재 비활성)
        if (from === 0 && showcase) mapped = mergeShowcase<Video>(mapped, showcaseToVideo);
        // 전역 스토어에 좋아요 수 시드(seed-once) → 모든 피드가 같은 값 공유
        mapped.forEach((v) => { if (!v.id.startsWith("demo-")) seedLikeCount(v.id, v.likes); });
        setVideos((prev) => {
          // 첫 페이지(from===0)는 교체 — 일반 로드는 prev=[] 라 동일, 스테일 재검증 땐 스테일→신선 매끄러운 스왑.
          if (from === 0) return mapped;
          const seen = new Set(prev.map((v) => v.id));
          return [...prev, ...mapped.filter((v) => !seen.has(v.id))];
        });
        setActiveId((prev) => prev ?? mapped[0]?.id ?? null);
        // 댓글 수 — 새 페이지 영상만 조회해 누적 병합
        const ids = mapped.map((v) => v.id).filter((id) => !id.startsWith("demo-"));
        if (ids.length > 0) {
          // 수용된 제약(2026-07-08): 한 페이지(≤12영상)의 최상위·비숨김 댓글 행을 받아 클라에서 카운트.
          //   PostgREST 기본 1000행 상한이 있어 12개 영상의 최상위 댓글 합이 1000을 넘으면 과소집계 가능
          //   (현재 규모에선 미발동). 스케일 시 grouped-count RPC(video_id별 count) 로 전환 권장.
          // 댓글수는 비블로킹 — 영상은 이미 setVideos 됐으니 첫 페인트를 막지 않고 뒤채운다(왕복 1회 제거).
          void (async () => {
            const { data: countData } = await supabase.from("comments")
              .select("video_id").in("video_id", ids).is("parent_id", null).eq("is_hidden", false);
            if (countData && reqChip === chipRef.current && mySeq === sessionSeqRef.current) {   // B2: 칩/세션 변경 시 폐기(stale 방지)
              const counts: Record<string, number> = {};
              countData.forEach((c: any) => { counts[c.video_id] = (counts[c.video_id] || 0) + 1; });
              setCommentCounts((prev) => ({ ...prev, ...counts }));
              // 전역 스토어에 댓글수 시드(seed-once) → 모든 피드 "댓글 N" 통일
              Object.entries(counts).forEach(([id, n]) => seedCommentCount(id, n));
            }
          })();
        }
      }
    } catch (e) {
      console.error("loadMore error:", e);
      // H5: 에러 시 무한 재시도 루프 중단 + 사용자 피드백. 재시도 버튼으로 재개.
      if (reqChip === chipRef.current && mySeq === sessionSeqRef.current) {
        hasMoreRef.current = false;
        setHasMore(false);
        setFeedError(true);
      }
    } finally {
      // H10: 그 사이 칩/유저가 바뀌었으면(=새 세션) 이 stale 완료는 새 세션의 fetching/loading 을 안 건드린다
      if (mySeq === sessionSeqRef.current) {
        fetchingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [showcase]);

  // H5: 에러 후 재시도 — 에러 해제 + (순서 미확정이면 재확정) + 다음 페이지 재요청
  const retryLoad = useCallback(async () => {
    setFeedError(false);
    hasMoreRef.current = true;
    setHasMore(true);
    if (orderRef.current.length === 0) {
      const { data, error } = await supabase.rpc("get_home_feed_order", { p_filter: chipRef.current });
      if (error) { setFeedError(true); hasMoreRef.current = false; setHasMore(false); return; }
      orderRef.current = (data as string[]) || [];
    }
    loadMore();
  }, [loadMore]);

  // 초기 로드: 광고 + 좋아요 상태 + 첫 페이지 영상 (user/칩 변경 시 처음부터 재시작)
  // 단, 모듈 캐시에 직전 피드가 있으면 즉시 복원(리로드/스피너 없이 — 탭 복귀 즉시화).
  useEffect(() => {
    let cancelled = false;
    const cacheKey = `${user?.id ?? "anon"}:${chip}`;
    const snap = homeFeedCache[cacheKey];
    const age = snap ? Date.now() - snap.ts : Infinity;
    const isFresh = !!snap && age < HOME_CACHE_TTL_MS;                 // 90초 이내 → 재검증 없이 확정
    const isStale = !!snap && !isFresh && age < HOME_STALE_TTL_MS;     // 30분 이내 → SWR(즉시 표시 후 재검증)
    if (snap && (isFresh || isStale)) {
      // 즉시 복원(콜드스타트/탭복귀 스피너 없음). 스테일이면 아래 async 가 배경 재검증.
      sessionSeqRef.current++;
      chipRef.current = chip;
      offsetRef.current = snap.offset;
      hasMoreRef.current = snap.hasMore;
      fetchingRef.current = false;
      orderRef.current = snap.order || [];
      setHasMore(snap.hasMore);
      setVideos(snap.videos);
      snap.videos.forEach((v) => { if (!v.id.startsWith("demo-")) seedLikeCount(v.id, v.likes); });
      setAds(snap.ads);
      setCommentCounts(snap.commentCounts);
      Object.entries(snap.commentCounts).forEach(([id, n]) => seedCommentCount(id, n as number));
      setActiveId(snap.videos[0]?.id ?? null);
      setLoading(false);
      if (isFresh) {
        stateKeyRef.current = cacheKey;   // 신선 → 이 데이터로 확정(저장 허용), 재검증 안 함
        return () => { cancelled = true; };
      }
      // 스테일 → stateKeyRef 는 아직 미확정(아래 async 가 null 로 두어 재검증 완료까지 저장 차단)
    }
    const revalidating = !!(snap && isStale);
    (async () => {
      if (!revalidating) {   // 캐시 없음 → 일반 로드(스피너). 스테일 재검증이면 화면 유지·스피너 없음.
        setLoading(true);
        setVideos([]);
        setActiveId(null);
        setHasMore(true);
      }
      stateKeyRef.current = null;   // 로드/재검증 완료 전까지 저장 금지(오염 방지)
      sessionSeqRef.current++;   // H10: 새 세션 시작 → 이전 in-flight loadMore 무효화
      chipRef.current = chip;
      offsetRef.current = 0;
      hasMoreRef.current = true;
      fetchingRef.current = false;
      if (!revalidating) orderRef.current = [];   // 스테일 재검증이면 새 순서 도착 전까지 기존 순서 유지
      setFeedError(false);
      try {
        // 홈 피드 광고: ads_public 뷰에서 조회 — 승인·활성·노출기간 필터를 뷰가 강제하고
        // 민감컬럼(budget_krw/spent_krw/owner_id 등)은 비노출. 여기선 노출형식(feed_display)만 거름.
        // 광고는 첫 영상 페인트에 불필요(피드 interleaving 용) → 비블로킹 병렬(순서 조회 앞에서 await 안 함).
        supabase.from("ads_public")
          .select("id,title,advertiser,image_url,video_url,thumbnail_url,link_url,cta_text,interval_count,ad_type")
          .or("ad_type.eq.feed_display,ad_type.is.null")
          .then(({ data }) => { if (!cancelled && data && data.length > 0) setAds(data as Ad[]); }, () => {});

        // H3: 이 세션의 랭킹 순서를 1회 확정(고정) → 이후 페이지는 이 순서에서 슬라이스만.
        const { data: orderData, error: orderErr } = await supabase.rpc("get_home_feed_order", { p_filter: chip });
        if (cancelled) return;
        if (orderErr) throw orderErr;
        if (chip !== chipRef.current) return;   // 그 사이 칩 바뀌면 폐기
        orderRef.current = (orderData as string[]) || [];
        const hasAny = orderRef.current.length > 0;
        hasMoreRef.current = hasAny;
        setHasMore(hasAny);

        if (!cancelled) await loadMore();
        // 첫 페이지 로드 완료 → 이제 state 는 이 키의 데이터 (캐시 저장 허용)
        if (!cancelled && chip === chipRef.current) stateKeyRef.current = cacheKey;
      } catch (error) {
        console.error("Error fetching discovery data:", error);
        // 재검증(스테일 표시 중) 실패는 화면 유지(에러 미표시) — 다음 세션에서 다시 시도. 일반 로드 실패만 에러 표시.
        if (!cancelled && !revalidating) { setFeedError(true); hasMoreRef.current = false; setHasMore(false); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, chip, loadMore]);

  // 피드 변경 시 모듈 캐시에 저장 → 탭 복귀 시 즉시 복원용(메모리, 세션 내). 초기 로딩 중엔 기록 안 함.
  useEffect(() => {
    if (loading) return;
    const cacheKey = `${user?.id ?? "anon"}:${chip}`;
    // state 소유 키와 현재 키가 일치할 때만 저장 — 유저/칩 전환 커밋 직후 이전 세션의
    // videos 가 새 키에 (offset=0·order=[] 와 함께) 저장되는 캐시 포이즈닝 차단
    if (stateKeyRef.current !== cacheKey) return;
    homeFeedCache[cacheKey] = {
      videos, offset: offsetRef.current, hasMore: hasMoreRef.current, commentCounts, ads, order: orderRef.current, ts: Date.now(),
    };
    // H9: 캐시 크기 제한 — 오래된 스냅샷부터 제거
    const keys = Object.keys(homeFeedCache);
    if (keys.length > HOME_CACHE_MAX) {
      keys.sort((a, b) => homeFeedCache[a].ts - homeFeedCache[b].ts)
        .slice(0, keys.length - HOME_CACHE_MAX)
        .forEach((k) => delete homeFeedCache[k]);
    }
    persistHomeCacheToLS();   // 콜드스타트 즉시 페인트용으로 localStorage 에도 지속(첫 페이지만)
  }, [videos, ads, commentCounts, loading, user?.id, chip]);

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

  // 노출 트래킹 — 세션키 전달(서버 dedup: 광고·뷰어·1시간 1회 과금)
  const handleAdImpression = useCallback(async (adId: string) => {
    try { await sendAdEvent("feed_impression", adId); } catch {}
  }, []);

  // 영상 목록에 광고를 interval_count마다 삽입하여 피드 아이템 배열 생성
  // Phase 24: 차단 사용자 영상은 visibleVideos 기준으로 제외
  const feedItems = useMemo<FeedItem[]>(() => {
    // 자체광고 ON 이면 광고주 설정 주기(interval_count), OFF 면 외부광고 고정 주기(자체광고 데이터와 분리)
    const interval = HOME_FEED_SELF_ADS ? ((ads[0]?.interval_count) || 4) : 5;
    const result: FeedItem[] = [];
    let adSlot = 0;
    visibleVideos.forEach((v, i) => {
      result.push({ kind: "video", ...v });
      if ((i + 1) % interval === 0) {
        // 자체광고 우선(스위치 ON 시) → 없으면 외부 네트워크(애드핏/애드센스). 둘 다 없으면 슬롯 생략(빈 섹션 방지)
        if (HOME_FEED_SELF_ADS && adSlot < ads.length) {
          result.push({ kind: "ad", ...ads[adSlot], adIndex: adSlot });
          adSlot++;
        } else if (EXTERNAL_ADS_ACTIVE) {
          result.push({ kind: "extad", slot: adSlot });
          adSlot++;
        }
      }
    });
    return result;
  }, [visibleVideos, ads]);

  // 데스크탑 그리드 광고 삽입: 영상 6개마다 1개.
  // 핵심: 그리드상 광고 간격 = 영상6 + 광고1 = "7칸 주기"(광고가 들어가며 뒤 영상이 한 칸씩 밀림).
  //   7은 2·3·4열과 서로소 → 광고가 같은 열에 쏠리지 않고 행마다 대각선으로 회전.
  //   (interval=7이면 주기 8 = 4의 배수라 4열에서 매번 오른쪽 끝에 박힘 → 6이어야 함)
  // 자체광고 먼저(반복 없이) → 소진되면 애드핏(ExternalAdSlot) 폴백
  const DESKTOP_AD_INTERVAL = 6;
  const desktopItems = useMemo<DesktopItem[]>(() => {
    const out: DesktopItem[] = [];
    let adSlot = 0;
    // Phase 24: 차단 사용자 영상 제외 — 모바일(feedItems)과 동일하게 visibleVideos 기준
    visibleVideos.forEach((v, i) => {
      out.push({ kind: "video", video: v });
      if ((i + 1) % DESKTOP_AD_INTERVAL === 0) {
        // 자체광고 우선(스위치 ON 시) → 없으면 애드핏/애드센스. 둘 다 없으면 슬롯 생략(빈 셀 방지)
        if (HOME_FEED_SELF_ADS && adSlot < ads.length) {
          out.push({ kind: "selfad", ad: ads[adSlot], key: `selfad-${ads[adSlot].id}-${adSlot}` });
          adSlot++;
        } else if (EXTERNAL_ADS_ACTIVE) {
          out.push({ kind: "adfit", slot: adSlot });
          adSlot++;
        }
      }
    });
    return out;
  }, [visibleVideos, ads]);

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
  }, [videos.length > 0, loading]); // 매 append 마다 리스너 재바인딩하던 것 → 피드 등장/소멸(0↔N)
                                    // 시에만 재바인딩(detectActive 는 내부에서 현재 래퍼를 querySelectorAll
                                    // 로 읽어 새 항목 반영). loading 포함: container 는 loading=false 시 생김.

  // 좋아요 토글 — 전역 스토어 경유(모든 피드 동시 반영). 낙관적 반영·롤백·중복방지는 스토어가 처리.
  const toggleLike = useCallback(async (videoId: string, base?: number) => {
    if (handleShowcaseClick(videoId)) return;
    const res = await toggleLikeStore(videoId, base);
    if (res === "needAuth" && onSignInClick) onSignInClick();
    else if (res === "error") toast.error(t("discoveryFeed.likeFailed"));
  }, [onSignInClick, toggleLikeStore, t]);

  // 안정 참조 — DesktopMovieCard/MovieSection(memo) 리렌더 방지용(H12)
  const handleComment = useCallback((video: Video) => {
    if (handleShowcaseClick(video.id)) return;
    setCommentVideo(video);
  }, []);
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
  if (videos.length === 0) return (
    <div className="h-full flex flex-col items-center justify-center gap-3 bg-background text-center px-6">
      {feedError ? (
        <>
          <p className="text-muted-foreground">{t("discoveryFeed.loadFailed")}</p>
          <button onClick={retryLoad} className="px-4 py-2 rounded-lg bg-[#6366f1] hover:bg-[#5457e5] text-white text-sm font-bold transition-colors">{t("common.retry")}</button>
        </>
      ) : (
        <p className="text-muted-foreground">{t("discoveryFeed.empty")}</p>
      )}
    </div>
  );

  const isCommentOpen = commentVideo !== null;

  return (
    <div className="discovery-feed-wrapper h-full w-full bg-[#0a0a0a] overflow-hidden flex flex-col">
      {/* BETA_MODE: 홈피드 상단 베타 띠배너 (홈은 카테고리 없으니 배너만). 끄면 미표시 */}
      {BETA_MODE && (
        <div className="shrink-0 flex items-center gap-2 md:gap-3 px-3 md:px-6 py-2 bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#ec4899]">
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/20 text-white text-[9px] md:text-[11px] font-black shrink-0">
            <Sparkles className="w-3 h-3" /> BETA
          </span>
          {/* 모바일: 마퀴(흐르는 텍스트)로 전체 노출 — truncate 로 잘리던 문구 해결. 2벌 복제 → -50% 무한루프 */}
          <div className="md:hidden flex-1 min-w-0 overflow-hidden">
            <div className="flex w-max banner-marquee" style={{ animationDuration: "14s" }}>
              <span className="text-white text-[11px] font-bold whitespace-nowrap pr-10">{t("discoveryFeed.betaBanner")}</span>
              <span aria-hidden="true" className="text-white text-[11px] font-bold whitespace-nowrap pr-10">{t("discoveryFeed.betaBanner")}</span>
            </div>
          </div>
          {/* 데스크탑: 공간 충분 → 정적 표시 */}
          <p className="hidden md:block flex-1 min-w-0 text-white text-sm font-bold truncate">
            {t("discoveryFeed.betaBanner")}
          </p>
          <button
            onClick={() => onNavigate?.("upload")}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 md:px-3.5 py-1 md:py-1.5 rounded-full bg-white text-[#6d28d9] text-[11px] md:text-sm font-black hover:bg-white/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> {t("discoveryFeed.betaRegister")}
          </button>
        </div>
      )}

      {/* 모바일 칩 필터 바 — 데스크탑은 헤더에 칩이 있으나 모바일엔 진입점이 없던 것 보강(B1, 2026-06-28).
          상단 상시 노출, 가로 스크롤. setChip 은 데스크탑과 동일 state 공유.
          브레이크포인트는 피드 레이아웃(≥1024px=데스크탑 그리드)과 맞춰 lg:hidden — md:hidden 이면
          태블릿(768~1023px)에서 모바일 피드는 나오는데 칩 바만 사라지는 사각지대가 생김. */}
      <div className="lg:hidden shrink-0 bg-[#0a0a0a] border-b border-white/5">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar px-3 py-2">
          {HOME_CHIPS.map((c) => (
            <button
              key={c.key}
              onClick={() => setChip(c.key)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${
                chip === c.key
                  ? "bg-white text-black border-white"
                  : "bg-white/5 text-white/60 border-white/10"
              }`}
            >
              {t(`discoveryFeed.chips.${c.key}`)}
            </button>
          ))}
        </div>
      </div>

      {/* SEO + Google OAuth 브랜딩 인증용 약관 링크 (시각적 노출 X, 봇 인식 O)
          DiscoveryFeed 가 첫 화면이고 푸터가 없어서 약관 링크가 노출 안 됨 → 추가 */}
      <nav aria-label={t("discoveryFeed.legalNav")} className="sr-only">
        <a href="?info=privacy">{t("footer.privacy")}</a>
        <a href="?info=terms">{t("footer.terms")}</a>
        <a href="?info=about">{t("footer.about")}</a>
        <a href="?info=creator-revenue">{t("footer.creatorRevenue")}</a>
      </nav>
      <div
        ref={containerRef}
        className={`mobile-feed-container h-full overflow-y-auto snap-y snap-mandatory custom-scrollbar ${isCommentOpen ? 'comments-open' : ''}`}
      >
        {feedItems.map((item) => (
          <div
            key={item.kind === "video" ? item.id : item.kind === "ad" ? `ad-${item.id}-${item.adIndex}` : `extad-${item.slot}`}
            className={`discovery-section-wrapper ${isCommentOpen && item.kind === "video" && item.id === commentVideo?.id ? 'is-comment-active' : ''}`}
          >
            {item.kind === "ad" ? (
              <AdCard ad={item} onImpression={handleAdImpression} />
            ) : item.kind === "extad" ? (
              <ExternalAdSlot index={item.slot} className="h-full w-full" />
            ) : (
              <MovieSection
                video={item}
                isActive={item.id === activeId}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted(!isMuted)}
                onVideoClick={onVideoClick}
                onToggleLike={toggleLike}
                onSetActive={(id) => setActiveId(id)}
                onComment={handleComment}
                onShare={handleShare}
                onFullscreen={(v) => { if (handleShowcaseClick(v.id)) return; openFullscreenGated(v); }}
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
        {feedError && (
          <div className="py-10 flex flex-col items-center gap-3 text-center">
            <p className="text-sm text-gray-400">{t("discoveryFeed.loadFailed")}</p>
            <button onClick={retryLoad} className="px-4 py-2 rounded-lg bg-[#6366f1] hover:bg-[#5457e5] text-white text-sm font-bold transition-colors">{t("discoveryFeed.retry")}</button>
          </div>
        )}
        {!hasMore && !feedError && (
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
                    {t(`discoveryFeed.chips.${c.key}`)}
                  </button>
                ))}
              </div>
              {/* 왼쪽 화살표 (스크롤 시작 이후 표시) */}
              {chipArrows.left && (
                <button
                  type="button"
                  onClick={() => scrollChips("left")}
                  aria-label={t("discoveryFeed.chipPrev")}
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
                  aria-label={t("discoveryFeed.chipNext")}
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
                    placeholder={t("discoveryFeed.searchPlaceholder")}
                    aria-label={t("common.search")}
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
            {desktopItems.map((item) => {
              if (item.kind === "selfad") {
                return <DesktopAdCard key={item.key} ad={item.ad} onImpression={handleAdImpression} />;
              }
              if (item.kind === "adfit") {
                // 자체광고 소진 시 폴백 — 미설정/비활성이면 ExternalAdSlot 이 null 반환(빈 셀 없음)
                return (
                  <ExternalAdSlot
                    key={`adfit-${item.slot}`}
                    index={item.slot}
                    className="justify-self-center self-center"
                  />
                );
              }
              const v = item.video;
              return (
                <DesktopMovieCard
                  key={v.id}
                  video={v}
                  onVideoClick={onVideoClick}
                  onAddToCart={onAddToCart}
                  onToggleLike={toggleLike}
                  onComment={handleComment}
                  onShare={handleShare}
                  commentCount={commentCounts[v.id] || 0}
                  creatorAvatar={v.creatorId ? creatorInfo[v.creatorId]?.avatar ?? null : null}
                  creatorName={v.creatorId ? creatorInfo[v.creatorId]?.name ?? null : null}
                  onViewCreator={onViewCreator}
                  onSignInClick={onSignInClick}
                />
              );
            })}
          </div>
          {/* 무한 스크롤 sentinel (데스크탑) */}
          <div className="feed-load-sentinel h-1" aria-hidden />
          {loadingMore && (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" /></div>
          )}
          {feedError && (
            <div className="py-10 flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-gray-400">{t("discoveryFeed.loadFailed")}</p>
              <button onClick={retryLoad} className="px-4 py-2 rounded-lg bg-[#6366f1] hover:bg-[#5457e5] text-white text-sm font-bold transition-colors">{t("discoveryFeed.retry")}</button>
            </div>
          )}
          {!hasMore && !feedError && (
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
        /* 댓글 열림 시: 활성 카드 하단 글로우 구분선(::after, z-50)이 댓글 시트(z-40) 상단으로
           겹쳐 첫 댓글과 포개지던 것 방지 → 구분선 숨김 */
        .mobile-feed-container.comments-open .discovery-section-wrapper.is-comment-active::after {
          display: none !important;
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
        {!isDesktop && commentVideo && (
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
        thumbnail={shareTarget?.thumbnail}
        onClose={() => setShareTarget(null)}
      />

      {/* 데스크탑 댓글 모달 */}
      <AnimatePresence>
        {isDesktop && commentVideo && (
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
            isLiked={isLikedStore(fullscreenVideo.id)}
            likeCount={likesDisplayCount(fullscreenVideo.id, fullscreenVideo.likes)}
            commentCount={likesDisplayComments(fullscreenVideo.id, commentCounts[fullscreenVideo.id] || 0)}
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
            onToggleLike={() => toggleLike(fullscreenVideo.id, fullscreenVideo.likes)}
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

// 데스크탑 그리드용 자체광고 카드 — DesktopMovieCard 와 동일 셸(aspect-video + 푸터)로 그리드 리듬 유지
const DesktopAdCard = memo(({ ad, onImpression }: { ad: Ad; onImpression: (id: string) => void }) => {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const tracked = useRef(false);

  useEffect(() => {
    if (!cardRef.current || tracked.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked.current) {
          tracked.current = true;
          onImpression(ad.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [ad.id, onImpression]);

  const handleClick = () => {
    // 제스처와 동기 오픈 먼저(팝업차단 회피) → 클릭 집계는 fire-and-forget.
    openAdLinkSafe(ad.link_url);
    sendAdEvent("feed_click", ad.id).catch(() => {});
  };

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className="bg-[#141414] rounded-2xl overflow-hidden border border-white/[0.08] hover:border-[#6366f1]/50 shadow-lg hover:shadow-[0_0_30px_rgba(99,102,241,0.15)] transition-all duration-300 cursor-pointer group flex flex-col"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        {ad.image_url ? (
          <img src={ad.image_url} alt={ad.title} loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover" />
        ) : ad.video_url ? (
          <AdVideoPlayer src={ad.video_url} poster={ad.thumbnail_url} />
        ) : ad.thumbnail_url ? (
          <img src={ad.thumbnail_url} alt={ad.title} loading="lazy" decoding="async" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6]" />
        )}
        <div className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-black/50 backdrop-blur-sm border border-white/20 rounded-full text-[10px] font-bold text-white/70 tracking-widest">
          {t("discoveryFeed.adBadge")}
        </div>
      </div>
      <div className="p-5 flex-1 flex flex-col">
        {ad.advertiser && (
          <p className="text-xs text-white/50 font-medium mb-1">{ad.advertiser}</p>
        )}
        <h3 className="font-extrabold text-lg text-white line-clamp-2 uppercase tracking-tight">{ad.title}</h3>
        <button
          onClick={(e) => { e.stopPropagation(); handleClick(); }}
          className="mt-4 self-start flex items-center gap-1.5 px-4 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-white/90 transition-colors"
        >
          {ad.cta_text}
        </button>
      </div>
    </div>
  );
});

const DesktopMovieCard = memo(function DesktopMovieCard({ video, onVideoClick, onAddToCart, onToggleLike, onComment, onShare, commentCount = 0, creatorAvatar = null, creatorName = null, onViewCreator, onSignInClick }: { video: Video; onVideoClick: (video: Video) => void; onAddToCart?: (video: Video) => void; onToggleLike: (id: string, base: number) => void; onComment: (video: Video) => void; onShare: (video: Video) => void; commentCount?: number; creatorAvatar?: string | null; creatorName?: string | null; onViewCreator?: (creatorId: string) => void; onSignInClick?: () => void }) {
  const { isLiked: isLikedStore, displayCount, displayComments, displayViews, seedViews } = useLikes();
  const isLiked = isLikedStore(video.id);
  const likeDisplay = displayCount(video.id, video.likes);
  const commentDisplay = displayComments(video.id, commentCount);
  const viewCount = displayViews(video.id, video.views);
  useEffect(() => { seedViews(video.id, video.views ?? undefined); }, [video.id, video.views, seedViews]);
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const ageVerified = profile?.age_verified ?? false;
  const isMyVideo = !!user?.id && !!video.creatorId && user.id === video.creatorId;
  const isAgeLocked = !isMyVideo && shouldBlur((video as any).age_rating, ageVerified);
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<any>(null);

  // Video.js를 React 외부에서 생성 — removeChild 충돌 방지
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isHovered || isAgeLocked || !video.videoUrl) return;  // 19+ 미인증 호버 자동재생 차단

    // 재호버: 이미 만든 플레이어를 하이라이트 시작점부터 재생 재개
    // (기존엔 pause 만 있고 resume 이 없어 두 번째 호버부터 멈춘 프레임만 보이던 버그)
    if (playerRef.current) {
      const p = playerRef.current;
      if (!p.isDisposed()) {
        p.currentTime(video.highlightStart || 0);
        const pp = p.play();
        if (pp) pp.catch(() => {});
      }
      return;
    }

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
    // 하이라이트 구간 루프 — 모바일 카드(MovieSection)와 동일: start~end(기본 30초) 반복
    p.on('timeupdate', () => {
      const s = video.highlightStart || 0;
      let e = video.highlightEnd || (s + 30);
      const d = p.duration();
      if (typeof d === 'number' && d > 0 && e > d) e = d; // 구간이 영상보다 길면 전체 재생
      const t = p.currentTime();
      if (typeof t === 'number' && t >= e) {
        p.currentTime(s);
        const pp2 = p.play();
        if (pp2) pp2.catch(() => {});
      }
    });
  }, [isHovered, video.videoUrl, video.highlightStart, video.highlightEnd, isAgeLocked]);

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
        <img src={video.thumbnail} loading="lazy" decoding="async"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 z-10 ${isHovered && !isAgeLocked ? 'opacity-0' : 'opacity-100'} ${isAgeLocked ? 'blur-xl scale-110' : ''}`} />
        {/* React가 아닌 Video.js가 직접 관리하는 컨테이너 */}
        <div ref={containerRef} className="absolute inset-0 z-0" />
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 items-start">
          <span className="px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-white font-bold text-[8px] border border-white/10 uppercase tracking-tighter">
            {video.tool}
          </span>
          {video.seriesId && (
            <span className="px-2 py-0.5 bg-[#6366f1]/85 backdrop-blur-md rounded text-white font-bold text-[8px] border border-white/20">
              {t("discoveryFeed.seriesBadge")}
            </span>
          )}
        </div>
        {/* 연령 등급 뱃지 (우상단) */}
        <div className="absolute top-3 right-3 z-10">
          <AgeBadge rating={(video as any).age_rating} size="xs" />
        </div>
        {/* 호버 시 하단 그라디언트 */}
        <div className={`absolute inset-0 bg-gradient-to-t from-black/60 to-transparent transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`} />
        {/* Phase 26: 19+ 잠금 오버레이 (본인 영상 제외) — 클릭은 카드로 버블 → ProductDetail 재게이트 */}
        {isAgeLocked && (
          <div className="absolute inset-0 z-30 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center text-center p-4">
            <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center mb-3">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <p className="text-base font-black text-white mb-1">{t("video.ageGateLockTitle")}</p>
            <p className="text-xs text-gray-300 underline">{t("video.ageGateLockHint")}</p>
          </div>
        )}
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
                {isNegotiationOnly(video.price)
                  ? <span className="text-lg font-black text-amber-400">{t("video.negotiationOnly", "별도 협의")}</span>
                  : <span className="text-lg font-black text-[#f87171]">₩{video.price.toLocaleString()}</span>}
              </>
            ) : (
              <>
                <span className="text-[10px] text-white/50 font-medium leading-none mb-1">{t("video.freeWatch")}</span>
                <span className="text-lg font-black text-gray-400">{t("video.notForSaleShort")}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-4">
            {viewCount > 0 && (
              <span className="flex items-center gap-1 p-2 text-white/40" title={t("videoRow.viewsPrefix", "조회수")}>
                <Eye className="w-5 h-5 text-white/30" />
                <span className="text-xs">{formatCompactNumber(viewCount)}</span>
              </span>
            )}
            <button onClick={(e) => { e.stopPropagation(); onToggleLike(video.id, video.likes); }} className="flex items-center gap-1 p-2 hover:bg-red-500/10 rounded-full transition-colors">
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white/30'}`} />
              {likeDisplay > 0 && <span className="text-xs text-white/40">{likeDisplay.toLocaleString()}</span>}
            </button>
            {/* 모바일 카드와 동일한 아이콘으로 통일: 댓글 MessageCircle, 공유 Send (2026-06-11) */}
            <button onClick={(e) => { e.stopPropagation(); onComment(video); }} className="flex items-center gap-1 p-2 hover:bg-white/10 rounded-full transition-colors">
              <MessageCircle className="w-5 h-5 text-white/30 hover:text-white transition-colors" />
              {commentDisplay > 0 && <span className="text-xs text-white/40">{commentDisplay}</span>}
            </button>
            <button onClick={(e) => { e.stopPropagation(); onShare(video); }} className="p-2 hover:bg-white/10 rounded-full transition-colors">
              <Send className="w-5 h-5 text-white/30 hover:text-white transition-colors" />
            </button>
            {/* 장바구니 — 담기(상세 이동 아님). ₩0=미판매 안내, 협의판매(₩1,000만+)=상세로(문의 흐름) */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (video.price <= 0) {
                  toast.info(t("video.notForSaleToast", "무료 시청 전용 영상입니다 (라이선스 미판매)"));
                  return;
                }
                if (isNegotiationOnly(video.price)) {
                  toast.info(t("video.negotiationToast", "별도 협의 상품입니다 — 상세에서 문의해주세요"));
                  onVideoClick(video);
                  return;
                }
                if (onAddToCart) onAddToCart(video);
                else onVideoClick(video);   // 콜백 미주입 폴백(기존 동작)
              }}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
              aria-label={t("videoRow.addToCart", "장바구니")}
            >
              <ShoppingCart className="w-5 h-5 text-white/30 hover:text-white transition-colors" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
