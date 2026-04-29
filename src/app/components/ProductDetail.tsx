import { X, Play, Heart, Send, Download, ShoppingCart, Check, Volume2, VolumeX, Loader2, MessageCircle, Maximize2 } from "lucide-react";
import { Button } from "./ui/button";
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { toast } from "sonner";
import { CommentPanel } from "./CommentPanel";
import { useBackButton } from "../hooks/useBackButton";

interface ProductDetailProps {
  product: {
    id: string;
    thumbnail: string;
    title: string;
    creator: string;
    price: number;
    duration: string;
    resolution?: string;
    tool: string;
    videoUrl: string;
    highlightStart?: number;
    highlightEnd?: number;
  };
  onClose: () => void;
  onAddToCart?: (product: any, licenseType: "standard" | "commercial" | "extended") => boolean | void;
}

export function ProductDetail({ product, onClose, onAddToCart }: ProductDetailProps) {
  const [isLiked, setIsLiked] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showComments, setShowComments] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (product.videoUrl && videoRef.current && !playerRef.current) {
      const player = videojs(videoRef.current, {
        autoplay: true,
        controls: false,
        loop: true,
        muted: isMuted,
        fluid: true,
        responsive: true,
        html5: {
          vhs: {
            withCredentials: false
          }
        },
        crossOrigin: 'anonymous'
      });

      player.ready(() => {
        if (!player) return;
        player.src({
          src: product.videoUrl,
          type: product.videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
        });
        player.one('loadedmetadata', () => {
          if (player) {
            const p = player.play();
            if (p) p.catch(() => {});
          }
          setHasError(false);
        });
      });

      player.on('error', () => {
        const err = player.error();
        if (err && (err.code === 4 || err.code === 2)) {
          setHasError(true);
        }
      });

      // 하이라이트 구간 반복 재생 로직 (Video.js)
      player.on('timeupdate', () => {
        const p = playerRef.current;
        const item = product;
        if (!p || !item) return;
        
        const start = item.highlightStart || 0;
        const end = item.highlightEnd || 15;
        if (p.currentTime() >= end) {
          p.currentTime(start);
        }
      });

      playerRef.current = player;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [product]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

  useEffect(() => {
    if (playerRef.current) {
      if (isPlaying) {
        const pp = playerRef.current.play();
        if (pp) pp.catch(() => {});
      } else {
        playerRef.current.pause();
      }
    }
  }, [isPlaying]);

  const togglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsPlaying(!isPlaying);
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsMuted(!isMuted);
  };

  // 뒤로가기로 댓글 패널 닫기
  useBackButton(showComments, () => setShowComments(false));

  const handleAddToCart = () => {
    if (!onAddToCart) return;
    const result = onAddToCart(product, "standard");
    // 인증 통과 시에만 "담김" 표시 (미로그인 시 로그인 모달이 뜨므로 UI 변경 없음)
    if (result !== false) {
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}?video=${product.id}`;
    const shareData = {
      title: product.title,
      text: `CREAITE: ${product.title} by ${product.creator}`,
      url,
    };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("링크가 클립보드에 복사됐습니다!");
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(url);
          toast.success("링크가 클립보드에 복사됐습니다!");
        } catch {
          toast.error("공유 링크 복사에 실패했습니다.");
        }
      }
    }
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
        {/* Header */}
        <div className="relative bg-black aspect-video md:aspect-video max-h-[40vh] md:max-h-none flex items-center justify-center overflow-hidden shrink-0">
          {product.videoUrl ? (
            <div className="w-full h-full" onClick={togglePlay}>
              <video
                ref={videoRef}
                className="video-js vjs-big-play-centered w-full h-full object-contain"
                playsInline
                data-priority-video=""
              />
              
              {/* Error/Processing Overlay */}
              {hasError && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-8 text-center pointer-events-auto">
                  <Loader2 className="w-12 h-12 text-[#6366f1] animate-spin mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">영상이 현재 처리 중입니다</h3>
                  <p className="text-gray-300 text-sm max-w-[300px]">
                    고화질 스트리밍을 위해 서버에서 영상을 부드럽게 변환하고 있습니다. 잠시 후 상쾌하게 감상하실 수 있습니다!
                  </p>
                </div>
              )}

              {/* Play/Pause Overlay on Hover or Pause */}
              <div className={`absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity duration-300 ${isPlaying ? 'opacity-0 hover:opacity-100' : 'opacity-100'}`}>
                <button 
                  onClick={togglePlay}
                  className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white flex items-center justify-center hover:bg-white/30 transition-colors"
                >
                  {isPlaying ? (
                    <div className="flex gap-1.5 items-center justify-center">
                      <div className="w-2 h-8 bg-white rounded-full"></div>
                      <div className="w-2 h-8 bg-white rounded-full"></div>
                    </div>
                  ) : (
                    <Play className="w-8 h-8 text-white ml-1" />
                  )}
                </button>
              </div>

              {/* Volume + Fullscreen Control */}
              <div className="absolute bottom-4 right-4 flex gap-2">
                <button
                  onClick={toggleMute}
                  className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                  aria-label={isMuted ? "음소거 해제" : "음소거"}
                >
                  {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const player = playerRef.current;
                    if (!player) return;
                    if (player.isFullscreen()) player.exitFullscreen();
                    else player.requestFullscreen();
                  }}
                  className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                  aria-label="전체화면"
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="relative w-full h-full">
              <img 
                src={product.thumbnail} 
                alt={product.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="px-4 py-2 bg-black/60 backdrop-blur-md rounded-lg text-white text-sm">
                  비디오 정보를 불러올 수 없습니다
                </div>
              </div>
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
              <div className="flex items-center gap-3 text-muted-foreground">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                  <span className="text-white text-xs">AI</span>
                </div>
                <span>{product.creator}</span>
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
            <div className="mb-6">
              <h3 className="mb-3">상품 설명</h3>
              <div className="bg-card p-4 rounded-lg border border-border">
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  이 영상은 최신 AI 기술을 활용하여 제작된 고품질 콘텐츠입니다. 
                  전문적인 후반 작업과 색보정을 거쳐 완성되었으며, 다양한 용도로 활용하실 수 있습니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["우주", "코스믹", "사이파이", "배경영상", "시네마틱"].map((tag) => (
                    <span 
                      key={tag}
                      className="px-3 py-1 bg-[#6366f1]/10 border border-[#6366f1]/30 rounded-full text-sm"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Generation Info */}
            <div className="mb-6">
              <h3 className="mb-3">AI 제작 정보</h3>
              <div className="bg-card p-4 rounded-lg border border-border space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">사용된 AI 툴</p>
                  <p className="text-sm">{product.tool}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">창작성 부가 내역</p>
                  <p className="text-sm">
                    컬러 그레이딩, 시퀀스 배열, 트랜지션 효과 추가, 사운드 디자인, 최종 렌더링 최적화
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#10b981]">
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
              onClick={() => toast.info("결제 기능은 준비 중입니다.", { duration: 3000 })}
              className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
            >
              <Download className="w-5 h-5" />
              구매하기
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
    </motion.div>
  );
}
