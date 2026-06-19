// ════════════════════════════════════════════════════════════════════════════
// OTT 페이지 — 재설계 (2026-06-01)
//   1. 상단 히어로: 데스크탑 2등분 / 모바일 1개씩 5초 자동 슬라이드 (트렌딩 상위)
//   2. 하단 카테고리 행: 한 줄 우측·다음 줄 좌측으로 천천히 자동 흐름(마퀴),
//      가로형 카드 + 제목/정보 카드 안. 마우스 올리면 정지. (쿠팡플레이 하단 스타일)
//   ↳ 연령 게이트(블러/잠금) + 쇼케이스 합성 유지.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Info, Plus, Lock, Loader2, Volume2, VolumeX, Clock, ChevronLeft, ChevronRight, Heart, Eye } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { type CarouselVideo } from "./VideoRowCarousel";
import { formatCompactNumber as fmtCompact } from "../i18n/numberFormat";
import { Footer } from "./Footer";
import { mergeShowcase, shouldShowShowcase } from "../utils/showcase";
import type { ShowcaseVideo } from "../data/showcaseVideos";
import { GENRES } from "../data/genres";
import { getGenreStyle } from "../utils/brandColors";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { isNegotiationOnly } from "../utils/licensePricing";
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
  onPlayProduct?: (product: Product) => void;   // 히어로 "지금 보기" → 상세 + 전체화면 재생
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

// 형식 카테고리 행 — top(장르 위) / bottom(장르 뒤·기타 위)
const OTT_FORMAT_DEFS: { category: string; position: "top" | "bottom" }[] = [
  { category: "애니메이션", position: "top" },
  { category: "다큐멘터리", position: "bottom" },
  { category: "뮤직비디오", position: "bottom" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 시간대 무드 편성: 접속 시각에 따라 카테고리(장르) 행 순서를 재배치.
//  · 영상이 아니라 "장르 행"을 정렬 → 영상 수와 무관하게 자동 동작.
//  · order 의 키는 getGenreStyle().key 와 동일. 목록에 없는 장르는 중간, "default"(기타)는 항상 맨 뒤.
// ─────────────────────────────────────────────────────────────────────────────
interface ProgrammingBand { id: string; emoji: string; name: string; tagline: string; order: string[] }
const PROGRAMMING_BANDS: ProgrammingBand[] = [
  { id: "dawn",    emoji: "🌌", name: "잠 못 드는 새벽", tagline: "긴장감으로 깨어 있는 시간", order: ["horror", "thriller", "sci-fi", "fantasy"] },
  { id: "morning", emoji: "🌅", name: "하루를 여는 아침", tagline: "잔잔하게 시작하는 한 편",   order: ["documentary", "drama", "animation", "music"] },
  { id: "day",     emoji: "☀️", name: "활기찬 낮",       tagline: "가볍고 신나는 무드",       order: ["comedy", "action", "animation", "sci-fi"] },
  { id: "evening", emoji: "🌆", name: "함께 보는 저녁",   tagline: "누군가와 나누는 시간",     order: ["drama", "romance", "comedy", "fantasy"] },
  { id: "night",   emoji: "🌙", name: "몰입의 밤",        tagline: "깊이 빠져드는 한 편",     order: ["thriller", "romance", "sci-fi", "drama", "horror"] },
];
function currentBand(): ProgrammingBand {
  const h = new Date().getHours();
  if (h >= 2 && h < 5) return PROGRAMMING_BANDS[0];
  if (h >= 5 && h < 11) return PROGRAMMING_BANDS[1];
  if (h >= 11 && h < 17) return PROGRAMMING_BANDS[2];
  if (h >= 17 && h < 21) return PROGRAMMING_BANDS[3];
  return PROGRAMMING_BANDS[4]; // 21–02
}
function bandRank(genreKey: string, band: ProgrammingBand): number {
  const idx = band.order.indexOf(genreKey);
  if (idx >= 0) return idx;            // 이 시간대 우선 장르 (위에서부터)
  if (genreKey === "default") return 999; // 기타/미분류는 항상 맨 뒤
  return 100;                          // 나머지 알려진 장르
}

// 탭 재방문 시 즉시 표시용 모듈 캐시 (stale-while-revalidate). 키 = `${showcase}`.
type OttSnapshot = {
  trending: CarouselVideo[];
  formatRows: { category: string; position: "top" | "bottom"; videos: CarouselVideo[] }[];
  genreRows: GenreRow[];
};
const ottCache: Record<string, OttSnapshot> = {};

export function Ott({ onProductClick, onPlayProduct, onNavigate, onHeroScroll }: OttProps) {
  const { t } = useTranslation();
  const { profile, user } = useAuth();
  const showcase = shouldShowShowcase(profile?.is_admin);
  const ageVerified = profile?.age_verified ?? false;

  // 모듈 캐시에서 초기 hydrate — 탭 재방문 시 첫 렌더부터 표시(스피너 스킵)
  const _ottInit = ottCache[String(showcase)];
  const [loading, setLoading] = useState(!_ottInit);
  const [trending, setTrending] = useState<CarouselVideo[]>(_ottInit?.trending ?? []);
  const [genreRows, setGenreRows] = useState<GenreRow[]>(_ottInit?.genreRows ?? []);
  // 형식 카테고리 행 (애니메이션·다큐멘터리·뮤직비디오 — category 기준, 2026-06-11)
  const [formatRows, setFormatRows] = useState<{ category: string; position: "top" | "bottom"; videos: CarouselVideo[] }[]>(_ottInit?.formatRows ?? []);
  // 풀블리드 히어로: 자동재생 영상 소스 + 음소거 토글.
  // clipUrl(미리 잘린 30초 하이라이트 클립)이 있으면 seek 없이 처음부터 재생(안정적).
  const [heroSrc, setHeroSrc] = useState<{ url: string; start: number; end: number; clipUrl?: string; previewUrl?: string } | null>(null);
  const [heroMuted, setHeroMuted] = useState(true);
  const [heroIdx, setHeroIdx] = useState(0);   // 히어로 순환 인덱스 (20초마다)
  const scrollRef = useRef<HTMLDivElement>(null);

  const allVideoIds = useMemo(() => {
    const ids = new Set<string>();
    trending.forEach((v) => ids.add(v.id));
    formatRows.forEach((r) => r.videos.forEach((v) => ids.add(v.id)));
    genreRows.forEach((r) => r.videos.forEach((v) => ids.add(v.id)));
    return Array.from(ids).filter((id) => !id.startsWith("demo-"));
  }, [trending, formatRows, genreRows]);
  const ageRatings = useAgeRatings(allVideoIds);

  const ageGuard: AgeGuard = (v) => {
    const rating = ageRatings[v.id];
    const isMyVideo = !!user?.id && !!v.creator_id && user.id === v.creator_id;
    return { rating, isAgeLocked: !isMyVideo && shouldBlur(rating, ageVerified) };
  };

  // 시간대 무드 편성 — 접속 시각에 따라 카테고리 행 순서 재배치 ("기타"는 항상 맨 뒤)
  const band = useMemo(() => currentBand(), []);
  const orderedRows = useMemo(
    () => [...genreRows].sort(
      (a, b) => bandRank(getGenreStyle(a.category).key, band) - bandRank(getGenreStyle(b.category).key, band),
    ),
    [genreRows, band],
  );

  // 히어로 후보: 트렌딩(비면 카테고리 행 영화) 상위 5편을 20초마다 순환 (2026-06-12)
  const heroFallback = genreRows.flatMap((r) => r.videos);
  const heroes = (trending.length > 0 ? trending : heroFallback).slice(0, 5);
  const heroId = heroes[heroIdx]?.id;
  useEffect(() => { setHeroIdx(0); }, [heroes.length]);   // 목록 바뀌면 처음부터
  useEffect(() => {
    if (heroes.length <= 1) return;
    const id = setInterval(() => setHeroIdx((i) => (i + 1) % heroes.length), 20000);
    return () => clearInterval(id);
  }, [heroes.length]);
  // 현재 히어로의 재생 URL(+클립) 로딩 — RPC엔 video_url 이 없어 별도 조회
  useEffect(() => {
    setHeroSrc(null);
    if (!heroId || heroId.startsWith("demo-") || heroId.startsWith("showcase")) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("videos")
        .select("video_url, highlight_start, highlight_end, hero_clip_url")
        .eq("id", heroId)
        .maybeSingle();
      if (!cancelled && data?.video_url) {
        const hStart = data.highlight_start || 0;
        // 히어로 미리보기: 크리에이터 하이라이트(기본 30초) 그대로, 없으면 +30초
        const hEnd = data.highlight_end || (hStart + 30);
        // 클립 없는 영상은 Bunny 자동 생성 애니메이션 미리보기(preview.webp)로 동적 표시.
        // video_url(.../playlist.m3u8) 의 마지막 경로만 preview.webp 로 치환.
        const previewUrl = /\/[^/]+\.m3u8$/i.test(data.video_url)
          ? data.video_url.replace(/\/[^/]+$/, "/preview.webp")
          : undefined;
        setHeroSrc({ url: data.video_url, start: hStart, end: hEnd, clipUrl: data.hero_clip_url || undefined, previewUrl });
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
    let cancelled = false;
    const key = String(showcase);
    const snap = ottCache[key];
    if (snap) {
      // 캐시 즉시 반영(stale-while-revalidate) — 스피너 없이 직전 데이터 표시 후 아래서 갱신
      setTrending(snap.trending); setFormatRows(snap.formatRows); setGenreRows(snap.genreRows);
      setLoading(false);
    } else {
      setLoading(true);
    }
    async function loadAll() {
      try {
        // 3단 워터폴 → 단일 Promise.all (서로 독립이므로 왕복 3회→1회)
        const [{ data: trd }, formatData, rows] = await Promise.all([
          supabase.rpc("get_trending_videos", { p_tier: "ott", p_hours: 168, p_limit: 10 }),
          Promise.all(
            OTT_FORMAT_DEFS.map((f) =>
              supabase.rpc("get_videos_by_category", { p_category: f.category, p_tier: "ott", p_limit: 50 }),
            ),
          ),
          Promise.all(
            GENRES.map(async (g) => {
              const { data } = await supabase.rpc("get_videos_by_genre", { p_genre: g, p_tier: "ott", p_limit: 50 });
              return { category: g, videos: data || [] } as GenreRow;
            }),
          ),
        ]);

        const merge = (real: CarouselVideo[], opts?: { category?: string }) =>
          showcase ? mergeShowcase(real, showcaseToCarousel, { tier: "ott", ...opts }) : real;

        if (cancelled) return;  // showcase 전환 중 stale 응답 적용 방지

        const nextTrending = merge((trd || []) as CarouselVideo[]);
        const nextFormatRows = OTT_FORMAT_DEFS.map((f, i) => ({
          category: f.category,
          position: f.position,
          videos: merge(((formatData[i] as any)?.data || []) as CarouselVideo[], { category: f.category }),
        })).filter((r) => r.videos.length > 0);

        const mergedRows = rows.map((r) => ({ ...r, videos: merge(r.videos, { category: r.category }) }));
        if (showcase && mergedRows.length < 5) {
          const showcaseCategories = ["drama", "thriller", "romance", "action", "comedy"];
          for (const cat of showcaseCategories) {
            if (mergedRows.find((r) => r.category === cat)) continue;
            const mockOnly = mergeShowcase([] as CarouselVideo[], showcaseToCarousel, { tier: "ott", category: cat, maxShowcase: 12 });
            if (mockOnly.length > 0) mergedRows.push({ category: cat, videos: mockOnly });
            if (mergedRows.length >= 5) break;
          }
        }
        const nextGenreRows = mergedRows.filter((r) => r.videos.length > 0);

        // 모듈 캐시에 기록 → 다음 재방문 시 즉시 표시
        ottCache[key] = { trending: nextTrending, formatRows: nextFormatRows, genreRows: nextGenreRows };
        setTrending(nextTrending);
        setFormatRows(nextFormatRows);
        setGenreRows(nextGenreRows);
      } catch (err: any) {
        console.warn("[Ott] 로딩 실패:", err?.message);
        // 캐시 표시 중이면 백그라운드 갱신 실패는 조용히 무시
        if (!cancelled && !snap) toast.error(t("common.loadError", "콘텐츠를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadAll();
    return () => { cancelled = true; };
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
          video={heroes[heroIdx] ?? heroes[0]}
          src={heroSrc}
          ageGuard={ageGuard}
          muted={heroMuted}
          onToggleMute={() => setHeroMuted((m) => !m)}
          onClick={(v) => onProductClick(toProduct(v))}
          onPlay={(v) => (onPlayProduct ?? onProductClick)(toProduct(v))}
        />
      )}

      {/* ━━━ 시간대 무드 편성 헤더 ━━━ */}
      {orderedRows.length > 0 && (
        <div className="max-w-[1800px] mx-auto px-4 md:px-6 mt-7 mb-1">
          <div className="flex items-center gap-1.5 text-[#a78bfa] text-xs font-bold mb-1">
            <Clock className="w-3.5 h-3.5" /> {t("ott.programmingNow", "지금 이 시간의 편성")}
          </div>
          <h2 className="text-xl md:text-2xl font-black flex items-center gap-2">
            <span>{band.emoji}</span> {band.name}
          </h2>
          <p className="text-xs md:text-sm text-gray-400 mt-0.5">{band.tagline}</p>
        </div>
      )}

      {/* ━━━ 카테고리 마퀴 행 (좌우 교차) — 시간대 무드 순서 ━━━ */}
      <div className="max-w-[1800px] mx-auto mt-3 relative">
        {/* 순서: 애니메이션(top) → 장르(기타 제외) → 다큐·뮤직비디오(bottom) → 기타 */}
        {([
          ...formatRows.filter((r) => r.position === "top").map((r) => ({ category: r.category, videos: r.videos, isFormat: true })),
          ...orderedRows.filter((r) => r.category !== "기타").map((r) => ({ category: r.category, videos: r.videos, isFormat: false })),
          ...formatRows.filter((r) => r.position === "bottom").map((r) => ({ category: r.category, videos: r.videos, isFormat: true })),
          ...orderedRows.filter((r) => r.category === "기타").map((r) => ({ category: r.category, videos: r.videos, isFormat: false })),
        ]).map((row, i) => (
          <CategoryRow
            key={`${row.isFormat ? "fmt" : "gen"}-${row.category}`}
            category={row.category}
            videos={row.videos}
            dir={i % 2 === 0 ? "right" : "left"}
            highlighted={row.isFormat || band.order.includes(getGenreStyle(row.category).key)}
            onClick={(v) => onProductClick(toProduct(v))}
            ageGuard={ageGuard}
          />
        ))}
        {orderedRows.length === 0 && formatRows.length === 0 && (
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
  onPlay,
}: {
  video: CarouselVideo;
  src: { url: string; start: number; end: number; clipUrl?: string; previewUrl?: string } | null;
  ageGuard: AgeGuard;
  muted: boolean;
  onToggleMute: () => void;
  onClick: (v: CarouselVideo) => void;   // 작품 정보 / 섹션 클릭 → 상세
  onPlay: (v: CarouselVideo) => void;    // 지금 보기 → 상세 + 전체화면 재생
}) {
  const { t } = useTranslation();
  const g = ageGuard(video);
  const videoRef = useRef<HTMLVideoElement>(null);
  // 영상이 실제로 재생을 시작했는지. 그 전엔 포스터를 깔아둬 검은/멈춤 화면 방지.
  const [videoReady, setVideoReady] = useState(false);

  // 재생 소스 우선순위: 미리 잘린 30초 하이라이트 클립(seek 불필요·100% 안정) →
  //   풀영상 MP4 폴백 → 샘플 폴백. 클립이 있으면 deep seek 자체를 안 하므로 멈춤·검은화면이 없다.
  // 히어로 클립(미리 잘린 30초)이 있을 때만 자동재생. 없으면 포스터(썸네일)만 표시.
  // (클립 없는 영화로 deep seek/풀영상 재생하면 멈춤·검은화면 위험 → 포스터가 안전·깔끔)
  const playUrl = src?.clipUrl || "";
  const useVideo = !g.isAgeLocked && !!src?.clipUrl;
  // 클립이 없으면 Bunny 애니메이션 미리보기(preview.webp)로 동적 표시 (정적 멈춤 방지).
  const usePreview = !g.isAgeLocked && !src?.clipUrl && !!src?.previewUrl;

  // 네이티브 <video> 사용(배경 영상 표준). playUrl 변경 시 노출 초기화 → 포스터부터 다시.
  useEffect(() => { setVideoReady(false); }, [playUrl]);

  // 음소거 토글을 네이티브 video 에 동기화
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, videoReady]);

  return (
    <section className="relative w-full h-[90vh] md:h-[84vh]">
      <button onClick={() => onClick(video)} className="absolute inset-0 w-full h-full text-left">
        {/* 썸네일 (poster) — 항상 베이스로 깔아둠. 영상이 준비되면 그 위로 영상이 페이드인 (검은 화면 방지) */}
        {video.thumbnail && (
          <img
            src={video.thumbnail}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover ${g.isAgeLocked ? "blur-2xl scale-110" : ""}`}
          />
        )}
        {/* 클립 없는 영상 — Bunny 애니메이션 미리보기(preview.webp). 로드 실패 시 숨겨 썸네일 노출. */}
        {usePreview && (
          <img
            key={src!.previewUrl}
            src={src!.previewUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
        )}
        {/* 영상 — 네이티브 <video> 배경재생. 재생 시작(videoReady) 전까진 투명이라 포스터가 보임.
            key={playUrl} 로 소스 변경 시 재마운트하여 자동재생 재시작. */}
        {useVideo && (
          <div className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-700 ${videoReady ? "opacity-100" : "opacity-0"}`}>
            <video
              key={playUrl}
              ref={videoRef}
              className="w-full h-full object-cover"
              src={playUrl}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onTimeUpdate={() => { const v = videoRef.current; if (v && v.currentTime > 0.05) setVideoReady(true); }}
              onPlaying={() => { const v = videoRef.current; if (v && v.currentTime > 0.05) setVideoReady(true); }}
            />
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
            <button onClick={() => onPlay(video)} className="inline-flex items-center gap-1.5 px-5 md:px-7 py-2.5 rounded-lg bg-white text-black text-sm font-bold hover:bg-white/90 transition-colors">
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
// 카테고리 행 — 기본 자동 흐름(좌/우) + 데스크탑 화살표로 그 방향 추가 진행.
//  · 마우스 올리면 자동 흐름 일시정지(클릭/화살표 조작 편하게). 항목 2벌 복제로 무한 루프.
// ────────────────────────────────────────────────────────────────────────────
function CategoryRow({
  category,
  videos,
  dir,
  highlighted,
  onClick,
  ageGuard,
}: {
  category: string;
  videos: CarouselVideo[];
  dir: "left" | "right";
  highlighted?: boolean;
  onClick: (v: CarouselVideo) => void;
  ageGuard: AgeGuard;
}) {
  const { t } = useTranslation();
  const style = getGenreStyle(category);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const doubled = [...videos, ...videos]; // 무한 루프용 2벌 복제

  // 기본 자동 흐름 (방향: dir) — hover 시 일시정지. scrollWidth/2 지점에서 되감아 끊김 없음.
  // scrollLeft 는 정수 반올림되므로 소수 속도를 누적해 1px 이상 모일 때만 적용 (수동 스크롤과도 호환).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (dir === "right") el.scrollLeft = el.scrollWidth / 2;
    let raf = 0;
    let acc = 0;
    const SPEED = 0.25; // px/frame (느린 흐름)
    const step = () => {
      if (!pausedRef.current && el.scrollWidth > el.clientWidth + 4) {
        acc += SPEED;
        if (acc >= 1) {
          const inc = Math.floor(acc);
          acc -= inc;
          const half = el.scrollWidth / 2;
          el.scrollLeft += dir === "left" ? inc : -inc;
          if (el.scrollLeft >= half) el.scrollLeft -= half;
          else if (el.scrollLeft <= 0) el.scrollLeft += half;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [dir, videos.length]);

  if (videos.length === 0) return null;

  const labelOnLeft = dir === "right"; // 라벨/시작 위치 (행마다 좌우 교차)
  const scroll = (d: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.8;
    el.scrollBy({ left: d === "left" ? -amount : amount, behavior: "smooth" });
  };

  return (
    <section
      className="relative mb-7 group/row"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
    >
      <div
        ref={scrollRef}
        className={`flex gap-3 overflow-x-auto scrollbar-hide ${labelOnLeft ? "pl-12 md:pl-28 md:pr-14" : "pr-12 md:pr-28 md:pl-14"}`}
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
                      loading="lazy"
                      decoding="async"
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
                      {/* 시청연령 · 좋아요 · 조회수 · 가격 — 단조로움 보강 (2026-06-11) */}
                      <div className="flex items-center gap-2.5 mt-1.5">
                        {g.rating && (
                          <span className={`text-[10px] md:text-[11px] px-1.5 py-0.5 rounded font-bold border ${g.rating === "19" ? "border-red-500/60 text-red-300" : "border-white/30 text-gray-200"}`}>
                            {g.rating === "all" ? "전체" : g.rating === "19" ? "19+" : `${g.rating}+`}
                          </span>
                        )}
                        {typeof v.likes === "number" && v.likes > 0 && (
                          <span className="flex items-center gap-1 text-[11px] md:text-xs text-gray-200">
                            <Heart className="w-3.5 h-3.5 fill-[#f87171] text-[#f87171]" />{fmtCompact(v.likes)}
                          </span>
                        )}
                        {typeof v.views === "number" && v.views > 0 && (
                          <span className="flex items-center gap-1 text-[11px] md:text-xs text-gray-400">
                            <Eye className="w-3.5 h-3.5" />{fmtCompact(v.views)}
                          </span>
                        )}
                        <span className="ml-auto text-[12px] md:text-sm font-black">
                          {typeof v.price_standard === "number" && v.price_standard > 0
                            ? (isNegotiationOnly(v.price_standard)
                                ? <span className="text-amber-400">{t("video.negotiationOnly", "별도 협의")}</span>
                                : <span className="text-[#f87171]">₩{v.price_standard.toLocaleString()}</span>)
                            : <span className="text-gray-400">{t("video.notForSaleShort")}</span>}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* 잠금(블러) 시엔 정보 줄이 안 보이므로 모서리 배지로 연령 표시. 평상시는 정보 줄 칩으로 통일 */}
                  {g.isAgeLocked && g.rating && g.rating !== "all" && (
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

      {/* 데스크탑 좌우 nav 화살표 (모바일 숨김 · hover 시 표시 · 클릭 시 좌우 스크롤) */}
      <button
        onClick={() => scroll("left")}
        aria-label={t("videoRow.previous", "이전")}
        className="hidden md:flex absolute left-0 top-0 bottom-0 z-10 w-12 items-center justify-center bg-gradient-to-r from-[#0a0a0a]/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity hover:from-[#0a0a0a]"
      >
        <ChevronLeft className="w-7 h-7 text-white" />
      </button>
      <button
        onClick={() => scroll("right")}
        aria-label={t("videoRow.next", "다음")}
        className="hidden md:flex absolute right-0 top-0 bottom-0 z-10 w-12 items-center justify-center bg-gradient-to-l from-[#0a0a0a]/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity hover:from-[#0a0a0a]"
      >
        <ChevronRight className="w-7 h-7 text-white" />
      </button>

      {/* 반투명 브랜드 카테고리 패널 — 모바일: 가장자리 / 데스크탑: 화살표 옆(안쪽).
          highlighted(=지금 시간 추천)면 따뜻한 시그니처 그라데이션으로 강조 */}
      <div
        className={`absolute top-0 bottom-0 z-20 w-9 md:w-11 flex flex-col items-center justify-center gap-1.5 backdrop-blur-md border-white/15
          ${labelOnLeft ? "left-0 md:left-12 border-r" : "right-0 md:right-12 border-l"}
          ${highlighted
            ? (labelOnLeft ? "bg-gradient-to-r from-[#a78bfa]/65 via-[#ec4899]/45 to-transparent" : "bg-gradient-to-l from-[#a78bfa]/65 via-[#ec4899]/45 to-transparent")
            : (labelOnLeft ? "bg-gradient-to-r from-[#6366f1]/60 via-[#8b5cf6]/35 to-transparent" : "bg-gradient-to-l from-[#6366f1]/60 via-[#8b5cf6]/35 to-transparent")}`}
        title={highlighted ? t("ott.programmingPick", "지금 시간 추천") : undefined}
      >
        <style.Icon className="w-5 h-5 md:w-7 md:h-7 text-white drop-shadow-lg" strokeWidth={2.2} />
        <span className="[writing-mode:vertical-rl] text-xs md:text-base font-black text-white tracking-wide drop-shadow">{t(style.labelKey)}</span>
      </div>
    </section>
  );
}
