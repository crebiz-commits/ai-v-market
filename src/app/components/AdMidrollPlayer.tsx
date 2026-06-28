// Phase 28 — Mid-roll/Pre-roll/Post-roll/Bumper 광고 플레이어 (video.js 기반)
//
// 정책 v4 (2026-05-26 1차 → v5 2026-05-26 video.js 전환):
//   - 본편 Bunny iframe 앞/중간/뒤에 풀스크린 광고 영상 재생
//   - 영상 길이 검사·SKIP 정책 분기·트래킹 모두 클라이언트 직접 컨트롤
//   - HTML5 <video> 직접 사용 시 mp4 buffer 누적으로 메모리 800MB+ 누수 → video.js 전환
//   - video.js dispose() 가 src/listener/buffer 모두 자동 해제
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { ExternalLink, SkipForward, Volume2, VolumeX, Loader2 } from "lucide-react";
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
  const [loading, setLoading] = useState(true);  // 첫 'playing' 전 로딩 스피너
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

    setLoading(true);
    const videoEl = document.createElement("video");
    videoEl.className = "video-js vjs-fill";
    videoEl.setAttribute("playsinline", "");
    videoEl.setAttribute("webkit-playsinline", "");
    if (ad.thumbnail_url) videoEl.poster = ad.thumbnail_url;  // 로딩 중 검은화면 대신 썸네일
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

    // 실제 재생 시작 → 로딩 스피너 제거
    player.on("playing", () => setLoading(false));

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

    // 음소거 자동재생만 사용(가장 안정). 소리는 사용자가 우상단 버튼으로 켬.
    //   ⚠️ 기존엔 자동 unmute 후 재생을 재시도했는데, 브라우저 autoplay 정책이
    //   unmute 재생을 차단하면 영상이 멈춰 "검은 화면"이 되는 간헐 버그(3~4회 중 1회) 유발 → 제거.
    player.ready(() => {
      if (!playerRef.current || playerRef.current.isDisposed()) return;
      playerRef.current.play()?.catch(() => {});
    });

    // 워치독: 4초 내 재생이 시작되지 않으면(간헐 autoplay 스톨) load+play 1회 재시도
    const watchdogId = window.setTimeout(() => {
      const p = playerRef.current;
      if (!p || p.isDisposed() || completedRef.current) return;
      if ((p.currentTime() || 0) === 0) {
        try { p.load(); p.play()?.catch(() => {}); } catch { /* 무시 */ }
      }
    }, 4000);

    const maxDur = ad.duration_seconds || 30;
    const timeoutId = window.setTimeout(() => {
      console.warn(`[AdMidrollPlayer] timeout fallback after ${maxDur + 5}s, forcing complete`);
      safeComplete({ skipped: false });
    }, (maxDur + 5) * 1000);

    return () => {
      window.clearTimeout(timeoutId);
      window.clearTimeout(watchdogId);
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

      {/* 로딩 스피너 — 첫 재생 전까지(검은 화면 대신) */}
      {ad.video_url && loading && (
        <div className="absolute inset-0 z-[5] flex items-center justify-center pointer-events-none">
          <Loader2 className="w-9 h-9 text-white/70 animate-spin" />
        </div>
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
