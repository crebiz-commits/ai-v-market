import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Play, Pause, Volume2, VolumeX, Heart, MessageCircle, Send, Minimize2, Maximize2, Gauge, PictureInPicture2 } from "lucide-react";
// video.js 는 정적 import 금지(홈 피드 선행 의존성 방지) — 마운트 시 지연 로드.
import { loadVideojs } from "../utils/videojsLoader";
import { useCreatorInfo } from "../hooks/useCreatorInfo";
import { CreatorAvatar } from "./CreatorAvatar";
import { trackVideoView } from "../utils/viewTracking";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface VideoFullscreenProps {
  video: {
    id: string;
    title: string;
    creator: string;
    creatorId?: string;
    videoUrl: string;
    thumbnail: string;
    likes: number;
  };
  isLiked: boolean;
  likeCount?: number;   // 전역 스토어 반영 카운트(없으면 video.likes 폴백)
  commentCount?: number;
  onClose: () => void;
  onToggleLike: () => void;
  onComment: () => void;
  onShare: () => void;
}

function formatTime(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function VideoFullscreen({
  video,
  isLiked,
  likeCount,
  commentCount = 0,
  onClose,
  onToggleLike,
  onComment,
  onShare,
}: VideoFullscreenProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const creatorInfo = useCreatorInfo([video.creatorId]);
  const creatorAvatar = video.creatorId ? creatorInfo[video.creatorId]?.avatar ?? null : null;
  const creatorName = (video.creatorId ? creatorInfo[video.creatorId]?.name : null) ?? video.creator;
  const [duration, setDuration] = useState(0);
  // isSeeking 은 timeupdate 가드용으로만 쓰이고 렌더에 안 쓰이므로 ref — 상태였을 땐 플레이어 init
  //   effect(deps 고정)가 초기 false 를 캡처해 가드가 죽어 드래그 중 스크러버가 튀던 것 해소.
  const isSeekingRef = useRef(false);
  // Phase 14: 재생 컨트롤
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showRateMenu, setShowRateMenu] = useState(false);
  const [isPiP, setIsPiP] = useState(false);

  // Phase 8: 시청 기록 추적 (re-render 없이 ref로 관리)
  const maxWatchedRef = useRef(0);
  const trackedRef = useRef(false);
  // 실제 재생된 초(정산 기준) — 앞으로 건너뛴 구간은 빼야 SUM(watch_seconds) pro-rata 가 정직하다.
  const watchedRef = useRef(0);
  const lastSecRef = useRef<number | null>(null);
  const reportedRef = useRef(0);   // 마지막 서버 보고 시점의 watched

  // Video.js 초기화
  useEffect(() => {
    if (!videoRef.current || !video.videoUrl) return;

    // 새 영상이 들어오면 추적 상태 리셋
    maxWatchedRef.current = 0;
    trackedRef.current = false;
    watchedRef.current = 0;
    lastSecRef.current = null;
    reportedRef.current = 0;

    let cancelled = false;
    let createdPlayer: any = null;
    void loadVideojs().then((videojs) => {
      if (cancelled || !videoRef.current) return;
      const player = videojs(videoRef.current, {
      autoplay: true,
      controls: false,
      muted: false,
      fluid: false,
      responsive: true,
      preload: "auto",
      html5: { vhs: { withCredentials: false } },
    });
    createdPlayer = player;
    player.src({
      src: video.videoUrl,
      type: video.videoUrl.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4",
    });

    player.on("loadedmetadata", () => {
      setDuration(player.duration() || 0);
      // 자동재생 시도 — 차단되면 muted로 폴백
      const p = player.play();
      if (p) {
        p.catch(() => {
          if (!player.isDisposed()) {
            player.muted(true);
            player.play()?.catch(() => {});
          }
        });
      }
    });
    player.on("timeupdate", () => {
      const t = player.currentTime() || 0;
      if (!isSeekingRef.current) setCurrentTime(t);

      // 시청 추적 — 정상 재생 진행분만 누적(시킹·되감기 제외). timeupdate 는 초당 여러 번
      //   오므로 정상 델타는 1초 미만이다. 위치(t)는 이어보기용으로 따로 보낸다.
      const last = lastSecRef.current;
      if (last !== null) {
        const delta = t - last;
        if (delta > 0 && delta < 2) watchedRef.current += delta;
      }
      lastSecRef.current = t;
      if (t > maxWatchedRef.current) maxWatchedRef.current = t;

      const d = player.duration() || 0;
      const threshold = d > 0 ? Math.max(5, d * 0.30) : Infinity;
      if (!trackedRef.current) {
        if (watchedRef.current >= threshold) {
          trackedRef.current = true;
          reportedRef.current = watchedRef.current;
          trackVideoView(video.id, Math.floor(watchedRef.current), Math.floor(t));
        }
      } else if (watchedRef.current - reportedRef.current >= 20) {
        // 20초 재생마다 갱신 보고 — 서버가 GREATEST 로 누적(행은 늘지 않음)
        reportedRef.current = watchedRef.current;
        trackVideoView(video.id, Math.floor(watchedRef.current), Math.floor(t));
      }
    });
    player.on("ended", () => {
      if (watchedRef.current >= 5 && (!trackedRef.current || watchedRef.current > reportedRef.current)) {
        trackedRef.current = true;
        reportedRef.current = watchedRef.current;
        trackVideoView(video.id, Math.floor(watchedRef.current), Math.floor(maxWatchedRef.current));
      }
    });
    player.on("play", () => setIsPlaying(true));
    player.on("pause", () => setIsPlaying(false));
    player.on("volumechange", () => setIsMuted(!!player.muted()));
    // 로드/재생 실패 — 검은 화면 방치 대신 안내(피드와 동일 메시지). X/Esc 로 닫기 가능.
    player.on("error", () => { toast.error(t("discoveryFeed.videoProcessing")); });

    playerRef.current = player;
    }).catch(() => { toast.error(t("discoveryFeed.videoProcessing")); /* 청크 로드 실패 안내 */ });
    return () => {
      cancelled = true;
      // 나갈 때 최종 보고 — 30% 미달(5초+)이면 첫 기록, 이미 기록됐으면 잔여 재생분 반영.
      //   없으면 마지막 20초 구간이 유실된다.
      if (video.id && watchedRef.current >= 5 &&
          (!trackedRef.current || watchedRef.current > reportedRef.current)) {
        trackVideoView(video.id, Math.floor(watchedRef.current), Math.floor(maxWatchedRef.current));
      }
      if (createdPlayer && !createdPlayer.isDisposed()) createdPlayer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.videoUrl]);

  // 컨트롤 자동 숨김 (3초 후)
  useEffect(() => {
    if (!showControls) return;
    const timer = setTimeout(() => setShowControls(false), 3000);
    return () => clearTimeout(timer);
  }, [showControls, isPlaying]);

  // Phase 14: 확장된 키보드 단축키
  //   Esc: 닫기 / Space: 재생-정지 / ← →: 10초 / ↑ ↓: 볼륨 / M: 음소거
  //   > <: 배속 / P: PiP
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 텍스트 입력 중이면 단축키 무시
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const p = playerRef.current;
      if (!p || p.isDisposed()) return;

      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }  // preventDefault: App 전역 ESC(back)와 이중 처리 방지(back 2회→탭 점프)
      if (e.key === " ") { e.preventDefault(); togglePlay(); return; }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        p.currentTime(Math.max(0, (p.currentTime() || 0) - 10));
        setShowControls(true);
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        p.currentTime(Math.min(p.duration() || 0, (p.currentTime() || 0) + 10));
        setShowControls(true);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        p.volume(Math.min(1, (p.volume() || 0) + 0.1));
        p.muted(false);
        setShowControls(true);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        p.volume(Math.max(0, (p.volume() || 0) - 0.1));
        setShowControls(true);
        return;
      }
      if (e.key === "m" || e.key === "M") {
        toggleMute();
        return;
      }
      if (e.key === ">" || e.key === ".") {
        cyclePlaybackRate(1);
        return;
      }
      if (e.key === "<" || e.key === ",") {
        cyclePlaybackRate(-1);
        return;
      }
      if (e.key === "p" || e.key === "P") {
        togglePiP();
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 14: 배속 변경
  const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const applyRate = (r: number) => {
    const p = playerRef.current;
    if (!p || p.isDisposed()) return;
    p.playbackRate(r);
    setPlaybackRate(r);
    setShowControls(true);
  };
  const cyclePlaybackRate = (direction: 1 | -1) => {
    // 현재 배속은 플레이어(ref)에서 직접 읽는다 — keydown 핸들러가 초기 렌더의 이 함수를
    //   캡처(deps [])해도 stale playbackRate(=1)에 갇히지 않고 항상 실제 배속 기준으로 증감.
    const p = playerRef.current;
    const cur = (p && !p.isDisposed()) ? (p.playbackRate() || 1) : playbackRate;
    const curIdx = RATES.indexOf(cur);
    const baseIdx = curIdx === -1 ? RATES.indexOf(1) : curIdx;
    const nextIdx = (baseIdx + direction + RATES.length) % RATES.length;
    applyRate(RATES[nextIdx]);
  };

  // Phase 14: PiP 토글
  const togglePiP = async () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPiP(false);
      } else {
        await (videoEl as any).requestPictureInPicture();
        setIsPiP(true);
      }
    } catch (err) {
      console.warn("[PiP] 실패:", err);
    }
    setShowControls(true);
  };

  // PiP 상태 동기화 (사용자가 PiP 창 직접 닫는 경우)
  useEffect(() => {
    const handlePipEnter = () => setIsPiP(true);
    const handlePipLeave = () => setIsPiP(false);
    document.addEventListener("enterpictureinpicture", handlePipEnter);
    document.addEventListener("leavepictureinpicture", handlePipLeave);
    return () => {
      document.removeEventListener("enterpictureinpicture", handlePipEnter);
      document.removeEventListener("leavepictureinpicture", handlePipLeave);
    };
  }, []);

  // ── 기기 네이티브 전체화면 + 가로 잠금 ──
  // PWA manifest 가 portrait 고정이라 폰을 돌려도 페이지가 회전하지 않음.
  // 영상만 네이티브 Fullscreen API + Screen Orientation 잠금으로 가로 전체화면 진입(유튜브 패턴).
  // iPhone Safari 는 엘리먼트 풀스크린 미지원 → <video> 네이티브 풀스크린(webkitEnterFullscreen)이
  // 기기 회전까지 자동 처리.
  const [isDeviceFs, setIsDeviceFs] = useState(false);
  const enterDeviceFullscreen = async () => {
    const vEl: any = videoRef.current;
    if (typeof document !== "undefined" && !document.fullscreenEnabled && vEl?.webkitEnterFullscreen) {
      try { vEl.webkitEnterFullscreen(); return; } catch { /* 폴백 진행 */ }
    }
    const root: any = rootRef.current;
    try {
      if (root?.requestFullscreen) await root.requestFullscreen();
      else if (root?.webkitRequestFullscreen) root.webkitRequestFullscreen();
    } catch { /* 사용자 제스처 없으면 차단될 수 있음 — 무시 */ }
    try { await (screen.orientation as any)?.lock?.("landscape"); } catch { /* 미지원 기기 무시 */ }
  };
  const exitDeviceFullscreen = async () => {
    try { (screen.orientation as any)?.unlock?.(); } catch { /* 무시 */ }
    try {
      if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
      else if ((document as any).webkitFullscreenElement && (document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
    } catch { /* 무시 */ }
  };
  const toggleDeviceFullscreen = () => {
    const fs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    if (fs) exitDeviceFullscreen(); else enterDeviceFullscreen();
    setShowControls(true);
  };
  // 전체화면 상태 동기화(버튼 아이콘) + 가로 회전 자동 진입(best-effort) + 언마운트 정리.
  useEffect(() => {
    const syncFs = () => setIsDeviceFs(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    const onOrientation = () => {
      const type = (screen.orientation as any)?.type || "";
      const isFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      // 가로로 돌리면 자동 전체화면 시도(브라우저가 제스처 요구 시 조용히 실패).
      if (type.startsWith("landscape") && !isFs) enterDeviceFullscreen();
    };
    document.addEventListener("fullscreenchange", syncFs);
    document.addEventListener("webkitfullscreenchange", syncFs as any);
    (screen.orientation as any)?.addEventListener?.("change", onOrientation);
    window.addEventListener("orientationchange", onOrientation);
    return () => {
      document.removeEventListener("fullscreenchange", syncFs);
      document.removeEventListener("webkitfullscreenchange", syncFs as any);
      (screen.orientation as any)?.removeEventListener?.("change", onOrientation);
      window.removeEventListener("orientationchange", onOrientation);
      // 닫힐 때 전체화면/가로 잠금 해제 (다른 화면이 가로로 남는 것 방지)
      try { (screen.orientation as any)?.unlock?.(); } catch { /* 무시 */ }
      try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch { /* 무시 */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p || p.isDisposed()) return;
    if (p.paused()) {
      const pp = p.play();
      if (pp) pp.catch(() => {});
    } else {
      p.pause();
    }
    setShowControls(true);
  };

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p) return;
    p.muted(!p.muted());
    setShowControls(true);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value);
    setCurrentTime(t);
    const p = playerRef.current;
    if (p && !p.isDisposed()) p.currentTime(t);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9999] bg-black select-none"
    >
      {/* 비디오 */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        <video
          ref={videoRef}
          className="video-js w-full h-full object-contain"
          playsInline
          poster={video.thumbnail}
          data-priority-video=""
        />
      </div>

      {/* 탭 영역 (컨트롤 토글) — 컨트롤 외 영역 */}
      <div
        className="absolute inset-0 z-10"
        onClick={() => setShowControls((s) => !s)}
      />

      <AnimatePresence>
        {showControls && (
          <>
            {/* 상단 바 */}
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -50, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/80 to-transparent pt-safe"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <button
                  onClick={(e) => { e.stopPropagation(); onClose(); }}
                  className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white"
                  aria-label={t("common.close")}
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <CreatorAvatar avatarUrl={creatorAvatar} name={creatorName} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{video.title}</p>
                    <p className="text-white/60 text-xs truncate">{creatorName}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* 중앙 재생/정지 큰 버튼 */}
            <motion.button
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 w-20 h-20 rounded-full bg-black/40 backdrop-blur-md border-2 border-white/30 flex items-center justify-center text-white"
              aria-label={t("videoFullscreen.playPause")}
            >
              {isPlaying ? (
                <Pause className="w-10 h-10 fill-white" />
              ) : (
                <Play className="w-10 h-10 fill-white ml-1" />
              )}
            </motion.button>

            {/* 우측 액션 버튼 (좋아요/댓글/공유) */}
            <motion.div
              initial={{ x: 50, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 50, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-3 items-center"
            >
              <button
                onClick={(e) => { e.stopPropagation(); onToggleLike(); setShowControls(true); }}
                className="flex flex-col items-center"
                aria-label={t("common.like")}
              >
                <div className={`w-11 h-11 rounded-full backdrop-blur-xl border-2 flex items-center justify-center transition-all ${
                  isLiked ? "bg-red-500/30 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.6)]" : "bg-white/10 border-white/30"
                }`}>
                  <Heart className={`w-5 h-5 ${isLiked ? "fill-red-400 text-red-400" : "text-white"}`} strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-bold text-white mt-1 drop-shadow">{(likeCount ?? video.likes).toLocaleString()}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onComment(); }}
                className="flex flex-col items-center"
                aria-label={t("common.comment")}
              >
                <div className="w-11 h-11 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-white" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-bold text-white mt-1 drop-shadow">{commentCount > 0 ? commentCount.toLocaleString() : t("common.comment")}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onShare(); }}
                className="flex flex-col items-center"
                aria-label={t("common.share")}
              >
                <div className="w-11 h-11 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center">
                  <Send className="w-5 h-5 text-white -rotate-12" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-bold text-white mt-1 drop-shadow">{t("common.share")}</span>
              </button>
            </motion.div>

            {/* 하단 바 (진행바 + 컨트롤) */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent pb-safe"
            >
              <div className="px-4 pt-8 pb-3" onClick={(e) => e.stopPropagation()}>
                {/* 진행바 */}
                <div className="relative h-1 bg-white/20 rounded-full mb-3 group cursor-pointer">
                  <div
                    className="absolute left-0 top-0 h-full bg-[#6366f1] rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                  <input
                    type="range"
                    min={0}
                    max={duration || 0}
                    step="0.01"
                    value={currentTime}
                    onChange={handleSeek}
                    onMouseDown={() => { isSeekingRef.current = true; }}
                    onMouseUp={() => { isSeekingRef.current = false; }}
                    onTouchStart={() => { isSeekingRef.current = true; }}
                    onTouchEnd={() => { isSeekingRef.current = false; }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#6366f1] shadow-lg"
                    style={{ left: `${progressPercent}%` }}
                  />
                </div>

                {/* 컨트롤 버튼 줄 */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                    aria-label={t("videoFullscreen.playPause")}
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                  </button>
                  <span className="text-white text-xs font-medium tabular-nums">
                    {formatTime(currentTime)} <span className="text-white/40">/ {formatTime(duration)}</span>
                  </span>
                  <button
                    onClick={toggleMute}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                    aria-label={isMuted ? t("videoFullscreen.unmute") : t("videoFullscreen.mute")}
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>

                  <div className="flex-1" />

                  {/* Phase 14: 배속 버튼 + 메뉴 */}
                  <div className="relative">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowRateMenu(v => !v); setShowControls(true); }}
                      className="h-9 px-2.5 rounded-full flex items-center gap-1 text-white hover:bg-white/10 transition-colors text-xs font-bold"
                      aria-label={t("videoFullscreen.speed")}
                      title={t("videoFullscreen.speed")}
                    >
                      <Gauge className="w-4 h-4" />
                      {playbackRate}x
                    </button>
                    {showRateMenu && (
                      <div
                        className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur-md rounded-lg overflow-hidden border border-white/20 min-w-[90px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {RATES.map(r => (
                          <button
                            key={r}
                            onClick={() => { applyRate(r); setShowRateMenu(false); }}
                            className={`w-full px-4 py-2 text-xs font-medium text-left transition-colors ${
                              playbackRate === r
                                ? "bg-[#6366f1]/40 text-white"
                                : "text-white/80 hover:bg-white/10"
                            }`}
                          >
                            {r}x {r === 1 && t("videoFullscreen.rateDefault")}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Phase 14: PiP 버튼 (지원 브라우저에서만) */}
                  {typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled && (
                    <button
                      onClick={(e) => { e.stopPropagation(); togglePiP(); }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                        isPiP ? "bg-[#6366f1]/30 text-[#8b5cf6]" : "text-white hover:bg-white/10"
                      }`}
                      aria-label={t("videoFullscreen.pip")}
                      title={t("videoFullscreen.pip")}
                    >
                      <PictureInPicture2 className="w-5 h-5" />
                    </button>
                  )}

                  {/* 기기 전체화면(가로) 토글 — PWA 세로고정 우회. 가로 영상은 풀스크린에서 꽉 참 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleDeviceFullscreen(); }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                      isDeviceFs ? "bg-[#6366f1]/30 text-[#8b5cf6]" : "text-white hover:bg-white/10"
                    }`}
                    aria-label={t("videoFullscreen.deviceFullscreen")}
                    title={t("videoFullscreen.deviceFullscreen")}
                  >
                    <Maximize2 className="w-5 h-5" />
                  </button>

                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                    aria-label={t("videoFullscreen.exitFullscreen")}
                  >
                    <Minimize2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
