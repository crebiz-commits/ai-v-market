// ════════════════════════════════════════════════════════════════════════════
// 시네마 페이지 (Phase 13) — Netflix 스타일 가로 행 캐러셀
//
// 메이저 플랫폼 스타일:
//   - 당신을 위한 추천 (For You) — 좋아요/시청 이력 기반
//   - 이어 보기 (Continue Watching)
//   - 지금 뜨는 시네마 (Trending Now, 24h)
//   - 새로 추가됨 (New Releases, 14일)
//   - 인기 Top 10
//   - 카테고리별 (동적 — 영상 있는 카테고리만)
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { Loader2, Film, Search as SearchIcon } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { VideoRowCarousel, type CarouselVideo } from "./VideoRowCarousel";
import { CoverFlow } from "./CoverFlow";
import { Input } from "./ui/input";
import { mergeShowcase, shouldShowShowcase } from "../utils/showcase";
import type { ShowcaseVideo } from "../data/showcaseVideos";

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

// CarouselVideo (RPC 반환) → CoverFlow Video 매핑
function toCoverFlowVideo(v: CarouselVideo & { video_url?: string }): any {
  return {
    id: v.id,
    thumbnail: v.thumbnail || "",
    title: v.title,
    creator: v.creator_display_name || v.creator || "이름 없음",
    creatorId: v.creator_id,
    videoUrl: (v as any).video_url || "",
    duration: v.duration || "",
    resolution: "",
    tool: v.ai_tool || "",
    price: v.price_standard || 0,
    highlightStart: v.highlight_start ?? 0,
    highlightEnd: v.highlight_end ?? 15,
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
  priceCommercial?: number;
  priceExclusive?: number;
  highlightStart?: number;
  highlightEnd?: number;
  views?: number;
  likes?: number;
}

interface CinemaProps {
  onProductClick: (product: Product) => void;
  tier?: "cinema" | "ott";   // 시네마(3분+) 또는 OTT(10분+)
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
    creator: v.creator_display_name || v.creator || "이름 없음",
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
    highlightEnd: v.highlight_end ?? 15,
    views: typeof v.views === "number" ? v.views : 0,
  };
}

export function Cinema({ onProductClick, tier = "cinema" }: CinemaProps) {
  const { profile } = useAuth();
  const showcase = shouldShowShowcase(profile?.is_admin);
  const [loading, setLoading] = useState(true);
  const [recommended, setRecommended] = useState<CarouselVideo[]>([]);
  const [continueWatching, setContinueWatching] = useState<CarouselVideo[]>([]);
  const [trending, setTrending] = useState<CarouselVideo[]>([]);
  const [newReleases, setNewReleases] = useState<CarouselVideo[]>([]);
  const [top10, setTop10] = useState<CarouselVideo[]>([]);
  const [categoryRows, setCategoryRows] = useState<CategoryRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CarouselVideo[]>([]);
  const [searching, setSearching] = useState(false);

  const isOtt = tier === "ott";
  const heroTitle = isOtt ? "프리미엄 OTT" : "시네마";
  const heroSubtitle = isOtt
    ? "10분+ 장편 콘텐츠 — 프리미엄 구독자 전용"
    : "3분+ 시네마틱 영상 — 미리보기 3분 무료";

  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      try {
        const [
          { data: rec },
          { data: cont },
          { data: trd },
          { data: nrl },
          { data: top },
          { data: cats },
        ] = await Promise.all([
          supabase.rpc("get_recommended_videos", { p_tier: tier, p_limit: 15 }),
          supabase.rpc("get_continue_watching", { p_limit: 10 }),
          supabase.rpc("get_trending_videos", { p_tier: tier, p_hours: 24, p_limit: 10 }),
          supabase.rpc("get_new_releases", { p_tier: tier, p_days: 14, p_limit: 10 }),
          supabase.rpc("get_trending_videos", { p_tier: tier, p_hours: 168, p_limit: 10 }),  // 7일
          supabase.rpc("get_categories_with_count", { p_tier: tier, p_min_count: 2 }),
        ]);

        // Showcase Mode: tier 기반 (cinema=3분+, ott=10분+) Mock 합성
        const merge = (real: CarouselVideo[], opts?: { category?: string }) =>
          showcase ? mergeShowcase(real, showcaseToCarousel, { tier, ...opts }) : real;

        setRecommended(merge(rec || []));
        // 이어 보기는 시네마 tier일 때만 (OTT는 별도)
        setContinueWatching(
          (cont || []).filter((v: CarouselVideo) => {
            if (tier === "ott") return (v.duration_seconds || 0) >= 600;
            return (v.duration_seconds || 0) >= 180 && (v.duration_seconds || 0) < 600;
          })
        );
        setTrending(merge(trd || []));
        setNewReleases(merge(nrl || []));
        setTop10(merge(top || []));

        // 카테고리별 영상 로드 (상위 5개 카테고리)
        const topCategories = (cats || []).slice(0, 5);
        const rows: CategoryRow[] = await Promise.all(
          topCategories.map(async (cat: { category: string; video_count: number }) => {
            const { data } = await supabase.rpc("get_videos_by_category", {
              p_category: cat.category,
              p_tier: tier,
              p_limit: 12,
            });
            return { category: cat.category, videos: merge(data || [], { category: cat.category }) };
          })
        );
        // showcase 모드 + 실제 카테고리가 적으면 mock 카테고리도 추가
        if (showcase && rows.length < 5) {
          const showcaseCategories = ["drama", "action", "thriller", "romance", "comedy"];
          for (const cat of showcaseCategories) {
            if (rows.find(r => r.category === cat)) continue;
            const mockOnly = mergeShowcase([] as CarouselVideo[], showcaseToCarousel, { tier, category: cat, maxShowcase: 12 });
            if (mockOnly.length > 0) rows.push({ category: cat, videos: mockOnly });
            if (rows.length >= 5) break;
          }
        }
        setCategoryRows(rows);
      } catch (err: any) {
        console.warn("[Cinema] 로딩 실패:", err?.message);
      } finally {
        setLoading(false);
      }
    }
    loadAll();
  }, [tier]);

  // 검색
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase
        .from("v_available_videos")
        .select("*")
        .ilike("title", `%${searchQuery}%`)
        .eq(tier === "cinema" ? "show_on_cinema" : "show_on_ott", true)
        .limit(20);
      setSearchResults((data as any) || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, tier]);

  const handleClick = (v: CarouselVideo) => onProductClick(toProduct(v));

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 text-[#6366f1] animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-background pb-20">
      {/* 헤더 */}
      <div className="px-4 md:px-6 pt-4 pb-3 sticky top-0 bg-background/95 backdrop-blur-sm z-20">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-black flex items-center gap-2">
              {isOtt ? "👑" : "🎬"} {heroTitle}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{heroSubtitle}</p>
          </div>
        </div>

        {/* 검색 */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 bg-card border-border"
            placeholder={`${heroTitle} 영상 검색`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* 검색 결과 */}
      {searchQuery.trim() ? (
        <div className="mt-4">
          {searching ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 text-[#6366f1] animate-spin" />
            </div>
          ) : searchResults.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">
              "{searchQuery}" 검색 결과가 없습니다
            </p>
          ) : (
            <VideoRowCarousel
              title={`🔍 "${searchQuery}" 검색 결과`}
              subtitle={`${searchResults.length}개 영상`}
              videos={searchResults}
              onVideoClick={handleClick}
            />
          )}
        </div>
      ) : (
        <div className="mt-4">
          {/* 🎡 CoverFlow — 원통형 캐러셀 (CREAITE만의 시그니처 UI) */}
          {(() => {
            // 추천이 비어있으면 인기/신규/top10 영상으로 fallback (중복 제거 후 상위 7개)
            const seen = new Set<string>();
            const heroVideos = [...recommended, ...trending, ...newReleases, ...top10]
              .filter((v) => {
                if (seen.has(v.id)) return false;
                seen.add(v.id);
                return true;
              })
              .slice(0, 7);

            if (heroVideos.length === 0) return null;

            return (
              <div className="mb-8 mt-2">
                <div className="px-4 md:px-6 mb-3">
                  <h2 className="text-base md:text-lg font-bold flex items-center gap-2">
                    🎡 추천 큐레이션
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    좌우 드래그로 회전 · 클릭으로 시청
                  </p>
                </div>
                <CoverFlow
                  videos={heroVideos.map(toCoverFlowVideo)}
                  onVideoClick={(v: any) => handleClick(v as CarouselVideo)}
                />
              </div>
            );
          })()}

          {/* 추천 (For You) */}
          <VideoRowCarousel
            title="✨ 당신을 위한 추천"
            subtitle="좋아요와 시청 이력 기반"
            videos={recommended}
            onVideoClick={handleClick}
            emptyMessage="추천을 위해 영상을 좋아요해보세요"
          />

          {/* 이어 보기 */}
          {continueWatching.length > 0 && (
            <VideoRowCarousel
              title="▶️ 이어 보기"
              subtitle="중단된 부분부터 다시 시청"
              videos={continueWatching}
              onVideoClick={handleClick}
              showProgress={true}
            />
          )}

          {/* 인기 (24h) */}
          <VideoRowCarousel
            title="🔥 지금 뜨는 시네마"
            subtitle="최근 24시간 시청 폭증"
            videos={trending}
            onVideoClick={handleClick}
            emptyMessage="아직 인기 영상이 모이지 않았습니다"
          />

          {/* 새로 추가됨 */}
          <VideoRowCarousel
            title="🆕 새로 추가됨"
            subtitle="최근 14일 업로드"
            videos={newReleases}
            onVideoClick={handleClick}
          />

          {/* Top 10 */}
          <VideoRowCarousel
            title="📊 인기 Top 10"
            subtitle="최근 7일 기준"
            videos={top10}
            onVideoClick={handleClick}
            showRank={true}
            emptyMessage="아직 Top 10 데이터가 없습니다"
          />

          {/* 카테고리별 */}
          {categoryRows.map((row) => (
            <VideoRowCarousel
              key={row.category}
              title={`🎨 ${row.category}`}
              videos={row.videos}
              onVideoClick={handleClick}
            />
          ))}

          {/* 빈 상태 */}
          {recommended.length === 0 && trending.length === 0 && newReleases.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Film className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p className="font-semibold">{heroTitle} 영상이 아직 없습니다</p>
              <p className="text-xs mt-1">
                {isOtt ? "10분 이상의 장편 영상이 업로드되면 표시됩니다" : "3분 이상의 영상이 업로드되면 표시됩니다"}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
