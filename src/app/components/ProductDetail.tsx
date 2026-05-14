import { X, Heart, Send, Download, ShoppingCart, Check, MessageCircle, Crown, Lock, Flag } from "lucide-react";
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
import { ShareModal } from "./ShareModal";

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
  };
  onClose: () => void;
  onAddToCart?: (product: any, licenseType: "standard" | "commercial" | "extended") => Promise<boolean> | boolean | void;
  onSignInClick?: () => void;
  onViewCreator?: (creatorId: string) => void;
}

export function ProductDetail({ product, onClose, onAddToCart, onSignInClick, onViewCreator }: ProductDetailProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [showComments, setShowComments] = useState(false);
  // 크리에이터 아바타·이름 — Phase 6.6 (videos.creator는 snapshot이라 항상 최신 profiles 정보 우선)
  const creatorInfo = useCreatorInfo([product.creatorId]);
  const creatorAvatar = product.creatorId ? creatorInfo[product.creatorId]?.avatar : null;
  const creatorName = (product.creatorId ? creatorInfo[product.creatorId]?.name : null) ?? product.creator;

  // Phase 4: 페이월 게이트
  const { isSubscriber, isAuthenticated, user } = useAuth();
  // Phase 9: 라이선스 결제
  const { startLicensePurchase } = usePayment();
  const [buyingLicense, setBuyingLicense] = useState(false);
  // Phase 10: 신고 모달
  const [reportOpen, setReportOpen] = useState(false);
  // Phase 19: 공유 모달
  const [shareOpen, setShareOpen] = useState(false);
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

  // iframe 실제 노출 여부 — 페이월 게이트
  const iframeBlocked = ottBlocked || cinemaCutoffTriggered;

  // 뒤로가기로 댓글 패널 닫기
  useBackButton(showComments, () => setShowComments(false));

  // Phase 9: 라이선스 즉시 구매 (장바구니 우회)
  const handleBuyNow = async () => {
    if (!isAuthenticated) {
      onSignInClick?.();
      return;
    }
    if (!product.price || product.price <= 0) {
      toast.error("이 영상은 라이선스 판매 대상이 아닙니다.");
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
        toast.info("결제를 취소했습니다.");
      } else {
        toast.error("결제 시작 실패: " + (err?.message || "알 수 없는 오류"));
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
                  {ottBlocked ? "프리미엄 OTT 콘텐츠" : "미리보기가 끝났어요"}
                </h3>
                <p className="text-sm text-gray-300 mb-5 max-w-md">
                  {ottBlocked
                    ? "이 영상은 구독자 전용입니다. 월 ₩4,900으로 모든 OTT 영상을 무제한으로 시청하세요."
                    : "구독하시면 이 영상의 전체를 시청하실 수 있습니다. 월 ₩4,900."}
                </p>
                <Button
                  onClick={() => {
                    setPaywallReason(ottBlocked ? "ott_block" : "cinema_cutoff");
                    setPaywallOpen(true);
                  }}
                  className="bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black px-6 h-11 shadow-lg shadow-amber-500/20 rounded-xl border border-white/10"
                >
                  <Crown className="w-4 h-4" />
                  구독하기
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
                  영상을 재생할 수 없습니다 (라이브러리 설정 누락)
                </div>
              </div>
            </div>
          )}


          {/* 시네마 미리보기 카운트다운 표시 (비구독자 + 시네마 + iframe 활성 시) */}
          {cinemaPaywallNeeded && !iframeBlocked && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-amber-500/90 backdrop-blur-sm rounded-full text-white text-xs font-black shadow-lg flex items-center gap-1.5 pointer-events-none">
              <Lock className="w-3.5 h-3.5" />
              3분 미리보기 — 구독 시 풀 영상
            </div>
          )}

          {/* Duration Badge */}
          <div className="absolute top-4 right-4 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-white text-sm">
            {product.duration}
          </div>

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
              <h2 className="text-2xl mb-2">{product.title}</h2>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <CreatorAvatar avatarUrl={creatorAvatar} name={creatorName} size="sm" />
                  <span>{creatorName}</span>
                </div>
                {product.creatorId && onViewCreator && (
                  <button
                    onClick={() => onViewCreator(product.creatorId!)}
                    className="px-3 py-1.5 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-gray-200 transition-colors whitespace-nowrap"
                  >
                    채널 보기 →
                  </button>
                )}
              </div>
            </div>

            {/* Specs */}
            <div className="grid grid-cols-3 gap-4 mb-6 p-4 bg-card rounded-lg border border-border">
              <div>
                <p className="text-xs text-muted-foreground mb-1">해상도</p>
                <p className="font-medium">{product.resolution || "4K"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">길이</p>
                <p className="font-medium">{product.duration}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">AI 툴</p>
                <p className="font-medium">{product.tool}</p>
              </div>
            </div>

            {/* 카테고리 / 장르 뱃지 */}
            {(product.category || product.genre) && (
              <div className="flex flex-wrap gap-2 mb-6">
                {product.category && (
                  <span className="px-3 py-1 bg-[#6366f1]/15 border border-[#6366f1]/30 rounded-full text-xs font-medium text-[#a78bfa]">
                    {product.category}
                  </span>
                )}
                {product.genre && (
                  <span className="px-3 py-1 bg-[#8b5cf6]/15 border border-[#8b5cf6]/30 rounded-full text-xs font-medium text-[#a78bfa]">
                    {product.genre}
                  </span>
                )}
              </div>
            )}

            {/* License (단일 통합) */}
            <div className="mb-6">
              <h3 className="mb-4">영상 라이선스 구매</h3>
              <div className="p-5 rounded-lg border-2 border-[#6366f1] bg-[#6366f1]/5">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                  <div>
                    <p className="font-bold">All-in-One License</p>
                    <p className="text-sm text-muted-foreground">유튜브·SNS·기업 마케팅·독점 사용권 모두 포함</p>
                  </div>
                  <p className="text-xl font-black text-[#6366f1]">₩{product.price.toLocaleString()}</p>
                </div>
                <ul className="space-y-2">
                  {[
                    "유튜브, 인스타그램, 모든 SNS 게시물 사용 가능",
                    "상업·기업 마케팅 용도 사용 가능",
                    "독점 사용권 부여 (구매 시 마켓에서 즉시 판매 종료)",
                    "구매자 명의의 팀·조직 내 자유 사용",
                    "편집·변형 후 재배포 가능",
                    "구매 완료 시 모든 라이선스 및 사용권이 구매자에게 영구 양도",
                    "원본 영상 파일 제공",
                    "라이선스 영구 유효 (사용 기간 제한 없음)",
                    "표시 가격은 부가세(VAT) 포함",
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
                <p className="text-sm font-bold text-amber-200 mb-2">⚠️ 구매 전 안내</p>
                <ul className="space-y-1 text-xs text-amber-100/80 leading-relaxed">
                  <li>• 영상 콘텐츠 특성상 구매 후 환불·반품이 불가능합니다</li>
                  <li>• 결제 전 미리보기를 통해 충분히 확인해 주시기 바랍니다</li>
                </ul>
              </div>
            </div>

            {/* Product Description */}
            {product.description && (
              <div className="mb-6">
                <h3 className="mb-3">상품 설명</h3>
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
                <h3 className="mb-3">태그</h3>
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
                <h3 className="mb-3">🎬 시네마 크레딧</h3>
                <div className="bg-card p-4 rounded-lg border border-border space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    {product.director && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">감독</p>
                        <p className="text-sm font-medium">{product.director}</p>
                      </div>
                    )}
                    {product.writer && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">각본</p>
                        <p className="text-sm font-medium">{product.writer}</p>
                      </div>
                    )}
                    {product.composer && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">음악</p>
                        <p className="text-sm font-medium">{product.composer}</p>
                      </div>
                    )}
                    {product.productionYear && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">제작 연도</p>
                        <p className="text-sm font-medium">{product.productionYear}</p>
                      </div>
                    )}
                    {product.language && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">언어</p>
                        <p className="text-sm font-medium">{product.language}</p>
                      </div>
                    )}
                    {product.subtitleLanguage && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">자막</p>
                        <p className="text-sm font-medium">{product.subtitleLanguage}</p>
                      </div>
                    )}
                  </div>
                  {product.castCredits && (
                    <div className="pt-3 border-t border-border">
                      <p className="text-xs text-muted-foreground mb-1">출연 / 가상 캐릭터</p>
                      <p className="text-sm font-medium">{product.castCredits}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* AI 제작 상세 */}
            <div className="mb-6">
              <h3 className="mb-3">🤖 AI 제작 상세</h3>
              <div className="bg-card p-4 rounded-lg border border-border space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">사용된 AI 툴</p>
                    <p className="text-sm font-medium">{product.tool}</p>
                  </div>
                  {product.aiModelVersion && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">모델 버전</p>
                      <p className="text-sm font-medium">{product.aiModelVersion}</p>
                    </div>
                  )}
                </div>
                {product.prompt && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">사용한 프롬프트</p>
                    <p className="text-xs font-mono bg-background/50 p-2 rounded leading-relaxed text-foreground/80 whitespace-pre-wrap">
                      {product.prompt}
                    </p>
                  </div>
                )}
                {product.seed && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">시드값 (재현·저작권 증거)</p>
                    <p className="text-xs font-mono bg-background/50 p-2 rounded text-foreground/80">
                      {product.seed}
                    </p>
                  </div>
                )}
                <div className="flex items-center gap-2 text-xs text-[#10b981] pt-2 border-t border-border">
                  <Check className="w-4 h-4" />
                  <span>저작권 확인 완료 • 상업적 이용 가능</span>
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
              onClick={() => setIsLiked(!isLiked)}
              className="flex flex-col items-center"
              aria-label="좋아요"
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
              aria-label="댓글"
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
              aria-label="공유"
            >
              <div className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                <Send className="w-[18px] h-[18px] text-foreground -rotate-12" strokeWidth={1.8} />
              </div>
            </motion.button>

            {/* Phase 10: 신고 버튼 */}
            <motion.button
              whileTap={{ scale: 0.85 }}
              onClick={() => setReportOpen(true)}
              className="flex flex-col items-center"
              aria-label="신고"
              title="이 영상 신고"
            >
              <div className="w-10 h-10 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center hover:bg-red-500/20 hover:border-red-400/60 transition-colors">
                <Flag className="w-[18px] h-[18px] text-foreground" strokeWidth={1.8} />
              </div>
            </motion.button>

            <div className="flex-1" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground">All-in-One 라이선스</p>
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
                  담김
                </>
              ) : (
                <>
                  <ShoppingCart className="w-5 h-5" />
                  장바구니
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
                  결제창 열기
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  구매하기
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
                title={product.title}
                onClose={() => setShowComments(false)}
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
                title={product.title}
                onClose={() => setShowComments(false)}
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

      {/* Phase 19: 공유 모달 */}
      <ShareModal
        open={shareOpen}
        url={`${typeof window !== "undefined" ? window.location.origin : ""}?video=${product.id}`}
        title={product.title}
        text={`CREAITE: ${product.title} by ${product.creator}`}
        onClose={() => setShareOpen(false)}
      />
    </motion.div>
  );
}
