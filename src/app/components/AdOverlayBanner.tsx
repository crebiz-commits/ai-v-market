// Phase 28 — Overlay 광고 컴포넌트
// 영상 재생 중 trigger_position_pct 지점에서 duration_seconds 동안 하단에 배너 노출.
// 클릭 시 record_ad_click + 외부 링크 이동. X 클릭 시 즉시 숨김.
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ExternalLink } from "lucide-react";
import { recordAdClick, type AdRpcResult } from "../utils/adFetch";
import { openExternal } from "../utils/openExternal";

interface AdOverlayBannerProps {
  ad: AdRpcResult;
  videoId: string;
  onDismiss: () => void;
}

export function AdOverlayBanner({ ad, videoId, onDismiss }: AdOverlayBannerProps) {
  const duration = ad.duration_seconds || 10;
  const [remaining, setRemaining] = useState(duration);
  // 소재 이미지가 로드 실패(잘못된 URL·HTML 페이지 등)하면 깨진 이미지 대신 텍스트 배너로 폴백.
  const [imgBroken, setImgBroken] = useState(false);

  // 자동 닫힘 카운트다운
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      const left = Math.max(0, duration - elapsed);
      setRemaining(left);
      if (left <= 0) {
        clearInterval(timer);
        onDismiss();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [duration, onDismiss]);

  const handleClick = async () => {
    if (!ad.link_url) return;
    await recordAdClick(ad.ad_id, videoId, "overlay");
    openExternal(ad.link_url);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 80, opacity: 0 }}
        transition={{ type: "spring", damping: 22 }}
        className="absolute bottom-3 left-3 right-3 md:left-6 md:right-6 z-30 pointer-events-auto"
      >
        <div className="bg-black/85 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          <div className="flex items-stretch gap-3 p-3">
            {/* 광고 이미지 / 썸네일 — 로드 실패 시 숨기고 텍스트 배너로 폴백 */}
            {(ad.image_url || ad.thumbnail_url) && !imgBroken && (
              <button
                onClick={handleClick}
                className="w-16 h-16 md:w-20 md:h-20 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 hover:opacity-80 transition-opacity"
              >
                <img
                  src={ad.image_url || ad.thumbnail_url || ""}
                  alt={ad.title}
                  className="w-full h-full object-cover"
                  onError={() => setImgBroken(true)}
                />
              </button>
            )}

            {/* 텍스트 + CTA */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    AD
                  </span>
                  {ad.advertiser && (
                    <span className="text-[10px] text-white/60 truncate">{ad.advertiser}</span>
                  )}
                </div>
                <p className="text-sm font-bold text-white truncate">{ad.title}</p>
              </div>
              {ad.link_url && (
                <button
                  onClick={handleClick}
                  className="self-start text-xs font-bold text-[#a78bfa] hover:text-[#c4b5fd] flex items-center gap-1 mt-1"
                >
                  {ad.cta_text || "자세히 보기"}
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 닫기 + 카운트다운 */}
            <div className="flex flex-col items-end justify-between flex-shrink-0">
              <button
                onClick={onDismiss}
                className="p-1 rounded-full hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                aria-label="광고 닫기"
              >
                <X className="w-4 h-4" />
              </button>
              <span className="text-[10px] font-mono text-white/50">{remaining}s</span>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
