import { useState, useRef, useEffect } from "react";
import { Heart, Share2, ShoppingCart, Volume2, VolumeX, Loader2 } from "lucide-react";
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
  const touchEndY = useRef(0);

  const currentVideo = videos[currentIndex];

  useEffect(() => {
    async function fetchVideos() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10);

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

  // Initialize and update video.js player
  useEffect(() => {
    if (currentVideo?.videoUrl && videoRef.current) {
      console.log("Initializing player for:", currentVideo.title, currentVideo.videoUrl);
      
      // Dispose old player if exists
      if (playerRef.current) {
        playerRef.current.dispose();
      }

      // Initialize new player
      const player = videojs(videoRef.current, {
        autoplay: true,
        controls: false,
        loop: false,
        muted: isMuted,
        fluid: true,
        responsive: true,
        playsinline: true,
        html5: {
          vhs: {
            withCredentials: false
          }
        },
        crossOrigin: 'anonymous'
      });

      player.ready(() => {
        player.src({
          src: currentVideo.videoUrl,
          type: currentVideo.videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
        });

        // Set initial highlight position once metadata is loaded
        player.one('loadedmetadata', () => {
          const duration = player.duration();
          let start = currentVideo.highlightStart || 0;
          
          // If start point is beyond duration, reset to 0
          if (start >= duration) {
            console.warn(`Highlight start (${start}) is beyond duration (${duration}). Resetting to 0.`);
            start = 0;
          }
          
          player.currentTime(start);
          player.play().catch((e: any) => {
            console.error("Autoplay failed:", e);
            // Show play button if needed
          });
        });
      });

      player.on('play', () => setIsPlaying(true));
      player.on('pause', () => setIsPlaying(false));
      player.on('error', () => {
        console.error("Video player error:", player.error());
      });

      // Highlight looping logic
      player.on('timeupdate', () => {
        const start = currentVideo.highlightStart || 0;
        let end = currentVideo.highlightEnd || 15;
        const duration = player.duration();
        
        // Ensure end point doesn't exceed duration
        if (duration > 0 && end > duration) {
          end = duration;
        }

        const currentTime = player.currentTime();
        if (typeof currentTime === 'number' && currentTime >= end) {
          player.currentTime(start);
          player.play().catch(() => {});
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
  }, [currentIndex, currentVideo]);

  // Sync volume state
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = () => {
    const diff = touchStartY.current - touchEndY.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && currentIndex < videos.length - 1) {
        setCurrentIndex(prev => prev + 1);
      } else if (diff < 0 && currentIndex > 0) {
        setCurrentIndex(prev => prev - 1);
      }
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.deltaY > 0 && currentIndex < videos.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else if (e.deltaY < 0 && currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const toggleLike = (videoId: string) => {
    setLikedVideos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(videoId)) {
        newSet.delete(videoId);
      } else {
        newSet.add(videoId);
      }
      return newSet;
    });
  };

  const togglePlay = () => {
    if (playerRef.current) {
      if (playerRef.current.paused()) {
        playerRef.current.play();
      } else {
        playerRef.current.pause();
      }
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#050505]">
        <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
          <Loader2 className="w-10 h-10 text-[#6366f1]" />
        </motion.div>
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
    <div className="h-full w-full bg-[#050505] overflow-hidden">
      {/* Mobile: Full-Screen Immersive Layout */}
      <div 
        className="md:hidden relative h-full w-full bg-black overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
        onClick={togglePlay}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentVideo.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 w-full h-full"
          >
            {/* Full Screen Video Background */}
            <div className="absolute inset-0 w-full h-full video-js-responsive-container">
              <div data-vjs-player>
                <video
                  ref={videoRef}
                  className="video-js vjs-big-play-centered vjs-fill"
                  playsInline
                  poster={currentVideo.thumbnail}
                />
              </div>

              {/* Gradient Overlay for Readability */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/95 pointer-events-none z-10" />
            </div>

            {/* Play/Pause Indicator (Central Overlay) */}
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
                <div className="w-20 h-20 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/20">
                  <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[20px] border-l-white border-b-[10px] border-b-transparent ml-2" />
                </div>
              </div>
            )}

            {/* Top UI Elements */}
            <div className="absolute top-6 left-6 z-30">
              <span className="px-3 py-1 bg-black/40 backdrop-blur-md rounded-full text-white font-black text-[10px] tracking-widest border border-white/10 uppercase italic">
                {currentVideo.tool}
              </span>
            </div>

            <div className="absolute top-6 right-6 flex flex-col gap-3 z-30">
              <button 
                onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                className="w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {/* Right Side Interaction Bar */}
            <div className="absolute right-4 bottom-32 flex flex-col gap-6 items-center z-30" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => toggleLike(currentVideo.id)} className="flex flex-col items-center gap-1 group">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${isLiked ? 'bg-red-500/20 border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.3)]' : 'bg-black/40 border-white/10 group-hover:bg-black/60'}`}>
                  <Heart className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                </div>
                <span className="text-[10px] font-bold text-white drop-shadow-md">{(currentVideo.likes + (isLiked ? 1 : 0)).toLocaleString()}</span>
              </button>
              
              <button className="flex flex-col items-center gap-1 group">
                <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center group-hover:bg-black/60 shadow-lg">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <span className="text-[10px] font-bold text-white drop-shadow-md">담기</span>
              </button>

              <button className="flex flex-col items-center gap-1 group">
                <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center group-hover:bg-black/60 shadow-lg">
                  <Share2 className="w-5 h-5 text-white" />
                </div>
                <span className="text-[10px] font-bold text-white drop-shadow-md">공유</span>
              </button>
            </div>

            {/* Bottom Metadata Info */}
            <div className="absolute bottom-24 left-6 right-20 z-30 pointer-events-none">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white shadow-lg ring-2 ring-indigo-500/20">AI</div>
                <span className="text-sm font-bold text-white drop-shadow-md">{currentVideo.creator}</span>
              </div>
              <h3 className="text-2xl font-black text-white leading-tight drop-shadow-lg mb-2">{currentVideo.title}</h3>
              <p className="text-xs text-white/70 line-clamp-2 drop-shadow-md max-w-xs">
                {currentVideo.tool} 툴로 제작된 영화적 감성의 고화질 AI 영상입니다. 상업적 사용이 가능합니다.
              </p>
            </div>

            {/* Bottom Floating CTA Button */}
            <div className="absolute bottom-6 left-6 right-6 z-30 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
              <Button 
                onClick={() => onVideoClick(currentVideo)}
                className="w-full h-14 bg-white/10 hover:bg-white/20 backdrop-blur-xl text-white font-black rounded-2xl text-lg border border-white/20 shadow-2xl transition-all active:scale-[0.98]"
              >
                상세 보기 ₩{currentVideo.price.toLocaleString()}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Desktop View (Basic Grid) */}
      <style>{`
        .video-js-responsive-container {
          width: 100%;
          height: 100%;
        }
        .video-js.vjs-fill {
          width: 100%;
          height: 100%;
        }
        .vjs-poster {
          background-size: cover;
        }
        video.vjs-tech {
          object-fit: cover;
        }
      `}</style>
    </div>
  );
}
