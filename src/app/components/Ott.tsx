// ════════════════════════════════════════════════════════════════════════════
// OTT 페이지 — 재설계 (2026-06-01)
//   1. 상단 히어로: 데스크탑 2등분 / 모바일 1개씩 5초 자동 슬라이드 (트렌딩 상위)
//   2. 하단 카테고리 행: 한 줄 우측·다음 줄 좌측으로 천천히 자동 흐름(마퀴),
//      가로형 카드 + 제목/정보 카드 안. 마우스 올리면 정지. (쿠팡플레이 하단 스타일)
//   ↳ 연령 게이트(블러/잠금) + 쇼케이스 합성 유지.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Info, Plus, Lock, Loader2 } from "lucide-react";
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

export function Ott({ onProductClick, onNavigate }: OttProps) {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const showcase = shouldShowShowcase(profile?.is_admin);
  const ageVerified = profile?.age_verified ?? false;

  const [loading, setLoading] = useState(true);
  const [trending, setTrending] = useState<CarouselVideo[]>([]);
  const [genreRows, setGenreRows] = useState<GenreRow[]>([]);

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
    <div className="h-full overflow-y-auto bg-black pb-12">
      {/* ━━━ 2등분 히어로 ━━━ */}
      {heroes.length > 0 && (
        <div className="max-w-[1800px] mx-auto px-2 md:px-4 pt-3">
          <HeroPanels videos={heroes} onClick={(v) => onProductClick(toProduct(v))} ageGuard={ageGuard} />
        </div>
      )}

      {/* ━━━ 카테고리 마퀴 행 (좌우 교차) ━━━ */}
      <div className="max-w-[1800px] mx-auto mt-6">
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

// ────────────────────────────────────────────────────────────────────────────
// 2등분 히어로 (모바일 1개씩 5초 자동 슬라이드)
// ────────────────────────────────────────────────────────────────────────────
function HeroPanels({
  videos,
  onClick,
  ageGuard,
}: {
  videos: CarouselVideo[];
  onClick: (v: CarouselVideo) => void;
  ageGuard: AgeGuard;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const id = setInterval(() => {
      if (el.scrollWidth <= el.clientWidth + 4) return;
      const card = el.firstElementChild as HTMLElement | null;
      const step = card ? card.offsetWidth : el.clientWidth;
      let next = el.scrollLeft + step;
      if (next >= el.scrollWidth - 4) next = 0;
      el.scrollTo({ left: next, behavior: "smooth" });
    }, 5000);
    return () => clearInterval(id);
  }, [videos.length]);

  return (
    <div ref={ref} className="flex overflow-x-auto scrollbar-hide snap-x snap-mandatory">
      {videos.map((v) => {
        const g = ageGuard(v);
        return (
          <div key={v.id} className="snap-start flex-shrink-0 w-full md:w-1/2 p-1.5">
            <button
              onClick={() => onClick(v)}
              className="relative block w-full h-[52vh] md:h-[60vh] rounded-2xl overflow-hidden text-left group"
            >
              {v.thumbnail && (
                <img
                  src={v.thumbnail}
                  alt=""
                  className={`absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ${g.isAgeLocked ? "blur-2xl scale-110" : ""}`}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

              {g.isAgeLocked ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 text-center">
                  <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center mb-2 shadow-2xl">
                    <Lock className="w-7 h-7 text-white" />
                  </div>
                  <p className="text-xl font-black text-white mb-0.5">{t("video.ageGateLockTitle")}</p>
                  <p className="text-xs text-gray-300 underline">{t("video.ageGateLockHint")}</p>
                </div>
              ) : (
                <div className="absolute bottom-0 left-0 right-0 p-5 md:p-6">
                  <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold text-white bg-gradient-to-r from-[#a78bfa] via-[#ec4899] to-[#f59e0b] mb-2">
                    {t("ott.creaiteOriginal")}
                  </span>
                  <h2 className="text-2xl md:text-3xl font-black text-white leading-tight mb-1 line-clamp-2">{v.title}</h2>
                  <p className="text-xs md:text-sm text-gray-300 mb-3 line-clamp-1">
                    {v.creator_display_name || v.creator || ""}
                  </p>
                  <div className="flex gap-2">
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black text-xs font-bold">
                      <Play className="w-4 h-4 fill-black" /> {t("ott.watchNow")}
                    </span>
                    <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/15 backdrop-blur border border-white/30 text-white text-xs font-bold">
                      <Info className="w-4 h-4" /> {t("ott.moreInfo")}
                    </span>
                  </div>
                </div>
              )}

              {g.rating && g.rating !== "all" && (
                <div className="absolute top-3 right-3">
                  <AgeBadge rating={g.rating} size="md" />
                </div>
              )}
            </button>
          </div>
        );
      })}
    </div>
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
