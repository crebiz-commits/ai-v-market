import { useState, useRef, useEffect } from "react";
import { Heart, Share2, ShoppingCart, Volume2, VolumeX, Loader2, Play } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";

interface Video {
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  likes: number;
  price: number;
  duration: string;
  tool: string;
  videoUrl: string;
  highlightStart?: number;
  highlightEnd?: number;
}

interface DiscoveryFeedProps {
  onVideoClick: (video: Video) => void;
}

export function DiscoveryFeed({ onVideoClick }: DiscoveryFeedProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const touchStartY = useRef(0);

  const currentVideo = videos[currentIndex];

  useEffect(() => {
    async function fetchVideos() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) throw error;

        if (data && data.length > 0) {
          const mappedVideos: Video[] = data.map((item: any) => ({
            id: item.id,
            thumbnail: item.thumbnail,
            title: item.title,
            creator: item.creator || "AI Creator",
            likes: item.likes || 0,
            price: item.price_standard || 0,
            duration: item.duration || "0:00",
            tool: item.ai_tool || "AI Tool",
            videoUrl: item.video_url || "",
            highlightStart: item.highlight_start || 0,
            highlightEnd: item.highlight_end || 15,
          }));
          setVideos(mappedVideos);
        }
      } catch (error: any) {
        console.error("Error fetching discovery videos:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchVideos();
  }, []);

  // Mobile Player Initialization
  useEffect(() => {
    if (!videoRef.current || playerRef.current || loading) return;

    const player = videojs(videoRef.current, {
      autoplay: true,
      controls: false,
      loop: false,
      muted: isMuted,
      fill: true,
      responsive: true,
      playsinline: true,
      html5: { vhs: { withCredentials: false } },
      crossOrigin: 'anonymous'
    });

    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
    playerRef.current = player;

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [loading]);

  useEffect(() => {
    const player = playerRef.current;
    if (player && currentVideo) {
      player.pause();
      player.src({
        src: currentVideo.videoUrl,
        type: currentVideo.videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
      });

      player.one('loadedmetadata', () => {
        const duration = player.duration();
        let start = currentVideo.highlightStart || 0;
        if (duration > 0 && start >= duration) start = 0;
        player.currentTime(start);
        player.play().catch((e: any) => console.log("Play failed:", e));
      });

      player.off('timeupdate');
      player.on('timeupdate', () => {
        const start = currentVideo.highlightStart || 0;
        let end = currentVideo.highlightEnd || 15;
        const duration = player.duration();
        if (duration > 0 && end > duration) end = duration;
        const currentTime = player.currentTime();
        if (typeof currentTime === 'number' && currentTime >= end) {
          player.currentTime(start);
          player.play().catch(() => {});
        }
      });
    }
  }, [currentIndex, currentVideo]);

  useEffect(() => {
    if (playerRef.current) playerRef.current.muted(isMuted);
  }, [isMuted]);

  const toggleLike = (videoId: string) => {
    setLikedVideos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) newSet.delete(videoId);
      else newSet.add(videoId);
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#050505]">
        <Loader2 className="w-10 h-10 text-[#6366f1] animate-spin" />
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[#050505] text-gray-500">
        표시할 영상이 없습니다.
      </div>
    );
  }

  const isLiked = currentVideo && likedVideos.has(currentVideo.id);

  return (
    <div className="h-full w-full bg-[#050505] overflow-y-auto custom-scrollbar">
      {/* 📱 MOBILE VIEW: Immserive Full Screen Scroll */}
      <div className="mobile-feed-container overflow-hidden" 
        onTouchStart={(e) => { touchStartY.current = e.touches[0].clientY; }}
        onTouchEnd={(e) => {
          const diff = touchStartY.current - e.changedTouches[0].clientY;
          if (Math.abs(diff) > 50) {
            if (diff > 0 && currentIndex < videos.length - 1) setCurrentIndex(prev => prev + 1);
            else if (diff < 0 && currentIndex > 0) setCurrentIndex(prev => prev - 1);
          }
        }}
        onClick={() => { if(playerRef.current) playerRef.current.paused() ? playerRef.current.play() : playerRef.current.pause(); }}
      >
        <div className="vjs-fixed-container">
          <div data-vjs-player className="full-vjs-container">
            <video ref={videoRef} className="video-js vjs-fill vjs-big-play-centered" playsInline />
          </div>
          <div className="bottom-gradient-overlay" />
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={currentVideo.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 pointer-events-none">
            <div className="absolute top-6 left-6 pointer-events-auto">
              <span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white font-black text-[10px] tracking-widest border border-white/20 uppercase italic">{currentVideo.tool}</span>
            </div>
            <div className="absolute top-6 right-6 pointer-events-auto">
              <button onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/20">
                  <Play className="w-8 h-8 text-white fill-white ml-2" />
                </div>
              </div>
            )}
            <div className="absolute right-4 bottom-32 flex flex-col gap-6 items-center pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => toggleLike(currentVideo.id)} className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${isLiked ? 'bg-red-500/20 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'bg-black/60 border-white/20'}`}>
                  <Heart className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                </div>
                <span className="text-[10px] font-bold text-white shadow-sm">{(currentVideo.likes + (isLiked ? 1 : 0)).toLocaleString()}</span>
              </button>
              <button className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-white" /></button>
              <button className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center"><Share2 className="w-5 h-5 text-white" /></button>
            </div>
            <div className="absolute bottom-24 left-6 right-20">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow-lg">AI</div>
                <span className="text-sm font-bold text-white drop-shadow-md">{currentVideo.creator}</span>
              </div>
              <h3 className="text-2xl font-black text-white leading-tight drop-shadow-lg mb-2">{currentVideo.title}</h3>
              <p className="text-xs text-white/80 line-clamp-2 drop-shadow-md max-w-xs">{currentVideo.tool} 툴로 제작된 고화질 AI 영상입니다.</p>
            </div>
            <div className="absolute bottom-6 left-6 right-6 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <Button onClick={() => onVideoClick(currentVideo)} className="w-full h-14 bg-white/10 hover:bg-white/20 backdrop-blur-xl text-white font-black rounded-2xl text-lg border border-white/40 shadow-2xl">상세 보기 ₩{currentVideo.price.toLocaleString()}</Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 🖥️ DESKTOP VIEW: Premium Grid */}
      <div className="desktop-feed-container min-h-screen p-8 lg:p-12">
        <div className="desktop-grid-wrapper">
          <div className="desktop-header">
            <h2 className="desktop-title">Discovery <span className="beta-tag">Beta</span></h2>
            <div className="flex items-center gap-4">
              <span className="video-count">{videos.length} VIDEOS FOUND</span>
            </div>
          </div>
          
          <div className="desktop-grid">
            {videos.map((video) => (
              <DesktopCard key={video.id} video={video} onVideoClick={onVideoClick} />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        /* Responsive Visibility Controls */
        .mobile-feed-container { display: block; position: relative; height: calc(100vh - 64px); width: 100%; }
        .desktop-feed-container { display: none; }

        @media (min-width: 768px) {
          .mobile-feed-container { display: none; }
          .desktop-feed-container { display: block; }
        }

        /* Common Styles */
        .vjs-fixed-container { position: absolute; inset: 0; width: 100%; height: 100%; background: #000; }
        .video-js.vjs-fill { width: 100% !important; height: 100% !important; }
        .vjs-tech { object-fit: cover !important; width: 100% !important; height: 100% !important; }
        .vjs-poster { background-size: cover !important; display: none !important; }
        .vjs-loading-spinner { display: none !important; }
        .bottom-gradient-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 50%, rgba(0,0,0,0.9) 100%); pointer-events: none; z-index: 10; }
        .full-vjs-container { width: 100%; height: 100%; }

        /* Desktop Grid Component Styles */
        .desktop-grid-wrapper { max-width: 1400px; margin: 0 auto; }
        .desktop-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; }
        .desktop-title { font-size: 2.25rem; font-weight: 900; color: white; text-transform: uppercase; font-style: italic; letter-spacing: -0.05em; }
        .beta-tag { color: #6366f1; font-size: 0.75rem; vertical-align: top; margin-left: 8px; font-weight: bold; }
        .video-count { color: rgba(255,255,255,0.4); font-size: 0.875rem; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em; }
        
        .desktop-grid { 
          display: grid; 
          grid-template-cols: repeat(1, minmax(0, 1fr)); 
          gap: 32px; 
        }
        @media (min-width: 640px) { .desktop-grid { grid-template-cols: repeat(2, minmax(0, 1fr)); } }
        @media (min-width: 1024px) { .desktop-grid { grid-template-cols: repeat(3, minmax(0, 1fr)); } }
        @media (min-width: 1280px) { .desktop-grid { grid-template-cols: repeat(4, minmax(0, 1fr)); } }

        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
      `}</style>
    </div>
  );
}

function DesktopCard({ video, onVideoClick }: { video: Video; onVideoClick: (video: Video) => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    if (isHovered && videoRef.current && !playerRef.current) {
      const player = videojs(videoRef.current, {
        autoplay: true,
        controls: false,
        loop: true,
        muted: true,
        fill: true,
        playsinline: true,
        crossOrigin: 'anonymous'
      });
      
      player.ready(() => {
        player.src({
          src: video.videoUrl,
          type: video.videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
        });
        player.one('loadedmetadata', () => {
          player.currentTime(video.highlightStart || 0);
          player.play().catch(() => {});
        });
      });
      playerRef.current = player;
    } else if (!isHovered && playerRef.current) {
      playerRef.current.dispose();
      playerRef.current = null;
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [isHovered, video]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onVideoClick(video)}
      className="desktop-card-outer"
    >
      <img src={video.thumbnail} alt={video.title} className={`card-thumbnail ${isHovered ? 'hidden' : 'visible'}`} />
      {isHovered && (
        <div className="card-video-container">
          <div data-vjs-player className="full-vjs-container">
            <video ref={videoRef} className="video-js vjs-fill" />
          </div>
        </div>
      )}

      <div className="card-overlay" />
      <div className="card-content">
        <div className="card-tag"><span>{video.tool}</span></div>
        <h3 className="card-title">{video.title}</h3>
        <p className="card-creator">{video.creator}</p>
        <div className="card-footer">
          <span className="card-price">₩{video.price.toLocaleString()}</span>
          <div className="card-icons"><Heart className="w-4 h-4 icon-heart" /><ShoppingCart className="w-4 h-4 icon-cart" /></div>
        </div>
      </div>
      <div className="card-hover-accent" />

      <style>{`
        .desktop-card-outer {
          position: relative;
          aspect-ratio: 9/16;
          border-radius: 2rem;
          overflow: hidden;
          background: #111;
          border: 1px solid rgba(255,255,255,0.05);
          cursor: pointer;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .desktop-card-outer:hover {
          border-color: rgba(255,255,255,0.2);
          box-shadow: 0 20px 40px rgba(0,0,0,0.4);
          transform: translateY(-8px);
        }
        .card-thumbnail { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 0.7s ease; }
        .desktop-card-outer:hover .card-thumbnail { transform: scale(1.1); }
        .visible { opacity: 1; }
        .hidden { opacity: 0; }
        .card-video-container { position: absolute; inset: 0; width: 100%; height: 100%; }
        .card-overlay { position: absolute; inset: 0; background: linear-gradient(to top, black 0%, transparent 60%); z-index: 10; opacity: 0.8; }
        .card-content { position: absolute; inset: 0; padding: 24px; display: flex; flex-direction: column; justify-content: flex-end; z-index: 20; }
        .card-tag { margin-bottom: 12px; }
        .card-tag span { padding: 2px 8px; background: rgba(255,255,255,0.1); border-radius: 6px; font-size: 8px; font-weight: 900; color: rgba(255,255,255,0.5); border: 1px solid rgba(255,255,255,0.1); text-transform: uppercase; }
        .card-title { font-size: 1.25rem; font-weight: 900; color: white; line-height: 1.2; margin-bottom: 4px; transition: color 0.5s; }
        .desktop-card-outer:hover .card-title { color: #6366f1; }
        .card-creator { font-size: 0.75rem; color: rgba(255,255,255,0.5); font-weight: 500; margin-bottom: 16px; }
        .card-footer { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.1); pt: 16px; width: 100%; }
        .card-price { font-size: 0.875rem; font-weight: 900; color: white; text-transform: uppercase; font-style: italic; }
        .card-icons { display: flex; gap: 12px; }
        .icon-heart { color: rgba(255,255,255,0.3); transition: color 0.5s; }
        .icon-cart { color: rgba(255,255,255,0.3); transition: color 0.5s; }
        .desktop-card-outer:hover .icon-heart { color: #ef4444; }
        .desktop-card-outer:hover .icon-cart { color: white; }
        .card-hover-accent { position: absolute; inset: 0; background: rgba(99, 102, 241, 0.05); opacity: 0; transition: opacity 0.5s; z-index: 0; }
        .desktop-card-outer:hover .card-hover-accent { opacity: 1; }
      `}</style>
    </motion.div>
  );
}
