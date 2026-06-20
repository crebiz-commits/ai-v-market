// ════════════════════════════════════════════════════════════════════════════
// 시네마 페이지 (Phase 13) — Netflix 스타일 가로 행 캐러셀
//
// 메이저 플랫폼 스타일:
//   - 당신을 위한 추천 (For You) — 좋아요/시청 이력 기반
//   - 이어 보기 (Continue Watching)
//   - 지금 뜨는 시네마 (Trending Now, 24h)
//   - 새로 추가됨 (New Releases, 14일)
//   - 인기 Top 10
//   - 카테고리별 (고정 순서: 영화·드라마·애니메이션·다큐멘터리·뮤직비디오·기타)
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useState } from "react";
import { GENRES, genreEmoji } from "../data/genres";  // 장르 단일 출처 (업로드/시네마/OTT 공유)
import { Loader2, Film } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { VideoRowCarousel, type CarouselVideo } from "./VideoRowCarousel";
import { TrendingHeroSection } from "./TrendingHeroSection";
import { Footer } from "./Footer";
import { useAgeRatings } from "../hooks/useAgeRatings";
import { useSeriesCounts } from "../hooks/useSeriesCounts";
import { CoverFlow } from "./CoverFlow";
import { EventBannerBoard, type BoardBanner } from "./EventBannerBoard";
import { fetchEventBanners } from "../data/eventBanners";
import { TopCreatorsRow } from "./TopCreators";
import { mergeShowcase, shouldShowShowcase } from "../utils/showcase";
import type { ShowcaseVideo } from "../data/showcaseVideos";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getGenreLabel } from "../i18n/categoryLabels";

// ShowcaseVideo → CarouselVideo 변환
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

// 형식 카테고리 행 — 장르(분위기)가 아닌 콘텐츠 형식. 장르 행에 안 잡히는 코너 노출용.
// (영화·드라마·기타는 장르와 겹치거나 너무 광범위 → 제외)
// position: "top" = 장르 행보다 위 / "bottom" = 장르 행 뒤·"기타" 바로 위
const FORMAT_DEFS: { category: string; title: string; position: "top" | "bottom" }[] = [
  { category: "애니메이션", title: "🎨 애니메이션", position: "top" },
  { category: "다큐멘터리", title: "🎥 다큐멘터리", position: "bottom" },
  { category: "뮤직비디오", title: "🎵 뮤직비디오", position: "bottom" },
];

// CarouselVideo (RPC 반환) → CoverFlow Video 매핑
function toCoverFlowVideo(v: CarouselVideo & { video_url?: string }): any {
  return {
    id: v.id,
    thumbnail: v.thumbnail || "",
    title: v.title,
    creator: v.creator_display_name || v.creator || "Unknown",
    creatorId: v.creator_id,
    videoUrl: (v as any).video_url || "",
    duration: v.duration || "",
    resolution: "",
    tool: v.ai_tool || "",
    price: v.price_standard || 0,
    highlightStart: v.highlight_start ?? 0,
    highlightEnd: v.highlight_end ?? ((v.highlight_start ?? 0) + 30),
  };
}

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
  tags?: string[];
  priceStandard?: number;
  highlightStart?: number;
  highlightEnd?: number;
  views?: number;
  likes?: number;
}

interface CinemaProps {
  onProductClick: (product: Product) => void;
  onAddToCart?: (product: Product) => void;  // 카드 hover '+' 버튼 — App.tsx의 addToCart 호출
  tier?: "cinema" | "ott";   // 시네마(3분+) 또는 OTT(10분+)
  onNavigate?: (tab: string, sub?: string) => void;
  onViewCreator?: (creatorId: string) => void;  // 탑 크리에이터 카드 → 채널 이동
  onSignInClick?: () => void;                    // 팔로우 등 로그인 필요 액션
}

interface CategoryRow {
  category: string;
  videos: CarouselVideo[];
}

// CarouselVideo → Product 변환 (ProductDetail 호환)
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
    videoUrl: "",  // VideoRowCarousel은 raw video_url 없음 — ProductDetail에서 자체 조회
    priceStandard: v.price_standard || 0,
    highlightStart: v.highlight_start ?? 0,
    highlightEnd: v.highlight_end ?? ((v.highlight_start ?? 0) + 30),
    views: typeof v.views === "number" ? v.views : 0,
    likes: typeof v.likes === "number" ? v.likes : 0,
  };
}

// 탭 재방문 시 즉시 표시용 모듈 캐시 (stale-while-revalidate). 키 = `${tier}:${showcase}`.
// useAgeRatings 의 모듈 캐시와 동일 패턴 — 재진입 시 스피너 없이 직전 데이터를 바로 그리고 뒤에서 갱신.
type CinemaSnapshot = {
  recommended: CarouselVideo[];
  trending: CarouselVideo[];
  newReleases: CarouselVideo[];
  top10: CarouselVideo[];
  formatRows: { category: string; title: string; position: "top" | "bottom"; videos: CarouselVideo[] }[];
  categoryRows: CategoryRow[];
};
const cinemaCache: Record<string, CinemaSnapshot> = {};

export function Cinema({ onProductClick, onAddToCart, tier = "cinema", onNavigate, onViewCreator, onSignInClick }: CinemaProps) {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const showcase = shouldShowShowcase(profile?.is_admin);
  // 캐시 키에 user id 포함 — 개인화 추천(get_recommended_videos)이 사용자 간 공유되지 않게.
  // (user 없으면 'anon'. tier·showcase 만으로 키를 만들면 로그아웃/계정전환 시 이전 사용자 추천이 새어나감)
  const cacheKey = `${user?.id ?? "anon"}:${tier}:${showcase}`;
  // 모듈 캐시에서 초기 hydrate — 탭 재방문 시 첫 렌더부터 데이터 표시(스피너 스킵)
  const _initSnap = cinemaCache[cacheKey];
  const [loading, setLoading] = useState(!_initSnap);
  const [recommended, setRecommended] = useState<CarouselVideo[]>(_initSnap?.recommended ?? []);
  const [trending, setTrending] = useState<CarouselVideo[]>(_initSnap?.trending ?? []);
  const [newReleases, setNewReleases] = useState<CarouselVideo[]>(_initSnap?.newReleases ?? []);
  const [top10, setTop10] = useState<CarouselVideo[]>(_initSnap?.top10 ?? []);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>(_initSnap?.categoryRows ?? []);
  // 형식 카테고리 행 (애니메이션·다큐멘터리·뮤직비디오 — 장르가 아닌 category 기준, 2026-06-11)
  const [formatRows, setFormatRows] = useState<{ category: string; title: string; position: "top" | "bottom"; videos: CarouselVideo[] }[]>(_initSnap?.formatRows ?? []);
  // 이벤트 배너 — DB(event_banners) 로드, 실패/미적용 시 하드코딩 폴백 (2026-06-11)
  const [banners, setBanners] = useState<BoardBanner[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchEventBanners().then((b) => { if (!cancelled) setBanners(b); });
    return () => { cancelled = true; };
  }, []);

  // Phase 26 보강: 카드용 age_rating 일괄 조회
  const allVideoIds = useMemo(() => {
    const ids = new Set<string>();
    recommended.forEach(v => ids.add(v.id));
    trending.forEach(v => ids.add(v.id));
    newReleases.forEach(v => ids.add(v.id));
    top10.forEach(v => ids.add(v.id));
    formatRows.forEach(r => r.videos.forEach(v => ids.add(v.id)));
    categoryRows.forEach(r => r.videos.forEach(v => ids.add(v.id)));
    return Array.from(ids).filter(id => !id.startsWith("demo-")); // showcase mock 제외
  }, [recommended, trending, newReleases, top10, formatRows, categoryRows]);
  const ageRatings = useAgeRatings(allVideoIds);
  const seriesCounts = useSeriesCounts(allVideoIds);

  const isOtt = tier === "ott";
  const heroTitle = isOtt ? t("cinema.heroOttTitle") : t("cinema.heroCinemaTitle");
  const heroSubtitle = isOtt
    ? t("cinema.heroSubtitleOtt")
    : t("cinema.heroSubtitleCinema");

  useEffect(() => {
    let cancelled = false;
    const snap = cinemaCache[cacheKey];
    if (snap) {
      // 캐시 즉시 반영(stale-while-revalidate) — 스피너 없이 직전 데이터 표시 후 아래서 백그라운드 갱신
      setRecommended(snap.recommended); setTrending(snap.trending); setNewReleases(snap.newReleases);
      setTop10(snap.top10); setFormatRows(snap.formatRows); setCategoryRows(snap.categoryRows);
      setLoading(false);
    } else {
      setLoading(true);
    }
    async function loadAll() {
      try {
        const settled = await Promise.allSettled([
          supabase.rpc("get_recommended_videos", { p_tier: tier, p_limit: 15 }),
          supabase.rpc("get_trending_videos", { p_tier: tier, p_hours: 24, p_limit: 10 }),
          supabase.rpc("get_new_releases", { p_tier: tier, p_days: 14, p_limit: 10 }),
          supabase.rpc("get_trending_videos", { p_tier: tier, p_hours: 720, p_limit: 10 }),  // 30일 (이달의 BEST)
          // 형식 카테고리 행 (애니메이션·다큐멘터리·뮤직비디오)
          ...FORMAT_DEFS.map((f) =>
            supabase.rpc("get_videos_by_category", { p_category: f.category, p_tier: tier, p_limit: 50 }),
          ),
          // 장르별 병렬 호출 (넷플릭스식: 작은 제한 없이 장르 전부 노출)
          ...GENRES.map((g) =>
            supabase.rpc("get_videos_by_genre", { p_genre: g, p_tier: tier, p_limit: 50 }),
          ),
        ]);
        if (cancelled) return;  // tier/showcase 전환 중 stale 응답 적용 방지
        // Promise.allSettled: RPC 하나가 실패해도 나머지로 채움(실패분=빈 데이터) → 시네마 전체가 비는 것 방지.
        const rpcData = (r: PromiseSettledResult<any>): any => (r.status === "fulfilled" ? (r.value?.data ?? null) : null);
        const rec = rpcData(settled[0]);
        const trd = rpcData(settled[1]);
        const nrl = rpcData(settled[2]);
        const top = rpcData(settled[3]);
        const restResults = settled.slice(4).map((r) => ({ data: rpcData(r) }));
        const formatResults = restResults.slice(0, FORMAT_DEFS.length);
        const categoryResults = restResults.slice(FORMAT_DEFS.length);

        // Showcase Mode: tier 기반 (cinema=3분+, ott=10분+) Mock 합성
        const merge = (real: CarouselVideo[], opts?: { category?: string }) =>
          showcase ? mergeShowcase(real, showcaseToCarousel, { tier, ...opts }) : real;

        // 인기 영상 풀(좋아요순) — 베타라 조회/추천 데이터가 적은 섹션을 채우는 폴백.
        // 카테고리 영상 전부 + 추천 + 신규를 모아 좋아요순 정렬.
        const popPool: CarouselVideo[] = [
          ...((rec || []) as CarouselVideo[]),
          ...((nrl || []) as CarouselVideo[]),
          ...categoryResults.flatMap((r: any) => ((r?.data || []) as CarouselVideo[])),
        ].sort((a, b) => (b.likes || 0) - (a.likes || 0));
        // base(실제 데이터)를 앞에 두고 popPool 인기순으로 target 개까지 채움(중복 제거).
        const fillPopular = (base: CarouselVideo[], target: number): CarouselVideo[] => {
          const seen = new Set(base.map((v) => v.id));
          const out = [...base];
          for (const v of popPool) {
            if (out.length >= target) break;
            if (seen.has(v.id)) continue;
            seen.add(v.id);
            out.push(v);
          }
          return out;
        };

        // 추천: 개인화 결과(많이 본 사용자는 시청영상 제외돼 마를 수 있음) + 인기순 보충
        const nextRecommended = merge(fillPopular((rec || []) as CarouselVideo[], 15));
        // 지금 뜨는(24h): 최근 24시간 조회 데이터 없으면 인기순으로 보충
        const nextTrending = merge(fillPopular((trd || []) as CarouselVideo[], 10));
        const nextNewReleases = merge((nrl || []) as CarouselVideo[]);
        // 이달의 BEST(30일 트렌딩): 실제 조회 영상 앞 + 인기순 보충
        const nextTop10 = merge(fillPopular((top || []) as CarouselVideo[], 10));
        // 형식 카테고리 행 (애니메이션·다큐멘터리·뮤직비디오) — 영상 있는 것만
        const nextFormatRows = FORMAT_DEFS.map((f, i) => ({
          category: f.category,
          title: f.title,
          position: f.position,
          videos: merge(((formatResults[i] as any)?.data || []) as CarouselVideo[], { category: f.category }),
        })).filter((r) => r.videos.length > 0);
        // 장르별 영상 행 — 업로드 장르 순서(SF·액션·로맨스…). 영상 1개 이상 있는 장르만 표시.
        const nextCategoryRows: CategoryRow[] = GENRES.map((g, i) => ({
          category: g,
          videos: merge((categoryResults[i] as any)?.data || [], { category: g }),
        })).filter((row) => row.videos.length > 0);

        // 모듈 캐시에 기록 → 다음 재방문 시 스피너 없이 즉시 표시
        cinemaCache[cacheKey] = {
          recommended: nextRecommended, trending: nextTrending, newReleases: nextNewReleases,
          top10: nextTop10, formatRows: nextFormatRows, categoryRows: nextCategoryRows,
        };

        setRecommended(nextRecommended);
        setTrending(nextTrending);
        setNewReleases(nextNewReleases);
        setTop10(nextTop10);
        setFormatRows(nextFormatRows);
        setCategoryRows(nextCategoryRows);
      } catch (err: any) {
        console.warn("[Cinema] 로딩 실패:", err?.message);
        // 캐시를 이미 표시 중이면(snap) 백그라운드 갱신 실패는 조용히 무시
        if (!cancelled && !snap) toast.error(t("common.loadError", "콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();
    return () => { cancelled = true; };
  }, [tier, showcase, user?.id]);  // user 포함: 로그인/로그아웃·계정전환 시 개인화 추천 재조회

  const handleClick = (v: CarouselVideo) => onProductClick(toProduct(v));
  const handleAddToCart = onAddToCart
    ? (v: CarouselVideo) => onAddToCart(toProduct(v))
    : undefined;

  if (loading) {
    return (
      <div className="h-full overflow-y-auto bg-background flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-10 h-10 text-[#6366f1] animate-spin" />
        </div>
        <Footer onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background flex flex-col pb-20 md:pb-0">
      {/* 헤더 — 검색은 상단 헤더 🔍(통합 검색)로 일원화. 시네마 인페이지 검색 제거(2026-05-31) */}
      <div className="px-4 md:px-6 pt-4 pb-3 sticky top-0 bg-background/95 backdrop-blur-sm z-20 relative">
        <div>
          <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2">
            {isOtt ? "👑" : "🎬"} {heroTitle}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">{heroSubtitle}</p>
        </div>
        {/* 네온 구분선 (모바일 피드 구분선과 동일) */}
        <div className="neon-divider absolute left-0 right-0 bottom-0" />
      </div>

      {/* 이벤트/프로모 배너 보드 (활성 이벤트 있을 때만 노출. 넓은 화면 최대 5개 / 모바일 1개 5초 슬라이드) */}
      <div className="mt-3">
        <EventBannerBoard banners={banners} onNavigate={onNavigate} />
      </div>

      <div className="mt-4">
          {/* 🎡 CoverFlow — 원통형 캐러셀 (CREAITE만의 시그니처 UI) */}
          {(() => {
            // 추천(get_recommended_videos) 기준 — 추천이 1순위로 채워지고(p_limit 15),
            // 부족할 때만 트렌딩/신규/월간BEST로 메움. 중복 제거 후 상위 11개.
            const seen = new Set<string>();
            const heroVideos = [...recommended, ...trending, ...newReleases, ...top10]
              .filter((v) => {
                if (seen.has(v.id)) return false;
                seen.add(v.id);
                return true;
              })
              .slice(0, 11);

            if (heroVideos.length === 0) return null;

            return (
              <div className="mb-8 mt-2 md:-mb-10 lg:-mb-20">
                {/* 다른 섹션과 동일한 한 줄 헤더(고정 h-7 + 설명 인라인) */}
                <div className="px-4 md:px-6 mb-2 h-7 flex items-end gap-2 overflow-hidden">
                  <h2 className="text-base md:text-xl font-bold">{t("cinema.coverflowTitle")}</h2>
                  <p className="text-xs md:text-sm text-muted-foreground">{t("cinema.coverflowSubtitle")}</p>
                </div>
                <CoverFlow
                  videos={heroVideos.map(toCoverFlowVideo)}
                  onVideoClick={(v: any) => handleClick(v as CarouselVideo)}
                />
              </div>
            );
          })()}

          {/* 추천 (For You) — relative z-10 으로 CoverFlow reflection 위에 표시 */}
          <div className="relative z-10 bg-background">
            <VideoRowCarousel
              title={t("cinema.forYouTitle")}
              subtitle={t("cinema.forYouSubtitle")}
              videos={recommended}
              onVideoClick={handleClick}
              onAddToCart={handleAddToCart}
              emptyMessage={t("cinema.forYouEmpty")}
              ageRatings={ageRatings} seriesCounts={seriesCounts}
            />
          </div>

          {/* 인기 (24h) — 히어로 + 네온 글로우 캐러셀 */}
          <TrendingHeroSection
            title={t("cinema.trendingTitle")}
            subtitle={t("cinema.trendingSubtitle")}
            videos={trending}
            onVideoClick={handleClick}
              onAddToCart={handleAddToCart}
            emptyMessage={t("cinema.trendingEmpty")}
          />

          {/* 새로 추가됨 */}
          <VideoRowCarousel
            title={t("cinema.newReleasesTitle")}
            subtitle={t("cinema.newReleasesSubtitle")}
            videos={newReleases}
            onVideoClick={handleClick}
              onAddToCart={handleAddToCart}
            ageRatings={ageRatings} seriesCounts={seriesCounts}
          />

          {/* 이달의 BEST (30일 인기) — 순번 표시 없이 일반 카드 */}
          <VideoRowCarousel
            title={t("cinema.monthBestTitle")}
            subtitle={t("cinema.monthBestSubtitle")}
            videos={top10}
            onVideoClick={handleClick}
              onAddToCart={handleAddToCart}
            emptyMessage={t("cinema.monthBestEmpty")}
            ageRatings={ageRatings} seriesCounts={seriesCounts}
          />

          {/* 형식 카테고리 (top) — 애니메이션: 장르 행보다 먼저 */}
          {formatRows.filter((r) => r.position === "top").map((row) => (
            <VideoRowCarousel
              key={row.category}
              title={row.title}
              videos={row.videos}
              onVideoClick={handleClick}
              onAddToCart={handleAddToCart}
              ageRatings={ageRatings} seriesCounts={seriesCounts}
            />
          ))}

          {/* 장르별 (기타 제외) */}
          {categoryRows.filter((row) => row.category !== "기타").map((row) => (
            <VideoRowCarousel
              key={row.category}
              title={`${genreEmoji(row.category)} ${getGenreLabel(row.category, t)}`}
              videos={row.videos}
              onVideoClick={handleClick}
              onAddToCart={handleAddToCart}
              ageRatings={ageRatings} seriesCounts={seriesCounts}
            />
          ))}

          {/* 형식 카테고리 (bottom) — 다큐·뮤직비디오: 기타 바로 위 */}
          {formatRows.filter((r) => r.position === "bottom").map((row) => (
            <VideoRowCarousel
              key={row.category}
              title={row.title}
              videos={row.videos}
              onVideoClick={handleClick}
              onAddToCart={handleAddToCart}
              ageRatings={ageRatings} seriesCounts={seriesCounts}
            />
          ))}

          {/* 기타 장르 (맨 마지막) */}
          {categoryRows.filter((row) => row.category === "기타").map((row) => (
            <VideoRowCarousel
              key={row.category}
              title={`${genreEmoji(row.category)} ${getGenreLabel(row.category, t)}`}
              videos={row.videos}
              onVideoClick={handleClick}
              onAddToCart={handleAddToCart}
              ageRatings={ageRatings} seriesCounts={seriesCounts}
            />
          ))}

          {/* 이번 주 TOP 크리에이터 — 모든 행 맨 아래 */}
          <TopCreatorsRow
            onViewCreator={onViewCreator}
            onSignInClick={onSignInClick}
            onSeeAll={() => onNavigate?.("top-creators")}
          />

          {/* 빈 상태 */}
          {recommended.length === 0 && trending.length === 0 && newReleases.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Film className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="font-semibold">{t("cinema.emptyCinemaTitle", { tier: heroTitle })}</p>
              <p className="text-xs mt-1">
                {isOtt ? t("cinema.emptyCinemaSubtitleOtt") : t("cinema.emptyCinemaSubtitleCinema")}
              </p>
            </div>
          )}
        </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}
