// ════════════════════════════════════════════════════════════════════════════
// OTT 페이지 — 재설계 (2026-06-01)
//   1. 상단 히어로: 데스크탑 2등분 / 모바일 1개씩 5초 자동 슬라이드 (트렌딩 상위)
//   2. 하단 카테고리 행: 한 줄 우측·다음 줄 좌측으로 천천히 자동 흐름(마퀴),
//      가로형 카드 + 제목/정보 카드 안. 마우스 올리면 정지. (쿠팡플레이 하단 스타일)
//   ↳ 연령 게이트(블러/잠금) + 쇼케이스 합성 유지.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Info, Plus, Lock, Loader2, Volume2, VolumeX } from "lucide-react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { type CarouselVideo } from "./VideoRowCarousel";
import { Footer } from "./Footer";
import { mergeShowcase, shouldShowShowcase } from "../utils/showcase";
import type { ShowcaseVideo } from "../data/showcaseVideos";
import { getGenreStyle } from "../utils/brandColors";
import { useTranslation } from "react-i18next";
import { AgeBadge, shouldBlur } from "./AgeBadge";
import { useAgeRatings } from "../hooks/useAgeRatings";

interface Product {
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  creatorId?: string;
  price: number;
  duration: string;
  durationSeconds?: number;
  resolution: string;
  tool: string;
  category: string;
  videoUrl: string;
  priceStandard?: number;
  highlightStart?: number;
  highlightEnd?: number;
  views?: number;
  likes?: number;
}

interface OttProps {
  onProductClick: (product: Product) => void;
  onNavigate?: (tab: string) => void;
  // 풀블리드 히어로 스크롤 시 글로벌 헤더 배경 토글 (App.tsx)
  onHeroScroll?: (scrolled: boolean) => void;
}

function showcaseToCarousel(s: ShowcaseVideo): CarouselVideo {
  return {
    id: s.id,
    title: s.title,
    thumbnail: s.thumbnail,
    creator: s.creator,
    creator_id: s.creatorId ?? null,
    creator_display_name: s.creator,
    creator_avatar: null,
    duration: s.duration,
    duration_seconds: s.durationSeconds,
    ai_tool: s.tool,
    category: s.category,
    price_standard: s.price,
    views: s.views,
    likes: s.likes,
    highlight_start: 0,
    highlight_end: 15,
  } as any;
}

function toProduct(v: CarouselVideo): Product {
  return {
    id: v.id,
    thumbnail: v.thumbnail || "",
    title: v.title,
    creator: v.creator_display_name || v.creator || "Unknown",
    creatorId: v.creator_id ?? undefined,
    price: v.price_standard || 0,
    duration: v.duration || "",
    durationSeconds: v.duration_seconds ?? undefined,
    resolution: "",
    tool: v.ai_tool || "",
    category: v.category || "",
    videoUrl: "",
    priceStandard: v.price_standard || 0,
    highlightStart: v.highlight_start ?? 0,
    highlightEnd: v.highlight_end ?? 15,
    views: typeof v.views === "number" ? v.views : 0,
    likes: typeof v.likes === "number" ? v.likes : 0,
  };
}

interface GenreRow {
  category: string;
  videos: CarouselVideo[];
}

type AgeGuard = (v: CarouselVideo) => { rating?: string; isAgeLocked: boolean };

export function Ott({ onProductClick, onNavigate, onHeroScroll }: OttProps) {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const showcase = shouldShowShowcase(profile?.is_admin);
  const ageVerified = profile?.age_verified ?? false;

  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<CarouselVideo[]>([]);
  const [genreRows, setGenreRows] = useState<GenreRow[]>([]);
  // 풀블리드 히어로: 자동재생 영상 소스(hls) + 음소거 토글
  const [heroSrc, setHeroSrc] = useState<{ url: string; start: number; end: number } | null>(null);
  const [heroMuted, setHeroMuted] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const allVideoIds = useMemo(() => {
    const ids = new Set<string>();
    trending.forEach((v) => ids.add(v.id));
    genreRows.forEach((r) => r.videos.forEach((v) => ids.add(v.id)));
    return Array.from(ids).filter((id) => !id.startsWith("demo-"));
  }, [trending, genreRows]);
  const ageRatings = useAgeRatings(allVideoIds);

  const ageGuard: AgeGuard = (v) => {
    const rating = ageRatings[v.id];
    const isMyVideo = !!user?.id && !!v.creator_id && user.id === v.creator_id;
    return { rating, isAgeLocked: !isMyVideo && shouldBlur(rating, ageVerified) };
  };

  // 히어로(트렌딩 1위)의 재생 URL(+하이라이트 구간) 로딩 — RPC엔 video_url 이 없어 별도 조회
  const heroId = trending[0]?.id;
  useEffect(() => {
    setHeroSrc(null);
    if (!heroId || heroId.startsWith("demo-") || heroId.startsWith("showcase")) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("videos")
        .select("video_url, highlight_start, highlight_end")
        .eq("id", heroId)
        .maybeSingle();
      if (!cancelled && data?.video_url) {
        setHeroSrc({ url: data.video_url, start: data.highlight_start || 0, end: data.highlight_end || 15 });
      }
    })();
    return () => { cancelled = true; };
  }, [heroId]);

  // 탭 진입/재진입 시 헤더 투명 초기화 (스크롤 0 상태)
  useEffect(() => {
    onHeroScroll?.(false);
    return () => onHeroScroll?.(false);
  }, [onHeroScroll]);

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const { data: trd } = await supabase.rpc("get_trending_videos", {
          p_tier: "ott",
          p_hours: 168,
          p_limit: 10,
        });

        const { data: cats } = await supabase.rpc("get_categories_with_count", {
          p_tier: "ott",
          p_min_count: 1,
        });

        const topCategories = (cats || []).slice(0, 6);
        const rows: GenreRow[] = await Promise.all(
          topCategories.map(async (cat: { category: string }) => {
            const { data } = await supabase.rpc("get_videos_by_category", {
              p_category: cat.category,
              p_tier: "ott",
              p_limit: 12,
            });
            return { category: cat.category, videos: data || [] };
          })
        );

        const merge = (real: CarouselVideo[], opts?: { category?: string }) =>
          showcase ? mergeShowcase(real, showcaseToCarousel, { tier: "ott", ...opts }) : real;

        setTrending(merge(trd || []));

        const mergedRows = rows.map((r) => ({ ...r, videos: merge(r.videos, { category: r.category }) }));

        if (showcase && mergedRows.length < 5) {
          const showcaseCategories = ["drama", "thriller", "romance", "action", "comedy"];
          for (const cat of showcaseCategories) {
            if (mergedRows.find((r) => r.category === cat)) continue;
            const mockOnly = mergeShowcase([] as CarouselVideo[], showcaseToCarousel, {
              tier: "ott",
              category: cat,
              maxShowcase: 12,
            });
            if (mockOnly.length > 0) mergedRows.push({ category: cat, videos: mockOnly });
            if (mergedRows.length >= 5) break;
          }
        }
        setGenreRows(mergedRows.filter((r) => r.videos.length > 0));
      } catch (err: any) {
        console.warn("[Ott] 로딩 실패:", err?.message);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [showcase]);

  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-black flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-[#a78bfa] animate-spin" />
        </div>
        <Footer onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  // 히어로: 트렌딩 상위 4편 (데스크탑 2등분, 모바일 1개씩 순환)
  const heroes = trending.slice(0, 4);

  if (heroes.length === 0 && genreRows.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-black flex flex-col">
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">{t("ott.noVideos")}</div>
        <Footer onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => onHeroScroll?.((e.currentTarget.scrollTop || 0) > 80)}
      className="h-full overflow-y-auto bg-black pb-12"
    >
      {/* ━━━ 풀블리드 단일 히어로 (영상 자동재생) ━━━ */}
      {heroes.length > 0 && (
        <HeroBillboard
          video={heroes[0]}
          src={heroSrc}
          ageGuard={ageGuard}
          muted={heroMuted}
          onToggleMute={() => setHeroMuted((m) => !m)}
          onClick={(v) => onProductClick(toProduct(v))}
        />
      )}

      {/* ━━━ 카테고리 마퀴 행 (좌우 교차) ━━━ */}
      <div className="max-w-[1800px] mx-auto mt-6 relative">
        {genreRows.map((row, i) => (
          <MarqueeRow
            key={row.category}
            category={row.category}
            videos={row.videos}
            dir={i % 2 === 0 ? "right" : "left"}
            onClick={(v) => onProductClick(toProduct(v))}
            ageGuard={ageGuard}
          />
        ))}
        {genreRows.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">{t("ott.noGenreContent")}</div>
        )}
      </div>

      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}

// 히어로에 등록된 실제 영상이 없을 때 당분간 보여줄 샘플 미리보기 영상 (영상 등록 시 자동 대체)
// Tears of Steel — 블렌더 재단 오픈무비(CC) SF 시네마틱·드라마틱(로봇·미래도시, HLS 스트리밍)
const FALLBACK_HERO_VIDEO = "https://test-streams.mux.dev/tos_ismc/main.m3u8";

// ────────────────────────────────────────────────────────────────────────────
// 풀블리드 단일 히어로 (영상 자동재생 — 음소거·하이라이트 구간 반복, 소리 토글)
//  · 헤더 영역까지 꽉 차는 배경. video.js 로 HLS 재생.
//  · 실제 video_url 이 없으면 당분간 샘플 미리보기 영상을 전체 반복 재생 (폴백).
// ────────────────────────────────────────────────────────────────────────────
function HeroBillboard({
  video,
  src,
  ageGuard,
  muted,
  onToggleMute,
  onClick,
}: {
  video: CarouselVideo;
  src: { url: string; start: number; end: number } | null;
  ageGuard: AgeGuard;
  muted: boolean;
  onToggleMute: () => void;
  onClick: (v: CarouselVideo) => void;
}) {
  const { t } = useTranslation();
  const g = ageGuard(video);
  const videoRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // 실제 영상이 없으면 샘플 미리보기 영상으로 폴백 (영상 등록 전 임시)
  const isFallback = !src?.url;
  const playUrl = src?.url || FALLBACK_HERO_VIDEO;
  // 연령 잠금만 자동재생 제외 (블러 썸네일). 그 외엔 실제 영상 또는 폴백 영상 재생
  const useVideo = !g.isAgeLocked;

  // video.js 플레이어 생성/삭제 — DiscoveryFeed 와 동일한 메모리 누수 방지 패턴
  useEffect(() => {
    if (!useVideo || !videoRef.current) return;
    setIsPlaying(false);

    const player = videojs(videoRef.current, {
      autoplay: true,
      controls: false,
      loop: isFallback,           // 폴백 영상은 전체 반복 / 실제 영상은 하이라이트 구간 반복
      muted: true,
      fill: true,
      fluid: false,        // 비율 상자(letterbox) 모드 끄기 — 항상 컨테이너 꽉 채움
      playsinline: true,
      preload: "auto",
      crossOrigin: "anonymous",
      sources: [{
        src: playUrl,
        type: playUrl.includes(".m3u8") ? "application/x-mpegURL" : "video/mp4",
      }],
    });
    playerRef.current = player;
    player.muted(true);
    player.ready(() => {
      player.currentTime(isFallback ? 0 : (src?.start || 0));
      player.play()?.catch(() => {});
    });
    player.on("playing", () => setIsPlaying(true));
    player.on("pause", () => setIsPlaying(false));
    // 실제 영상일 때만 하이라이트 구간 반복 (폴백은 loop:true 로 전체 반복)
    if (!isFallback && src) {
      player.on("timeupdate", () => {
        const s = src.start || 0;
        let e = src.end || 15;
        const d = player.duration();
        if (typeof d === "number" && d > 0 && e > d) e = d;
        const tt = player.currentTime();
        if (typeof tt === "number" && tt >= e) {
          player.currentTime(s);
          player.play()?.catch(() => {});
        }
      });
    }

    return () => {
      setIsPlaying(false);
      if (playerRef.current) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, [useVideo, playUrl, isFallback]);

  // 음소거 토글 동기화
  useEffect(() => {
    const p = playerRef.current;
    if (p && !p.isDisposed()) p.muted(muted);
  }, [muted]);

  return (
    <section className="relative w-full h-[90vh] md:h-[84vh]">
      <button onClick={() => onClick(video)} className="absolute inset-0 w-full h-full text-left">
        {/* 썸네일 (poster) — 영상 재생 시작되면 페이드아웃 */}
        {video.thumbnail && (
          <img
            src={video.thumbnail}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${g.isAgeLocked ? "blur-2xl scale-110" : ""} ${isPlaying ? "opacity-0" : "opacity-100"}`}
          />
        )}
        {/* 영상 — video.js 내부 <video> 가 컨테이너를 꽉 채우도록(cover) 강제 (모바일 레터박스 방지) */}
        {useVideo && (
          <div className="absolute inset-0 w-full h-full pointer-events-none [&_.video-js]:!absolute [&_.video-js]:!inset-0 [&_.video-js]:!w-full [&_.video-js]:!h-full [&_.video-js]:!pt-0 [&_video]:!w-full [&_video]:!h-full [&_video]:!object-cover">
            <video ref={videoRef} className="video-js w-full h-full" playsInline poster={video.thumbnail || undefined} />
          </div>
        )}

        {/* 하단: 텍스트 가독성용 — 아래 1/2 에만 옅게 (영상이 더 보이도록) */}
        <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-black/90 via-black/30 to-transparent pointer-events-none" />
      </button>

      {/* 음소거 토글 (영상 재생 중에만) */}
      {useVideo && (
        <button
          onClick={onToggleMute}
          className="absolute bottom-6 right-5 md:right-8 z-10 w-11 h-11 rounded-full bg-black/50 backdrop-blur border border-white/30 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          aria-label={muted ? t("video.unmute", "음소거 해제") : t("video.mute", "음소거")}
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      )}

      {/* 연령 잠금 / 일반 정보 */}
      {g.isAgeLocked ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-center pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center mb-2 shadow-2xl">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <p className="text-xl font-black text-white mb-0.5">{t("video.ageGateLockTitle")}</p>
          <p className="text-xs text-gray-300 underline">{t("video.ageGateLockHint")}</p>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 max-w-[1800px] mx-auto pointer-events-none">
          <span className="inline-block px-2.5 py-1 rounded-full text-[10px] md:text-xs font-bold text-white bg-gradient-to-r from-[#a78bfa] via-[#ec4899] to-[#f59e0b] mb-3">
            {t("ott.creaiteOriginal")}
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-white leading-tight mb-1.5 max-w-2xl line-clamp-2 drop-shadow-lg">{video.title}</h2>
          <p className="text-sm md:text-base text-gray-200 mb-4 max-w-xl line-clamp-1 drop-shadow">
            {video.creator_display_name || video.creator || ""}
          </p>
          <div className="flex gap-2.5 pointer-events-auto">
            <button onClick={() => onClick(video)} className="inline-flex items-center gap-1.5 px-5 md:px-7 py-2.5 rounded-lg bg-white text-black text-sm font-bold hover:bg-white/90 transition-colors">
              <Play className="w-5 h-5 fill-black" /> {t("ott.watchNow")}
            </button>
            <button onClick={() => onClick(video)} className="inline-flex items-center gap-1.5 px-5 md:px-7 py-2.5 rounded-lg bg-white/15 backdrop-blur border border-white/30 text-white text-sm font-bold hover:bg-white/25 transition-colors">
              <Info className="w-5 h-5" /> {t("ott.moreInfo")}
            </button>
          </div>
        </div>
      )}

      {g.rating && g.rating !== "all" && (
        <div className="absolute top-16 right-4 md:right-8 z-10">
          <AgeBadge rating={g.rating} size="md" />
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 카테고리 마퀴 행 (좌/우 자동 흐름, 마우스 hover 시 정지)
// ────────────────────────────────────────────────────────────────────────────
function MarqueeRow({
  category,
  videos,
  dir,
  onClick,
  ageGuard,
}: {
  category: string;
  videos: CarouselVideo[];
  dir: "left" | "right";
  onClick: (v: CarouselVideo) => void;
  ageGuard: AgeGuard;
}) {
  const { t } = useTranslation();
  const style = getGenreStyle(category);
  if (videos.length === 0) return null;

  // 끊김 없는 무한 흐름: 항목 2벌 복제, 트랙을 -50%까지 이동. 카드당 약 28s (천천히)
  const doubled = [...videos, ...videos];
  const duration = `${videos.length * 28}s`;

  return (
    <section className="mb-7">
      <h3 className="text-base md:text-lg font-bold px-4 md:px-6 mb-2.5 flex items-center gap-2">
        <span className="text-xl">{style.emoji}</span>
        {t(style.labelKey)}
      </h3>
      <div className="marquee-row overflow-hidden">
        <div
          className={`flex gap-3 w-max ${dir === "right" ? "marquee-right" : "marquee-left"}`}
          style={{ animationDuration: duration }}
        >
          {doubled.map((v, i) => {
            const g = ageGuard(v);
            return (
              <button
                key={`${v.id}-${i}`}
                onClick={() => onClick(v)}
                className="flex-shrink-0 w-80 md:w-[30rem] group/card text-left"
              >
                <div className="relative aspect-video rounded-xl overflow-hidden bg-card">
                  {v.thumbnail && (
                    <img
                      src={v.thumbnail}
                      alt=""
                      className={`w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500 ${g.isAgeLocked ? "blur-xl scale-110" : ""}`}
                    />
                  )}

                  {g.isAgeLocked ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 text-center">
                      <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center mb-1.5">
                        <Lock className="w-5 h-5 text-white" />
                      </div>
                      <p className="text-xs font-black text-white">{t("video.ageGateLockTitle")}</p>
                    </div>
                  ) : (
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/90 via-black/45 to-transparent">
                      <p className="text-sm md:text-base font-bold text-white line-clamp-1">{v.title}</p>
                      <p className="text-[11px] md:text-xs text-gray-300 line-clamp-1 mt-0.5">
                        {v.creator_display_name || v.creator || "CREAITE"}
                        {v.ai_tool ? ` · ${v.ai_tool}` : ""}
                      </p>
                    </div>
                  )}

                  {g.rating && g.rating !== "all" && (
                    <div className="absolute top-2 left-2">
                      <AgeBadge rating={g.rating} size="xs" />
                    </div>
                  )}

                  {!g.isAgeLocked && (
                    <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur border border-white/30 flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity">
                      <Plus className="w-4 h-4 text-white" />
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
