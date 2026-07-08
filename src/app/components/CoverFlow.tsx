import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Play, Lock } from 'lucide-react';
import { useCreatorInfo } from '../hooks/useCreatorInfo';
import { CreatorAvatar } from './CreatorAvatar';
import { shouldBlur } from './AgeBadge';
import { useAuth } from '../contexts/AuthContext';

interface Video {
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  creatorId?: string;
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
  // 비디오 클릭 시 외부 핸들러 호출. 시네마 경로(유일 사용처)는 항상 주입 → ProductDetail 라우팅.
  // (예전엔 미주입 시 내부 모달을 띄웠으나, 항상 주입돼 도달 불가였던 모달/플레이어/라이선스
  //  UI 는 2026-06-28 데드코드로 제거. 내부 재생이 필요해지면 git 이력에서 복원.)
  onVideoClick?: (video: Video) => void;
  ageRatings?: Record<string, string>;  // 19+ 블러용 (다른 피드와 동일 게이팅)
}

export function CoverFlow({ videos, hideControls, onVideoClick, ageRatings }: CoverFlowProps) {
  const { profile } = useAuth();
  const ageVerified = profile?.age_verified ?? false;
  const [rotation, setRotation] = useState(0);
  const creatorInfo = useCreatorInfo(videos.map((v) => v.creatorId));
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [startRotation, setStartRotation] = useState(0);
  const [isAutoRotating, setIsAutoRotating] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRotateTimeoutRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const visibleRef = useRef(true);   // 화면 밖/탭숨김이면 자동회전 setState 스킵(상시 60fps 리렌더 방지)
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const hasDraggedRef = useRef(false);

  const isEmpty = videos.length === 0;
  const anglePerItem = isEmpty ? 0 : 360 / videos.length;

  // 화면 크기별 비율 기반 반경 (좁은 화면 47% / 데스크탑 42%) + 600px cap
  const getRadius = () => {
    if (typeof window === 'undefined') return 250;
    const width = window.innerWidth;
    const ratio = width < 768 ? 0.47 : 0.42;
    return Math.min(Math.round(width * ratio), 600);
  };

  const [radius, setRadius] = useState(getRadius());
  // 마우스(hover) 가능 디바이스에서만 화살표 표시 — viewport 크기와 무관
  const [isHoverDevice, setIsHoverDevice] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      setIsHoverDevice(window.matchMedia('(hover: hover)').matches);
    }
  }, []);

  // CoverFlow 가 화면 밖이면 자동회전 리렌더 중지(배터리·CPU). 탭숨김은 animate 가 document.hidden 으로 검사.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => { visibleRef.current = e.isIntersecting; }, { threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // rotation 값을 기준으로 실제 중앙에 있는 인덱스 계산
  const getCenterIndex = () => {
    if (isEmpty) return 0;
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

    // 중앙 아이템 클릭 → 외부 핸들러(ProductDetail 라우팅)
    if (index === centerIndex) {
      onVideoClick?.(videos[index]);
      return;
    }

    // 그렇지 않으면 해당 아이템을 중앙으로 회전 (getCenterIndex 규약과 일치: +index)
    setIsAutoRotating(false);
    const targetRotation = index * anglePerItem;
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
      // 화면에 안 보이거나(스크롤로 벗어남) 입력 중이면 화살표를 가로채지 않음 — 페이지 전역 하이재킹 방지.
      if (!visibleRef.current) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
      if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [anglePerItem]);

  // 언마운트 시 타임아웃 정리
  useEffect(() => {
    return () => {
      if (autoRotateTimeoutRef.current) {
        clearTimeout(autoRotateTimeoutRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  const getTransform = (index: number) => {
    if (isEmpty) return { display: 'none' };
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
        if (visibleRef.current && !document.hidden) setRotation((prev) => {
          const newRotation = prev - 0.12; // 매 프레임마다 회전 속도 (2026-06-11: 0.05→0.12 빠르게)
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

  if (isEmpty) return null;

  return (
    <div className="relative w-full bg-black py-6 md:py-12 lg:py-28">
      {/* Navigation Buttons — 마우스 디바이스(데스크탑) 에서만 표시, 터치 디바이스(모바일) 는 자동 숨김 */}
      {!hideControls && isHoverDevice && (
        <>
          <button
            onClick={handlePrev}
            className="flex absolute left-2 md:left-8 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all items-center justify-center group"
            aria-label="Previous"
          >
            <ChevronLeft className="w-5 h-5 md:w-6 md:h-6 text-white" />
          </button>

          <button
            onClick={handleNext}
            className="flex absolute right-2 md:right-8 top-1/2 -translate-y-1/2 z-30 w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 transition-all items-center justify-center group"
            aria-label="Next"
          >
            <ChevronRight className="w-5 h-5 md:w-6 md:h-6 text-white" />
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
            const isAgeLocked = shouldBlur(ageRatings?.[video.id], ageVerified);  // 19+ 미인증 → 블러
            return (
              <div
                key={video.id}
                className="coverflow-item"
                style={style}
              >
                {/* Cover Image */}
                <div
                  className="coverflow-cover cursor-pointer"
                  onClick={(e) => handleCoverClick(index, e)}
                >
                  <img
                    src={video.thumbnail}
                    alt={video.title}
                    className={`w-full h-full object-cover ${isAgeLocked ? "blur-xl scale-110" : ""}`}
                  />
                  {/* 19+ 잠금 오버레이 */}
                  {isAgeLocked && (
                    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
                      <div className="w-7 h-7 rounded-full bg-red-600 flex items-center justify-center">
                        <Lock className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}


                  {/* Play Button for center item — 글래스모피즘, 카드 정중앙 */}
                  {index === centerIndex && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white/[0.07] backdrop-blur-md border border-white/20 flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.35)] opacity-85">
                        <Play className="w-2.5 h-2.5 md:w-3 md:h-3 text-[#c4b5fd] ml-0.5" fill="currentColor" strokeWidth={0} />
                      </div>
                    </div>
                  )}

                  {/* Info Overlay (only on active) */}
                  {index === centerIndex && (
                    <div className="absolute bottom-0 left-0 right-0 p-1.5 md:p-3 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                      <h3 className="text-white font-semibold text-[10px] md:text-sm mb-0.5 truncate">
                        {video.title}
                      </h3>
                      {(() => {
                        const latestName = (video.creatorId ? creatorInfo[video.creatorId]?.name : null) ?? video.creator;
                        return (
                          <div className="flex items-center gap-1">
                            <CreatorAvatar
                              avatarUrl={video.creatorId ? creatorInfo[video.creatorId]?.avatar ?? null : null}
                              name={latestName}
                              size="xs"
                            />
                            <p className="text-white/70 text-[8px] md:text-xs">{latestName}</p>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Reflection */}
                <div className="coverflow-reflection">
                  <img
                    src={video.thumbnail}
                    alt=""
                    className={`w-full h-full object-cover ${isAgeLocked ? "blur-xl scale-110" : ""}`}
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
