import { useState, useRef, useEffect, memo, useCallback } from "react";
import { Heart, Share2, ShoppingCart, Volume2, VolumeX, Loader2, Play, MessageSquare, ChevronRight, ExternalLink } from "lucide-react";
import { motion } from "motion/react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";

interface Ad {
  id: string;
  title: string;
  advertiser: string;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  link_url: string;
  cta_text: string;
  interval_count: number;
}

type FeedItem =
  | ({ kind: "video" } & Video)
  | ({ kind: "ad" } & Ad);

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

// 📢 Ad Card Component
const AdCard = memo(({ ad, onImpression }: { ad: Ad; onImpression: (id: string) => void }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const impressionTracked = useRef(false);

  useEffect(() => {
    if (!cardRef.current || impressionTracked.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionTracked.current) {
          impressionTracked.current = true;
          onImpression(ad.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [ad.id, onImpression]);

  const handleClick = async () => {
    try {
      await supabase.rpc("increment_ad_clicks", { ad_id: ad.id }).catch(() => {});
    } catch {}
    window.open(ad.link_url, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      ref={cardRef}
      className="discovery-section relative overflow-hidden cursor-pointer group"
      onClick={handleClick}
    >
      {/* 배경 이미지 */}
      {ad.image_url && (
        <img
          src={ad.image_url}
          alt={ad.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      {/* 그라디언트 오버레이 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/10" />

      {/* 광고 배지 */}
      <div className="absolute top-3 left-3 z-10 px-2 py-0.5 bg-black/50 backdrop-blur-sm border border-white/20 rounded-full text-[10px] font-bold text-white/70 tracking-widest">
        AD
      </div>

      {/* 콘텐츠 */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-4">
        {ad.advertiser && (
          <p className="text-xs text-white/60 font-medium mb-1">{ad.advertiser}</p>
        )}
        <p className="text-white font-bold text-base leading-snug mb-3">{ad.title}</p>
        <button
          className="flex items-center gap-1.5 px-4 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-white/90 transition-colors"
          onClick={handleClick}
        >
          {ad.cta_text}
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
});

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

  // Effect 1: 플레이어 생성/삭제 — video 소스가 바뀔 때만 (isActive 제외!)
  // isActive를 deps에 넣으면 dispose()가 <video> DOM을 제거해 videoRef가 죽은 요소를 참조하게 됨
  useEffect(() => {
    if (!videoRef.current || !video.videoUrl) return;

    setIsPlaying(false);

    const player = videojs(videoRef.current, {
      autoplay: false,
      controls: false,
      loop: true,
      muted: true,
      fill: true,
      responsive: true,
      playsinline: true,
      preload: "metadata",
      crossOrigin: 'anonymous',
      sources: [{
        src: video.videoUrl,
        type: video.videoUrl.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
      }]
    });

    playerRef.current = player;
    player.muted(isMuted);

    player.on('playing', () => setIsPlaying(true));
    player.on('pause',   () => setIsPlaying(false));
    player.on('waiting', () => setIsPlaying(false));
    player.on('ended',   () => setIsPlaying(false));
    player.on('error',   () => {
      setIsPlaying(false);
      const err = player.error();
      if (err && (err.code === 4 || err.code === 2)) setHasError(true);
    });

    player.on('timeupdate', () => {
      const s = video.highlightStart || 0;
      let e = video.highlightEnd || 15;
      const d = player.duration();
      if (typeof d === 'number' && d > 0 && e > d) e = d;
      const t = player.currentTime();
      if (typeof t === 'number' && t >= e) {
        player.currentTime(s);
        player.play()?.catch(() => {});
      }
    });

    return () => {
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [video.id, video.videoUrl]); // ← isActive 없음

  // Effect 2: 활성/비활성 전환 — 플레이어 재생성 없이 재생/정지만
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;

    if (isActive) {
      setIsPlaying(false); // 버퍼링 중 썸네일 표시
      player.currentTime(video.highlightStart || 0);
      player.muted(isMuted);
      player.play().catch(() => {
        player.muted(true);
        player.play().catch(() => {});
      });
    } else {
      player.pause();
      player.currentTime(video.highlightStart || 0);
    }
  }, [isActive]);

  // Effect 3: 뮤트 상태 반영
  useEffect(() => {
    if (playerRef.current && !playerRef.current.isDisposed()) {
      playerRef.current.muted(isMuted);
    }
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
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 z-[15] pointer-events-none ${isPlaying ? 'opacity-0' : 'opacity-100'}`}
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
              // 🖐️ 클릭 시 현재 영상이 활성 상태가 아니면 활성화를 먼저 유도 (부모에게 전달 등의 로직이 필요할 수 있으나 현재는 상태 유지 위주)
              if (!isActive) return; 

              if (playerRef.current.paused()) playerRef.current.play();
              else playerRef.current.pause();
            }
          }}
        />

        {/* 🚀 Floating Icons Overlay on Video (Right Side) */}
        <div className="absolute right-3 bottom-6 z-30 flex flex-col gap-3 items-center pointer-events-auto">
          <button onClick={(e) => { e.stopPropagation(); onToggleLike(video.id, isLiked); }} className="flex flex-col items-center">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center backdrop-blur-md border transition-all ${isLiked ? 'bg-red-500/20 border-red-500' : 'bg-black/20 border-white/20'}`}>
              <Heart className={`w-[18px] h-[18px] ${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
            </div>
            <span className="text-[8px] font-bold text-white mt-0.5 drop-shadow-md">{video.likes.toLocaleString()}</span>
          </button>

          <button className="flex flex-col items-center">
            <div className="w-9 h-9 rounded-full bg-black/20 backdrop-blur-md border border-white/20 flex items-center justify-center">
              <MessageSquare className="w-[18px] h-[18px] text-white" />
            </div>
            <span className="text-[8px] font-bold text-white mt-0.5 drop-shadow-md">0</span>
          </button>
        </div>

        {/* UI Overlay Labels */}
        <div className="absolute top-3 left-3 z-30 pointer-events-none">
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
  const [ads, setAds] = useState<Ad[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [likedVideos, setLikedVideos] = useState<Set<string>>(new Set());
  const [isMuted, setIsMuted] = useState(true);
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch initial data (videos + ads in parallel)
  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [videoResult, adResult] = await Promise.all([
          supabase.from("videos").select("*").order("created_at", { ascending: false }).limit(20),
          supabase.from("ads").select("id,title,advertiser,image_url,video_url,thumbnail_url,link_url,cta_text,interval_count")
            .eq("is_active", true)
            .or("starts_at.is.null,starts_at.lte." + new Date().toISOString())
            .or("ends_at.is.null,ends_at.gte." + new Date().toISOString()),
        ]);

        if (videoResult.error) throw videoResult.error;

        if (videoResult.data) {
          const formatted = videoResult.data.map((item: any) => ({
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

        if (adResult.data && adResult.data.length > 0) {
          setAds(adResult.data as Ad[]);
        }
      } catch (error) {
        console.error("Error fetching discovery data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [user?.id]);

  // 노출 트래킹
  const handleAdImpression = useCallback(async (adId: string) => {
    await supabase.rpc("increment_ad_impressions", { ad_id: adId }).catch(() => {});
  }, []);

  // 영상 목록에 광고를 interval_count마다 삽입하여 피드 아이템 배열 생성
  const feedItems = (() => {
    if (ads.length === 0) return videos.map(v => ({ kind: "video" as const, ...v }));
    const interval = ads[0].interval_count || 4;
    const result: FeedItem[] = [];
    let adIdx = 0;
    videos.forEach((v, i) => {
      result.push({ kind: "video", ...v });
      if ((i + 1) % interval === 0 && ads.length > 0) {
        result.push({ kind: "ad", ...ads[adIdx % ads.length] });
        adIdx++;
      }
    });
    return result;
  })();

  // Scroll-based active video detection — finds the card whose top is closest to container top
  useEffect(() => {
    const container = containerRef.current;
    if (!container || videos.length === 0) return;

    let rafId: number | null = null;

    const detectActive = () => {
      const sections = container.querySelectorAll<HTMLElement>(".discovery-section");
      if (sections.length === 0) return;

      const containerTop = container.getBoundingClientRect().top;
      let bestId: string | null = null;
      let bestDist = Infinity;

      sections.forEach(el => {
        const dist = Math.abs(el.getBoundingClientRect().top - containerTop);
        if (dist < bestDist) {
          bestDist = dist;
          bestId = el.getAttribute("data-video-id");
        }
      });

      if (bestId) {
        setActiveId(prev => (prev !== bestId ? bestId : prev));
      }
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        detectActive();
        rafId = null;
      });
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    // Set initial active on mount
    detectActive();

    return () => {
      container.removeEventListener("scroll", onScroll);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
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

  if (loading) return <div className="h-full flex items-center justify-center bg-background"><Loader2 className="w-10 h-10 text-[#6366f1] animate-spin" /></div>;
  if (videos.length === 0) return <div className="h-full flex items-center justify-center bg-background text-muted-foreground">표시할 영상이 없습니다.</div>;

  return (
    <div className="discovery-feed-wrapper h-full w-full bg-gray-50 overflow-hidden flex flex-col">
      <div
        ref={containerRef}
        className="mobile-feed-container h-full overflow-y-auto snap-y snap-mandatory custom-scrollbar"
      >
        {feedItems.map((item) => (
          <div
            key={item.kind === "video" ? item.id : `ad-${item.id}`}
            className="discovery-section-wrapper"
          >
            {item.kind === "ad" ? (
              <AdCard ad={item} onImpression={handleAdImpression} />
            ) : (
              <MovieSection
                video={item}
                isActive={item.id === activeId}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted(!isMuted)}
                onVideoClick={onVideoClick}
                isLiked={likedVideos.has(item.id)}
                onToggleLike={toggleLike}
              />
            )}
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
          height: calc(100dvh - 136px);
          overflow-y: auto;
          scroll-snap-type: y mandatory;
          -webkit-overflow-scrolling: touch;
          background: #f3f4f6; /* bg-gray-100 */
        }
        .discovery-section-wrapper {
          height: calc(50% - 6px) !important;
          scroll-snap-align: start;
          padding: 6px 0; /* 위아래 6px씩 합쳐서 12px 여백 생성 */
          box-sizing: border-box;
          background: #f3f4f6;
        }
        .discovery-section {
          height: 100%;
          background: white;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
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
