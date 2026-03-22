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
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const touchStartY = useRef(0);
  const isDragging = useRef(false);
  const lastWheelTime = useRef(0);

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
          setVideos(data.map((item: any) => ({
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
          })));
        }
      } catch {
        console.error("Error fetching discovery videos");
      } finally {
        setLoading(false);
      }
    }
    fetchVideos();
  }, []);

  useEffect(() => {
    if (!videoRef.current || playerRef.current || loading) return;
    const player = videojs(videoRef.current, {
      autoplay: true, controls: false, loop: false, muted: isMuted, fill: true, responsive: true, playsinline: true, crossOrigin: 'anonymous'
    });
    player.on('play', () => { setIsPlaying(true); setHasError(false); });
    player.on('pause', () => setIsPlaying(false));
    player.on('error', () => {
      const err = player.error();
      if (err && (err.code === 4 || err.code === 2)) {
        setHasError(true);
      }
    });
    playerRef.current = player;
    return () => { if (playerRef.current) playerRef.current.dispose(); };
  }, [loading]);

  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" && currentIndex > 0) setCurrentIndex(prev => prev - 1);
      if (e.key === "ArrowDown" && currentIndex < videos.length - 1) setCurrentIndex(prev => prev + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentIndex, videos.length]);

  useEffect(() => {
    const player = playerRef.current;
    if (player && currentVideo) {
      player.pause();
      player.src({ src: currentVideo.videoUrl, type: currentVideo.videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4' });
      player.one('loadedmetadata', () => {
        const d = player.duration();
        let s = currentVideo.highlightStart || 0;
        if (d > 0 && s >= d) s = 0;
        player.currentTime(s);
        player.play().catch(() => {});
      });
      player.on('timeupdate', () => {
        const s = currentVideo.highlightStart || 0;
        let e = currentVideo.highlightEnd || 15;
        const d = player.duration();
        if (d > 0 && e > d) e = d;
        if (player.currentTime() >= e) { player.currentTime(s); player.play().catch(() => {}); }
      });
    }
  }, [currentIndex, currentVideo]);

  const toggleLike = (id: string) => {
    setLikedVideos(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  if (loading) return <div className="h-full flex items-center justify-center bg-[#050505]"><Loader2 className="w-10 h-10 text-indigo-500 animate-spin" /></div>;
  if (videos.length === 0) return <div className="h-full flex items-center justify-center bg-[#050505] text-gray-500">표시할 영상이 없습니다.</div>;

  const isLiked = currentVideo && likedVideos.has(currentVideo.id);

  return (
    <div className="discovery-feed-wrapper h-full w-full bg-[#050505]">
      {/* 📱 Mobile */}
      <div className="mobile-feed-container" 
        onPointerDown={(e) => { 
          touchStartY.current = e.clientY; 
          isDragging.current = false;
        }}
        onPointerMove={(e) => { 
          if (Math.abs(e.clientY - touchStartY.current) > 10) {
            if (!isDragging.current) {
              isDragging.current = true;
              try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch (err) {}
            }
          }
        }}
        onPointerUp={(e) => {
          if (isDragging.current) {
            const touchEndY = e.clientY;
            const diff = touchStartY.current - touchEndY;
            
            if (Math.abs(diff) > 50) {
              if (diff > 0 && currentIndex < videos.length - 1) {
                setCurrentIndex(v => v + 1);
              } else if (diff < 0 && currentIndex > 0) {
                setCurrentIndex(v => v - 1);
              }
            }
            try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch (err) {}
            isDragging.current = false;
          }
        }}
        onWheel={(e) => {
          const now = Date.now();
          if (now - lastWheelTime.current < 500) return; // Debounce wheel
          
          if (e.deltaY > 50 && currentIndex < videos.length - 1) {
            setCurrentIndex(v => v + 1);
            lastWheelTime.current = now;
          } else if (e.deltaY < -50 && currentIndex > 0) {
            setCurrentIndex(v => v - 1);
            lastWheelTime.current = now;
          }
        }}
      >
        {/* 🎬 Video Section */}
        <div className="relative w-full h-full pointer-events-none">
          <video ref={videoRef} className="video-js vjs-big-play-centered w-full h-full" playsInline />
          
          {/* Error/Processing Overlay */}
          {hasError && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-8 text-center pointer-events-auto">
              <Loader2 className="w-12 h-12 text-[#6366f1] animate-spin mb-4" />
              <h3 className="text-xl font-bold text-white mb-2">영상이 현재 처리 중입니다</h3>
              <p className="text-gray-300 text-sm max-w-[280px]">
                고화질 스트리밍을 위해 서버에서 영상을 변환하고 있습니다. 잠시 후 다시 시도해 주세요.
              </p>
            </div>
          )}
          <div className="bottom-gradient-overlay" />
        </div>

        {/* 👆 Dedicated Tap Layer for Play/Pause */}
        <div 
          className="absolute inset-0 z-10 cursor-pointer pointer-events-auto"
          onPointerUp={(e) => {
            if (!isDragging.current && playerRef.current) {
              if (playerRef.current.paused()) {
                playerRef.current.play();
              } else {
                playerRef.current.pause();
              }
            }
          }}
        />

        <div className="absolute top-4 right-4 z-50 pointer-events-none opacity-20 text-[8px] text-white">v1.0.8-stable</div>
        <AnimatePresence mode="wait">
          <motion.div key={currentVideo.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 pointer-events-none">
            <div className="absolute top-6 left-6 pointer-events-auto"><span className="px-3 py-1 bg-black/60 backdrop-blur-md rounded-full text-white font-black text-[10px] items-center italic border border-white/10 uppercase">{currentVideo.tool}</span></div>
            <div className="absolute top-6 right-6 pointer-events-auto"><button onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }} className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center text-white">{isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}</button></div>
            {!isPlaying && <div className="absolute inset-0 flex items-center justify-center"><div className="w-16 h-16 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/20"><Play className="w-8 h-8 text-white fill-white ml-2" /></div></div>}
            <div className="absolute right-4 bottom-32 flex flex-col gap-6 items-center pointer-events-auto" onClick={e => e.stopPropagation()}>
              <button onClick={() => toggleLike(currentVideo.id)} className="flex flex-col items-center gap-1">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${isLiked ? 'bg-red-500/20 border-red-500' : 'bg-black/60 border-white/20'}`}><Heart className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} /></div>
                <span className="text-[10px] font-bold text-white">{(currentVideo.likes + (isLiked ? 1 : 0)).toLocaleString()}</span>
              </button>
              <button className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-white" /></button>
              <button className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center"><Share2 className="w-5 h-5 text-white" /></button>
            </div>
            <div className="absolute bottom-24 left-6 right-20">
              <div className="flex items-center gap-2 mb-3"><div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">AI</div><span className="text-sm font-bold text-white">{currentVideo.creator}</span></div>
              <h3 className="text-2xl font-black text-white leading-tight mb-2">{currentVideo.title}</h3>
              <p className="text-xs text-white/80 line-clamp-2 max-w-xs">{currentVideo.tool} 툴로 제작된 고화질 AI 영상입니다.</p>
            </div>
            <div className="absolute bottom-6 left-6 right-6 pointer-events-auto" onClick={e => e.stopPropagation()}><Button onClick={() => onVideoClick(currentVideo)} className="w-full h-14 bg-white/10 hover:bg-white/20 backdrop-blur-xl text-white font-black rounded-2xl text-lg border border-white/40">상세 보기 ₩{currentVideo.price.toLocaleString()}</Button></div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 🖥️ Desktop */}
      <div className="desktop-feed-container min-h-screen p-8 lg:p-12">
        <div className="desktop-grid-wrapper">
          <div className="desktop-header">
            <h2 className="desktop-title">Discovery <span className="beta-tag">Beta</span></h2>
            <span className="video-count">{videos.length} VIDEOS</span>
          </div>
          <div className="desktop-grid">
            {videos.map(v => <DesktopCard key={v.id} video={v} onVideoClick={onVideoClick} />)}
          </div>
        </div>
      </div>

      <style>{`
        .discovery-feed-wrapper { position: relative; overflow: hidden; }
        .mobile-feed-container { 
          display: block; 
          position: relative; 
          height: 100%; 
          width: 100%; 
          background: #000;
          touch-action: none !important; 
        }
        .desktop-feed-container { 
          display: none; 
          height: 100%; 
          overflow-y: auto; 
          background: #050505;
        }
        @media (min-width: 768px) { 
          .mobile-feed-container { display: none; } 
          .desktop-feed-container { display: block; } 
          .discovery-feed-wrapper { overflow: visible; }
        }
        .vjs-fixed-container { position: absolute; inset: 0; background: #000; overflow: hidden; }
        .video-js.vjs-fill { width: 100% !important; height: 100% !important; }
        .vjs-tech { object-fit: cover !important; }
        .bottom-gradient-overlay { position: absolute; inset: 0; background: linear-gradient(to bottom, transparent 60%, rgba(0,0,0,0.9) 100%); pointer-events: none; z-index: 10; }
        .full-vjs-container { position: absolute; inset: 0; width: 100%; height: 100%; }
        .desktop-grid-wrapper { max-width: 1400px; margin: 0 auto; padding-bottom: 100px; }
        .desktop-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px; }
        .desktop-title { font-size: 2rem; font-weight: 900; color: white; text-transform: uppercase; font-style: italic; }
        .beta-tag { color: #6366f1; font-size: 0.7rem; vertical-align: top; margin-left: 4px; }
        .video-count { color: rgba(255,255,255,0.4); font-size: 0.8rem; font-weight: bold; }
        
        .desktop-grid { 
          display: grid !important; 
          grid-template-columns: repeat(2, 1fr) !important;
          gap: 32px !important; 
          width: 100% !important;
        }
        @media (min-width: 1024px) { .desktop-grid { grid-template-columns: repeat(3, 1fr) !important; } }
        @media (min-width: 1440px) { .desktop-grid { grid-template-columns: repeat(4, 1fr) !important; } }

        .desktop-card-outer { position: relative; width: 100%; aspect-ratio: 9/16; border-radius: 1.5rem; overflow: hidden; background: #111; border: 1px solid #222; cursor: pointer; transition: all 0.4s ease; }
        .desktop-card-outer:hover { transform: translateY(-8px); border-color: #444; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
        .card-thumbnail { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: opacity 0.3s; }
        .card-video-container { position: absolute; inset: 0; z-index: 5; }
        .card-overlay { position: absolute; inset: 0; background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 60%); z-index: 10; }
        .card-content { position: absolute; inset: 0; padding: 20px; display: flex; flex-direction: column; justify-content: flex-end; z-index: 20; }
        .card-title { font-size: 1.1rem; font-weight: 800; color: white; margin-bottom: 2px; }
        .card-creator { font-size: 0.7rem; color: #aaa; margin-bottom: 12px; }
        .card-footer { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #222; padding-top: 12px; }
        .card-price { font-size: 0.8rem; font-weight: 800; color: white; }
        .card-icons { display: flex; gap: 8px; color: #666; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
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
    let p: any = null;
    if (isHovered && videoRef.current) {
      p = videojs(videoRef.current, { 
        autoplay: true, 
        controls: false, 
        loop: true, 
        muted: true, 
        fill: true, 
        responsive: true,
        playsinline: true, 
        crossOrigin: 'anonymous' 
      });
      
      const setupPlayer = () => {
        if (!p) return;
        p.src({ 
          src: video.videoUrl, 
          type: video.videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4' 
        });
        p.one('loadedmetadata', () => { 
          if (!p) return;
          p.currentTime(video.highlightStart || 0); 
          p.play().catch(() => {}); 
        });
      };

      p.ready(setupPlayer);
      playerRef.current = p;
    }
    
    return () => {
      if (p) {
        p.dispose();
        if (playerRef.current === p) playerRef.current = null;
      }
    };
  }, [isHovered, video.videoUrl, video.highlightStart]);


  return (
    <motion.div onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} onClick={() => onVideoClick(video)} className="desktop-card-outer">
      <img src={video.thumbnail} className="card-thumbnail" style={{ opacity: isHovered ? 0 : 1 }} />
      {isHovered && <div className="card-video-container"><div className="full-vjs-container"><video ref={videoRef} className="video-js vjs-fill" /></div></div>}
      <div className="card-overlay" /><div className="card-content"><div className="card-tag"><span style={{fontSize:'8px', background:'rgba(255,255,255,0.1)', padding:'2px 6px', borderRadius:'4px', color:'#888'}}>{video.tool}</span></div><h3 className="card-title">{video.title}</h3><p className="card-creator">{video.creator}</p><div className="card-footer"><span className="card-price">₩{video.price.toLocaleString()}</span><div className="card-icons"><Heart className="w-4 h-4" /><ShoppingCart className="w-4 h-4" /></div></div></div>
    </motion.div>
  );
}
