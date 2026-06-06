import { X, Heart, Send, Download, Check, MessageCircle, Crown, Lock, Flag, Bookmark, FileText, ShoppingCart, Eye } from "lucide-react";
import { formatCompactNumber } from "../i18n/numberFormat";
import { VideoRowCarousel, type CarouselVideo } from "./VideoRowCarousel";
import { Button } from "./ui/button";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { CommentPanel } from "./CommentPanel";
import { useBackButton } from "../hooks/useBackButton";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { useCreatorInfo } from "../hooks/useCreatorInfo";
import { SubscriptionModal, type PaywallReason } from "./SubscriptionModal";
import { CreatorAvatar } from "./CreatorAvatar";
import { trackVideoView } from "../utils/viewTracking";
import { usePayment } from "../hooks/usePayment";
import { Loader2 } from "lucide-react";
import { ReportModal } from "./ReportModal";
import { FollowButton } from "./FollowButton";
import { VideoEditModal } from "./VideoEditModal";
import { Pencil, Clock as ClockIcon } from "lucide-react";
import { AgeBadge, shouldBlur } from "./AgeBadge";
import { AgeGateModal } from "./AgeGateModal";
import { ShareModal } from "./ShareModal";
import { NextVideoOverlay } from "./NextVideoOverlay";
import { AddToPlaylistModal } from "./AddToPlaylistModal";
import { supabase } from "../utils/supabaseClient";
import { useTranslation } from "react-i18next";
import { getCategoryLabel } from "../i18n/categoryLabels";
import { AdOverlayBanner } from "./AdOverlayBanner";
import { AdMidrollPlayer } from "./AdMidrollPlayer";
import { fetchAdForVideo, recordAdImpression, type AdRpcResult } from "../utils/adFetch";

const BUNNY_PLAYER_ORIGIN = "https://iframe.mediadelivery.net";
function postBunnyCommand(iframe: HTMLIFrameElement | null, method: "play" | "pause") {
  if (!iframe) return;
  iframe.contentWindow?.postMessage(
    JSON.stringify({ context: "player.js", version: "0.0.1", method }),
    BUNNY_PLAYER_ORIGIN,
  );
}

// Bunny Stream 라이브러리 ID (env 변수). 클라이언트에 노출되어도 안전.
const BUNNY_LIBRARY_ID = (import.meta as any).env?.VITE_BUNNY_LIBRARY_ID || "";

// 페이월 정책 v2 (2026-05-26): 단순화 — 비구독자는 모든 영상 1분 미리보기 통일
// 실제 값은 SettingsContext 에서 동적으로 조회 (어드민이 platform_settings 로 조절 가능)
// 아래 상수는 SettingsContext fetch 실패 시 fallback
const FALLBACK_CINEMA_MIN = 60;       // 시네마 코너 노출 최소 (1분)
const FALLBACK_CINEMA_PREVIEW = 60;   // 비구독자 미리보기 (1분)
const FALLBACK_OTT_THRESHOLD = 600;   // OTT 코너 노출 최소 (10분)

// duration 텍스트 → 초 (durationSeconds 미제공 레거시 영상 대응)
function parseDurationText(text: string | undefined): number {
  if (!text) return 0;
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

interface ProductDetailProps {
  product: {
    // 기본 정보
    id: string;
    thumbnail: string;
    title: string;
    creator: string;
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

    // 채널 진입용 (Phase 6.5)
    creatorId?: string;

    // Phase 28: Sponsorship
    sponsorBrand?: string | null;
    sponsorLogoUrl?: string | null;
    sponsorDisclosure?: string | null;
    sponsorLinkUrl?: string | null;

    // Phase 31.6: 카운트 (Cinema/OTT 캐러셀 진입 시 전달)
    views?: number;
    likes?: number;
  };
  onClose: () => void;
  onAddToCart?: (product: any, licenseType: "standard" | "commercial" | "extended") => Promise<boolean> | boolean | void;
  onSignInClick?: () => void;
  onViewCreator?: (creatorId: string) => void;
  onNavigateToVideo?: (videoId: string) => void | Promise<void>;   // Phase 16: 연속 재생
  autoOpenComments?: boolean;   // 알림(답글) 클릭 진입 시 댓글창 자동 열기
}

export function ProductDetail({ product: productProp, onClose, onAddToCart, onSignInClick, onViewCreator, onNavigateToVideo, autoOpenComments }: ProductDetailProps) {
  const { t } = useTranslation();
  const [isLiked, setIsLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
  // Phase 31.6 — 좋아요·조회수 카운트 (DB videos.likes / videos.views 자동 동기화, 트리거 Phase 23.1)
  const [likesCount, setLikesCount] = useState<number>(productProp.likes ?? 0);
  const [viewsCount, setViewsCount] = useState<number>(productProp.views ?? 0);
  // Phase 31.3 — 라이선스 9개 체크리스트 모바일 접기/펼치기
  const [licenseExpanded, setLicenseExpanded] = useState(false);
  // Phase 32 — 함께 시청된 콘텐츠 (similar videos)
  const [similarVideos, setSimilarVideos] = useState<CarouselVideo[]>([]);
  // Phase 22: 영상 편집 모달 + 챕터/자막 fetch
  const [editOpen, setEditOpen] = useState(false);
  const [videoMeta, setVideoMeta] = useState<{
    chapters: { title: string; time_seconds: number }[];
    subtitle_url: string | null;
    age_rating: string;
  }>({
    chapters: [],
    subtitle_url: null,
    age_rating: "all",
  });
  // 보강 필드 — Cinema/OTT 카드처럼 가벼운 페이로드로 진입한 경우 누락된 필드를 DB에서 직접 채움
  const [extra, setExtra] = useState<{
    description?: string;
    genre?: string;
    productionYear?: number;
    castCredits?: string;
    director?: string;
    writer?: string;
    composer?: string;
    language?: string;
    subtitleLanguage?: string;
    aiModelVersion?: string;
    prompt?: string;
    seed?: string;
    resolution?: string;
    tags?: string[];
    sponsorBrand?: string | null;
    sponsorLogoUrl?: string | null;
    sponsorDisclosure?: string | null;
    sponsorLinkUrl?: string | null;
    licenseType?: string;
    licenseSourceUrl?: string;
    attribution?: string;
    originalCreator?: string;
  }>({});
  // 진입 경로별 누락 필드를 DB fetch 결과로 보강한 통합 product (Cinema/OTT 가벼운 페이로드 보강용)
  const product = useMemo(() => ({
    ...productProp,
    description: productProp.description ?? extra.description,
    genre: productProp.genre ?? extra.genre,
    productionYear: productProp.productionYear ?? extra.productionYear,
    castCredits: productProp.castCredits ?? extra.castCredits,
    director: productProp.director ?? extra.director,
    writer: productProp.writer ?? extra.writer,
    composer: productProp.composer ?? extra.composer,
    language: productProp.language ?? extra.language,
    subtitleLanguage: productProp.subtitleLanguage ?? extra.subtitleLanguage,
    aiModelVersion: productProp.aiModelVersion ?? extra.aiModelVersion,
    prompt: productProp.prompt ?? extra.prompt,
    seed: productProp.seed ?? extra.seed,
    resolution: productProp.resolution || extra.resolution,
    tags: (productProp.tags && productProp.tags.length > 0) ? productProp.tags : extra.tags,
    sponsorBrand: productProp.sponsorBrand ?? extra.sponsorBrand,
    sponsorLogoUrl: productProp.sponsorLogoUrl ?? extra.sponsorLogoUrl,
    sponsorDisclosure: productProp.sponsorDisclosure ?? extra.sponsorDisclosure,
    sponsorLinkUrl: productProp.sponsorLinkUrl ?? extra.sponsorLinkUrl,
    licenseType: extra.licenseType,
    licenseSourceUrl: extra.licenseSourceUrl,
    attribution: extra.attribution,
    originalCreator: extra.originalCreator,
  }), [productProp, extra]);
  // Phase 26: 연령 게이트
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  // 알림(답글) 클릭으로 진입 시 댓글창 자동 열기 (영상 바뀌면 재평가)
  useEffect(() => {
    if (autoOpenComments) setShowComments(true);
  }, [autoOpenComments, product.id]);
  // 크리에이터 아바타·이름 — Phase 6.6 (videos.creator는 snapshot이라 항상 최신 profiles 정보 우선)
  const creatorInfo = useCreatorInfo([product.creatorId]);
  const creatorAvatar = product.creatorId ? creatorInfo[product.creatorId]?.avatar : null;
  const creatorName = (product.creatorId ? creatorInfo[product.creatorId]?.name : null) ?? product.creator;

  // Phase 4: 페이월 게이트
  const { isSubscriber, isPremium, subscriptionTier, isAuthenticated, user, profile } = useAuth();
  // 콘텐츠 정책 v2 — 페이월·광고 임계값 동적 조회
  const settings = useSettings();
  // Phase 9: 라이선스 결제
  const { startLicensePurchase } = usePayment();
  const [buyingLicense, setBuyingLicense] = useState(false);
  // Phase 10: 신고 모달
  const [reportOpen, setReportOpen] = useState(false);
  // Phase 19: 공유 모달
  const [shareOpen, setShareOpen] = useState(false);
  // Phase 18: 플레이리스트 모달 + 저장됨 상태
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  useEffect(() => {
    if (!isAuthenticated || !product.id) {
      setIsSaved(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_playlist_memberships", { p_video_id: product.id });
      if (!cancelled && Array.isArray(data)) {
        setIsSaved(data.some((p: any) => p.contains));
      }
    })();
    return () => { cancelled = true; };
  }, [product.id, isAuthenticated]);

  // Phase 36: 영상별 JSON-LD VideoObject 스크립트 주입 (구글 비디오 검색용)
  useEffect(() => {
    if (!product.id) return;
    const seconds = product.durationSeconds || 0;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    const isoDuration = `PT${m}M${s}S`;
    const ld = {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: product.title,
      description: t("productDetail.jsonLdDescription", { creator: creatorName }),
      thumbnailUrl: product.thumbnail,
      uploadDate: new Date().toISOString(),
      duration: isoDuration,
      contentUrl: `https://www.creaite.net/?video=${product.id}`,
      embedUrl: `https://www.creaite.net/?video=${product.id}`,
      potentialAction: {
        "@type": "WatchAction",
        target: `https://www.creaite.net/?video=${product.id}`,
      },
    };
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = "video-jsonld";
    script.text = JSON.stringify(ld);
    // 기존 video-jsonld 있으면 제거
    const prev = document.getElementById("video-jsonld");
    if (prev) prev.remove();
    document.head.appendChild(script);
    return () => {
      const el = document.getElementById("video-jsonld");
      if (el) el.remove();
    };
  }, [product.id, product.title, product.thumbnail, product.durationSeconds, creatorName]);

  // Phase 22: 영상 메타데이터 (chapters, subtitle_url) 마운트 시 fetch
  useEffect(() => {
    if (!product.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("videos")
        .select(
          "chapters, subtitle_url, age_rating, " +
          "description, genre, production_year, cast_credits, " +
          "director, writer, composer, language, subtitle_language, " +
          "ai_model_version, prompt, seed, resolution, tags, " +
          "sponsor_brand, sponsor_logo_url, sponsor_disclosure, sponsor_link_url, " +
          "license_type, license_source_url, attribution, original_creator, " +
          "likes, views"
        )
        .eq("id", product.id)
        .maybeSingle();
      if (error) console.error("[ProductDetail] videos meta fetch error:", error);
      if (cancelled || !data) return;
      const d = data as any;
      const meta = {
        chapters: Array.isArray(d.chapters) ? d.chapters : [],
        subtitle_url: d.subtitle_url || null,
        age_rating: d.age_rating || "all",
      };
      setVideoMeta(meta);
      setExtra({
        description: d.description || undefined,
        genre: d.genre || undefined,
        productionYear: d.production_year || undefined,
        castCredits: d.cast_credits || undefined,
        director: d.director || undefined,
        writer: d.writer || undefined,
        composer: d.composer || undefined,
        language: d.language || undefined,
        subtitleLanguage: d.subtitle_language || undefined,
        aiModelVersion: d.ai_model_version || undefined,
        prompt: d.prompt || undefined,
        seed: d.seed || undefined,
        resolution: d.resolution || undefined,
        tags: Array.isArray(d.tags) ? d.tags : undefined,
        sponsorBrand: d.sponsor_brand ?? null,
        sponsorLogoUrl: d.sponsor_logo_url ?? null,
        sponsorDisclosure: d.sponsor_disclosure ?? null,
        sponsorLinkUrl: d.sponsor_link_url ?? null,
        licenseType: d.license_type || undefined,
        licenseSourceUrl: d.license_source_url || undefined,
        attribution: d.attribution || undefined,
        originalCreator: d.original_creator || undefined,
      });
      // Phase 31.6 — 카운트 최신화 (캐러셀 stale 데이터 보정)
      if (typeof d.likes === "number") setLikesCount(d.likes);
      if (typeof d.views === "number") setViewsCount(d.views);
      // Phase 26: 19+ 영상 + 미인증 사용자면 진입 시 자동 게이트
      if (meta.age_rating === "19" && !profile?.age_verified && user?.id !== (product.creatorId || undefined)) {
        setAgeGateOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [product.id, profile?.age_verified, user?.id, product.creatorId]);

  // Phase 32 — 함께 시청된 콘텐츠 (유사 영상) 조회
  useEffect(() => {
    if (!product.id) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_similar_videos", {
          p_video_id: product.id,
          p_tier: "all",
          p_limit: 8,
        });
        if (!cancelled && !error && data) setSimilarVideos(data as CarouselVideo[]);
      } catch (err) {
        console.warn("[ProductDetail] similar videos fetch failed:", err);
      }
    })();
    return () => { cancelled = true; };
  }, [product.id]);

  const isMyVideo = !!user?.id && !!product.creatorId && user.id === product.creatorId;
  // Phase 26: 19+ 영상 비인증 시 컨텐츠 잠금 (본인 영상은 제외)
  const isAgeLocked = !isMyVideo && shouldBlur(videoMeta.age_rating, profile?.age_verified);

  // Phase 23: 좋아요 정상화 — video_likes 테이블 연동 (DiscoveryFeed와 동일 출처)
  useEffect(() => {
    if (!isAuthenticated || !user || !product.id) {
      setIsLiked(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("video_likes")
        .select("video_id")
        .eq("video_id", product.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!cancelled) setIsLiked(!!data);
    })();
    return () => { cancelled = true; };
  }, [product.id, isAuthenticated, user]);

  const handleToggleLike = async () => {
    if (!isAuthenticated || !user) {
      onSignInClick?.();
      return;
    }
    if (likeBusy) return;
    setLikeBusy(true);
    const next = !isLiked;
    setIsLiked(next);
    setLikesCount(c => Math.max(0, c + (next ? 1 : -1)));
    try {
      if (next) {
        await supabase.from("video_likes").insert({ video_id: product.id, user_id: user.id });
      } else {
        await supabase.from("video_likes").delete().match({ video_id: product.id, user_id: user.id });
      }
    } catch (err) {
      setIsLiked(!next);
      setLikesCount(c => Math.max(0, c + (next ? -1 : 1)));
      toast.error(t("productDetail.toast.likeFailed"));
      console.error("[ProductDetail] toggleLike error:", err);
    } finally {
      setLikeBusy(false);
    }
  };
  const durationSeconds = product.durationSeconds ?? parseDurationText(product.duration);
  // 라이선스 판매 가능 여부 (₩0 영상은 무료 시청 전용, 라이선스 미판매)
  const isLicensable = !!product.price && product.price > 0;
  // 페이월 정책 v2 — 동적 설정 (어드민 조절 가능). fallback은 1분
  const previewSeconds = settings.cinemaPreviewSeconds || FALLBACK_CINEMA_PREVIEW;
  const cinemaMinSec = settings.cinemaMinSeconds || FALLBACK_CINEMA_MIN;
  // 영상이 미리보기 시간보다 길면 비구독자에게 미리보기 cutoff 적용
  // (영상이 더 짧으면 자동으로 풀 시청 — 별도 처리 불필요)
  const needsPreviewCutoff = durationSeconds > previewSeconds && !isSubscriber;
  // OTT 영상도 1분 미리보기 통일 (즉시 차단 X) — 단 카드에는 "🔒 프리미엄" 배지 표시
  const isOttVideo = durationSeconds >= (settings.ottMinSeconds || FALLBACK_OTT_THRESHOLD);
  const isCinemaVideo = durationSeconds >= cinemaMinSec;
  // 페이월 모달 상태
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallReason, setPaywallReason] = useState<PaywallReason>("cinema_cutoff");
  // 미리보기 컷오프 발동 후 iframe 제거 플래그
  const [cinemaCutoffTriggered, setCinemaCutoffTriggered] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // 비구독자 미리보기 컷오프 — 영상 currentTime이 previewSeconds(기본 60초) 도달 시 차단
  // Bunny Stream Player의 player.js 프로토콜(postMessage)로 재생 위치 추적.
  // wall-clock이 아닌 영상 시간 기준이라 시킹 점프(예: 7분 위치)도 즉시 차단.
  useEffect(() => {
    if (!needsPreviewCutoff || cinemaCutoffTriggered) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const LISTENER_ID = "creaite-cinema-cutoff";
    const BUNNY_ORIGIN = "https://iframe.mediadelivery.net";

    const subscribeTimeupdate = () => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          context: "player.js",
          version: "0.0.1",
          method: "addEventListener",
          value: "timeupdate",
          listener: LISTENER_ID,
        }),
        BUNNY_ORIGIN,
      );
    };

    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== BUNNY_ORIGIN) return;
      let data: any;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data?.context !== "player.js") return;

      // Bunny가 ready 이벤트를 보내면 그때 timeupdate 구독 (load 시점은 너무 빠름)
      if (data?.event === "ready") {
        console.log("[페이월] Bunny ready 수신 → timeupdate 구독");
        subscribeTimeupdate();
        return;
      }

      if (data?.event === "timeupdate") {
        const seconds = data?.value?.seconds ?? 0;
        if (seconds >= previewSeconds) {
          console.log("[페이월] currentTime", seconds, "초 도달 → 차단");
          setCinemaCutoffTriggered(true);
          setPaywallReason("cinema_cutoff");
          setPaywallOpen(true);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [needsPreviewCutoff, cinemaCutoffTriggered, previewSeconds]);

  // ── Phase 8: 시청 기록 (video_views 적재용) ──
  // 페이월 통과한 사용자가 영상을 실제로 시청하면 30% 도달 시 1회 RPC 호출.
  // 30%에 도달하지 못해도 5초 이상 시청했으면 unmount 시점에 기록 (서버에서 low_ratio로 invalid 처리).
  // 페이월 cutoff와 별도 LISTENER_ID로 구독해서 서로 간섭 없음.
  useEffect(() => {
    if (!product.id || !durationSeconds) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const LISTENER_ID = "creaite-view-tracker";
    const BUNNY_ORIGIN = "https://iframe.mediadelivery.net";
    const threshold = Math.max(5, Math.floor(durationSeconds * 0.30));
    let maxWatched = 0;
    let tracked = false;

    const subscribeTimeupdate = () => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          context: "player.js",
          version: "0.0.1",
          method: "addEventListener",
          value: "timeupdate",
          listener: LISTENER_ID,
        }),
        BUNNY_ORIGIN,
      );
    };

    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== BUNNY_ORIGIN) return;
      let data: any;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data?.context !== "player.js") return;

      if (data?.event === "ready") {
        subscribeTimeupdate();
        return;
      }
      // 다른 LISTENER (cinema cutoff 등) 이벤트는 무시
      if (data?.event !== "timeupdate" || data?.listener !== LISTENER_ID) return;

      const seconds = data?.value?.seconds ?? 0;
      if (seconds > maxWatched) maxWatched = seconds;

      if (!tracked && maxWatched >= threshold) {
        tracked = true;
        trackVideoView(product.id, Math.floor(maxWatched));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      // 30%에 못 도달했어도 5초+ 시청은 기록 (서버에서 유효성 판정)
      if (!tracked && maxWatched >= 5) {
        trackVideoView(product.id, Math.floor(maxWatched));
      }
    };
  }, [product.id, durationSeconds]);

  // Bunny Stream Player iframe embed URL
  // 진행바·볼륨·전체화면·재생속도·자막·HLS 적응형 비트레이트 등 모두 내장
  //
  // VAST pre-roll 정책 v4 (2026-05-26): Bunny iframe 의 vastTagUrl 파라미터 폐기.
  // Bunny 가 vastTagUrl 의 path/query 양쪽 모두 IMA SDK 에 전달 못해서
  // 1분 미만 차단 정책 적용이 사실상 불가. 자체 광고 컴포넌트(AdMidrollPlayer
  // format='preroll')로 본편 iframe 앞에 직접 광고 영상 띄우는 방식으로 전환.
  // 영상 길이 검사·skip 정책 분기·트래킹 모두 클라이언트가 직접 컨트롤.
  const bunnyEmbedUrl = BUNNY_LIBRARY_ID && product.id
    ? `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${product.id}?autoplay=true&loop=false&muted=true&preload=true&responsive=true`
    : null;

  // ── 자체 VAST Pre-roll 광고 (정책 v4 — Bunny vastTagUrl 폐기, 자체 컴포넌트) ──
  // 1분+ 영상이고 비프리미엄일 때만 본편 iframe 앞에 광고 영상 직접 재생.
  // 영상 변경 시 1회만 fetch (광고 종료 후 재 fetch 안 함).
  const [prerollAd, setPrerollAd] = useState<AdRpcResult | null>(null);
  const prerollFetchedRef = useRef(false);
  useEffect(() => {
    prerollFetchedRef.current = false;
    setPrerollAd(null);
  }, [product.id]);
  useEffect(() => {
    // Phase 28 정책 v5 (2026-05-26): AdMidrollPlayer 가 video.js 기반으로 재작성되어
    // dispose() 로 mp4 buffer/listener 자동 해제 → 메모리 누수 해결. preroll 재활성.
    if (prerollFetchedRef.current) return;
    if (cinemaCutoffTriggered || isAgeLocked) return;
    if (isPremium) return;
    if (!product.id || !durationSeconds || durationSeconds < 60) return;
    prerollFetchedRef.current = true;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("pick_random_video_preroll", {
        p_source_video_id: product.id,
      });
      if (cancelled || error || !data || data.length === 0) return;
      const ad = data[0];
      const skipOverride = subscriptionTier === "basic" ? 5 : null;
      const rawUrl = ad.video_url || "";
      const videoUrl = rawUrl.includes("/playlist.m3u8")
        ? rawUrl.replace("/playlist.m3u8", "/play_720p.mp4")
        : rawUrl;
      setPrerollAd({
        ad_id: ad.id,
        title: ad.title || "",
        advertiser: ad.advertiser || "",
        image_url: ad.image_url || null,
        video_url: videoUrl,
        thumbnail_url: ad.thumbnail_url || null,
        link_url: ad.link_url || null,
        cta_text: ad.cta_text || null,
        duration_seconds: ad.max_duration || 10,
        skip_after_seconds: skipOverride,
        trigger_position_pct: null,
      } as AdRpcResult);
    })();
    return () => { cancelled = true; };
  }, [product.id, cinemaCutoffTriggered, isAgeLocked, isPremium, subscriptionTier, durationSeconds]);

  // iframe 실제 노출 여부 — 미리보기 컷오프 + Phase 26: 19+ 미인증 차단 + 자체 광고 재생 중 차단
  // (v2 정책: OTT 즉시 차단 제거 — 모든 영상 1분 미리보기 통일)
  const iframeBlocked = cinemaCutoffTriggered || isAgeLocked || !!prerollAd;

  // ── Phase 28: Overlay 광고 (재생 중 30% 지점, 1분+ 영상만) ──
  const [overlayAd, setOverlayAd] = useState<AdRpcResult | null>(null);
  // 영상 변경 시 광고 상태 초기화
  useEffect(() => {
    setOverlayAd(null);
  }, [product.id]);

  useEffect(() => {
    if (iframeBlocked) return;
    if (!product.id || !durationSeconds || durationSeconds < 60) return;  // 1분 미만 제외
    const iframe = iframeRef.current;
    if (!iframe) return;

    const LISTENER_ID = "creaite-overlay-ad";
    const BUNNY_ORIGIN = "https://iframe.mediadelivery.net";
    let fired = false;

    const subscribe = () => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          context: "player.js",
          version: "0.0.1",
          method: "addEventListener",
          value: "timeupdate",
          listener: LISTENER_ID,
        }),
        BUNNY_ORIGIN,
      );
    };

    const handleMessage = async (e: MessageEvent) => {
      if (e.origin !== BUNNY_ORIGIN) return;
      let data: any;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data?.context !== "player.js") return;
      if (data?.event === "ready") {
        subscribe();
        return;
      }
      if (data?.event !== "timeupdate" || data?.listener !== LISTENER_ID) return;
      if (fired) return;

      const seconds = data?.value?.seconds ?? 0;
      // 광고가 등록한 trigger_position_pct를 따라야 하지만, RPC 전에는 알 수 없으니
      // 일단 25% 지점부터 광고를 fetch해보고 (RPC가 광고의 trigger_position_pct를 반환),
      // 광고의 실제 지점 도달 시 노출. 영상이 짧으면 부담스러우니 1차 fetch는 25% 지점에서 1회.
      const checkPct = (seconds / durationSeconds) * 100;
      if (checkPct < 25) return;
      fired = true;
      const ad = await fetchAdForVideo(product.id, "overlay");
      if (!ad) return;
      // 광고가 지정한 trigger_position_pct에 아직 도달 안 했으면 그 지점까지 대기
      const targetPct = ad.trigger_position_pct ?? 30;
      const currentPct = (seconds / durationSeconds) * 100;
      const delaySec = currentPct >= targetPct ? 0 : (durationSeconds * (targetPct - currentPct)) / 100;
      setTimeout(() => {
        setOverlayAd(ad);
        recordAdImpression(ad.ad_id, product.id, "overlay", { positionSeconds: Math.floor(seconds + delaySec) });
      }, delaySec * 1000);
    };

    const initialSubscribe = setTimeout(subscribe, 500);
    window.addEventListener("message", handleMessage);
    return () => {
      clearTimeout(initialSubscribe);
      window.removeEventListener("message", handleMessage);
    };
  }, [product.id, durationSeconds, iframeBlocked]);

  // ── Phase 28: Mid-roll 광고 (10분+ OTT 영상에 한정) ──
  const [midrollAd, setMidrollAd] = useState<AdRpcResult | null>(null);
  useEffect(() => {
    setMidrollAd(null);
  }, [product.id]);

  useEffect(() => {
    if (iframeBlocked) return;
    if (!product.id || !durationSeconds || durationSeconds < (settings.minDurationForMidroll || 600)) return;  // 10분+
    if (isSubscriber) return;  // 구독자(PREMIUM)는 광고 제거 — Step 6 정책과 동일
    const iframe = iframeRef.current;
    if (!iframe) return;

    const LISTENER_ID = "creaite-midroll-ad";
    let fired = false;

    const subscribe = () => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({
          context: "player.js",
          version: "0.0.1",
          method: "addEventListener",
          value: "timeupdate",
          listener: LISTENER_ID,
        }),
        BUNNY_PLAYER_ORIGIN,
      );
    };

    const handleMessage = async (e: MessageEvent) => {
      if (e.origin !== BUNNY_PLAYER_ORIGIN) return;
      let data: any;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch { return; }
      if (data?.context !== "player.js") return;
      if (data?.event === "ready") { subscribe(); return; }
      if (data?.event !== "timeupdate" || data?.listener !== LISTENER_ID) return;
      if (fired) return;

      const seconds = data?.value?.seconds ?? 0;
      const pct = (seconds / durationSeconds) * 100;
      // 50% 지점 도달 직전(48%)부터 fetch 시도 — 실제 trigger_position_pct는 광고가 들고 옴
      if (pct < 48) return;
      fired = true;
      const ad = await fetchAdForVideo(product.id, "midroll");
      if (!ad) return;
      const targetPct = ad.trigger_position_pct ?? 50;
      const currentPct = (seconds / durationSeconds) * 100;
      const delaySec = currentPct >= targetPct ? 0 : (durationSeconds * (targetPct - currentPct)) / 100;
      setTimeout(() => {
        postBunnyCommand(iframeRef.current, "pause");
        setMidrollAd(ad);
      }, delaySec * 1000);
    };

    const initialSubscribe = setTimeout(subscribe, 500);
    window.addEventListener("message", handleMessage);
    return () => {
      clearTimeout(initialSubscribe);
      window.removeEventListener("message", handleMessage);
    };
  }, [product.id, durationSeconds, iframeBlocked, isSubscriber]);

  // ── Phase 28: Sponsorship 배지 (영상 시작 시 5초간 우상단 노출) ──
  const [showSponsorBadge, setShowSponsorBadge] = useState(false);
  useEffect(() => {
    setShowSponsorBadge(false);
    if (!product.sponsorBrand || iframeBlocked) return;
    if (bumperAd || midrollAd || postrollAd) return;  // 광고 표시 중에는 숨김
    // 영상 시작 후 5초간 노출 (마운트와 동시에 시작 — Bunny ready 이벤트가 빠르게 옴)
    setShowSponsorBadge(true);
    const timer = setTimeout(() => setShowSponsorBadge(false), 5000);
    return () => clearTimeout(timer);
    // bumperAd 등이 바뀔 때마다 재실행 (광고 끝나면 배지가 다시 안 떠야 함 — 5초는 영상 시작 시 1회만)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id, product.sponsorBrand, iframeBlocked]);

  const handleSponsorClick = () => {
    if (!product.sponsorLinkUrl) return;
    window.open(product.sponsorLinkUrl, "_blank", "noopener,noreferrer");
  };

  // ── Phase 28: Bumper 광고 (영상 시작 직후 6초, 구독자 tier별 SKIP 차등) ──
  // 정책: Free=SKIP 불가 / Basic=5초 후 SKIP / Premium=광고 제거
  const [bumperAd, setBumperAd] = useState<AdRpcResult | null>(null);
  useEffect(() => {
    setBumperAd(null);
  }, [product.id]);

  useEffect(() => {
    if (iframeBlocked) return;
    if (isPremium) return;  // Premium은 광고 제거
    if (!product.id) return;
    let cancelled = false;
    (async () => {
      const ad = await fetchAdForVideo(product.id, "bumper");
      if (cancelled || !ad) return;
      // Tier별 SKIP 정책 override
      const skipOverride = subscriptionTier === "basic" ? 5 : null;  // free=null(SKIP 불가)
      postBunnyCommand(iframeRef.current, "pause");
      setBumperAd({ ...ad, skip_after_seconds: skipOverride });
    })();
    return () => { cancelled = true; };
  }, [product.id, iframeBlocked, isPremium, subscriptionTier]);

  // ── Phase 16: 연속 재생 (영상 종료 → 다음 영상 카운트다운) ──
  const [nextVideo, setNextVideo] = useState<{ id: string; title: string; thumbnail?: string | null; creator?: string | null; duration?: string | null; views?: number | null } | null>(null);
  const [showNextOverlay, setShowNextOverlay] = useState(false);
  // Phase 28: Post-roll 광고 (영상 종료 후, NextVideoOverlay 직전)
  const [postrollAd, setPostrollAd] = useState<AdRpcResult | null>(null);
  // 영상 변경 시 오버레이 초기화 (다른 영상 연속 재생할 때 잔류 방지)
  useEffect(() => {
    setShowNextOverlay(false);
    setNextVideo(null);
    setPostrollAd(null);
  }, [product.id]);

  // Bunny `ended` 이벤트 구독 + timeupdate 폴백 → 추천 영상 로드 → 오버레이 표시
  useEffect(() => {
    if (!onNavigateToVideo) return;
    if (iframeBlocked) return;
    const iframe = iframeRef.current;
    if (!iframe) return;

    const LISTENER_ID = "creaite-next-video";
    const BUNNY_ORIGIN = "https://iframe.mediadelivery.net";

    const subscribe = () => {
      // ended + timeupdate 둘 다 구독 (ended가 안 뜨는 영상 대비 폴백)
      ["ended", "timeupdate"].forEach((ev) => {
        iframe.contentWindow?.postMessage(
          JSON.stringify({
            context: "player.js",
            version: "0.0.1",
            method: "addEventListener",
            value: ev,
            listener: LISTENER_ID,
          }),
          BUNNY_ORIGIN,
        );
      });
    };

    let didFire = false;
    const triggerNext = async () => {
      if (didFire) return;
      didFire = true;
      try {
        // 1차: 같은 카테고리 비슷한 영상
        let { data, error } = await supabase.rpc("get_similar_videos", {
          p_video_id: product.id,
          p_limit: 3,
        });

        // 2차 폴백: similar 비면 trending (24h)
        if (!error && (!data || data.length === 0)) {
          const fallback = await supabase.rpc("get_trending_videos", {
            p_tier: "all",
            p_hours: 24,
            p_limit: 5,
          });
          data = (fallback.data || []).filter((v: any) => v.id !== product.id);
        }

        // 3차 폴백: 그래도 비면 신작 (30일)
        if (!data || data.length === 0) {
          const fallback2 = await supabase.rpc("get_new_releases", {
            p_tier: "all",
            p_days: 30,
            p_limit: 5,
          });
          data = (fallback2.data || []).filter((v: any) => v.id !== product.id);
        }

        if (!data || data.length === 0) return;
        const v = data[0];
        setNextVideo({
          id: v.id,
          title: v.title,
          thumbnail: v.thumbnail,
          creator: v.creator_display_name || v.creator,
          duration: v.duration,
          views: Number(v.views || 0),
        });

        // Phase 28: Post-roll 광고 시도 (구독자는 광고 제거)
        if (!isSubscriber) {
          const ad = await fetchAdForVideo(product.id, "postroll");
          if (ad) {
            setPostrollAd(ad);  // 광고 종료 콜백에서 setShowNextOverlay(true) 호출
            return;
          }
        }
        setShowNextOverlay(true);
      } catch {
        // 추천 로드 실패는 조용히 무시 (영상 시청 흐름 방해 안 함)
      }
    };

    // iframe이 이미 ready 상태일 수 있으니 한 번 즉시 시도 + ready 이벤트에서도 구독
    const initialSubscribe = setTimeout(subscribe, 500);

    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== BUNNY_ORIGIN) return;
      let data: any;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (data?.context !== "player.js") return;
      if (data?.event === "ready") {
        subscribe();
        return;
      }
      if (data?.event === "ended" && data?.listener === LISTENER_ID) {
        triggerNext();
        return;
      }
      // 폴백: timeupdate로 영상 종료 직전 감지 (Bunny가 ended 안 보내는 케이스)
      if (data?.event === "timeupdate" && data?.listener === LISTENER_ID) {
        const seconds = data?.value?.seconds ?? 0;
        const duration = data?.value?.duration ?? durationSeconds ?? 0;
        if (duration > 0 && seconds > 0 && Math.abs(seconds - duration) < 0.6) {
          triggerNext();
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => {
      clearTimeout(initialSubscribe);
      window.removeEventListener("message", handleMessage);
    };
  }, [product.id, iframeBlocked, onNavigateToVideo, durationSeconds, isSubscriber]);

  // 뒤로가기로 댓글 패널 닫기
  useBackButton(showComments, () => setShowComments(false));

  // Phase 9: 라이선스 즉시 구매 (장바구니 우회)
  const handleBuyNow = async () => {
    if (!isAuthenticated) {
      onSignInClick?.();
      return;
    }
    if (!product.price || product.price <= 0) {
      toast.error(t("productDetail.toast.notLicensable"));
      return;
    }

    setBuyingLicense(true);
    try {
      await startLicensePurchase({
        videoId: product.id,
        amount: product.price,
        videoTitle: product.title,
        email: user?.email,
        name: profile?.display_name || user?.name || user?.email,
      });
      // 토스 결제창으로 이동 — 여기 이후 코드는 실행 안 됨
    } catch (err: any) {
      if (err?.code === "USER_CANCEL") {
        toast.info(t("productDetail.toast.paymentCanceled"));
      } else {
        toast.error(t("productDetail.toast.paymentFailed") + (err?.message || t("productDetail.toast.unknownError")));
      }
      setBuyingLicense(false);
    }
  };

  const handleAddToCart = async () => {
    if (!onAddToCart) return;
    const result = await onAddToCart(product, "standard");
    // 인증 통과 + 추가 성공 시에만 "담김" 표시
    if (result === true) {
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    }
  };

  // Phase 19: 공유 모달 열기 (기존 navigator.share fallback도 유지 — 모바일 네이티브 공유)
  const handleShare = async () => {
    const url = `${window.location.origin}?video=${product.id}`;
    const shareData = {
      title: product.title,
      text: `CREAITE: ${product.title} by ${product.creator}`,
      url,
    };

    // 모바일에서 네이티브 공유 시트 우선 (있으면)
    if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;  // 사용자 취소 — 무시
        // 그 외 에러는 모달 fallback
      }
    }

    // 데스크톱 / 네이티브 공유 안 됨 → 우리 ShareModal
    setShareOpen(true);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background z-50 flex"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25 }}
        className="bg-background w-full h-full overflow-hidden flex"
        onClick={(e) => e.stopPropagation()}
      >
      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header — 영상 재생 영역 (페이월 적용). 슬림 헤더는 영상 우상단 배지로 통합됨 */}
        {/* 데스크탑 max-h 65vh — 영상 + 제목/메타/액션 한 화면에 보이도록 (넷플릭스 패턴, Phase 31.4) */}
        <div className="relative bg-black aspect-video md:aspect-video max-h-[40vh] md:max-h-[65vh] flex items-center justify-center overflow-hidden shrink-0">
          {iframeBlocked ? (
            // 페이월 차단 화면 — OTT 비구독자 또는 시네마 3분 컷오프 후
            <div className="relative w-full h-full">
              {/* 썸네일 배경 (블러) */}
              <img
                src={product.thumbnail}
                alt={product.title}
                className="absolute inset-0 w-full h-full object-cover scale-110 blur-md opacity-40"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />
              {/* 중앙 페이월 안내 — v2 단순화: OTT 영상도 미리보기 컷오프 후 동일 메시지 */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-2xl mb-4">
                  {isOttVideo ? <Crown className="w-8 h-8 text-white" /> : <Lock className="w-8 h-8 text-white" />}
                </div>
                <h3 className="text-xl md:text-2xl font-black text-white mb-2">
                  {isOttVideo ? t("productDetail.paywall.premiumOtt") : t("productDetail.paywall.previewEnded")}
                </h3>
                <p className="text-sm text-gray-300 mb-5 max-w-md">
                  {isOttVideo
                    ? t("productDetail.paywall.ottDescription")
                    : t("productDetail.paywall.cinemaDescription")}
                </p>
                <Button
                  onClick={() => {
                    setPaywallReason("cinema_cutoff");
                    setPaywallOpen(true);
                  }}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black px-6 h-11 shadow-lg shadow-amber-500/20 rounded-xl border border-white/10"
                >
                  <Crown className="w-4 h-4" />
                  {t("productDetail.paywall.subscribe")}
                </Button>
              </div>
            </div>
          ) : bunnyEmbedUrl ? (
            <iframe
              ref={iframeRef}
              src={bunnyEmbedUrl}
              loading="lazy"
              className="absolute inset-0 w-full h-full"
              style={{ border: 0 }}
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
              title={product.title}
            />
          ) : (
            <div className="relative w-full h-full">
              <img
                src={product.thumbnail}
                alt={product.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-4 py-2 bg-black/60 backdrop-blur-md rounded-lg text-white text-sm">
                  {t("productDetail.paywall.cannotPlay")}
                </div>
              </div>
            </div>
          )}



          {/* Phase 28: Overlay 광고 (재생 중 하단 배너) */}
          {overlayAd && !iframeBlocked && !midrollAd && (
            <AdOverlayBanner
              ad={overlayAd}
              videoId={product.id}
              onDismiss={() => setOverlayAd(null)}
            />
          )}

          {/* Phase 28: Mid-roll 광고 (영상 중간 풀스크린 광고) */}
          {midrollAd && !iframeBlocked && (
            <AdMidrollPlayer
              ad={midrollAd}
              videoId={product.id}
              format="midroll"
              onComplete={() => {
                setMidrollAd(null);
                postBunnyCommand(iframeRef.current, "play");
              }}
            />
          )}

          {/* Phase 28: Post-roll 광고 (영상 종료 후, NextVideoOverlay 직전) */}
          {postrollAd && !iframeBlocked && (
            <AdMidrollPlayer
              ad={postrollAd}
              videoId={product.id}
              format="postroll"
              onComplete={() => {
                setPostrollAd(null);
                setShowNextOverlay(true);
              }}
            />
          )}

          {/* Phase 28: Bumper 광고 (Free/Basic 시작 직후 6초, Premium은 표시 안 함) */}
          {bumperAd && !iframeBlocked && (
            <AdMidrollPlayer
              ad={bumperAd}
              videoId={product.id}
              format="bumper"
              onComplete={() => {
                setBumperAd(null);
                postBunnyCommand(iframeRef.current, "play");
              }}
            />
          )}

          {/* 정책 v4: 자체 VAST Pre-roll 광고 (본편 iframe 앞에 풀스크린) */}
          {/* prerollAd 가 있는 동안 iframeBlocked=true 라 본편 iframe 안 뜸 → 광고 종료 시 onComplete → setPrerollAd(null) → iframeBlocked=false → iframe 자동 마운트+autoplay */}
          {prerollAd && (cinemaCutoffTriggered === false && isAgeLocked === false) && (
            <AdMidrollPlayer
              ad={prerollAd}
              videoId={product.id}
              format="preroll"
              onComplete={() => setPrerollAd(null)}
            />
          )}

          {/* Phase 16: 다음 영상 오버레이 (영상 종료 시) */}
          <NextVideoOverlay
            open={showNextOverlay}
            nextVideo={nextVideo}
            countdownSeconds={8}
            onPlayNow={() => {
              if (nextVideo && onNavigateToVideo) {
                setShowNextOverlay(false);
                onNavigateToVideo(nextVideo.id);
              }
            }}
            onCancel={() => setShowNextOverlay(false)}
          />

          {/* AUTOPLAY 인디케이터 (Phase 31.4 — Bunny iframe 자동재생 표시) */}
          {!iframeBlocked && (
            <div className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 bg-black/60 backdrop-blur rounded-full text-[10px] md:text-xs text-white font-bold z-10">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              AUTOPLAY
            </div>
          )}

          {/* Duration Badge — 좌하단으로 이동 (우상단은 닫기 X + 1분 배지) */}
          <div className="absolute bottom-4 left-4 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-white text-sm">
            {product.duration}
          </div>

          {/* Phase 28: Sponsorship 배지 (시작 5초간) */}
          {showSponsorBadge && product.sponsorBrand && (
            <motion.button
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={handleSponsorClick}
              disabled={!product.sponsorLinkUrl}
              className="absolute top-16 right-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-amber-500/95 backdrop-blur-sm rounded-full text-white text-xs font-bold shadow-xl border border-amber-300/50 hover:bg-amber-500 disabled:cursor-default transition-colors"
            >
              {product.sponsorLogoUrl && (
                <img src={product.sponsorLogoUrl} alt={product.sponsorBrand} className="w-4 h-4 rounded-full object-cover bg-white/20" />
              )}
              <span>{product.sponsorDisclosure || "유료 광고 포함"}</span>
              <span className="opacity-80">· {product.sponsorBrand}</span>
            </motion.button>
          )}

          {/* 우상단: 1분 미리보기 배지 (비구독자만) + 닫기 X (가로 정렬, Phase 31.4) */}
          <div className="absolute top-4 right-4 flex items-center gap-2 z-20">
            {needsPreviewCutoff && !iframeBlocked && (
              <div className="px-2.5 py-1 bg-amber-500/85 backdrop-blur rounded-full text-[10px] md:text-xs font-bold text-black flex items-center gap-1">
                <Lock className="w-3 h-3" />
                {t("productDetail.paywall.cinemaPreviewBadge")}
              </div>
            )}
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              aria-label={t("common.close")}
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6">
            {/* Title & Creator */}
            <div className="mb-6">
              <h2 className="text-2xl md:text-4xl font-black mb-2">{product.title}</h2>

              {/* 인라인 메타: 연도·등급·길이·OTT·조회수·좋아요 (Phase 31.4 + 31.6) */}
              {(() => {
                const hasYearOrAge = !!product.productionYear || (videoMeta.age_rating && videoMeta.age_rating !== "all");
                const hasDurationLine = hasYearOrAge || !!product.duration;
                return (
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    {product.productionYear && (
                      <span className="text-sm text-gray-300">{product.productionYear}</span>
                    )}
                    <AgeBadge rating={videoMeta.age_rating} size="xs" />
                    {product.duration && (
                      <span className="text-sm text-gray-300">{hasYearOrAge ? "· " : ""}{product.duration}</span>
                    )}
                    {viewsCount > 0 && (
                      <span className="text-sm text-gray-300 inline-flex items-center gap-1">
                        {hasDurationLine ? "· " : ""}<Eye className="w-3.5 h-3.5 inline" /> {formatCompactNumber(viewsCount)}
                      </span>
                    )}
                    {likesCount > 0 && (
                      <span className="text-sm text-gray-300 inline-flex items-center gap-1">
                        · <Heart className="w-3.5 h-3.5 inline text-red-400" /> {formatCompactNumber(likesCount)}
                      </span>
                    )}
                    {isOttVideo && (
                      <span className="px-2 py-0.5 rounded bg-gradient-to-r from-amber-500/40 to-orange-500/40 backdrop-blur-sm text-white text-xs font-bold flex items-center gap-0.5">
                        <Crown className="w-3 h-3" /> OTT
                      </span>
                    )}
                  </div>
                );
              })()}
              <div className="flex items-center justify-between gap-3">
                {product.creatorId && onViewCreator ? (
                  <button
                    onClick={() => onViewCreator(product.creatorId!)}
                    className="flex items-center gap-3 text-muted-foreground hover:text-white transition-colors group"
                  >
                    <CreatorAvatar avatarUrl={creatorAvatar} name={creatorName} size="sm" />
                    <span className="group-hover:text-white">{creatorName}</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <CreatorAvatar avatarUrl={creatorAvatar} name={creatorName} size="sm" />
                    <span>{creatorName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {isMyVideo && (
                    <button
                      onClick={() => setEditOpen(true)}
                      className="w-9 h-9 rounded-full backdrop-blur-xl flex items-center justify-center border-2 border-white/30 bg-white/10 hover:bg-white/20 text-white transition-colors"
                      aria-label={t("productDetail.action.editVideo")}
                      title={t("productDetail.action.editVideo")}
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                  )}
                  {product.creatorId && (
                    <FollowButton
                      creatorId={product.creatorId}
                      onSignInClick={onSignInClick}
                      size="sm"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 영상 헤더 액션 — 비구독자 [구독하고 전체 보기] CTA + 5개 원형 액션 (Phase 31.3) */}
            <div className="flex items-center gap-3 mb-6 flex-wrap">
              {/* 비구독자 CTA — Bunny iframe 자동재생 1분 후 차단됨 → 구독 유도 */}
              {!isSubscriber && (
                <button
                  onClick={() => {
                    if (!isAuthenticated) {
                      onSignInClick?.();
                      return;
                    }
                    setPaywallReason(isOttVideo ? "ott_block" : "cinema_cutoff");
                    setPaywallOpen(true);
                  }}
                  className="px-5 py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-bold rounded-lg flex items-center gap-2 hover:opacity-90 flex-shrink-0 shadow-[0_0_25px_rgba(99,102,241,0.5)] transition-shadow hover:shadow-[0_0_35px_rgba(139,92,246,0.7)]"
                  aria-label={t("productDetail.subscribeFullView", "구독하고 전체 보기")}
                >
                  <Crown className="w-4 h-4" /> {t("productDetail.subscribeFullView", "구독하고 전체 보기")}
                </button>
              )}

              {/* 5개 원형 액션 — 좋아요/댓글/공유/저장/신고 */}
              <div className="flex items-center gap-2">
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={handleToggleLike}
                  disabled={likeBusy}
                  className="flex flex-col items-center shrink-0"
                  aria-label={t("common.like")}
                >
                  <div className={`w-10 h-10 rounded-full backdrop-blur-xl flex items-center justify-center border-2 transition-all ${
                    isLiked
                      ? "bg-red-500/30 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.6)]"
                      : "bg-white/10 border-white/30 shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                  }`}>
                    <Heart className={`w-[18px] h-[18px] ${isLiked ? "fill-red-400 text-red-400" : "text-foreground"}`} strokeWidth={1.8} />
                  </div>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setShowComments(!showComments)}
                  className="flex flex-col items-center shrink-0"
                  aria-label={t("common.comment")}
                >
                  <div className={`w-10 h-10 rounded-full backdrop-blur-xl border-2 flex items-center justify-center transition-all ${
                    showComments
                      ? "bg-[#6366f1]/30 border-[#8b5cf6] shadow-[0_0_20px_rgba(139,92,246,0.6)]"
                      : "bg-white/10 border-white/30 shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                  }`}>
                    <MessageCircle className="w-[18px] h-[18px] text-foreground" strokeWidth={1.8} />
                  </div>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  whileHover={{ rotate: 15 }}
                  onClick={handleShare}
                  className="flex flex-col items-center shrink-0"
                  aria-label={t("common.share")}
                >
                  <div className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                    <Send className="w-[18px] h-[18px] text-foreground -rotate-12" strokeWidth={1.8} />
                  </div>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => {
                    if (!isAuthenticated) { onSignInClick?.(); return; }
                    setPlaylistOpen(true);
                  }}
                  className="flex flex-col items-center shrink-0"
                  aria-label={t("productDetail.action.saveAriaLabel")}
                  title={t("productDetail.action.saveTitle")}
                >
                  <div className={`w-10 h-10 rounded-full backdrop-blur-xl border-2 flex items-center justify-center transition-all ${
                    isSaved
                      ? "bg-gradient-to-br from-[#6366f1]/30 to-[#ec4899]/30 border-[#ec4899] shadow-[0_0_20px_rgba(236,72,153,0.5)]"
                      : "bg-white/10 border-white/30 shadow-[0_0_15px_rgba(236,72,153,0.4)]"
                  }`}>
                    <Bookmark className={`w-[18px] h-[18px] ${isSaved ? "fill-[#ec4899] text-[#ec4899]" : "text-foreground"}`} strokeWidth={1.8} />
                  </div>
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setReportOpen(true)}
                  className="flex flex-col items-center shrink-0"
                  aria-label={t("common.report")}
                  title={t("productDetail.action.reportTitle")}
                >
                  <div className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center hover:bg-red-500/20 hover:border-red-400/60 transition-colors shadow-[0_0_15px_rgba(245,158,11,0.35)]">
                    <Flag className="w-[18px] h-[18px] text-foreground" strokeWidth={1.8} />
                  </div>
                </motion.button>
              </div>
            </div>

            {/* 줄거리 + 사이드 메타 2열 그리드 (넷플릭스 패턴, Phase 31.5) */}
            {(product.description || product.castCredits || product.genre || product.category) && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-8 mb-6">
                {/* 좌측: 줄거리 (2/3 폭) */}
                <div className="md:col-span-2">
                  {product.description && (
                    <p className="text-sm md:text-base text-foreground/80 leading-relaxed whitespace-pre-line">
                      {product.description}
                    </p>
                  )}
                </div>
                {/* 우측: 출연·장르·카테고리 (1/3 폭) */}
                <div className="md:col-span-1 space-y-3 text-sm">
                  {product.castCredits && (
                    <div>
                      <span className="text-xs text-gray-500">{t("productDetail.credits.cast")}: </span>
                      <span className="text-foreground/80">{product.castCredits}</span>
                    </div>
                  )}
                  {product.genre && (
                    <div>
                      <span className="text-xs text-gray-500">{t("upload.genreLabel", "장르")}: </span>
                      <span className="text-foreground/80">{getCategoryLabel(product.genre, t)}</span>
                    </div>
                  )}
                  {product.category && (
                    <div>
                      <span className="text-xs text-gray-500">{t("upload.categoryLabel", "카테고리")}: </span>
                      <span className="text-foreground/80">{getCategoryLabel(product.category, t)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Phase 22: 챕터 리스트 */}
            {videoMeta.chapters.length > 0 && (
              <div className="mb-6 bg-[#121212] rounded-xl border border-white/5 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-white/5 flex items-center gap-2">
                  <ClockIcon className="w-4 h-4 text-[#a78bfa]" />
                  <span className="text-sm font-bold text-white">{t("productDetail.meta.chapters")}</span>
                  <span className="text-[10px] text-gray-500">{t("productDetail.meta.chaptersCount", { count: videoMeta.chapters.length })}</span>
                </div>
                <div className="max-h-48 overflow-y-auto scrollbar-hide">
                  {videoMeta.chapters.map((c, idx) => {
                    const h = Math.floor(c.time_seconds / 3600);
                    const m = Math.floor((c.time_seconds % 3600) / 60);
                    const s = c.time_seconds % 60;
                    const fmt = h > 0
                      ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
                      : `${m}:${String(s).padStart(2, "0")}`;
                    return (
                      <div key={idx} className="flex items-center gap-3 px-4 py-2 hover:bg-white/5 transition-colors">
                        <span className="text-xs font-mono text-[#a78bfa] w-14 flex-shrink-0">{fmt}</span>
                        <span className="text-sm text-gray-200 flex-1 truncate">{c.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Phase 22: 자막 표시 안내 */}
            {videoMeta.subtitle_url && (
              <div className="mb-4 px-3 py-2 bg-[#10b981]/10 border border-[#10b981]/20 rounded-lg flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#10b981]" />
                <span className="text-xs text-[#10b981]">{t("productDetail.meta.subtitleAvailable")}</span>
              </div>
            )}

            {/* License (단일 통합) — ₩0 영상은 회색 비활성 카드 + 안내 */}
            <div className="mb-6">
              <h3 className="mb-4">{t("productDetail.license.title")}</h3>
              {isLicensable ? (
                <>
                  <div className="p-5 rounded-lg border-2 border-[#6366f1] bg-[#6366f1]/5">
                    <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                      <div>
                        <p className="font-bold">All-in-One License</p>
                        <p className="text-sm text-muted-foreground">{t("productDetail.license.subtitle")}</p>
                      </div>
                      <p className="text-xl font-black text-[#6366f1]">₩{product.price.toLocaleString()}</p>
                    </div>
                    {/* Phase 31.3 — 모바일은 4개 + "더 보기" / 데스크탑은 9개 전체 */}
                    {(() => {
                      const features = [
                        t("productDetail.license.item1"),
                        t("productDetail.license.item2"),
                        t("productDetail.license.item3"),
                        t("productDetail.license.item4"),
                        t("productDetail.license.item5"),
                        t("productDetail.license.item6"),
                        t("productDetail.license.item7"),
                        t("productDetail.license.item8"),
                        t("productDetail.license.item9"),
                      ];
                      const mobileFeatures = licenseExpanded ? features : features.slice(0, 4);
                      return (
                        <>
                          {/* 모바일 */}
                          <ul className="md:hidden space-y-2">
                            {mobileFeatures.map((feature, idx) => (
                              <li key={idx} className="text-sm text-foreground/80 flex items-start gap-2">
                                <Check className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                                <span>{feature}</span>
                              </li>
                            ))}
                            {features.length > 4 && (
                              <button
                                onClick={() => setLicenseExpanded(!licenseExpanded)}
                                className="w-full mt-2 py-2 text-xs font-bold text-[#a5b4fc] hover:text-white"
                              >
                                {licenseExpanded
                                  ? t("productDetail.license.collapseFeatures", "접기")
                                  : t("productDetail.license.moreFeatures", "5개 더 보기")}
                              </button>
                            )}
                          </ul>
                          {/* 데스크탑 — 9개 전체 */}
                          <ul className="hidden md:block space-y-2">
                            {features.map((feature, idx) => (
                              <li key={idx} className="text-sm text-foreground/80 flex items-start gap-2">
                                <Check className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                                <span>{feature}</span>
                              </li>
                            ))}
                          </ul>
                        </>
                      );
                    })()}

                    {/* 라이선스 박스 안에 [장바구니]/[구매] 가로 반반 (Phase 31.4) */}
                    <div className="grid grid-cols-2 gap-3 mt-5">
                      <Button
                        onClick={handleAddToCart}
                        variant="outline"
                        className="gap-2"
                        disabled={addedToCart}
                      >
                        {addedToCart ? (
                          <>
                            <Check className="w-5 h-5" />
                            {t("productDetail.cart.added")}
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-5 h-5" />
                            {t("productDetail.cart.addToCart")}
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleBuyNow}
                        disabled={buyingLicense}
                        className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] disabled:opacity-60 shadow-[0_0_25px_rgba(99,102,241,0.5)]"
                      >
                        {buyingLicense ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            {t("productDetail.cart.openPayment")}
                          </>
                        ) : (
                          <>
                            <Download className="w-5 h-5" />
                            {t("productDetail.cart.purchase")}
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* 주의 사항 */}
                  <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-sm font-bold text-amber-200 mb-2">{t("productDetail.license.purchaseWarning")}</p>
                    <ul className="space-y-1 text-xs text-amber-100/80 leading-relaxed">
                      <li>• {t("productDetail.license.purchaseWarning1")}</li>
                      <li>• {t("productDetail.license.purchaseWarning2")}</li>
                    </ul>
                  </div>
                </>
              ) : (
                <div className="p-5 rounded-lg border-2 border-white/10 bg-white/[0.03] opacity-80">
                  <div className="flex items-center justify-between mb-3 pb-3 border-b border-white/10">
                    <div>
                      <p className="font-bold text-gray-300">{t("productDetail.license.notForSale")}</p>
                      <p className="text-sm text-gray-500">{t("productDetail.license.freeViewOnly")}</p>
                    </div>
                    <Lock className="w-6 h-6 text-gray-500" />
                  </div>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    {t("productDetail.license.notForSaleDescription")}
                  </p>
                </div>
              )}
            </div>

            {/* Product Description — 영상 헤더 영역으로 이동 (Phase 31.4) */}

            {/* Tags */}
            {product.tags && product.tags.length > 0 && (
              <div className="mb-6">
                <h3 className="mb-3">{t("productDetail.tags")}</h3>
                <div className="flex flex-wrap gap-2">
                  {product.tags.map((tag, i) => (
                    <span
                      key={`${tag}-${i}`}
                      className="px-3 py-1 bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-full text-sm"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 시네마 크레딧 */}
            {(product.director || product.writer || product.composer || product.castCredits || product.productionYear || product.language) && (
              <div className="mb-6">
                <h3 className="mb-3">{t("productDetail.cinemaCredits")}</h3>
                <div className="bg-card p-4 rounded-lg border border-border space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {product.director && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t("productDetail.credits.director")}</p>
                        <p className="text-sm font-medium">{product.director}</p>
                      </div>
                    )}
                    {product.writer && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t("productDetail.credits.writer")}</p>
                        <p className="text-sm font-medium">{product.writer}</p>
                      </div>
                    )}
                    {product.composer && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t("productDetail.credits.music")}</p>
                        <p className="text-sm font-medium">{product.composer}</p>
                      </div>
                    )}
                    {product.productionYear && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t("productDetail.credits.productionYear")}</p>
                        <p className="text-sm font-medium">{product.productionYear}</p>
                      </div>
                    )}
                    {product.language && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t("productDetail.credits.language")}</p>
                        <p className="text-sm font-medium">{product.language}</p>
                      </div>
                    )}
                    {product.subtitleLanguage && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">{t("productDetail.credits.subtitles")}</p>
                        <p className="text-sm font-medium">{product.subtitleLanguage}</p>
                      </div>
                    )}
                  </div>
                  {product.castCredits && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">{t("productDetail.credits.cast")}</p>
                      <p className="text-sm font-medium">{product.castCredits}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI 제작 상세 */}
            <div className="mb-6">
              <h3 className="mb-3">{t("productDetail.aiProduction.title")}</h3>
              <div className="bg-card p-4 rounded-lg border border-border space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("productDetail.aiProduction.aiTools")}</p>
                    <p className="text-sm font-medium">{product.tool}</p>
                  </div>
                  {product.aiModelVersion && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t("productDetail.aiProduction.modelVersion")}</p>
                      <p className="text-sm font-medium">{product.aiModelVersion}</p>
                    </div>
                  )}
                </div>
                {product.prompt && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("productDetail.aiProduction.prompt")}</p>
                    <p className="text-xs font-mono bg-background/50 p-2 rounded leading-relaxed text-foreground/80 whitespace-pre-wrap">
                      {product.prompt}
                    </p>
                  </div>
                )}
                {product.seed && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t("productDetail.aiProduction.seed")}</p>
                    <p className="text-xs font-mono bg-background/50 p-2 rounded text-foreground/80">
                      {product.seed}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-[#10b981] pt-2 border-t border-border">
                  <Check className="w-4 h-4" />
                  <span>{t("productDetail.aiProduction.copyrightConfirmed")}</span>
                </div>
              </div>
            </div>

            {/* 출처·라이선스 (오픈 라이선스 시드 콘텐츠 — CC-BY 출처표기) */}
            {(product.attribution || product.originalCreator || (product.licenseType && product.licenseType !== "original")) && (
              <div className="mt-4">
                <h3 className="mb-3">출처·라이선스</h3>
                <div className="bg-card p-4 rounded-lg border border-border space-y-2 text-sm">
                  {product.attribution
                    ? <p className="text-foreground/80">{product.attribution}</p>
                    : product.originalCreator && <p className="text-foreground/80">원작: {product.originalCreator}</p>}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {product.licenseType && product.licenseType !== "original" && (
                      <span className="px-1.5 py-0.5 rounded bg-[#6366f1]/15 text-[#a78bfa] font-semibold uppercase">{product.licenseType}</span>
                    )}
                    {product.licenseSourceUrl && (
                      <a href={product.licenseSourceUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">원본 출처</a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 구매 액션은 라이선스 박스 안으로 통합됨 (Phase 31.4) */}
          </div>

          {/* Phase 32 — 함께 시청된 콘텐츠 가로 캐러셀 */}
          {similarVideos.length > 0 && (
            <div className="border-t border-white/5 mt-4 pt-2">
              <VideoRowCarousel
                title={t("productDetail.similarVideosTitle", "함께 시청된 콘텐츠")}
                subtitle={t("productDetail.similarVideosSubtitle", "같은 크리에이터 · 카테고리 · 장르 기반 추천")}
                videos={similarVideos}
                onVideoClick={(v) => {
                  if (onNavigateToVideo) onNavigateToVideo(v.id);
                }}
              />
            </div>
          )}
        </div>
        </div>{/* end main column */}

        {/* Desktop Comment Side Panel */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="hidden md:flex flex-col border-l border-white/10 overflow-hidden flex-shrink-0"
              style={{ width: 320 }}
            >
              <CommentPanel
                videoId={product.id}
                videoCreatorId={product.creatorId}
                onClose={() => setShowComments(false)}
                onViewCreator={onViewCreator}
                mode="panel"
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Comment Sheet — TikTok 스타일 (영상 위에 유지, 댓글이 하단을 채움) */}
        <AnimatePresence>
          {showComments && (
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="md:hidden absolute left-0 right-0 z-20 rounded-t-2xl overflow-hidden"
              style={{ top: "40vh", bottom: 0 }}
            >
              <CommentPanel
                videoId={product.id}
                videoCreatorId={product.creatorId}
                onClose={() => setShowComments(false)}
                onViewCreator={onViewCreator}
                mode="sheet"
              />
            </motion.div>
          )}
        </AnimatePresence>

      </motion.div>

      {/* Phase 4: 페이월 구독 안내 모달 */}
      <SubscriptionModal
        open={paywallOpen}
        reason={paywallReason}
        onClose={() => setPaywallOpen(false)}
        onSignInClick={onSignInClick}
      />

      {/* Phase 10: 신고 모달 */}
      <ReportModal
        open={reportOpen}
        targetType="video"
        targetId={product.id}
        targetTitle={product.title}
        onClose={() => setReportOpen(false)}
        onSignInClick={onSignInClick}
      />

      {/* Phase 22 + 33: 영상 편집 모달 (본인 영상만) */}
      {isMyVideo && (
        <VideoEditModal
          open={editOpen}
          videoId={product.id}
          initialThumbnail={product.thumbnail}
          initialChapters={videoMeta.chapters}
          initialSubtitleUrl={videoMeta.subtitle_url}
          initialAgeRating={videoMeta.age_rating}
          initialExtended={{
            title: product.title,
            description: product.description,
            category: product.category,
            genre: product.genre,
            director: product.director,
            writer: product.writer,
            composer: product.composer,
            castCredits: product.castCredits,
            productionYear: product.productionYear,
            language: product.language,
            subtitleLanguage: product.subtitleLanguage,
            aiTool: product.tool,
            aiModelVersion: product.aiModelVersion,
            prompt: product.prompt,
            seed: product.seed,
            resolution: product.resolution,
            tags: product.tags,
            sponsorBrand: product.sponsorBrand,
            sponsorLogoUrl: product.sponsorLogoUrl,
            sponsorDisclosure: product.sponsorDisclosure,
            sponsorLinkUrl: product.sponsorLinkUrl,
          }}
          onClose={() => setEditOpen(false)}
          onSaved={(updates) => {
            setEditOpen(false);
            if (updates.chapters) setVideoMeta(prev => ({ ...prev, chapters: updates.chapters! }));
            if (updates.subtitleUrl !== undefined) setVideoMeta(prev => ({ ...prev, subtitle_url: updates.subtitleUrl ?? null }));
            if (updates.ageRating) setVideoMeta(prev => ({ ...prev, age_rating: updates.ageRating! }));
            // Phase 33 — 확장 필드 갱신 (extra state 에 머지 → useMemo product 재계산)
            if (updates.extended) {
              setExtra(prev => ({ ...prev, ...updates.extended }));
            }
          }}
        />
      )}

      {/* Phase 26: 연령 게이트 모달 */}
      <AgeGateModal
        open={ageGateOpen}
        onClose={() => {
          setAgeGateOpen(false);
          // 인증 안 한 채로 닫으면 영상에서 나가기
          if (isAgeLocked) onClose();
        }}
        onResult={(verified) => {
          if (verified) setAgeGateOpen(false);
        }}
      />

      {/* Phase 26: 19+ 잠금 오버레이 (영상 위에 표시) */}
      {isAgeLocked && (
        <div className="absolute inset-0 z-30 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-600 flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h3 className="text-xl font-black text-white mb-2">{t("productDetail.ageGate.title")}</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-xs">{t("productDetail.ageGate.description")}</p>
          <div className="flex gap-2">
            <Button onClick={onClose} variant="outline" className="bg-white/5 text-gray-300 border-white/10 hover:bg-white/10">
              {t("productDetail.ageGate.back")}
            </Button>
            <Button onClick={() => setAgeGateOpen(true)} className="bg-red-600 hover:bg-red-700 text-white font-bold gap-2">
              <Lock className="w-4 h-4" /> {t("productDetail.ageGate.verify")}
            </Button>
          </div>
        </div>
      )}

      {/* Phase 19: 공유 모달 */}
      <ShareModal
        open={shareOpen}
        url={`${typeof window !== "undefined" ? window.location.origin : ""}?video=${product.id}`}
        title={product.title}
        text={`CREAITE: ${product.title} by ${product.creator}`}
        onClose={() => setShareOpen(false)}
      />

      {/* Phase 18: 플레이리스트 모달 */}
      <AddToPlaylistModal
        open={playlistOpen}
        videoId={product.id}
        videoTitle={product.title}
        onClose={() => setPlaylistOpen(false)}
        onChange={async () => {
          // 저장 상태 갱신
          const { data } = await supabase.rpc("get_playlist_memberships", { p_video_id: product.id });
          if (Array.isArray(data)) {
            setIsSaved(data.some((p: any) => p.contains));
          }
        }}
      />
    </motion.div>
  );
}
