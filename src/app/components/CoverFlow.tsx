import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, X, Play, Pause, Volume2, VolumeX, Maximize } from 'lucide-react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import Player from 'video.js/dist/types/player';

interface Video {
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  videoUrl?: string;
  duration?: string;
  resolution?: string;
  tool?: string;
  price?: number;
  highlightStart?: number;
  highlightEnd?: number;
}

interface CoverFlowProps {
  videos: Video[];
  hideControls?: boolean;
}

export function CoverFlow({ videos, hideControls }: CoverFlowProps) {
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startRotation, setStartRotation] = useState(0);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [selectedLicense, setSelectedLicense] = useState<'standard' | 'commercial' | 'exclusive'>('standard');
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<Player | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRotateTimeoutRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);
  
  const anglePerItem = 360 / videos.length;
  
  // 화면 크기에 따라 반경 조정
  const getRadius = () => {
    if (typeof window === 'undefined') return 250;
    const width = window.innerWidth;
    if (width >= 1536) return 520; // 2xl 이상 - 데스크탑 크기 축소
    if (width >= 1280) return 480; // xl - 데스크탑 크기 축소
    if (width >= 1024) return 400; // lg - 데스크탑 크기 축소
    if (width >= 768) return 350; // md
    return 170; // sm 이하 - 모바일에서 캐러셀 가로 폭 확장
  };

  const [radius, setRadius] = useState(getRadius());

  // rotation 값을 기준으로 실제 중앙에 있는 인덱스 계산
  const getCenterIndex = () => {
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const index = Math.round(normalizedRotation / anglePerItem) % videos.length;
    return index;
  };

  const centerIndex = getCenterIndex();

  useEffect(() => {
    const handleResize = () => {
      setRadius(getRadius());
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Make sure Video.js player is only initialized once per modal open
    if (selectedVideo?.videoUrl && videoRef.current && !playerRef.current) {
      console.log('Initializing video.js player for:', selectedVideo.videoUrl);
      
      const videoElement = videoRef.current;
      const player = videojs(videoElement, {
        autoplay: true,
        controls: false,
        loop: true,
        muted: isMuted,
        fluid: true,
        responsive: true,
        html5: {
          vhs: {
            withCredentials: false
          }
        },
        crossOrigin: 'anonymous'
      });

      player.ready(() => {
        console.log('Player is ready, setting source');
        player.src({
          src: selectedVideo.videoUrl!,
          type: selectedVideo.videoUrl!.includes('.m3u8') ? 'application/x-mpegURL' : 'video/mp4'
        });
      });

      if (player) {
        // 하이라이트 구간 반복 재생 로직 (Video.js)
        player.on('timeupdate', () => {
          const currentVideo = selectedVideo;
          if (!player || !currentVideo) return;
          
          const start = currentVideo.highlightStart || 0;
          const end = currentVideo.highlightEnd || (start + 15);
          
          const currentTime = player.currentTime();
          if (typeof currentTime === 'number' && currentTime >= end) {
            player.currentTime(start);
          }
        });
      }

      playerRef.current = player;
    }

      return () => {
        const player = playerRef.current;
        if (player) {
          console.log('Disposing video.js player');
          player.dispose();
          playerRef.current = null;
        }
      };
  }, [selectedVideo]);

  // Sync volume/muted state with player
  useEffect(() => {
    if (playerRef.current) {
      playerRef.current.muted(isMuted);
    }
  }, [isMuted]);

  useEffect(() => {
    const player = playerRef.current;
    if (player) {
      if (isPlaying) {
        player.play()?.catch(e => console.log('Play failed', e));
      } else {
        player.pause();
      }
    }
  }, [isPlaying]);

  const handlePrev = () => {
    setIsAutoRotating(false);
    setRotation((prev) => prev + anglePerItem);
    // 3초 후 자동 회전 재개
    if (autoRotateTimeoutRef.current) {
      clearTimeout(autoRotateTimeoutRef.current);
    }
    autoRotateTimeoutRef.current = window.setTimeout(() => {
      setIsAutoRotating(true);
    }, 3000);
  };

  const handleNext = () => {
    setIsAutoRotating(false);
    setRotation((prev) => prev - anglePerItem);
    // 3초 후 자동 회전 재개
    if (autoRotateTimeoutRef.current) {
      clearTimeout(autoRotateTimeoutRef.current);
    }
    autoRotateTimeoutRef.current = window.setTimeout(() => {
      setIsAutoRotating(true);
    }, 3000);
  };

  const handleCoverClick = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // 드래그한 경우 클릭 무시
    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }
    
    // 중앙에 있는 아이템을 클릭한 경우 비디오 플레이어 열기
    if (index === centerIndex) {
      setSelectedVideo(videos[index]);
      setIsAutoRotating(false);
      setIsPlaying(true);
      return;
    }
    
    // 그렇지 않으면 해당 아이템으로 회전
    setIsAutoRotating(false);
    const targetRotation = -index * anglePerItem;
    setRotation(targetRotation);
    // 3초 후 자동 회전 재개
    if (autoRotateTimeoutRef.current) {
      clearTimeout(autoRotateTimeoutRef.current);
    }
    autoRotateTimeoutRef.current = window.setTimeout(() => {
      setIsAutoRotating(true);
    }, 3000);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsAutoRotating(false);
    setIsDragging(true);
    setStartX(e.clientX);
    setStartRotation(rotation);
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    hasDraggedRef.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const diff = e.clientX - startX;
    const newRotation = startRotation + (diff / 2);
    setRotation(newRotation);
    if (Math.abs(e.clientX - dragStartPosRef.current.x) > 5 || Math.abs(e.clientY - dragStartPosRef.current.y) > 5) {
      hasDraggedRef.current = true;
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    // 드래그 종료 후 3초 후 자동 회전 재개
    if (autoRotateTimeoutRef.current) {
      clearTimeout(autoRotateTimeoutRef.current);
    }
    autoRotateTimeoutRef.current = window.setTimeout(() => {
      setIsAutoRotating(true);
    }, 3000);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsAutoRotating(false);
    setStartX(e.touches[0].clientX);
    setStartRotation(rotation);
    dragStartPosRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    hasDraggedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const diff = e.touches[0].clientX - startX;
    const newRotation = startRotation + (diff / 2);
    setRotation(newRotation);
    if (Math.abs(e.touches[0].clientX - dragStartPosRef.current.x) > 5 || Math.abs(e.touches[0].clientY - dragStartPosRef.current.y) > 5) {
      hasDraggedRef.current = true;
    }
  };

  const handleTouchEnd = () => {
    // 터치 종료 후 3초 후 자동 회전 재개
    if (autoRotateTimeoutRef.current) {
      clearTimeout(autoRotateTimeoutRef.current);
    }
    autoRotateTimeoutRef.current = window.setTimeout(() => {
      setIsAutoRotating(true);
    }, 3000);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const getTransform = (index: number) => {
    const angle = -index * anglePerItem + rotation;
    const x = radius * Math.sin(angle * Math.PI / 180);
    const z = radius * Math.cos(angle * Math.PI / 180);
    
    return {
      transform: `translate3d(${x}px, 0, ${z}px) rotateY(${angle}deg)`,
      opacity: 1,
      zIndex: 100,
    };
  };

  useEffect(() => {
    const animate = () => {
      if (isAutoRotating) {
        setRotation((prev) => {
          const newRotation = prev - 0.05; // 매 프레임마다 0.05도씩 회전
          // currentIndex 업데이트
          const normalizedRotation = ((-newRotation % 360) + 360) % 360;
          const newIndex = Math.round(normalizedRotation / anglePerItem) % videos.length;
          if (newIndex !== centerIndex) {
            // setCurrentIndex(newIndex);
          }
          return newRotation;
        });
        animationFrameRef.current = requestAnimationFrame(animate);
      }
    };

    if (isAutoRotating) {
      animationFrameRef.current = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isAutoRotating, anglePerItem, centerIndex, videos.length]);

  const handleVideoPlay = () => {
    if (videoRef.current) {
      videoRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleVideoPause = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleVideoMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const handleVideoUnmute = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
  };

  const handleVideoMaximize = () => {
    if (videoRef.current) {
      videoRef.current.requestFullscreen();
    }
  };

  // Calculate price based on selected license
  const getPrice = () => {
    const basePrice = selectedVideo?.price || 29000;
    if (selectedLicense === 'standard') return basePrice;
    if (selectedLicense === 'commercial') return basePrice * 3;
    return basePrice * 8; // exclusive
  };

  return (
    <div className="relative w-full bg-black py-6 md:py-12 lg:py-28">
      {/* Navigation Buttons */}
      {!hideControls && (
        <>
          <button
            onClick={handlePrev}
            className="hidden md:flex absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-[200] w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all items-center justify-center group"
            aria-label="Previous"
          >
            <ChevronLeft className="w-6 h-6 text-white" />
          </button>

          <button
            onClick={handleNext}
            className="hidden md:flex absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-[200] w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all items-center justify-center group"
            aria-label="Next"
          >
            <ChevronRight className="w-6 h-6 text-white" />
          </button>
        </>
      )}

      {/* Cover Flow Container */}
      <div
        ref={containerRef}
        className="coverflow-container"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          perspective: '1200px',
          perspectiveOrigin: '50% 50%',
        }}
      >
        <div className="coverflow-stage">
          {videos.map((video, index) => {
            const style = getTransform(index);
            return (
              <div
                key={video.id}
                className="coverflow-item"
                style={style}
              >
                {/* Cover Image */}
                <div 
                  className="coverflow-cover cursor-pointer" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Image clicked:', video.title);
                    setSelectedVideo(video);
                    setIsAutoRotating(false);
                    setIsPlaying(true);
                  }}
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover"
                  />
                  

                  {/* Play Button for center item */}
                  {index === centerIndex && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-gradient-to-br from-[#6366f1]/90 to-[#8b5cf6]/90 backdrop-blur-sm border-2 border-white transition-all flex items-center justify-center shadow-lg">
                        <Play className="w-4 h-4 md:w-5 md:h-5 text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  )}

                  {/* Info Overlay (only on active) */}
                  {index === centerIndex && (
                    <div className="absolute bottom-0 left-0 right-0 p-1.5 md:p-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                      <h3 className="text-white font-semibold text-[10px] md:text-sm mb-0.5 truncate">
                        {video.title}
                      </h3>
                      <p className="text-white/70 text-[8px] md:text-xs">{video.creator}</p>
                    </div>
                  )}
                </div>

                {/* Reflection */}
                <div className="coverflow-reflection">
                  <img
                    src={video.thumbnail}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/50 to-black" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Progress Dots */}
      <div className="mt-8 md:mt-32 lg:mt-40 flex justify-center gap-2">
        {videos.map((_, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.stopPropagation();
              handleCoverClick(index, e);
            }}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              index === centerIndex
                ? 'w-8 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]'
                : 'w-1.5 bg-white/30 hover:bg-white/50'
            }`}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>

      {/* Video Player Modal - 캐러셀 중앙에 위치 */}
      {selectedVideo && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          {/* Video Player Container */}
          <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-black rounded-xl md:rounded-2xl shadow-2xl border border-white/20">
            {/* Close Button */}
            <button
              onClick={() => {
                setSelectedVideo(null);
                setIsPlaying(false);
                setIsAutoRotating(true);
              }}
              className="absolute top-2 right-2 md:top-4 md:right-4 z-10 w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 hover:bg-white/10 transition-all flex items-center justify-center"
            >
              <X className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </button>

            {/* Video Element - 16:9 Aspect Ratio */}
            <div className="aspect-video bg-black relative">
              {selectedVideo.videoUrl ? (
                <div data-vjs-player>
                  <video
                    ref={videoRef}
                    className="video-js vjs-big-play-centered w-full h-full"
                    playsInline
                  />
                </div>
              ) : (
                <div className="w-full h-full relative">
                  <img
                    src={selectedVideo.thumbnail}
                    alt={selectedVideo.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/20 backdrop-blur-sm border-2 border-white flex items-center justify-center">
                      <Play className="w-8 h-8 md:w-10 md:h-10 text-white ml-2" />
                    </div>
                  </div>
                </div>
              )}

            </div>

            {/* Video Controls & Info Overlay */}
            <div className="bg-background/95 backdrop-blur-sm p-3 md:p-5">
              {/* Title & Creator */}
              <div className="mb-3 md:mb-4">
                <h3 className="text-white text-lg md:text-xl font-bold mb-1.5 md:mb-2">{selectedVideo.title}</h3>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-xs md:text-sm font-bold">
                    {selectedVideo.creator?.charAt(1).toUpperCase()}
                  </div>
                  <span className="text-white/80 text-xs md:text-sm">{selectedVideo.creator}</span>
                </div>
              </div>

              {/* Video Controls & Specs - Same Row */}
              <div className="flex items-center justify-between gap-3 md:gap-4 mb-3 md:mb-4">
                {/* Video Controls - Left */}
                <div className="flex gap-1.5 md:gap-2">
                  {isPlaying ? (
                    <button
                      onClick={handleVideoPause}
                      className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center"
                    >
                      <Pause className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </button>
                  ) : (
                    <button
                      onClick={handleVideoPlay}
                      className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center"
                    >
                      <Play className="w-4 h-4 md:w-5 md:h-5 text-white ml-0.5" />
                    </button>
                  )}
                  {isMuted ? (
                    <button
                      onClick={handleVideoUnmute}
                      className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center"
                    >
                      <VolumeX className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </button>
                  ) : (
                    <button
                      onClick={handleVideoMute}
                      className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center"
                    >
                      <Volume2 className="w-4 h-4 md:w-5 md:h-5 text-white" />
                    </button>
                  )}
                  <button
                    onClick={handleVideoMaximize}
                    className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all flex items-center justify-center"
                  >
                    <Maximize className="w-4 h-4 md:w-5 md:h-5 text-white" />
                  </button>
                </div>

                {/* Video Specs - Right */}
                <div className="flex gap-2 md:gap-3">
                  <div className="text-center">
                    <div className="text-white/50 text-[9px] md:text-[10px] mb-0.5">해상도</div>
                    <div className="text-white text-xs md:text-sm font-medium">{selectedVideo.resolution || '4K'}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/50 text-[9px] md:text-[10px] mb-0.5">길이</div>
                    <div className="text-white text-xs md:text-sm font-medium">{selectedVideo.duration || '0:30'}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-white/50 text-[9px] md:text-[10px] mb-0.5">AI 툴</div>
                    <div className="text-white text-xs md:text-sm font-medium">{selectedVideo.tool || 'Sora'}</div>
                  </div>
                </div>
              </div>

              {/* License Tabs */}
              <div className="mb-3 md:mb-4">
                <div className="text-white/70 text-[10px] md:text-xs mb-1.5 md:mb-2">라이선스 선택</div>
                <div className="grid grid-cols-3 gap-1.5 md:gap-2">
                  <button
                    onClick={() => setSelectedLicense('standard')}
                    className={`p-2 md:p-3 rounded-lg border transition-all ${
                      selectedLicense === 'standard'
                        ? 'bg-gradient-to-r from-[#6366f1]/20 to-[#8b5cf6]/20 border-[#6366f1]'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="text-white text-xs md:text-sm font-medium mb-0.5 md:mb-1">Standard</div>
                    <div className={`text-[10px] md:text-xs ${
                      selectedLicense === 'standard' ? 'text-[#6366f1]' : 'text-white/50'
                    }`}>
                      개인/소규모
                    </div>
                  </button>
                  <button
                    onClick={() => setSelectedLicense('commercial')}
                    className={`p-2 md:p-3 rounded-lg border transition-all ${
                      selectedLicense === 'commercial'
                        ? 'bg-gradient-to-r from-[#6366f1]/20 to-[#8b5cf6]/20 border-[#6366f1]'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="text-white text-xs md:text-sm font-medium mb-0.5 md:mb-1">Commercial</div>
                    <div className={`text-[10px] md:text-xs ${
                      selectedLicense === 'commercial' ? 'text-[#6366f1]' : 'text-white/50'
                    }`}>
                      상업용
                    </div>
                  </button>
                  <button
                    onClick={() => setSelectedLicense('exclusive')}
                    className={`p-2 md:p-3 rounded-lg border transition-all ${
                      selectedLicense === 'exclusive'
                        ? 'bg-gradient-to-r from-[#6366f1]/20 to-[#8b5cf6]/20 border-[#6366f1]'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="text-white text-xs md:text-sm font-medium mb-0.5 md:mb-1">Exclusive</div>
                    <div className={`text-[10px] md:text-xs ${
                      selectedLicense === 'exclusive' ? 'text-[#6366f1]' : 'text-white/50'
                    }`}>
                      독점 라이선스
                    </div>
                  </button>
                </div>
              </div>

              {/* Price & Purchase Button */}
              <div className="flex items-center justify-between gap-2 md:gap-4">
                <div>
                  <div className="text-white/50 text-[10px] md:text-xs mb-0.5 md:mb-1">가격</div>
                  <div className="text-white text-xl md:text-2xl font-bold">
                    ₩{getPrice().toLocaleString()}
                  </div>
                </div>
                <button className="flex-1 max-w-[180px] md:max-w-xs px-4 md:px-8 py-2.5 md:py-3 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-sm md:text-lg font-bold rounded-full hover:shadow-lg hover:shadow-[#6366f1]/50 transition-all">
                  구매하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .coverflow-container {
          width: 100%;
          height: 220px;
          position: relative;
          cursor: grab;
          user-select: none;
        }

        .coverflow-container:active {
          cursor: grabbing;
        }

        .coverflow-stage {
          position: relative;
          width: 100%;
          height: 100%;
          transform-style: preserve-3d;
        }

        .coverflow-item {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 160px;
          height: 160px;
          margin-left: -80px;
          margin-top: -80px;
          transform-style: preserve-3d;
          cursor: pointer;
          will-change: transform;
          backface-visibility: hidden;
          -webkit-font-smoothing: antialiased;
        }

        .coverflow-cover {
          width: 100%;
          height: 100%;
          background: #1a1a1a;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
          position: relative;
          border: 2px solid rgba(255, 255, 255, 0.1);
          will-change: transform;
          transform: translateZ(0);
        }

        .coverflow-cover img {
          will-change: transform;
          transform: translateZ(0);
        }

        .coverflow-reflection {
          position: absolute;
          top: 100%;
          left: 0;
          width: 100%;
          height: 100%;
          transform: scaleY(-1) translateZ(0);
          opacity: 0.3;
          overflow: hidden;
          border-radius: 12px;
          pointer-events: none;
          will-change: transform;
        }

        @media (min-width: 768px) {
          .coverflow-container {
            height: 280px;
          }

          .coverflow-item {
            width: 200px;
            height: 200px;
            margin-left: -100px;
            margin-top: -100px;
          }
        }

        @media (min-width: 1024px) {
          .coverflow-container {
            height: 320px;
          }

          .coverflow-item {
            width: 230px;
            height: 230px;
            margin-left: -115px;
            margin-top: -115px;
          }
        }

        @media (max-width: 767px) {
          .coverflow-container {
            height: 160px;
          }

          .coverflow-item {
            width: 95px;
            height: 95px;
            margin-left: -47.5px;
            margin-top: -47.5px;
          }
        }
      `}</style>
    </div>
  );
}