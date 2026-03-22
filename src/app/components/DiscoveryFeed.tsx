import { useState, useRef, useEffect } from "react";
import { Heart, Share2, ShoppingCart, Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);

  const currentVideo = videos[currentIndex];

  useEffect(() => {
    if (videoRef.current && currentVideo) {
      const start = currentVideo.highlightStart || 0;
      // 영상이 바뀔 때 하이라이트 시작 지점으로 이동
      videoRef.current.currentTime = start;
      const playPromise = videoRef.current.play();
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          console.log("Autoplay prevented or failed", err);
        });
      }
    }
  }, [currentIndex, currentVideo]);

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
        setErrorMsg(error.message || String(error));
      } finally {
        setLoading(false);
      }
    }

    fetchVideos();
  }, []);

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

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (!currentVideo) return;
    const start = currentVideo.highlightStart || 0;
    const end = currentVideo.highlightEnd || 15;

    if (video.currentTime >= end) {
      video.currentTime = start;
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
      {/* Mobile: Consistent 16:9 + Details Layout */}
      <div 
        ref={containerRef}
        className="md:hidden relative h-full w-full flex flex-col"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentVideo.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex-1 flex flex-col min-h-0"
          >
            {/* Top Fixed Video Container (Strictly 16:9) */}
            <div className="relative w-full overflow-hidden bg-black shrink-0 shadow-2xl z-20" style={{ aspectRatio: '16/9' }}>
              {currentVideo.videoUrl ? (
                <video
                  ref={videoRef}
                  src={currentVideo.videoUrl}
                  poster={currentVideo.thumbnail}
                  className="w-full h-full object-contain"
                  autoPlay
                  loop
                  muted={isMuted}
                  playsInline
                  onTimeUpdate={handleTimeUpdate}
                />
              ) : (
                <img src={currentVideo.thumbnail} className="w-full h-full object-contain" alt="" />
              )}
              
              <div className="absolute top-4 left-4 z-30">
                <span className="px-2 py-1 bg-black/60 backdrop-blur-md rounded text-white font-black text-[10px] tracking-widest border border-white/10">
                  {currentVideo.tool.toUpperCase()}
                </span>
              </div>

              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="absolute bottom-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md border border-white/10 flex items-center justify-center text-white z-30"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>

            {/* Bottom Scrollable Details Section */}
            <div className="flex-1 overflow-y-auto bg-[#050505] p-6 pb-24 z-10">
              <div className="flex justify-between items-start mb-8">
                <div className="flex-1 pr-4">
                  <h3 className="text-2xl font-black text-white mb-2 leading-tight">{currentVideo.title}</h3>
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center text-[8px] font-bold text-white">AI</div>
                    <span className="text-sm font-bold text-gray-400">{currentVideo.creator}</span>
                  </div>
                </div>
                
                <div className="flex flex-col gap-6 items-center">
                  <button onClick={() => toggleLike(currentVideo.id)} className="flex flex-col items-center gap-1">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${isLiked ? 'bg-red-500/20 border-red-500 ring-4 ring-red-500/10' : 'bg-white/5 border-white/10'}`}>
                      <Heart className={`w-6 h-6 ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">{(currentVideo.likes + (isLiked ? 1 : 0)).toLocaleString()}</span>
                  </button>
                  <button className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <ShoppingCart className="w-5 h-5 text-gray-400" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">담기</span>
                  </button>
                  <button className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                      <Share2 className="w-5 h-5 text-gray-400" />
                    </div>
                    <span className="text-[10px] font-bold text-gray-500">공유</span>
                  </button>
                </div>
              </div>

              <div className="bg-white/5 p-5 rounded-2xl border border-white/5 mb-8">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <p className="text-[10px] text-indigo-400 font-black mb-1">STANDARD LICENSE</p>
                    <p className="text-2xl font-black text-white">₩{currentVideo.price.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-gray-500 font-bold mb-1">DURATION</p>
                    <p className="text-lg font-bold text-white">{currentVideo.duration}</p>
                  </div>
                </div>
                <div className="flex gap-4 border-t border-white/5 pt-4">
                  <div className="text-[10px] text-gray-400 font-bold bg-white/5 px-2 py-1 rounded">TOOL: {currentVideo.tool}</div>
                  <div className="text-[10px] text-gray-400 font-bold bg-white/5 px-2 py-1 rounded">RES: 4K</div>
                </div>
              </div>

              <p className="text-sm text-gray-400 mb-8 leading-relaxed">
                본 영상은 영화적 연출이 돋보이는 고화질 AI 영상입니다. 상업적 용도로 사용 가능하며, {currentVideo.tool} 툴로 제작되었습니다.
              </p>

              <Button 
                onClick={() => onVideoClick(currentVideo)}
                className="w-full h-14 bg-gradient-to-r from-indigo-500 to-purple-600 font-black rounded-xl text-lg shadow-lg shadow-indigo-500/20"
              >
                상세 보기 및 구매하기
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Desktop View (Basic Grid) */}
      <div className="hidden md:block h-full overflow-y-auto p-8 max-w-7xl mx-auto">
        <h2 className="text-3xl font-black mb-8 text-white">AI 영상 탐색</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {videos.map(video => (
            <div key={video.id} onClick={() => onVideoClick(video)} className="bg-[#111] rounded-2xl overflow-hidden border border-white/10 hover:border-indigo-500/50 transition-all cursor-pointer group">
              <div className="aspect-video relative overflow-hidden">
                <img src={video.thumbnail} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <div className="absolute bottom-4 left-4 right-4 text-white">
                  <p className="text-sm font-black mb-1 line-clamp-1">{video.title}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase">{video.creator}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
