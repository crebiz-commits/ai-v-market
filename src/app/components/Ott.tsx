// ════════════════════════════════════════════════════════════════════════════
// OTT 페이지 — A(시네마틱 매거진) + D(장르별 캐러셀) 합본
// 디자인 채택: 2026-05-16
// 시그니처 그라데이션: brandColors.BRAND_GRADIENT (보라→핑크→황색)
//
// 구조:
//   1. 풀블리드 히어로 (Trending #1, "지금 보기" + "작품 정보")
//   2. EDITOR'S PICK 매거진 (큰 1 + 작은 4)
//   3. 장르별 캐러셀 (좌/우 화살표로 슬라이드) — 상위 5개 장르
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useState, useRef } from "react";
import { Play, Info, Wand2, Heart, Sparkles, ChevronLeft, ChevronRight, Loader2, Lock } from "lucide-react";
import { motion } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { type CarouselVideo } from "./VideoRowCarousel";
import { mergeShowcase, shouldShowShowcase } from "../utils/showcase";
import type { ShowcaseVideo } from "../data/showcaseVideos";
import { BRAND_GRADIENT_TEXT, BRAND_BADGE_BG, getGenreStyle } from "../utils/brandColors";
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
}

// ShowcaseVideo → CarouselVideo
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
  };
}

interface GenreRow {
  category: string;
  videos: CarouselVideo[];
}

export function Ott({ onProductClick }: OttProps) {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const showcase = shouldShowShowcase(profile?.is_admin);
  const ageVerified = profile?.age_verified ?? false;

  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<CarouselVideo[]>([]);
  const [genreRows, setGenreRows] = useState<GenreRow[]>([]);

  // Phase 26 보강: 카드용 age_rating 일괄 조회
  const allVideoIds = useMemo(() => {
    const ids = new Set<string>();
    trending.forEach(v => ids.add(v.id));
    genreRows.forEach(r => r.videos.forEach(v => ids.add(v.id)));
    return Array.from(ids).filter(id => !id.startsWith("demo-"));
  }, [trending, genreRows]);
  const ageRatings = useAgeRatings(allVideoIds);

  // 카드 단계 잠금 가드
  const ageGuard = (v: CarouselVideo) => {
    const rating = ageRatings[v.id];
    const isMyVideo = !!user?.id && !!v.creator_id && user.id === v.creator_id;
    return { rating, isAgeLocked: !isMyVideo && shouldBlur(rating, ageVerified) };
  };

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        // 1. 트렌딩 — 히어로 + 매거진용 (상위 5개 사용)
        const { data: trd } = await supabase.rpc("get_trending_videos", {
          p_tier: "ott",
          p_hours: 168,
          p_limit: 10,
        });

        // 2. 장르별 — get_categories_with_count로 상위 카테고리 찾고 각각 fetch
        const { data: cats } = await supabase.rpc("get_categories_with_count", {
          p_tier: "ott",
          p_min_count: 1,
        });

        const topCategories = (cats || []).slice(0, 5);
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

        // Showcase 합성
        const merge = (real: CarouselVideo[], opts?: { category?: string }) =>
          showcase ? mergeShowcase(real, showcaseToCarousel, { tier: "ott", ...opts }) : real;

        setTrending(merge(trd || []));

        // 장르별 행에 showcase 합성 + 부족하면 mock 카테고리 추가
        const mergedRows = rows.map(r => ({ ...r, videos: merge(r.videos, { category: r.category }) }));

        if (showcase && mergedRows.length < 5) {
          // 실제 카테고리가 부족할 때 mock 카테고리로 채움
          const showcaseCategories = ["drama", "thriller", "romance", "action", "comedy"];
          for (const cat of showcaseCategories) {
            if (mergedRows.find(r => r.category === cat)) continue;
            const mockOnly = mergeShowcase([] as CarouselVideo[], showcaseToCarousel, {
              tier: "ott",
              category: cat,
              maxShowcase: 12,
            });
            if (mockOnly.length > 0) mergedRows.push({ category: cat, videos: mockOnly });
            if (mergedRows.length >= 5) break;
          }
        }
        setGenreRows(mergedRows);
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
      <div className="h-full flex items-center justify-center bg-[#0a0a0a]">
        <Loader2 className="w-10 h-10 text-[#a78bfa] animate-spin" />
      </div>
    );
  }

  // 히어로: Top 5 중 랜덤 (진입할 때마다 다른 영상)
  // featured: 히어로 제외한 나머지에서 (중복 방지)
  const heroPool = Math.min(5, trending.length);
  const heroIdx = heroPool > 0 ? Math.floor(Math.random() * heroPool) : 0;
  const hero = trending[heroIdx];
  const featured = trending.filter((_, i) => i !== heroIdx).slice(0, 5);

  if (!hero) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0a0a] text-gray-500 text-sm">
        {t("ott.noVideos")}
      </div>
    );
  }

  const heroGuard = ageGuard(hero);

  return (
    <div className="h-full overflow-y-auto bg-black pb-12">
      {/* ━━━ 풀블리드 히어로 ━━━ */}
      <HeroSection
        video={hero}
        onClick={() => onProductClick(toProduct(hero))}
        rating={heroGuard.rating}
        isAgeLocked={heroGuard.isAgeLocked}
      />

      {/* ━━━ EDITOR'S PICK 매거진 ━━━ */}
      {featured.length > 0 && (
        <EditorsPick
          videos={featured}
          onClick={(v) => onProductClick(toProduct(v))}
          ageGuard={ageGuard}
        />
      )}

      {/* ━━━ AI 시네마 소개 헤더 ━━━ */}
      <div className="max-w-7xl mx-auto px-6 mt-16 mb-6">
        <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3 ${BRAND_BADGE_BG}`}>
          <Wand2 className="w-4 h-4 text-[#a78bfa]" />
          <span className="text-xs font-bold text-[#a78bfa]">{t("ott.sectionHeaderEyebrow")}</span>
        </div>
        <h2 className={`text-3xl md:text-4xl font-black mb-2 ${BRAND_GRADIENT_TEXT}`}>
          {t("ott.sectionHeaderTitle")}
        </h2>
        <p className="text-sm text-gray-500">{t("ott.sectionHeaderSubtitle")}</p>
      </div>

      {/* ━━━ 장르별 캐러셀 ━━━ */}
      {genreRows.map((row) => (
        <GenreCarousel
          key={row.category}
          category={row.category}
          videos={row.videos}
          onClick={(v) => onProductClick(toProduct(v))}
          ageGuard={ageGuard}
        />
      ))}

      {genreRows.length === 0 && (
        <div className="max-w-7xl mx-auto px-6 py-12 text-center text-gray-500 text-sm">
          {t("ott.noGenreContent")}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 풀블리드 히어로
// ────────────────────────────────────────────────────────────────────────────
function HeroSection({
  video,
  onClick,
  rating,
  isAgeLocked,
}: {
  video: CarouselVideo;
  onClick: () => void;
  rating?: string;
  isAgeLocked?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative h-[70vh] min-h-[500px] overflow-hidden">
      <img src={video.thumbnail || ""} alt="" className={`absolute inset-0 w-full h-full object-cover ${isAgeLocked ? "blur-2xl scale-110" : ""}`} />
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-transparent" />

      {/* Phase 26 보강: 19+ 잠금 오버레이 */}
      {isAgeLocked && (
        <button
          onClick={onClick}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center bg-black/55 hover:bg-black/65 transition-colors"
        >
          <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center mb-3 shadow-2xl">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <p className="text-2xl font-black text-white mb-1">{t("video.ageGateLockTitle")}</p>
          <p className="text-sm text-gray-300 underline">{t("video.ageGateLockHint")}</p>
        </button>
      )}

      {/* Phase 26 보강: 연령 등급 배지 (우상단) */}
      {rating && rating !== "all" && (
        <div className="absolute top-4 right-4 z-10">
          <AgeBadge rating={rating} size="md" />
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 max-w-2xl">
        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full mb-3 ${BRAND_BADGE_BG}`}>
          <Wand2 className="w-3 h-3 text-[#a78bfa]" />
          <span className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-widest">{t("ott.creaiteOriginal")}</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-black mb-4 leading-tight drop-shadow-lg">{video.title}</h1>
        <p className="text-sm md:text-base text-gray-300 mb-6 line-clamp-3 max-w-xl">
          {t("ott.heroDescription", { creator: video.creator_display_name || video.creator })}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClick}
            className="px-6 md:px-8 py-2.5 md:py-3 bg-white text-black font-bold rounded-lg flex items-center gap-2 hover:bg-gray-200 transition-colors text-sm md:text-base"
          >
            <Play className="w-5 h-5 fill-black" /> {t("ott.watchNow")}
          </button>
          <button
            onClick={onClick}
            className="px-6 md:px-8 py-2.5 md:py-3 bg-white/20 backdrop-blur-md text-white font-bold rounded-lg flex items-center gap-2 hover:bg-white/30 transition-colors border border-white/30 text-sm md:text-base"
          >
            <Info className="w-5 h-5" /> {t("ott.moreInfo")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// EDITOR'S PICK 매거진 (큰 1 + 작은 4)
// ────────────────────────────────────────────────────────────────────────────
function EditorsPick({
  videos,
  onClick,
  ageGuard,
}: {
  videos: CarouselVideo[];
  onClick: (v: CarouselVideo) => void;
  ageGuard: (v: CarouselVideo) => { rating?: string; isAgeLocked: boolean };
}) {
  const { t } = useTranslation();
  if (videos.length === 0) return null;
  const bigGuard = ageGuard(videos[0]);
  return (
    <div className="max-w-7xl mx-auto px-6 mt-12">
      <h3 className="text-xs font-bold text-[#a78bfa] uppercase tracking-widest mb-4">{t("ott.editorsPickHeader")}</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 큰 매거진 카드 */}
        <button
          onClick={() => onClick(videos[0])}
          className="md:col-span-2 md:row-span-2 relative h-[400px] rounded-2xl overflow-hidden group cursor-pointer text-left"
        >
          <img
            src={videos[0].thumbnail || ""}
            alt=""
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform ${bigGuard.isAgeLocked ? "blur-2xl scale-110" : ""}`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          {bigGuard.isAgeLocked && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-center px-4">
              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center mb-2">
                <Lock className="w-6 h-6 text-white" />
              </div>
              <p className="text-base font-black text-white">{t("video.ageGateLockTitle")}</p>
            </div>
          )}
          {bigGuard.rating && bigGuard.rating !== "all" && (
            <div className="absolute top-3 right-3">
              <AgeBadge rating={bigGuard.rating} size="sm" />
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 p-6">
            <span className="text-[10px] font-bold text-[#a78bfa] uppercase tracking-widest">{t("ott.cinematicShort")}</span>
            <h4 className="text-2xl font-black mt-1 mb-1">{videos[0].title}</h4>
            <p className="text-sm text-gray-300">{videos[0].creator_display_name || videos[0].creator}</p>
          </div>
        </button>
        {/* 작은 카드 4개 */}
        {videos.slice(1, 5).map((v) => {
          const g = ageGuard(v);
          return (
          <button
            key={v.id}
            onClick={() => onClick(v)}
            className="relative h-[195px] rounded-2xl overflow-hidden group cursor-pointer text-left"
          >
            <img
              src={v.thumbnail || ""}
              alt=""
              className={`w-full h-full object-cover group-hover:scale-105 transition-transform ${g.isAgeLocked ? "blur-xl scale-110" : ""}`}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            {g.isAgeLocked && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-center">
                <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center mb-1.5">
                  <Lock className="w-5 h-5 text-white" />
                </div>
                <p className="text-xs font-black text-white">{t("video.ageGateLockTitle")}</p>
              </div>
            )}
            {g.rating && g.rating !== "all" && (
              <div className="absolute top-2 right-2">
                <AgeBadge rating={g.rating} size="xs" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <h4 className="text-sm font-bold line-clamp-1">{v.title}</h4>
              <p className="text-[11px] text-gray-400">{v.creator_display_name || v.creator}</p>
            </div>
          </button>
          );
        })}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 장르별 캐러셀 (좌/우 화살표 + scroll-snap)
// ────────────────────────────────────────────────────────────────────────────
function GenreCarousel({
  category,
  videos,
  onClick,
  ageGuard,
}: {
  category: string;
  videos: CarouselVideo[];
  onClick: (v: CarouselVideo) => void;
  ageGuard: (v: CarouselVideo) => { rating?: string; isAgeLocked: boolean };
}) {
  const { t } = useTranslation();
  const style = getGenreStyle(category);
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.clientWidth * 0.8;
    scrollRef.current.scrollBy({ left: dir === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (videos.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 mb-8">
      {/* 헤더 (그라데이션 배경) */}
      <div className={`bg-gradient-to-r ${style.gradient} rounded-2xl p-5 mb-3 relative overflow-hidden`}>
        <div className="flex items-center justify-between relative z-10">
          <div>
            <h4 className="text-xl font-black flex items-center gap-2">
              <span className="text-2xl">{style.emoji}</span>
              {t(style.labelKey)}
            </h4>
            <p className="text-xs text-white/70 mt-1">{t(style.subtitleKey)}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => scrollBy("left")}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 flex items-center justify-center transition-colors"
              aria-label={t("ott.previous")}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => scrollBy("right")}
              className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 flex items-center justify-center transition-colors"
              aria-label={t("ott.next")}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="absolute -right-10 -bottom-10 opacity-20">
          <Sparkles className="w-32 h-32" />
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {videos.map((v) => {
          const g = ageGuard(v);
          return (
          <motion.button
            key={v.id}
            whileTap={{ scale: 0.98 }}
            onClick={() => onClick(v)}
            className="flex-shrink-0 w-[180px] md:w-[220px] cursor-pointer group snap-start text-left"
          >
            <div className="aspect-[2/3] rounded-lg overflow-hidden mb-2 relative">
              <img
                src={v.thumbnail || ""}
                alt=""
                className={`w-full h-full object-cover group-hover:scale-105 transition-transform ${g.isAgeLocked ? "blur-xl scale-110" : ""}`}
              />
              {!g.isAgeLocked && v.ai_tool && (
                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/70 backdrop-blur rounded text-[9px] font-bold flex items-center gap-1">
                  <Wand2 className="w-2.5 h-2.5" /> {v.ai_tool}
                </div>
              )}
              {v.duration && (
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/70 rounded text-[10px] font-bold">
                  {v.duration}
                </div>
              )}
              {/* Phase 26 보강: 19+ 잠금 */}
              {g.isAgeLocked && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 text-center pointer-events-none">
                  <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center mb-1.5">
                    <Lock className="w-5 h-5 text-white" />
                  </div>
                  <p className="text-xs font-black text-white">{t("video.ageGateLockTitle")}</p>
                </div>
              )}
              {g.rating && g.rating !== "all" && (
                <div className="absolute top-2 right-2">
                  <AgeBadge rating={g.rating} size="xs" />
                </div>
              )}
              {!g.isAgeLocked && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-3">
                  <p className="text-xs text-gray-300 flex items-center gap-1">
                    <Heart className="w-3 h-3 fill-pink-500 text-pink-500" />
                    {((v as any).likes || 0).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
            <p className="text-sm font-bold line-clamp-1">{v.title}</p>
            <p className="text-[11px] text-gray-500">{v.creator_display_name || v.creator}</p>
          </motion.button>
          );
        })}
      </div>
    </div>
  );
}
