import { useState, useRef, useEffect, memo } from "react";
import { Heart, Share2, ShoppingCart, Volume2, VolumeX, Loader2, Play, MessageSquare, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

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
  onSignInClick?: () => void;
}

// 🎬 Movie Section Component (2 per screen)
const MovieSection = memo(({ 
  video, 
  isActive, 
  isMuted, 
  onToggleMute, 
  onVideoClick, 
  isLiked, 
  onToggleLike 
}: { 
  video: Video; 
  isActive: boolean; 
  isMuted: boolean; 
  onToggleMute: () => void;
  onVideoClick: (video: Video) => void;
  isLiked: boolean;
  onToggleLike: (id: string, currentlyLiked: boolean) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!videoRef.current) return;

    const player = videojs(videoRef.current, {
      autoplay: false,
      controls: false,
      loop: true,
      muted: isMuted,
      fill: true,
      responsive: true,
      playsinline: true,
      preload: "auto",
      crossOrigin: 'anonymous',
      sources: [{
        src: video.videoUrl,
        type: video.videoUrl?.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
      }]
    });

    player.on('play', () => setIsPlaying(true));
    player.on('pause', () => setIsPlaying(false));
    player.on('error', () => {
      const err = player.error();
      if (err && (err.code === 4 || err.code === 2)) setHasError(true);
    });

    player.on('timeupdate', () => {
      const s = video.highlightStart || 0;
      let e = video.highlightEnd || 15;
      const d = player.duration();
      if (typeof d === 'number' && d > 0 && e > d) e = d;
      const currentTime = player.currentTime();
      if (typeof currentTime === 'number' && currentTime >= e) {
        player.currentTime(s);
        player.play()?.catch(() => {});
      }
    });

    playerRef.current = player;

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [video.id]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player) return;

    if (isActive) {
      player.muted(isMuted);
      if (player.readyState() >= 1) {
        player.currentTime(video.highlightStart || 0);
      } else {
        player.one('loadedmetadata', () => {
          player.currentTime(video.highlightStart || 0);
        });
      }
      player.play().catch(() => {});
    } else {
      player.pause();
    }
  }, [isActive, video.highlightStart]);

  useEffect(() => {
    if (playerRef.current) playerRef.current.muted(isMuted);
  }, [isMuted]);

  return (
    <div 
      className="discovery-section snap-start w-full flex flex-col bg-white overflow-hidden shadow-sm"
      data-video-id={video.id}
    >
      {/* 🎬 Video Area (70% height for maximum impact) */}
      <div className="relative w-full h-[70%] bg-black overflow-hidden group border-b border-white/10">
        <img 
          src={video.thumbnail} 
          alt="" 
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 z-0 ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
        />
        
        <div className="relative w-full h-full z-10 pointer-events-none">
          <video 
            ref={videoRef} 
            className="video-js vjs-big-play-centered w-full h-full" 
            playsInline 
            poster={video.thumbnail}
          />
          {hasError && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm p-4 text-center pointer-events-auto">
              <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin mb-2" />
              <p className="text-white text-xs">영상 처리 중...</p>
            </div>
          )}
        </div>

        {/* Playback Control Overlay */}
        <div 
          className="absolute inset-0 z-20 cursor-pointer pointer-events-auto"
          onClick={() => {
            if (playerRef.current) {
              if (playerRef.current.paused()) playerRef.current.play();
              else playerRef.current.pause();
            }
          }}
        />

        {/* 🚀 Floating Icons Overlay on Video (Right Side) */}
        <div className="absolute right-3 bottom-6 z-30 flex flex-col gap-3 items-center pointer-events-auto">
          <button onClick={(e) => { e.stopPropagation(); onToggleLike(video.id, isLiked); }} className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${isLiked ? 'bg-red-500/20 border-red-500' : 'bg-black/20 border-white/20'}`}>
              <Heart className={`w-4.5 h-4.5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
            </div>
            <span className="text-[8px] font-bold text-white mt-0.5 drop-shadow-md">{video.likes.toLocaleString()}</span>
          </button>
          
          <button className="flex flex-col items-center">
            <div className="w-9 h-9 rounded-full bg-black/20 backdrop-blur-md border border-white/20 flex items-center justify-center">
              <MessageSquare className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="text-[8px] font-bold text-white mt-0.5 drop-shadow-md">0</span>
          </button>
        </div>

        {/* UI Overlay Labels */}
        <div className="absolute top-3 left-3 z-25 pointer-events-none">
          <span className="px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-white font-bold text-[8px] border border-white/10 uppercase tracking-tighter">
            {video.tool}
          </span>
        </div>

        <button 
          onClick={(e) => { e.stopPropagation(); onToggleMute(); }} 
          className="absolute top-3 right-3 z-30 w-7 h-7 rounded-full bg-black/40 backdrop-blur-md border border-white/20 flex items-center justify-center text-white pointer-events-auto"
        >
          {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
        </button>

        {!isPlaying && isActive && !hasError && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/20">
              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
            </div>
          </div>
        )}
      </div>

      {/* 📄 Info Area (30% height - Slim and clean) */}
      <div className="h-[30%] p-2.5 flex flex-col justify-between bg-white">
        <div>
          <div className="flex justify-between items-center bg-gray-50/50 p-1 rounded-md border border-gray-100/50">
            <h3 className="text-xs font-bold text-gray-900 leading-tight line-clamp-1 flex-1 px-1">{video.title}</h3>
            <div className="flex items-center gap-1 ml-2 shrink-0 pr-1">
               <div className="w-3 h-3 rounded-full bg-indigo-100 flex items-center justify-center text-[6px] font-bold text-indigo-600">AI</div>
               <span className="text-[9px] font-semibold text-gray-400">{video.creator}</span>
            </div>
          </div>
          <p className="text-[9px] text-gray-400 line-clamp-1 mt-1.5 px-1 font-medium italic opacity-80">🎬 AI Cinematic Film Series</p>
        </div>

        <div className="flex items-center justify-between px-1 pb-1">
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <span className="text-[7px] text-gray-400 font-bold uppercase tracking-tight leading-none mb-0.5">PREMIUM</span>
              <span className="text-xs font-black text-red-600">₩{video.price.toLocaleString()}</span>
            </div>
            <div className="h-4 w-[1px] bg-gray-100 ml-1" />
            <div className="flex items-center gap-2 ml-1">
              <Share2 className="w-3.5 h-3.5 text-gray-300 hover:text-gray-700 transition-colors" />
              <ShoppingCart className="w-3.5 h-3.5 text-gray-300 hover:text-gray-700 transition-colors" />
            </div>
          </div>
          
          <Button 
            onClick={(e) => { e.stopPropagation(); onVideoClick(video); }} 
            className="h-7 px-3 bg-gray-900 hover:bg-black text-white font-bold rounded-md text-[10px] transition-all shadow-sm"
          >
            영화 상세 <ChevronRight className="w-2.5 h-2.5 ml-0.5" />
          </Button>
        </div>
      </div>
    </div>
  );
});

MovieSection.displayName = "MovieSection";

export function DiscoveryFeed({ onVideoClick, onSignInClick }: DiscoveryFeedProps) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(true);
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const { data: videoData, error: videoError } = await supabase
          .from("videos")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20);

        if (videoError) throw videoError;

        if (videoData) {
          const formatted = videoData.map((item: any) => ({
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
          setVideos(formatted);
          if (formatted.length > 0) setActiveId(formatted[0].id);

          if (user) {
            const { data: likesData } = await supabase
              .from("video_likes")
              .select("video_id")
              .eq("user_id", user.id);
            if (likesData) setLikedVideos(new Set(likesData.map(l => l.video_id)));
          }
        }
      } catch (error) {
        console.error("Error fetching discovery data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user?.id]);

  // Intersection Observer to detect the most prominent top video
  useEffect(() => {
    if (!containerRef.current || videos.length === 0) return;

    const observer = new IntersectionObserver((entries) => {
      let targetId: string | null = null;
      let maxRatio = 0;

      entries.forEach(entry => {
        if (entry.isIntersecting) {
          if (entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            targetId = entry.target.getAttribute("data-video-id");
          }
        }
      });

      if (targetId) {
        setActiveId(prev => (prev !== targetId ? targetId : prev));
      }
    }, { 
      threshold: [0.1, 0.3, 0.5, 0.7, 0.9],
      rootMargin: "0px 0px -60% 0px"
    });

    const elements = containerRef.current.querySelectorAll(".discovery-section");
    elements.forEach(el => observer.observe(el));

    return () => observer.disconnect();
  }, [videos]);

  const toggleLike = async (videoId: string, currentlyLiked: boolean) => {
    if (!user) {
      if (onSignInClick) onSignInClick();
      return;
    }

    setLikedVideos(prev => {
      const n = new Set(prev);
      currentlyLiked ? n.delete(videoId) : n.add(videoId);
      return n;
    });

    setVideos(prev => prev.map(v => 
      v.id === videoId ? { ...v, likes: v.likes + (currentlyLiked ? -1 : 1) } : v
    ));

    try {
      if (currentlyLiked) {
        await supabase.from("video_likes").delete().match({ video_id: videoId, user_id: user.id });
      } else {
        await supabase.from("video_likes").insert({ video_id: videoId, user_id: user.id });
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center bg-white"><Loader2 className="w-10 h-10 text-indigo-500 animate-spin" /></div>;
  if (videos.length === 0) return <div className="h-full flex items-center justify-center bg-white text-gray-500">표시할 영상이 없습니다.</div>;

  return (
    <div className="discovery-feed-wrapper h-full w-full bg-gray-50 overflow-hidden flex flex-col">
      <div 
        ref={containerRef}
        className="mobile-feed-container h-full overflow-y-auto snap-y snap-mandatory custom-scrollbar"
      >
        {videos.map((video) => (
          <div key={video.id} className="discovery-section-wrapper h-full">
             <MovieSection 
                video={video} 
                isActive={video.id === activeId}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted(!isMuted)}
                onVideoClick={onVideoClick}
                isLiked={likedVideos.has(video.id)}
                onToggleLike={toggleLike}
              />
          </div>
        ))}
        <div className="py-20 text-center text-gray-300 text-[10px] font-bold">END OF FEED</div>
      </div>

      <div className="desktop-feed-container min-h-screen p-8 lg:p-12 overflow-y-auto">
        <div className="desktop-grid-wrapper max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">DISCOVERY <span className="text-indigo-600">FILMS</span></h2>
            <span className="px-3 py-1 bg-gray-100 rounded-full text-[10px] font-bold text-gray-500 uppercase">{videos.length} VIDEOS</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {videos.map(v => (
              <DesktopMovieCard 
                key={v.id} 
                video={v} 
                onVideoClick={onVideoClick} 
                isLiked={likedVideos.has(v.id)} 
                onToggleLike={toggleLike} 
              />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .mobile-feed-container { 
          display: block; 
          height: calc(100dvh - 130px); 
          overflow-y: auto; 
          snap-y snap-mandatory;
          -webkit-overflow-scrolling: touch; 
        }
        .discovery-section-wrapper {
          height: 50%;
          scroll-snap-align: start;
        }
        .discovery-section {
          height: 100%;
        }
        .desktop-feed-container { display: none; background: #fff; }
        @media (min-width: 1024px) { 
          .mobile-feed-container { display: none; } 
          .desktop-feed-container { display: block; } 
        }
        .custom-scrollbar::-webkit-scrollbar { width: 0px; }
        .video-js.vjs-fill { width: 100% !important; height: 100% !important; }
        .vjs-tech { object-fit: contain !important; } 
      `}</style>
    </div>
  );
}

function DesktopMovieCard({ video, onVideoClick, isLiked, onToggleLike }: { video: Video; onVideoClick: (video: Video) => void; isLiked: boolean; onToggleLike: (id: string, currentlyLiked: boolean) => void }) {
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);

  useEffect(() => {
    let p: any = null;
    if (isHovered && videoRef.current) {
      p = videojs(videoRef.current, { 
        autoplay: true, controls: false, loop: true, muted: true, fill: true, responsive: true, playsinline: true, crossOrigin: 'anonymous' 
      });
      p.ready(() => {
        if (!p) return;
        p.src({ src: video.videoUrl, type: video.videoUrl?.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4' });
        p.one('loadedmetadata', () => { if (!p) return; p.currentTime(video.highlightStart || 0); p.play().catch(() => {}); });
      });
      playerRef.current = p;
    }
    return () => { if (p) { p.dispose(); if (playerRef.current === p) playerRef.current = null; } };
  }, [isHovered, video.videoUrl, video.highlightStart]);

  return (
    <motion.div 
      onMouseEnter={() => setIsHovered(true)} 
      onMouseLeave={() => setIsHovered(false)} 
      onClick={() => onVideoClick(video)} 
      className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 cursor-pointer group"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        <img src={video.thumbnail} className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${isHovered ? 'opacity-0' : 'opacity-100'}`} />
        {isHovered && <video ref={videoRef} className="video-js vjs-fill" />}
        <div className="absolute top-3 left-3 z-10">
          <span className="px-2 py-0.5 bg-black/60 backdrop-blur-md rounded text-white font-bold text-[8px] border border-white/10 uppercase tracking-tighter">
            {video.tool}
          </span>
        </div>
      </div>
      <div className="p-5">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-extrabold text-lg text-gray-900 line-clamp-1 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">{video.title}</h3>
        </div>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold text-gray-400">{video.creator}</span>
        </div>
        <div className="flex items-center justify-between pt-4 border-t border-gray-50">
          <span className="text-lg font-black text-red-600">₩{video.price.toLocaleString()}</span>
          <div className="flex items-center gap-4">
             <button onClick={(e) => { e.stopPropagation(); onToggleLike(video.id, isLiked); }} className="p-2 hover:bg-red-50 rounded-full transition-colors">
              <Heart className={`w-5 h-5 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-300'}`} />
            </button>
            <ShoppingCart className="w-5 h-5 text-gray-300 hover:text-gray-900 transition-colors" />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
