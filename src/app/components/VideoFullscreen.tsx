import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Play, Pause, Volume2, VolumeX, Heart, MessageCircle, Send, Minimize2 } from "lucide-react";
import videojs from "video.js";
import "video.js/dist/video-js.css";

interface VideoFullscreenProps {
  video: {
    id: string;
    title: string;
    creator: string;
    videoUrl: string;
    thumbnail: string;
    likes: number;
  };
  isLiked: boolean;
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
  commentCount = 0,
  onClose,
  onToggleLike,
  onComment,
  onShare,
}: VideoFullscreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);

  // Video.js 초기화
  useEffect(() => {
    if (!videoRef.current || !video.videoUrl) return;
    const player = videojs(videoRef.current, {
      autoplay: true,
      controls: false,
      muted: false,
      fluid: false,
      responsive: true,
      preload: "auto",
      html5: { vhs: { withCredentials: false } },
    });
    player.src({
      src: video.videoUrl,
      type: video.videoUrl.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4",
    });

    player.on("loadedmetadata", () => setDuration(player.duration() || 0));
    player.on("timeupdate", () => {
      if (!isSeeking) setCurrentTime(player.currentTime() || 0);
    });
    player.on("play", () => setIsPlaying(true));
    player.on("pause", () => setIsPlaying(false));
    player.on("volumechange", () => setIsMuted(player.muted()));

    playerRef.current = player;
    return () => {
      if (player && !player.isDisposed()) player.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.videoUrl]);

  // 컨트롤 자동 숨김 (3초 후)
  useEffect(() => {
    if (!showControls) return;
    const timer = setTimeout(() => setShowControls(false), 3000);
    return () => clearTimeout(timer);
  }, [showControls, isPlaying]);

  // 키보드 (Esc로 닫기, 스페이스로 재생/정지)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
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
                  aria-label="닫기"
                >
                  <X className="w-5 h-5" />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold text-sm truncate">{video.title}</p>
                  <p className="text-white/60 text-xs truncate">{video.creator}</p>
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
              aria-label={isPlaying ? "일시정지" : "재생"}
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
                aria-label="좋아요"
              >
                <div className={`w-11 h-11 rounded-full backdrop-blur-xl border-2 flex items-center justify-center transition-all ${
                  isLiked ? "bg-red-500/30 border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.6)]" : "bg-white/10 border-white/30"
                }`}>
                  <Heart className={`w-5 h-5 ${isLiked ? "fill-red-400 text-red-400" : "text-white"}`} strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-bold text-white mt-1 drop-shadow">{video.likes.toLocaleString()}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onComment(); }}
                className="flex flex-col items-center"
                aria-label="댓글"
              >
                <div className="w-11 h-11 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center">
                  <MessageCircle className="w-5 h-5 text-white" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-bold text-white mt-1 drop-shadow">{commentCount > 0 ? commentCount.toLocaleString() : "댓글"}</span>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onShare(); }}
                className="flex flex-col items-center"
                aria-label="공유"
              >
                <div className="w-11 h-11 rounded-full backdrop-blur-xl bg-white/10 border-2 border-white/30 flex items-center justify-center">
                  <Send className="w-5 h-5 text-white -rotate-12" strokeWidth={1.8} />
                </div>
                <span className="text-[10px] font-bold text-white mt-1 drop-shadow">공유</span>
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
                    onMouseDown={() => setIsSeeking(true)}
                    onMouseUp={() => setIsSeeking(false)}
                    onTouchStart={() => setIsSeeking(true)}
                    onTouchEnd={() => setIsSeeking(false)}
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
                    aria-label={isPlaying ? "일시정지" : "재생"}
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                  </button>
                  <span className="text-white text-xs font-medium tabular-nums">
                    {formatTime(currentTime)} <span className="text-white/40">/ {formatTime(duration)}</span>
                  </span>
                  <button
                    onClick={toggleMute}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                    aria-label={isMuted ? "음소거 해제" : "음소거"}
                  >
                    {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose(); }}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white hover:bg-white/10 transition-colors"
                    aria-label="전체화면 종료"
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
