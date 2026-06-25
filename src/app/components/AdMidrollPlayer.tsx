// Phase 28 — Mid-roll/Pre-roll/Post-roll/Bumper 광고 플레이어 (video.js 기반)
//
// 정책 v4 (2026-05-26 1차 → v5 2026-05-26 video.js 전환):
//   - 본편 Bunny iframe 앞/중간/뒤에 풀스크린 광고 영상 재생
//   - 영상 길이 검사·SKIP 정책 분기·트래킹 모두 클라이언트 직접 컨트롤
//   - HTML5 <video> 직접 사용 시 mp4 buffer 누적으로 메모리 800MB+ 누수 → video.js 전환
//   - video.js dispose() 가 src/listener/buffer 모두 자동 해제
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ExternalLink, SkipForward, Volume2, VolumeX } from "lucide-react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import type Player from "video.js/dist/types/player";
import { recordAdClick, recordAdImpression, type AdRpcResult, type AdFormat } from "../utils/adFetch";
import { openExternal } from "../utils/openExternal";

interface AdMidrollPlayerProps {
  ad: AdRpcResult;
  videoId: string;
  format: AdFormat;
  onComplete: (opts: { skipped: boolean }) => void;
}

export function AdMidrollPlayer({ ad, videoId, format, onComplete }: AdMidrollPlayerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(true);
  const skipAfter = ad.skip_after_seconds;
  const canSkip = skipAfter != null && elapsed >= skipAfter;

  useEffect(() => {
    recordAdImpression(ad.ad_id, videoId, format);
  }, [ad.ad_id, videoId, format]);

  useEffect(() => {
    if (!ad.video_url) return;
    const container = containerRef.current;
    if (!container) return;

    const safeComplete = (opts: { skipped: boolean }) => {
      if (completedRef.current) return;
      completedRef.current = true;
      onCompleteRef.current(opts);
    };

    const videoEl = document.createElement("video");
    videoEl.className = "video-js vjs-fill";
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("webkit-playsinline", "");
    container.appendChild(videoEl);

    const isHls = ad.video_url.includes(".m3u8");
    const player = videojs(videoEl, {
      autoplay: true,
      muted: true,
      controls: false,
      preload: "auto",
      playsinline: true,
      fill: true,
      responsive: true,
      crossOrigin: "anonymous",
      sources: [{
        src: ad.video_url,
        type: isHls ? "application/x-mpegURL" : "video/mp4",
      }],
    });
    playerRef.current = player;

    player.on("timeupdate", () => {
      if (!playerRef.current || playerRef.current.isDisposed()) return;
      const t = Math.floor(player.currentTime() || 0);
      setElapsed(t);
    });

    player.on("ended", () => {
      if (!playerRef.current || playerRef.current.isDisposed()) return;
      const dur = Math.floor(player.duration() || 0);
      recordAdImpression(ad.ad_id, videoId, format, {
        completed: true,
        positionSeconds: dur,
      });
      safeComplete({ skipped: false });
    });

    player.on("error", () => {
      const err = playerRef.current?.error?.();
      console.error("[AdMidrollPlayer] video.js error", err);
      safeComplete({ skipped: false });
    });

    // muted autoplay 로 시작 → 성공하면 즉시 unmute 시도
    // (Chrome autoplay 정책: 페이지에 사용자 인터랙션이 있었으면 unmuted autoplay 허용)
    // 실패하면 muted 유지 → 사용자가 우상단 음소거 토글 버튼으로 켤 수 있음
    player.ready(() => {
      if (!playerRef.current || playerRef.current.isDisposed()) return;
      const p = player.play();
      if (!p) return;
      p.then(() => {
        const cur = playerRef.current;
        if (!cur || cur.isDisposed()) return;
        cur.muted(false);
        const p2 = cur.play();
        if (p2) {
          p2.then(() => {
            setMuted(false);
          }).catch(() => {
            if (!playerRef.current || playerRef.current.isDisposed()) return;
            playerRef.current.muted(true);
            setMuted(true);
            playerRef.current.play()?.catch(() => {});
          });
        } else {
          setMuted(false);
        }
      }).catch(() => { /* muted autoplay 자체 실패는 극히 드묾 */ });
    });

    const maxDur = ad.duration_seconds || 30;
    const timeoutId = window.setTimeout(() => {
      console.warn(`[AdMidrollPlayer] timeout fallback after ${maxDur + 5}s, forcing complete`);
      safeComplete({ skipped: false });
    }, (maxDur + 5) * 1000);

    return () => {
      window.clearTimeout(timeoutId);
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
      }
      playerRef.current = null;
    };
  }, [ad.ad_id, ad.video_url, ad.duration_seconds, videoId, format]);

  const handleSkip = () => {
    if (!canSkip || completedRef.current) return;
    completedRef.current = true;
    recordAdImpression(ad.ad_id, videoId, format, { skipped: true, positionSeconds: elapsed });
    onCompleteRef.current({ skipped: true });
  };

  const handleClick = async () => {
    if (!ad.link_url) return;
    await recordAdClick(ad.ad_id, videoId, format);
    openExternal(ad.link_url);
  };

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const p = playerRef.current;
    if (!p || p.isDisposed()) return;
    const next = !p.muted();
    p.muted(next);
    setMuted(next);
  };

  const formatLabel =
    format === "midroll"  ? "MID-ROLL"  :
    format === "postroll" ? "POST-ROLL" :
    format === "preroll"  ? "PRE-ROLL"  :
    format === "bumper"   ? "BUMPER"    : "AD";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-40 bg-black flex items-center justify-center"
    >
      {ad.video_url ? (
        <div
          ref={containerRef}
          className="absolute inset-0 w-full h-full cursor-pointer"
          onClick={handleClick}
        />
      ) : ad.image_url ? (
        <button onClick={handleClick} className="w-full h-full">
          <img src={ad.image_url} alt={ad.title} className="w-full h-full object-contain" />
        </button>
      ) : (
        <div className="text-white">광고 로딩 실패</div>
      )}

      <div className="absolute top-3 left-3 flex items-center gap-2 z-10 pointer-events-none">
        <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded bg-amber-500/90 text-white">
          AD · {formatLabel}
        </span>
        {ad.advertiser && (
          <span className="text-xs text-white/80 font-medium">{ad.advertiser}</span>
        )}
      </div>

      {ad.video_url && (
        <button
          onClick={handleToggleMute}
          aria-label={muted ? "소리 켜기" : "소리 끄기"}
          className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-md transition-colors"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      )}

      {ad.link_url && (
        <button
          onClick={handleClick}
          className="absolute bottom-3 left-3 z-10 px-3 py-2 rounded-lg bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white text-sm font-bold flex items-center gap-1.5 shadow-xl"
        >
          {ad.cta_text || "자세히 보기"}
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      )}

      <div className="absolute bottom-3 right-3 z-10">
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
