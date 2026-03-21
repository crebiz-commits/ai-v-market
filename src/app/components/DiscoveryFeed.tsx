import { useState, useRef, useEffect } from "react";
import { Heart, Share2, ShoppingCart, Play, Pause, Volume2, VolumeX, Loader2 } from "lucide-react";
import { motion } from "motion/react";
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

  // 현재 영상이 바뀌면 자동으로 하이라이트 시작점으로 이동 및 재생
  useEffect(() => {
    if (videoRef.current && currentVideo) {
      const start = currentVideo.highlightStart || 0;
      videoRef.current.currentTime = start;
      videoRef.current.play().catch(err => {
        console.log("Autoplay prevented or failed", err);
      });
    }
  }, [currentIndex, currentVideo]);

  // Supabase에서 영상 데이터 가져오기 (주로 숏폼 카테고리)
  useEffect(() => {
    async function fetchVideos() {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("videos")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10);

        if (error) {
          throw error;
        }

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
            highlightEnd: item.highlight_end || 10, // 기본 10초
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

  // 하이라이트 구간 반복 재생 로직
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    const start = currentVideo.highlightStart || 0;
    const end = currentVideo.highlightEnd || 10;

    if (video.currentTime >= end) {
      video.currentTime = start;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-[#6366f1] mx-auto mb-4" />
          <p className="text-white/60">영상을 준비하는 중...</p>
          {errorMsg && <p className="text-red-500 mt-2 text-sm">{errorMsg}</p>}
        </div>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-black">
        <p className="text-white/60">표시할 영상이 없습니다.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile: Vertical Swipe Feed */}
      <div 
        ref={containerRef}
        className="md:hidden relative h-full w-full overflow-hidden bg-black"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onWheel={handleWheel}
      >
        <motion.div
          key={currentVideo.id}
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -100 }}
          transition={{ duration: 0.3 }}
          className="relative h-full w-full"
        >
        {/* Video Container */}
        <div className="relative h-full w-full flex items-center justify-center bg-black">
          {currentVideo.videoUrl ? (
            <video
              ref={videoRef}
              src={currentVideo.videoUrl}
              poster={currentVideo.thumbnail}
              className="h-full w-full object-contain"
              autoPlay
              loop
              muted={isMuted}
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => {
                const start = currentVideo.highlightStart || 0;
                e.currentTarget.currentTime = start;
              }}
            />
          ) : (
            <img 
              src={currentVideo.thumbnail} 
              alt={currentVideo.title}
              className="h-full w-full object-cover"
            />
          )}
          

          {/* Gradient Overlays */}
          <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />
        </div>

        {/* Top Info */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
              <span className="text-white text-sm font-medium">AI</span>
            </div>
            <span className="text-white">{currentVideo.creator}</span>
          </div>
          <div className="px-3 py-1 bg-black/50 backdrop-blur-sm rounded-full text-white text-sm">
            {currentVideo.duration}
          </div>
        </div>

        {/* Bottom Info */}
        <div className="absolute bottom-24 left-6 right-24">
          <h3 className="text-white text-xl mb-2">{currentVideo.title}</h3>
          <div className="flex items-center gap-3 text-white/80 text-sm mb-4">
            <span className="px-2 py-1 bg-[#6366f1]/20 border border-[#6366f1]/40 rounded text-[#6366f1]">
              {currentVideo.tool}
            </span>
            <span>₩{currentVideo.price.toLocaleString()}</span>
          </div>
          <Button 
            onClick={() => onVideoClick(currentVideo)}
            className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c4ee5]"
          >
            상세보기
          </Button>
        </div>

        {/* Right Action Buttons */}
        <div className="absolute right-6 bottom-32 flex flex-col items-center gap-6">
          <button 
            onClick={() => toggleLike(currentVideo.id)}
            className="flex flex-col items-center gap-1"
          >
            <div className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur-sm transition-colors ${
              likedVideos.has(currentVideo.id) 
                ? 'bg-[#ef4444]/20 border-2 border-[#ef4444]' 
                : 'bg-black/30 border border-white/20'
            }`}>
              <Heart 
                className={`w-6 h-6 ${
                  likedVideos.has(currentVideo.id) ? 'fill-[#ef4444] text-[#ef4444]' : 'text-white'
                }`} 
              />
            </div>
            <span className="text-white text-xs">
              {(currentVideo.likes + (likedVideos.has(currentVideo.id) ? 1 : 0)).toLocaleString()}
            </span>
          </button>

          <button className="flex flex-col items-center gap-1">
            <div className="w-14 h-14 rounded-full bg-black/30 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-white" />
            </div>
            <span className="text-white text-xs">담기</span>
          </button>

          <button className="flex flex-col items-center gap-1">
            <div className="w-14 h-14 rounded-full bg-black/30 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              <Share2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-white text-xs">공유</span>
          </button>

          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="flex flex-col items-center gap-1"
          >
            <div className="w-14 h-14 rounded-full bg-black/30 backdrop-blur-sm border border-white/20 flex items-center justify-center">
              {isMuted ? <VolumeX className="w-6 h-6 text-white" /> : <Volume2 className="w-6 h-6 text-white" />}
            </div>
          </button>
        </div>

        {/* Scroll Indicator */}
        <div className="absolute right-1/2 translate-x-1/2 bottom-4 flex flex-col items-center gap-2">
          {videos.map((_, idx) => (
            <div 
              key={idx}
              className={`w-1 h-1 rounded-full transition-all ${
                idx === currentIndex 
                  ? 'bg-white w-1.5 h-1.5' 
                  : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      </motion.div>
      </div>

      {/* Desktop: Grid View */}
      <div className="hidden md:block h-full overflow-y-auto bg-background">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h2 className="text-3xl font-bold mb-2">AI 영상 탐색</h2>
            <p className="text-muted-foreground">AI로 제작된 최신 영상 콘텐츠를 만나보세요</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {videos.map((video) => (
              <motion.div
                key={video.id}
                whileHover={{ scale: 1.02 }}
                transition={{ duration: 0.2 }}
                className="bg-card rounded-xl overflow-hidden border border-border hover:border-[#6366f1] transition-all cursor-pointer group"
                onClick={() => onVideoClick(video)}
              >
                <div className="relative aspect-[9/16] overflow-hidden bg-black">
                  <img 
                    src={video.thumbnail} 
                    alt={video.title}
                    className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  
                  {/* Watermark */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-white/15 text-4xl font-bold rotate-[-30deg]">
                      AI-V-MARKET
                    </div>
                  </div>

                  {/* Gradient Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent" />

                  {/* Duration Badge */}
                  <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 backdrop-blur-sm rounded text-white text-sm">
                    {video.duration}
                  </div>

                  {/* Creator Info */}
                  <div className="absolute top-3 left-3 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                      <span className="text-white text-xs font-medium">AI</span>
                    </div>
                    <span className="text-white text-sm">{video.creator}</span>
                  </div>

                  {/* Bottom Info */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white text-lg font-medium mb-2">{video.title}</h3>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-[#6366f1]/20 border border-[#6366f1]/40 rounded text-[#6366f1] text-xs">
                          {video.tool}
                        </span>
                        <span className="text-white/80 text-sm">₩{video.price.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-1 text-white/80 text-sm">
                        <Heart className={`w-4 h-4 ${likedVideos.has(video.id) ? 'fill-[#ef4444] text-[#ef4444]' : ''}`} />
                        <span>{(video.likes + (likedVideos.has(video.id) ? 1 : 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
