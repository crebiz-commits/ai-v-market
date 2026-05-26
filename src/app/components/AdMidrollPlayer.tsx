// Phase 28 — Mid-roll 광고 (10분+ OTT 영상 중간 광고)
// iframe pause 후 풀스크린 광고 영상 재생 → 종료/SKIP 시 iframe resume.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ExternalLink, SkipForward } from "lucide-react";
import { recordAdClick, recordAdImpression, type AdRpcResult, type AdFormat } from "../utils/adFetch";

interface AdMidrollPlayerProps {
  ad: AdRpcResult;
  videoId: string;
  format: AdFormat;  // "midroll" | "postroll" | "bumper"
  onComplete: (opts: { skipped: boolean }) => void;
}

export function AdMidrollPlayer({ ad, videoId, format, onComplete }: AdMidrollPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [canSkip, setCanSkip] = useState(ad.skip_after_seconds == null ? false : ad.skip_after_seconds <= 0);
  const skipAfter = ad.skip_after_seconds;  // null=SKIP 불가 (Bumper 무료)

  // 노출 임프레션 — 마운트 시 1회
  useEffect(() => {
    recordAdImpression(ad.ad_id, videoId, format);
  }, [ad.ad_id, videoId, format]);

  // 영상 재생 진행도 추적 → SKIP 버튼 활성화 + 안전망 (error / timeout)
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      const t = Math.floor(v.currentTime);
      setElapsed(t);
      if (skipAfter != null && t >= skipAfter && !canSkip) setCanSkip(true);
    };
    const onEnded = () => {
      recordAdImpression(ad.ad_id, videoId, format, { completed: true, positionSeconds: Math.floor(v.duration || 0) });
      onComplete({ skipped: false });
    };
    const onError = () => {
      console.error("[AdMidrollPlayer] video error", v.error);
      onComplete({ skipped: false });
    };
    // Fallback timeout: 광고 max_duration + 5초 후에도 ended 안 오면 강제 종료
    // (버퍼 부족 / 네트워크 stall 등으로 video 가 멈춰도 본편 진입 보장)
    const maxDur = ad.duration_seconds || 30;
    const timeoutId = window.setTimeout(() => {
      console.warn(`[AdMidrollPlayer] timeout fallback after ${maxDur + 5}s, forcing complete`);
      onComplete({ skipped: false });
    }, (maxDur + 5) * 1000);

    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onError);
    return () => {
      window.clearTimeout(timeoutId);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onError);
    };
  }, [ad.ad_id, videoId, format, skipAfter, canSkip, onComplete, ad.duration_seconds]);

  const handleSkip = () => {
    if (!canSkip) return;
    recordAdImpression(ad.ad_id, videoId, format, { skipped: true, positionSeconds: elapsed });
    onComplete({ skipped: true });
  };

  const handleClick = async () => {
    if (!ad.link_url) return;
    await recordAdClick(ad.ad_id, videoId, format);
    window.open(ad.link_url, "_blank", "noopener,noreferrer");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-40 bg-black flex items-center justify-center"
    >
      {/* 광고 영상 */}
      {/* muted 필수 — Chrome autoplay 정책: 소리 있는 영상은 사용자 인터랙션 없이 자동재생 차단 */}
      {ad.video_url ? (
        <video
          ref={videoRef}
          src={ad.video_url}
          autoPlay
          muted
          playsInline
          preload="auto"
          controls={false}
          className="w-full h-full object-contain"
          onClick={handleClick}
        />
      ) : ad.image_url ? (
        // 영상 없으면 이미지 광고로 fallback
        <button onClick={handleClick} className="w-full h-full">
          <img src={ad.image_url} alt={ad.title} className="w-full h-full object-contain" />
        </button>
      ) : (
        <div className="text-white">광고 로딩 실패</div>
      )}

      {/* 상단 AD 라벨 */}
      <div className="absolute top-3 left-3 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-amber-500/90 text-white">
          AD · {format === "midroll" ? "MID-ROLL" : format === "postroll" ? "POST-ROLL" : format === "preroll" ? "PRE-ROLL" : "BUMPER"}
        </span>
        {ad.advertiser && (
          <span className="text-xs text-white/80 font-medium">{ad.advertiser}</span>
        )}
      </div>

      {/* CTA 버튼 (좌하단) */}
      {ad.link_url && (
        <button
          onClick={handleClick}
          className="absolute bottom-3 left-3 px-3 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white text-sm font-bold flex items-center gap-1.5 shadow-xl"
        >
          {ad.cta_text || "자세히 보기"}
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}

      {/* SKIP 버튼 / 카운트다운 (우하단) */}
      <div className="absolute bottom-3 right-3">
        {skipAfter == null ? (
          <span className="px-3 py-2 rounded-lg bg-black/60 text-white/80 text-xs font-bold">
            SKIP 불가
          </span>
        ) : canSkip ? (
          <button
            onClick={handleSkip}
            className="px-3 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-bold flex items-center gap-1.5 backdrop-blur-md transition-colors"
          >
            SKIP
            <SkipForward className="w-3.5 h-3.5" />
          </button>
        ) : (
          <span className="px-3 py-2 rounded-lg bg-black/60 text-white/80 text-xs font-bold">
            {Math.max(0, skipAfter - elapsed)}초 후 SKIP
          </span>
        )}
      </div>
    </motion.div>
  );
}
