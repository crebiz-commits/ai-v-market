import { X, Heart, Send, Download, ShoppingCart, Check, MessageCircle, Crown, Lock, Flag, Bookmark, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { CommentPanel } from "./CommentPanel";
import { useBackButton } from "../hooks/useBackButton";
import { useAuth } from "../contexts/AuthContext";
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

// 페이월 정책 임계값 (Phase 4)
const CINEMA_PREVIEW_SECONDS = 180; // 비구독자 시네마 미리보기 한도 (3분)
const OTT_THRESHOLD_SECONDS = 600;  // 이 길이 이상이면 OTT 영상 (구독자만)

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

    // 라이선스 3종
    priceStandard?: number;
    priceCommercial?: number;
    priceExclusive?: number;

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
  };
  onClose: () => void;
  onAddToCart?: (product: any, licenseType: "standard" | "commercial" | "extended") => Promise<boolean> | boolean | void;
  onSignInClick?: () => void;
  onViewCreator?: (creatorId: string) => void;
  onNavigateToVideo?: (videoId: string) => void | Promise<void>;   // Phase 16: 연속 재생
}

export function ProductDetail({ product, onClose, onAddToCart, onSignInClick, onViewCreator, onNavigateToVideo }: ProductDetailProps) {
  const { t } = useTranslation();
  const [isLiked, setIsLiked] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);
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
  // Phase 26: 연령 게이트
  const [ageGateOpen, setAgeGateOpen] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  // 크리에이터 아바타·이름 — Phase 6.6 (videos.creator는 snapshot이라 항상 최신 profiles 정보 우선)
  const creatorInfo = useCreatorInfo([product.creatorId]);
  const creatorAvatar = product.creatorId ? creatorInfo[product.creatorId]?.avatar : null;
  const creatorName = (product.creatorId ? creatorInfo[product.creatorId]?.name : null) ?? product.creator;

  // Phase 4: 페이월 게이트
  const { isSubscriber, isPremium, subscriptionTier, isAuthenticated, user, profile } = useAuth();
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
      const { data } = await supabase
        .from("videos")
        .select("chapters, subtitle_url, age_rating")
        .eq("id", product.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const meta = {
        chapters: Array.isArray((data as any).chapters) ? (data as any).chapters : [],
        subtitle_url: (data as any).subtitle_url || null,
        age_rating: (data as any).age_rating || "all",
      };
      setVideoMeta(meta);
      // Phase 26: 19+ 영상 + 미인증 사용자면 진입 시 자동 게이트
      if (meta.age_rating === "19" && !profile?.age_verified && user?.id !== (product.creatorId || undefined)) {
        setAgeGateOpen(true);
      }
    })();
    return () => { cancelled = true; };
  }, [product.id, profile?.age_verified, user?.id, product.creatorId]);

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
    try {
      if (next) {
        await supabase.from("video_likes").insert({ video_id: product.id, user_id: user.id });
      } else {
        await supabase.from("video_likes").delete().match({ video_id: product.id, user_id: user.id });
      }
    } catch (err) {
      setIsLiked(!next);
      toast.error(t("productDetail.toast.likeFailed"));
      console.error("[ProductDetail] toggleLike error:", err);
    } finally {
      setLikeBusy(false);
    }
  };
  const durationSeconds = product.durationSeconds ?? parseDurationText(product.duration);
  // 영상 등급 판정
  const isOttVideo = durationSeconds >= OTT_THRESHOLD_SECONDS;        // 10분+
  const isCinemaVideo = durationSeconds >= CINEMA_PREVIEW_SECONDS;     // 3분+
  // OTT 비구독자: 즉시 차단 (iframe 절대 로드 안 함)
  const ottBlocked = isOttVideo && !isSubscriber;
  // 시네마 비구독자: 3분 미리보기 후 차단 (cutoff 트리거)
  const cinemaPaywallNeeded = isCinemaVideo && !isOttVideo && !isSubscriber;
  // 페이월 모달 상태
  const [paywallOpen, setPaywallOpen] = useState(ottBlocked);
  const [paywallReason, setPaywallReason] = useState<PaywallReason>(ottBlocked ? "ott_block" : "cinema_cutoff");
  // 시네마 컷오프 발동 후 iframe 제거 플래그
  const [cinemaCutoffTriggered, setCinemaCutoffTriggered] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // 시네마 미리보기 — 영상 currentTime이 180초 도달 시 차단
  // Bunny Stream Player의 player.js 프로토콜(postMessage)로 재생 위치 추적.
  // wall-clock이 아닌 영상 시간 기준이라 시킹 점프(예: 7분 위치)도 즉시 차단.
  useEffect(() => {
    if (!cinemaPaywallNeeded || cinemaCutoffTriggered) return;
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
        if (seconds >= CINEMA_PREVIEW_SECONDS) {
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
  }, [cinemaPaywallNeeded, cinemaCutoffTriggered]);

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
  // VAST pre-roll 광고는 vastTagUrl 파라미터로 자동 적용
  const SUPABASE_PROJECT_ID = "tvbpiuwmvrccfnplhwer";
  const vastTagUrl = encodeURIComponent(
    `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/server/vast-tag?source_video_id=${product.id}`
  );
  const bunnyEmbedUrl = BUNNY_LIBRARY_ID && product.id
    ? `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY_ID}/${product.id}?autoplay=true&loop=false&muted=true&preload=true&responsive=true&vastTagUrl=${vastTagUrl}`
    : null;

  // iframe 실제 노출 여부 — 페이월 게이트 + Phase 26: 19+ 미인증 차단
  const iframeBlocked = ottBlocked || cinemaCutoffTriggered || isAgeLocked;

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
    if (!product.id || !durationSeconds || durationSeconds < OTT_THRESHOLD_SECONDS) return;  // 10분+
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
        name: user?.name || user?.email,
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
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end md:items-center justify-center p-0 md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25 }}
        className={`bg-background w-full md:rounded-xl overflow-hidden max-h-[90vh] flex ${
          showComments ? "md:max-w-5xl" : "md:max-w-4xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Header — 영상 재생 영역 (페이월 적용) */}
        <div className="relative bg-black aspect-video md:aspect-video max-h-[40vh] md:max-h-none flex items-center justify-center overflow-hidden shrink-0">
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
              {/* 중앙 페이월 안내 */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-2xl mb-4">
                  {ottBlocked ? <Crown className="w-8 h-8 text-white" /> : <Lock className="w-8 h-8 text-white" />}
                </div>
                <h3 className="text-xl md:text-2xl font-black text-white mb-2">
                  {ottBlocked ? t("productDetail.paywall.premiumOtt") : t("productDetail.paywall.previewEnded")}
                </h3>
                <p className="text-sm text-gray-300 mb-5 max-w-md">
                  {ottBlocked
                    ? t("productDetail.paywall.ottDescription")
                    : t("productDetail.paywall.cinemaDescription")}
                </p>
                <Button
                  onClick={() => {
                    setPaywallReason(ottBlocked ? "ott_block" : "cinema_cutoff");
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


          {/* 시네마 미리보기 카운트다운 표시 (비구독자 + 시네마 + iframe 활성 시) */}
          {cinemaPaywallNeeded && !iframeBlocked && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-amber-500/90 backdrop-blur-sm rounded-full text-white text-xs font-black shadow-lg flex items-center gap-1.5 pointer-events-none">
              <Lock className="w-3.5 h-3.5" />
              {t("productDetail.paywall.cinemaPreviewBadge")}
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

          {/* Duration Badge */}
          <div className="absolute top-4 right-4 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-white text-sm">
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

          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 pb-40 md:pb-6">
            {/* Title & Creator */}
            <div className="mb-6">
              <div className="flex items-start gap-2 mb-2">
                <h2 className="text-2xl flex-1">{product.title}</h2>
                <AgeBadge rating={videoMeta.age_rating} size="md" />
              </div>
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

            {/* Specs */}
            <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-card rounded-lg border border-border">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("productDetail.meta.resolution")}</p>
                <p className="font-medium">{product.resolution || "4K"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("productDetail.meta.duration")}</p>
                <p className="font-medium">{product.duration}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t("productDetail.meta.aiTool")}</p>
                <p className="font-medium">{product.tool}</p>
              </div>
            </div>

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

            {/* 카테고리 / 장르 뱃지 */}
            {(product.category || product.genre) && (
              <div className="flex flex-wrap gap-2 mb-6">
                {product.category && (
                  <span className="px-3 py-1 bg-[#6366f1]/15 border border-[#6366f1]/30 rounded-full text-xs font-medium text-[#a78bfa]">
                    {getCategoryLabel(product.category, t)}
                  </span>
                )}
                {product.genre && (
                  <span className="px-3 py-1 bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 rounded-full text-xs font-medium text-[#a78bfa]">
                    {getCategoryLabel(product.genre, t)}
                  </span>
                )}
              </div>
            )}

            {/* License (단일 통합) */}
            <div className="mb-6">
              <h3 className="mb-4">{t("productDetail.license.title")}</h3>
              <div className="p-5 rounded-lg border-2 border-[#6366f1] bg-[#6366f1]/5">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                  <div>
                    <p className="font-bold">All-in-One License</p>
                    <p className="text-sm text-muted-foreground">{t("productDetail.license.subtitle")}</p>
                  </div>
                  <p className="text-xl font-black text-[#6366f1]">₩{product.price.toLocaleString()}</p>
                </div>
                <ul className="space-y-2">
                  {[
                    t("productDetail.license.item1"),
                    t("productDetail.license.item2"),
                    t("productDetail.license.item3"),
                    t("productDetail.license.item4"),
                    t("productDetail.license.item5"),
                    t("productDetail.license.item6"),
                    t("productDetail.license.item7"),
                    t("productDetail.license.item8"),
                    t("productDetail.license.item9"),
                  ].map((feature, idx) => (
                    <li key={idx} className="text-sm text-foreground/80 flex items-start gap-2">
                      <Check className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 주의 사항 */}
              <div className="mt-4 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-sm font-bold text-amber-200 mb-2">{t("productDetail.license.purchaseWarning")}</p>
                <ul className="space-y-1 text-xs text-amber-100/80 leading-relaxed">
                  <li>• {t("productDetail.license.purchaseWarning1")}</li>
                  <li>• {t("productDetail.license.purchaseWarning2")}</li>
                </ul>
              </div>
            </div>

            {/* Product Description */}
            {product.description && (
              <div className="mb-6">
                <h3 className="mb-3">{t("productDetail.description")}</h3>
                <div className="bg-card p-4 rounded-lg border border-border">
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                    {product.description}
                  </p>
                </div>
              </div>
            )}

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
          </div>
        </div>

        {/* Bottom Actions */}
        <div className="border-t border-border p-4 pb-8 md:pb-4 bg-card shrink-0">
          <div className="flex items-center gap-3 mb-3">
            {/* 좋아요 — 글래스 + 글로우 */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={handleToggleLike}
              disabled={likeBusy}
              className="flex flex-col items-center"
              aria-label={t("common.like")}
            >
              <div
                className={`w-10 h-10 rounded-full backdrop-blur-xl flex items-center justify-center border-2 transition-all ${
                  isLiked
                    ? "bg-red-500/30 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.6)]"
                    : "bg-white/10 border-white/30"
                }`}
              >
                <Heart
                  className={`w-[18px] h-[18px] ${isLiked ? "fill-red-400 text-red-400" : "text-foreground"}`}
                  strokeWidth={1.8}
                />
              </div>
            </motion.button>

            {/* 댓글 — pulse + purple glow */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              onClick={() => setShowComments(!showComments)}
              className="flex flex-col items-center"
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

            {/* 공유 — hover 회전 + cyan glow */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              whileHover={{ rotate: 15 }}
              onClick={handleShare}
              className="flex flex-col items-center"
              aria-label={t("common.share")}
            >
              <div className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                <Send className="w-[18px] h-[18px] text-foreground -rotate-12" strokeWidth={1.8} />
              </div>
            </motion.button>

            {/* Phase 18: 저장 (플레이리스트/나중에 보기) */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => {
                if (!isAuthenticated) {
                  onSignInClick?.();
                  return;
                }
                setPlaylistOpen(true);
              }}
              className="flex flex-col items-center"
              aria-label={t("productDetail.action.saveAriaLabel")}
              title={t("productDetail.action.saveTitle")}
            >
              <div className={`w-10 h-10 rounded-full backdrop-blur-xl border-2 flex items-center justify-center transition-all ${
                isSaved
                  ? "bg-gradient-to-br from-[#6366f1]/30 to-[#ec4899]/30 border-[#ec4899] shadow-[0_0_20px_rgba(236,72,153,0.5)]"
                  : "bg-white/10 border-white/30"
              }`}>
                <Bookmark
                  className={`w-[18px] h-[18px] ${isSaved ? "fill-[#ec4899] text-[#ec4899]" : "text-foreground"}`}
                  strokeWidth={1.8}
                />
              </div>
            </motion.button>

            {/* Phase 10: 신고 버튼 */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setReportOpen(true)}
              className="flex flex-col items-center"
              aria-label={t("common.report")}
              title={t("productDetail.action.reportTitle")}
            >
              <div className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center hover:bg-red-500/20 hover:border-red-400/60 transition-colors">
                <Flag className="w-[18px] h-[18px] text-foreground" strokeWidth={1.8} />
              </div>
            </motion.button>

            <div className="flex-1" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{t("productDetail.cart.allInOneLicense")}</p>
              <p className="text-2xl font-medium text-[#6366f1]">₩{product.price.toLocaleString()}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
              className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] disabled:opacity-60"
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

      {/* Phase 22: 영상 편집 모달 (본인 영상만) */}
      {isMyVideo && (
        <VideoEditModal
          open={editOpen}
          videoId={product.id}
          initialThumbnail={product.thumbnail}
          initialChapters={videoMeta.chapters}
          initialSubtitleUrl={videoMeta.subtitle_url}
          initialAgeRating={videoMeta.age_rating}
          onClose={() => setEditOpen(false)}
          onSaved={(updates) => {
            setEditOpen(false);
            if (updates.chapters) setVideoMeta(prev => ({ ...prev, chapters: updates.chapters! }));
            if (updates.subtitleUrl !== undefined) setVideoMeta(prev => ({ ...prev, subtitle_url: updates.subtitleUrl ?? null }));
            if (updates.ageRating) setVideoMeta(prev => ({ ...prev, age_rating: updates.ageRating! }));
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
