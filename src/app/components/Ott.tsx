// ════════════════════════════════════════════════════════════════════════════
// OTT 페이지 — 재설계 (2026-06-01)
//   1. 상단 히어로: 풀블리드 단일 빌보드 — (피처링+트렌딩) 상위 5편 순환(30초 상한/클립종료 시 조기전환)
//   2. 하단 카테고리 행: 한 줄 우측·다음 줄 좌측으로 천천히 자동 흐름(마퀴),
//      가로형 카드 + 제목/정보 카드 안. 마우스 올리면 정지. (쿠팡플레이 하단 스타일)
//   ↳ 연령 게이트(블러/잠금) + 쇼케이스 합성 유지.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { Play, Info, Plus, Lock, Loader2, Volume2, VolumeX, Clock, ChevronLeft, ChevronRight, Heart, Eye, Layers, ExternalLink } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { BUNNY_HOST } from "../utils/bunnyHost";
import { useAuth } from "../contexts/AuthContext";
import { useLikes } from "../contexts/LikesContext";
import { VideoRowCarousel, type CarouselVideo } from "./VideoRowCarousel";
import { useCollections, CREAITE_SELECT_SLUG } from "../data/collections";
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
import { useSeriesCounts } from "../hooks/useSeriesCounts";
import { BETA_MODE, BETA_ROW_TARGET } from "../config/beta";
import { BetaCard } from "./BetaCard";

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
  onAddToCart?: (product: Product) => void;     // 카드 '+' → 라이선스 담기 (OTT도 마켓 대상)
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
  { id: "dawn",    emoji: "🌌", name: "잠 못 드는 새벽", tagline: "긴장감으로 깨어 있는 시간", order: ["horror", "thriller", "sci-fi", "fantasy", "abstract"] },
  { id: "morning", emoji: "🌅", name: "하루를 여는 아침", tagline: "잔잔하게 시작하는 한 편",   order: ["nature", "documentary", "drama", "animation", "music"] },
  { id: "day",     emoji: "☀️", name: "활기찬 낮",       tagline: "가볍고 신나는 무드",       order: ["comedy", "action", "animation", "sci-fi", "nature"] },
  { id: "evening", emoji: "🌆", name: "함께 보는 저녁",   tagline: "누군가와 나누는 시간",     order: ["drama", "romance", "comedy", "fantasy", "nature"] },
  { id: "night",   emoji: "🌙", name: "몰입의 밤",        tagline: "깊이 빠져드는 한 편",     order: ["thriller", "romance", "sci-fi", "drama", "horror", "abstract"] },
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

// 새로고침(F5)·재방문 콜드스타트 즉시 페인트 — 홈피드·시네마와 동일한 localStorage SWR.
//   (OTT 행 데이터는 트렌딩/형식/장르 = 비개인화 공개 데이터라 사용자 키 불필요, showcase 만 대조)
const OTT_LS_KEY = "aivm_ott_v1";
const OTT_LS_TTL_MS = 30 * 60_000;
function readOttLS(key: string): OttSnapshot | null {
  try {
    const raw = localStorage.getItem(OTT_LS_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s?.key !== key || !s?.snap || Date.now() - (s.ts || 0) > OTT_LS_TTL_MS) return null;
    return s.snap as OttSnapshot;
  } catch { return null; }
}
function writeOttLS(key: string, snap: OttSnapshot) {
  try { localStorage.setItem(OTT_LS_KEY, JSON.stringify({ key, ts: Date.now(), snap })); } catch { /* quota 등 무시 */ }
}

// ⚡ 데이터 프리페치(App idle에서 호출) — 번들 RPC 를 미리 받아 loadAll 이 우선 소비.
//   원시 번들만 보관(매핑·showcase 머지는 컴포넌트 경로가 수행 = 로직 중복 없음). 5분 TTL.
let ottBundlePrefetch: { ts: number; p: Promise<any | null> } | null = null;
const OTT_BUNDLE_PREFETCH_TTL_MS = 5 * 60_000;
export function prefetchOttFeed() {
  if (Object.keys(ottCache).length > 0) return;  // 이미 데워짐(세션 캐시)
  if (ottBundlePrefetch && Date.now() - ottBundlePrefetch.ts < OTT_BUNDLE_PREFETCH_TTL_MS) return;
  ottBundlePrefetch = {
    ts: Date.now(),
    p: Promise.resolve(supabase.rpc("get_feed_bundle", {
      p_tier: "ott",
      p_genres: GENRES,
      p_categories: OTT_FORMAT_DEFS.map((f) => f.category),
      p_row_limit: 24,
    })).then((r: any) => (r?.error ? null : (r?.data ?? null))).catch(() => null),
  };
}
// 히어로 영상 소스 캐시(heroId → src) — 30초(상한) 회전마다 같은 영상 video_url 재조회 방지
type HeroSrc = { videoId: string; url: string; start: number; end: number; clipUrl?: string; previewUrl?: string };
const heroSrcCache = new Map<string, HeroSrc>();

// ── 히어로 영상광고 (수주/자체 재사용) ──────────────────────────────────────
//   ads_public(승인·활성·기간·예산 강제) 에서 영상광고(video_preroll)를 가져와
//   비디오 히어로 사이에 고르게 삽입(각 광고 순환마다 1번씩 ≈ N편마다 1개).
type HeroAd = {
  id: string; title: string; advertiser: string | null;
  video_url: string; thumbnail_url: string | null; link_url: string | null; cta_text: string | null;
};
type HeroItem = { type: "video"; video: CarouselVideo } | { type: "ad"; ad: HeroAd };

function buildHeroItems(videos: CarouselVideo[], ads: HeroAd[]): HeroItem[] {
  if (ads.length === 0) return videos.map((v) => ({ type: "video", video: v }));
  const V = videos.length;
  if (V === 0) return ads.slice(0, 3).map((ad) => ({ type: "ad", ad })); // 영상 없으면 광고만(캡)
  // 광고를 영상 수보다 많이 넣지 않음(꼬리 클러스터 방지) + 영상 사이에 고르게 1번씩 삽입.
  const use = ads.slice(0, Math.min(ads.length, V));
  const A = use.length;
  const pos = new Set<number>();
  for (let k = 1; k <= A; k++) pos.add(Math.round((k * V) / (A + 1))); // 균등 위치(영상 인덱스 기준)
  const items: HeroItem[] = [];
  let ai = 0;
  videos.forEach((v, i) => {
    items.push({ type: "video", video: v });
    if (pos.has(i + 1) && ai < A) items.push({ type: "ad", ad: use[ai++] });
  });
  while (ai < A) items.push({ type: "ad", ad: use[ai++] }); // 위치 겹침 안전망(드묾)
  return items;
}

// 외부 광고 링크 안전 오픈 — http(s) 스킴만 허용(javascript:/data: 차단).
function openAdLinkSafe(rawUrl: string | null | undefined) {
  if (!rawUrl) return;
  try {
    const u = new URL(rawUrl);
    if (u.protocol === "http:" || u.protocol === "https:") window.open(u.href, "_blank", "noopener,noreferrer");
  } catch { /* 잘못된 URL 무시 */ }
}
// 히어로 프리뷰 seek 상한(초). play_720p.mp4 을 highlight_start 로 seek 하는데 너무 깊은 지점
//   (예: "야인의 시대" 296초)은 버퍼링이 느려 선명 프레임이 안 떠 저화질 preview 에 고착됨
//   (바다의 신비 88초는 정상). → 히어로 배경 프리뷰는 이 값까지만 seek(초과분 clamp).
//   실제 highlight_start(상세페이지 하이라이트용)는 DB 그대로 불변 — 히어로 재생 지점만 얕게.
const HERO_MAX_SEEK_SEC = 90;

export function Ott({ onProductClick, onPlayProduct, onAddToCart, onNavigate, onHeroScroll }: OttProps) {
  const { t } = useTranslation();
  const { getCollection } = useCollections();
  const { profile, user } = useAuth();
  const showcase = shouldShowShowcase(profile?.is_admin);
  const ageVerified = profile?.age_verified ?? false;

  // 모듈 캐시(세션 내) → localStorage(새로고침 후) 순으로 초기 hydrate — 첫 렌더부터 표시(스피너 스킵)
  const _ottInit = ottCache[String(showcase)] ?? readOttLS(String(showcase));
  const [loading, setLoading] = useState(!_ottInit);
  const [trending, setTrending] = useState<CarouselVideo[]>(_ottInit?.trending ?? []);
  const [genreRows, setGenreRows] = useState<GenreRow[]>(_ottInit?.genreRows ?? []);
  // 형식 카테고리 행 (애니메이션·다큐멘터리·뮤직비디오 — category 기준, 2026-06-11)
  const [formatRows, setFormatRows] = useState<{ category: string; position: "top" | "bottom"; videos: CarouselVideo[] }[]>(_ottInit?.formatRows ?? []);
  // 풀블리드 히어로: 자동재생 영상 소스 + 음소거 토글.
  // clipUrl(미리 잘린 30초 하이라이트 클립)이 있으면 seek 없이 처음부터 재생(안정적).
  const [heroSrc, setHeroSrc] = useState<HeroSrc | null>(null);   // previewUrl·clipUrl 등 포함(모듈 HeroSrc 타입)
  const [heroMuted, setHeroMuted] = useState(true);
  const [heroIdx, setHeroIdx] = useState(0);   // 히어로 순환 인덱스 (30초 상한 / 클립종료 시 조기전환)
  const [featured, setFeatured] = useState<CarouselVideo[]>([]);  // 피처링(챌린지 우승작) — 히어로 최우선
  const [heroAds, setHeroAds] = useState<HeroAd[]>([]);           // 히어로 영상광고(수주/자체)
  const scrollRef = useRef<HTMLDivElement>(null);

  // CREAITE 셀렉트(공식 선정작) — 히어로 바로 아래 노출. creaite-select videoIds 로 로드.
  const [selectVideos, setSelectVideos] = useState<CarouselVideo[]>([]);
  // 셀렉트 videoIds 를 문자열 키로 — DB 로드/변경 시(폴백→DB) 이 키가 바뀌어 재조회.
  const selectIdsKey = (getCollection(CREAITE_SELECT_SLUG)?.videoIds ?? []).join(",");
  useEffect(() => {
    const ids = selectIdsKey ? selectIdsKey.split(",") : [];
    if (!ids.length) { setSelectVideos([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("videos")
        .select("id, title, thumbnail, creator, creator_id, category, genre, duration, duration_seconds, ai_tool, price_standard, views, likes, highlight_start, highlight_end")
        .in("id", ids).or("visibility.eq.public,visibility.is.null").eq("is_hidden", false);
      if (cancelled) return;
      const map = new Map((data || []).map((v: any) => [v.id, { ...v, creator_display_name: v.creator, creator_avatar: null } as CarouselVideo]));
      setSelectVideos(ids.map((id) => map.get(id)).filter(Boolean) as CarouselVideo[]);
    })();
    return () => { cancelled = true; };
  }, [selectIdsKey]);

  const allVideoIds = useMemo(() => {
    const ids = new Set<string>();
    trending.forEach((v) => ids.add(v.id));
    formatRows.forEach((r) => r.videos.forEach((v) => ids.add(v.id)));
    genreRows.forEach((r) => r.videos.forEach((v) => ids.add(v.id)));
    selectVideos.forEach((v) => ids.add(v.id));
    // featured(챌린지 우승작)는 히어로 최우선 노출인데 여기 빠져 있어 연령등급이 조회되지 않았음 →
    //   19+ featured 히어로가 블러 안 되던 청소년보호 구멍 + ratingKnown 게이트로 재생 막히던 것 해소.
    featured.forEach((v) => ids.add(v.id));
    return Array.from(ids).filter((id) => !id.startsWith("demo-"));
  }, [trending, formatRows, genreRows, selectVideos, featured]);
  const ageRatings = useAgeRatings(allVideoIds);
  const seriesCounts = useSeriesCounts(allVideoIds);

  const ageGuard = useCallback<AgeGuard>((v) => {
    const rating = ageRatings[v.id];
    const isMyVideo = !!user?.id && !!v.creator_id && user.id === v.creator_id;
    return { rating, isAgeLocked: !isMyVideo && shouldBlur(rating, ageVerified) };
  }, [ageRatings, user?.id, ageVerified]);

  // BETA_MODE: 업로드 페이지로 이동 (베타 카드/CTA). BETA_MODE 꺼지면 undefined → 베타 UI 미표시.
  const goUpload = useMemo(() => (BETA_MODE ? () => onNavigate?.("upload") : undefined), [onNavigate]);
  // 핸들러 안정화 — 매 렌더 새 참조로 memo 자식(CategoryRow/HeroBillboard)이 리렌더되던 것 방지
  const handleClick = useCallback((v: CarouselVideo) => onProductClick(toProduct(v)), [onProductClick]);
  const handlePlay = useCallback((v: CarouselVideo) => (onPlayProduct ?? onProductClick)(toProduct(v)), [onPlayProduct, onProductClick]);
  // 카드 '+' → 라이선스 담기. OTT 영상도 마켓 판매 대상(price_standard>0)이면 담김.
  //   미주입 시 undefined → 카트 버튼/배지 자체가 숨겨짐.
  const handleAddToCart = useMemo(
    () => (onAddToCart ? (v: CarouselVideo) => onAddToCart(toProduct(v)) : undefined),
    [onAddToCart]
  );
  const toggleHeroMute = useCallback(() => setHeroMuted((m) => !m), []);

  // 시간대 무드 편성 — 접속 시각에 따라 카테고리 행 순서 재배치 ("기타"는 항상 맨 뒤)
  const band = useMemo(() => currentBand(), []);
  const orderedRows = useMemo(
    () => [...genreRows].sort(
      (a, b) => bandRank(getGenreStyle(a.category).key, band) - bandRank(getGenreStyle(b.category).key, band),
    ),
    [genreRows, band],
  );

  // 히어로 후보: 트렌딩(비면 카테고리 행 영화) 상위 5편 순환 (2026-06-12)
  // 순환 규칙(2026-07-08): 클립 영상 = 클립 길이만큼 1회 재생 후 즉시 전환(반복 없음),
  //                       그 외 = 최대 30초 후 전환. 30초는 상한 타이머.
  const heroFallback = genreRows.flatMap((r) => r.videos);
  // 피처링(챌린지 우승작)을 히어로 최우선으로 앞에 붙이고 중복 제거 후 상위 5편
  const _heroPool = trending.length > 0 ? trending : heroFallback;
  const _heroSeen = new Set<string>();
  const heroes = [...featured, ..._heroPool].filter((v) => {
    if (!v?.id || _heroSeen.has(v.id)) return false;
    _heroSeen.add(v.id);
    return true;
  }).slice(0, 5);
  // 영상 히어로 사이에 영상광고 삽입 → 순환 아이템(광고면 HeroAdBillboard 로 별도 렌더)
  const heroItems = buildHeroItems(heroes, heroAds);
  const currentItem = heroItems[heroIdx] ?? heroItems[0];
  const currentAd = currentItem?.type === "ad" ? currentItem.ad : null;
  const currentVideo = currentItem?.type === "video" ? currentItem.video : null;
  const heroId = currentVideo?.id;   // 광고 아이템이면 undefined → heroSrc 조회 스킵
  useEffect(() => { setHeroIdx(0); }, [heroItems.length]);   // 목록 바뀌면 처음부터
  // 고정 인터벌 대신 히어로별 타임아웃(30초 상한) — 클립/광고가 ended 로 조기 전환해도
  // 다음 히어로가 30초를 온전히 갖는다(heroIdx 바뀔 때마다 타이머 리셋).
  useEffect(() => {
    if (heroItems.length <= 1) return;
    const id = setTimeout(() => setHeroIdx((i) => (i + 1) % heroItems.length), 30000);
    return () => clearTimeout(id);
  }, [heroItems.length, heroIdx]);
  // 클립/광고 영상이 끝나면 즉시 다음 히어로로 (같은 장면 반복 제거)
  const advanceHero = useCallback(() => setHeroIdx((i) => (i + 1) % Math.max(heroItems.length, 1)), [heroItems.length]);
  // 히어로 영상광고 로드 — ads_public(승인·활성·기간·예산 강제) 의 히어로 전용 광고(hero_display).
  //   프리롤과 독립된 형식(TV 광고처럼 히어로에서 그냥 재생). 자체·수주 모두 포함. 비디오 히어로 사이 삽입.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ads_public")
        .select("id,title,advertiser,video_url,thumbnail_url,link_url,cta_text,ad_type")
        .eq("ad_type", "hero_display")   // OTT 히어로 전용 광고(프리롤과 독립)
        .not("video_url", "is", null)
        .order("id", { ascending: true })
        .limit(12);   // 과다 광고 풀 방어(히어로는 소수만 순환)
      if (cancelled || !Array.isArray(data)) return;
      setHeroAds(
        (data as any[])
          .filter((a) => a.video_url && String(a.video_url).trim())
          .map((a) => ({
            id: a.id, title: a.title || "", advertiser: a.advertiser || null,
            video_url: a.video_url, thumbnail_url: a.thumbnail_url || null,
            link_url: a.link_url || null, cta_text: a.cta_text || null,
          })) as HeroAd[]
      );
    })();
    return () => { cancelled = true; };
  }, []);
  // 피처링 영상(featured_hero_until 미래) 로드 → 히어로 최우선 노출 (챌린지 우승작 1개월)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("videos")
        .select("id, title, thumbnail, creator, creator_id, category, genre, duration, duration_seconds, ai_tool, views, likes, price_standard, highlight_start, highlight_end")
        .gt("featured_hero_until", new Date().toISOString())
        .eq("visibility", "public")
        .eq("status", "ready")
        .eq("is_hidden", false)   // 방어심층: 검수 미통과/숨김 영상은 히어로 제외(RLS 외 명시 필터)
        .order("featured_hero_until", { ascending: false })
        .limit(3);
      if (cancelled || !Array.isArray(data)) return;
      // 이 직접 쿼리는 profiles 조인이 없어 creator(업로드 시 저장된 문자열)만 옴 →
      // 트렌딩 RPC 처럼 프로필 display_name 을 얹어 히어로 업로더명이 일관되게 나오도록 보강.
      const ids = Array.from(new Set(data.map((d: any) => d.creator_id).filter(Boolean)));
      let nameMap: Record<string, string> = {};
      if (ids.length) {
        const { data: ci } = await supabase.rpc("get_creators_info", { p_creator_ids: ids });
        (ci || []).forEach((r: any) => { if (r.creator_name) nameMap[r.creator_id] = r.creator_name; });
      }
      if (!cancelled) setFeatured(
        data.map((d: any) => ({
          ...d,
          creator_display_name: nameMap[d.creator_id] || d.creator,
          // videos.views 는 TEXT — RPC 경로(bigint→number)와 달리 문자열로 오므로 숫자화
          //   (안 하면 toProduct 의 typeof number 체크에 걸려 조회수 0 처리, 2026-07-14).
          views: Number(d.views) || 0,
        })) as unknown as CarouselVideo[]
      );
    })();
    return () => { cancelled = true; };
  }, []);
  // 현재 히어로의 재생 URL(+클립) 로딩 — RPC엔 video_url 이 없어 별도 조회
  useEffect(() => {
    setHeroSrc(null);
    if (!heroId || heroId.startsWith("demo-") || heroId.startsWith("showcase")) return;
    const cached = heroSrcCache.get(heroId);
    if (cached) { setHeroSrc(cached); return; }   // 회전 캐시 hit → 재조회 없음
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("videos")
        .select("video_url, highlight_start, highlight_end, hero_clip_id, hero_clip_status")
        .eq("id", heroId)
        .eq("is_hidden", false)   // 방어심층: 숨김 영상은 히어로 소스 미로딩(RLS 외 명시 필터)
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
        // (seek 재생용 mp4 렌디션 URL 은 HeroBillboard 가 src.url 에서 직접 파생 — 720→480→360→240 폴백 체인.
        //  이전엔 여기서 play_720p.mp4 단일 URL 을 넘겼으나 720p 미생성 영상에서 404 나던 문제로 제거.)
        // 히어로 클립(방식 C): 검수 통과(passed)한 클립만 재생. clipUrl=클립 Bunny playlist(HeroBillboard 가
        //   렌디션 폴백으로 재생). status!='passed'(pending/rejected/none)면 undefined → 본편 파생 폴백.
        const clipUrl = (data.hero_clip_status === "passed" && data.hero_clip_id)
          ? `https://${BUNNY_HOST}/${data.hero_clip_id}/playlist.m3u8`
          : undefined;
        const srcObj: HeroSrc = { videoId: heroId, url: data.video_url, start: hStart, end: hEnd, clipUrl, previewUrl };
        heroSrcCache.set(heroId, srcObj);
        setHeroSrc(srcObj);
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
    const snap = ottCache[key] ?? readOttLS(key);
    if (snap) {
      // 캐시 즉시 반영(stale-while-revalidate) — 스피너 없이 직전 데이터 표시 후 아래서 갱신
      setTrending(snap.trending); setFormatRows(snap.formatRows); setGenreRows(snap.genreRows);
      setLoading(false);
    } else {
      setLoading(true);
    }
    async function loadAll() {
      try {
        // ⚡ 번들 RPC 1회 왕복(기존 15회 병렬 → 1회, feed_bundle_rpc_20260714.sql).
        //   p_tier='ott' 는 서버가 트렌딩을 168h 로 계산. 미적용(PGRST202)·실패 시
        //   아래 기존 병렬 경로로 자동 폴백(배포 순서 무관 무중단).
        let trd: any[] | null = null;
        let formatData: (CarouselVideo[] | null)[] | null = null;
        let rows: GenreRow[] | null = null;
        try {
          // idle 프리페치 결과가 있으면 우선 소비(네트워크 0회) — 없거나 만료면 직접 호출.
          //   ⚠️ one-shot: 소비 즉시 삭제 — 안 지우면 재진입 때마다 옛 프라미스 재사용으로
          //   5분간 백그라운드 갱신이 실제로는 안 돎(신규 업로드 반영 지연).
          const pre = ottBundlePrefetch;
          ottBundlePrefetch = null;
          let bundle: any = (pre && Date.now() - pre.ts < OTT_BUNDLE_PREFETCH_TTL_MS)
            ? await pre.p : null;
          if (!bundle) {
            const { data, error: bundleErr } = await supabase.rpc("get_feed_bundle", {
              p_tier: "ott",
              p_genres: GENRES,
              p_categories: OTT_FORMAT_DEFS.map((f) => f.category),
              p_row_limit: 24,
            });
            if (!bundleErr) bundle = data;
          }
          if (bundle) {
            trd = bundle.trending ?? [];
            formatData = OTT_FORMAT_DEFS.map((f) => ((bundle.formats?.[f.category] ?? []) as CarouselVideo[]));
            rows = GENRES.map((g) => ({ category: g, videos: (bundle.genres?.[g] ?? []) as CarouselVideo[] } as GenreRow));
          }
        } catch { /* 폴백 진행 */ }

        if (!formatData || !rows) {
          // 각 RPC를 안전 래핑(실패 시 null) → 일부 RPC가 네트워크 실패해도 나머지로 채움(OTT 전체가 비는 것 방지).
          const rpcData = (name: string, args: any): Promise<any[] | null> =>
            Promise.resolve(supabase.rpc(name, args)).then((r: any) => r?.data ?? null).catch(() => null);
          // 3단 워터폴 → 단일 Promise.all (서로 독립이므로 왕복 3회→1회)
          [trd, formatData, rows] = await Promise.all([
            rpcData("get_trending_videos", { p_tier: "ott", p_hours: 168, p_limit: 10 }),
            Promise.all(
              OTT_FORMAT_DEFS.map((f) =>
                rpcData("get_videos_by_category", { p_category: f.category, p_tier: "ott", p_limit: 24 }),
              ),
            ),
            Promise.all(
              GENRES.map(async (g) => ({
                category: g,
                videos: (await rpcData("get_videos_by_genre", { p_genre: g, p_tier: "ott", p_limit: 24 })) || [],
              } as GenreRow)),
            ),
          ]);
        }

        const merge = (real: CarouselVideo[], opts?: { category?: string }) =>
          showcase ? mergeShowcase(real, showcaseToCarousel, { tier: "ott", ...opts }) : real;

        if (cancelled) return;  // showcase 전환 중 stale 응답 적용 방지

        // BETA_MODE면 빈 카테고리도 노출(베타 8칸) → filter 우회. 끄면 기존대로 빈 행 숨김.
        const keepRow = (len: number) => BETA_MODE || len > 0;
        const nextTrending = merge((trd || []) as CarouselVideo[]);
        const nextFormatRows = OTT_FORMAT_DEFS.map((f, i) => ({
          category: f.category,
          position: f.position,
          videos: merge((formatData![i] || []) as CarouselVideo[], { category: f.category }),
        })).filter((r) => keepRow(r.videos.length));

        const mergedRows = rows!.map((r) => ({ ...r, videos: merge(r.videos, { category: r.category }) }));
        if (showcase && mergedRows.length < 5) {
          const showcaseCategories = ["drama", "thriller", "romance", "action", "comedy"];
          for (const cat of showcaseCategories) {
            if (mergedRows.find((r) => r.category === cat)) continue;
            const mockOnly = mergeShowcase([] as CarouselVideo[], showcaseToCarousel, { tier: "ott", category: cat, maxShowcase: 12 });
            if (mockOnly.length > 0) mergedRows.push({ category: cat, videos: mockOnly });
            if (mergedRows.length >= 5) break;
          }
        }
        const nextGenreRows = mergedRows.filter((r) => keepRow(r.videos.length));

        // 모듈 캐시 + localStorage 기록 → 재방문·새로고침 시 즉시 표시
        const nextSnap: OttSnapshot = { trending: nextTrending, formatRows: nextFormatRows, genreRows: nextGenreRows };
        ottCache[key] = nextSnap;
        writeOttLS(key, nextSnap);
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
        <Footer mobile onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  if (heroes.length === 0 && genreRows.length === 0) {
    return (
      <div className="h-full overflow-y-auto bg-black flex flex-col">
        <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">{t("ott.noVideos")}</div>
        <Footer mobile onNavigate={onNavigate || (() => {})} />
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => onHeroScroll?.((e.currentTarget.scrollTop || 0) > 80)}
      className={`h-full overflow-y-auto bg-black pb-12 ${heroItems.length === 0 ? "pt-20 md:pt-24" : ""}`}
    >
      {/* ━━━ 풀블리드 단일 히어로 (영상/광고 자동재생) ━━━ */}
      {heroItems.length > 0 && currentAd ? (
        <HeroAdBillboard
          ad={currentAd}
          muted={heroMuted}
          onToggleMute={toggleHeroMute}
          onEnded={heroItems.length > 1 ? advanceHero : undefined}
        />
      ) : heroItems.length > 0 && currentVideo ? (
        <HeroBillboard
          video={currentVideo}
          // heroSrc 는 별도 state 라 히어로 전환 직후 한 박자 늦게 갱신됨(이펙트가 렌더 후 실행).
          //   그 사이 (새 video + 직전 src) 조합으로 직전 영상의 하이라이트가 잠깐 새던 것 차단:
          //   src.videoId 가 현재 히어로와 일치할 때만 사용, 불일치면 null(포스터만) 로 대기.
          src={heroSrc && heroSrc.videoId === currentVideo.id ? heroSrc : null}
          // 사용자 업로드 hero_clip 은 Bunny/Vision 검수를 안 거침 → admin 이 직접 지정(featured)한
          //   히어로에서만 클립 재생 허용. 트렌딩 히어로는 검수된 본편 파생 폴백(preview/mp4)만.
          allowClip={featured.some((f) => f.id === currentVideo.id)}
          ageGuard={ageGuard}
          muted={heroMuted}
          onToggleMute={toggleHeroMute}
          onClick={handleClick}
          onPlay={handlePlay}
          onEnded={heroItems.length > 1 ? advanceHero : undefined}
        />
      ) : null}

      {/* 🏆 CREAITE 셀렉트 — 공식 선정작 (히어로 바로 아래) */}
      {selectVideos.length > 0 && (
        <div className="relative z-10 pt-5">
          <VideoRowCarousel
            title={t("ott.selectTitle", "🏆 CREAITE 셀렉트")}
            subtitle={t("ott.selectSubtitle", "에디터가 보증하는 공식 선정작")}
            videos={selectVideos}
            onVideoClick={handleClick}
            onAddToCart={handleAddToCart}
            ageRatings={ageRatings} seriesCounts={seriesCounts}
            cardWidthClass="w-80 md:w-[30rem]"
          />
        </div>
      )}

      {/* ━━━ 시간대 무드 편성 헤더 ━━━ */}
      {orderedRows.length > 0 && (
        <div className="max-w-[1800px] mx-auto px-4 md:px-6 mt-7 mb-1">
          <div className="flex items-center gap-1.5 text-[#a78bfa] text-xs font-bold mb-1">
            <Clock className="w-3.5 h-3.5" /> {t("ott.programmingNow", "지금 이 시간의 편성")}
          </div>
          <h2 className="text-xl md:text-2xl font-black flex items-center gap-2">
            <span>{band.emoji}</span> {t(`ott.bands.${band.id}.name`)}
          </h2>
          <p className="text-xs md:text-sm text-gray-400 mt-0.5">{t(`ott.bands.${band.id}.tagline`)}</p>
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
            onClick={handleClick}
            onAddToCart={handleAddToCart}
            ageGuard={ageGuard}
            seriesCounts={seriesCounts}
            onUpload={goUpload}
          />
        ))}
        {orderedRows.length === 0 && formatRows.length === 0 && (
          <div className="px-6 py-12 text-center text-gray-500 text-sm">{t("ott.noGenreContent")}</div>
        )}
      </div>

      <Footer mobile onNavigate={onNavigate || (() => {})} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 풀블리드 단일 히어로 (영상 자동재생 — 음소거·하이라이트 구간 반복, 소리 토글)
//  · 헤더 영역까지 꽉 차는 배경. 네이티브 <video> 로 클립/mp4(seek) 재생 + preview.webp 폴백.
//  · 실제 video_url 이 없으면 당분간 샘플 미리보기 영상을 전체 반복 재생 (폴백).
// ────────────────────────────────────────────────────────────────────────────
// ── 히어로 영상광고 빌보드 — 광고영상 자동재생 + 제목/CTA(광고 링크) + '광고' 배지.
//    연령게이트·heroSrc DB조회 없음(광고는 전연령·자체 URL). onEnded 로 다음 히어로 전환.
//    ※ 집계 미호출(아래 useEffect 주석 참조 — 프리롤 dedup/크리에이터수익 오염 회피).
const HeroAdBillboard = memo(function HeroAdBillboard({
  ad, muted, onToggleMute, onEnded,
}: {
  ad: HeroAd;
  muted: boolean;
  onToggleMute: () => void;
  onEnded?: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  // Bunny playlist 면 mp4 렌디션(720→480→360→240 폴백), 아니면 원본 URL.
  const renditions = useMemo(() => {
    const u = ad.video_url || "";
    if (/\/playlist\.m3u8$/i.test(u)) return [720, 480, 360, 240].map((r) => u.replace(/\/playlist\.m3u8$/i, `/play_${r}p.mp4`));
    return u ? [u] : [];
  }, [ad.video_url]);
  const [renIdx, setRenIdx] = useState(0);
  useEffect(() => { setRenIdx(0); setVideoReady(false); }, [ad.id]);
  const playUrl = renditions[renIdx] || "";
  // ⚠️ 히어로 광고는 노출/클릭 집계(feed_impression/feed_click)를 호출하지 않는다.
  //   그 경로는 프리롤과 공유하는 ad_charge_dedup 슬롯을 선점해 (a)실제 프리롤의
  //   크리에이터 수익 이벤트(ad_video_events)를 억제하고 (b)예산광고를 히어로에서 오과금한다.
  //   히어로 전용 집계가 필요하면 별도 이벤트 타입/RPC(독립 dedup·무억제·hero CPM)를 신설할 것.
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted, videoReady]);
  // 화면 밖이면 정지(배터리/데이터), 재진입 시 재생
  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) v.play?.().catch(() => {}); else v.pause?.(); }, { threshold: 0.1 });
    io.observe(v); return () => io.disconnect();
  }, [playUrl]);
  const handleCta = () => { openAdLinkSafe(ad.link_url); };
  return (
    <section className="relative w-full h-[90vh] md:h-[84vh]">
      {/* 블러 배경 — 세로 소재가 가로(데스크탑) 히어로에서 뜰 때 좌우 여백을 채움(크롭 대신) */}
      {ad.thumbnail_url && (
        <img src={ad.thumbnail_url} alt="" aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-60"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
      )}
      {/* 포스터(베이스) — object-contain(전체 노출), 영상 준비 전까지 */}
      {ad.thumbnail_url && (
        <img
          src={ad.thumbnail_url}
          alt=""
          className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${videoReady ? "opacity-0" : "opacity-100"}`}
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
        />
      )}
      {/* 광고 영상 — object-contain(전체 노출·크롭 없음) 으로 세로 소재 대응 */}
      {playUrl && (
        <div className={`absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-700 ${videoReady ? "opacity-100" : "opacity-0"}`}>
          <video
            key={playUrl}
            ref={videoRef}
            className="w-full h-full object-contain"
            src={playUrl}
            autoPlay muted playsInline preload="auto" loop={!onEnded}
            onCanPlay={() => setVideoReady(true)}
            onPlaying={() => setVideoReady(true)}
            onEnded={() => onEnded?.()}
            onError={() => setRenIdx((i) => (i + 1 < renditions.length ? i + 1 : i))}
          />
        </div>
      )}
      {/* 하단 그라데이션 */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none" />
      {/* '광고' 배지 */}
      <div className="absolute top-4 left-4 md:top-6 md:left-8 z-10 px-2.5 py-1 bg-black/50 backdrop-blur-sm border border-white/20 rounded-full text-[11px] font-bold text-white/80 tracking-widest">
        {t("discoveryFeed.adBadge")}
      </div>
      {/* 음소거 토글 */}
      <button
        onClick={onToggleMute}
        aria-label={muted ? t("adPlayer.unmute") : t("adPlayer.mute")}
        className="absolute top-4 right-4 md:top-6 md:right-8 z-10 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white hover:bg-black/70 transition-colors"
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>
      {/* 카피 + CTA */}
      <div className="absolute bottom-0 left-0 right-0 z-10 p-6 md:p-12">
        {ad.advertiser && <p className="text-sm md:text-base text-white/70 font-medium mb-1">{ad.advertiser}</p>}
        {ad.title && <h2 className="text-2xl md:text-5xl font-black text-white mb-4 max-w-2xl line-clamp-2 drop-shadow-lg">{ad.title}</h2>}
        {ad.link_url && (
          <button
            onClick={handleCta}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black text-sm md:text-base font-bold rounded-full hover:bg-white/90 transition-colors"
          >
            {ad.cta_text || t("adPlayer.learnMore")} <ExternalLink className="w-4 h-4" />
          </button>
        )}
      </div>
    </section>
  );
});

const HeroBillboard = memo(function HeroBillboard({
  video,
  src,
  allowClip,
  ageGuard,
  muted,
  onToggleMute,
  onClick,
  onPlay,
  onEnded,
}: {
  video: CarouselVideo;
  src: HeroSrc | null;
  allowClip: boolean;   // admin featured 히어로만 true — 사용자 업로드 미검수 클립 재생 게이트
  ageGuard: AgeGuard;
  muted: boolean;
  onToggleMute: () => void;
  onClick: (v: CarouselVideo) => void;   // 작품 정보 / 섹션 클릭 → 상세
  onPlay: (v: CarouselVideo) => void;    // 지금 보기 → 상세 + 전체화면 재생
  onEnded?: () => void;                  // 클립 재생 끝 → 다음 히어로로 조기 전환 (미주입=단일 히어로, 루프 유지)
}) {
  const { t } = useTranslation();
  const g = ageGuard(video);
  const videoRef = useRef<HTMLVideoElement>(null);
  // 영상이 실제로 재생을 시작했는지. 그 전엔 포스터를 깔아둬 검은/멈춤 화면 방지.
  const [videoReady, setVideoReady] = useState(false);

  // 재생 소스 우선순위:
  //   ① 미리 잘린 하이라이트 클립(hero_clip_url) — 클립 1회 재생 후 다음 히어로(ended).
  //   ② 클립이 없으면 본편 mp4 를 highlight_start 에서 시작해 그대로 연속 재생.
  //      구간 되감기 없음(2026-07-08 단순화: 10초 구간 영상이 30초 창에서 3번 반복되던 것 제거)
  //      → 30초 상한 타이머 또는 영상 종료(ended) 시 다음 히어로로.
  //   preview.webp 를 항상 베이스로 깔아둬 seek 이 버벅이거나 실패해도 화면이 비지 않음(안전 폴백).
  // 클립은 admin featured 히어로 + 검수통과(passed)한 것만 재생(미검수 콘텐츠 게이트, 부모가 status 판정).
  //   클립도 Bunny playlist 라 seek 과 동일하게 mp4 렌디션 폴백 체인으로 재생(네이티브 HLS 미지원 대비).
  //   클립은 0초부터(하이라이트 이미 잘림), 본편 seek 은 highlight_start 로.
  const clipBase = allowClip ? src?.clipUrl : undefined;
  const clipRenditions = useMemo(() => {
    if (!clipBase || !/\/playlist\.m3u8$/i.test(clipBase)) return [] as string[];
    return [720, 480, 360, 240].map((r) => clipBase.replace(/\/playlist\.m3u8$/i, `/play_${r}p.mp4`));
  }, [clipBase]);
  const isClip = clipRenditions.length > 0;
  // 본편 seek 재생용 렌디션 폴백 체인 — Bunny 가 소스에 따라 특정 렌디션을 안 만들 수 있음.
  //   예: "야인의 시대"(1080p)는 play_720p.mp4 가 없고 480/360/240 만 존재 → 720p 하드코딩이 404 나
  //   seek 영상이 실패해 저화질 preview 에 고착되던 버그. 720→480→360→240 순 시도, onError 시 다음으로
  //   폴백해 실제 존재하는 최고 화질을 재생. 전부 실패해야 preview.
  const seekRenditions = useMemo(() => {
    if (!src?.url || isClip || !/\/playlist\.m3u8$/i.test(src.url)) return [] as string[];
    return [720, 480, 360, 240].map((r) => src.url.replace(/\/playlist\.m3u8$/i, `/play_${r}p.mp4`));
  }, [src?.url, isClip]);
  const [renIdx, setRenIdx] = useState(0);
  useEffect(() => { setRenIdx(0); }, [src?.url]);   // 새 히어로 = 720p 부터 다시 시도
  const isSeek = !isClip && seekRenditions.length > 0 && (src?.end ?? 0) > (src?.start ?? 0);
  const activeRenditions = isClip ? clipRenditions : seekRenditions;
  const playUrl = ((isClip || isSeek) ? activeRenditions[renIdx] : undefined) || "";
  // 연령등급이 아직 로드 안 됐으면(g.rating == null) 재생/미리보기 보류(fail-closed).
  //   ageRatings 는 비동기 RPC(전체 id), heroSrc 는 단일행 조회라 src 가 먼저 오는 레이스에서
  //   19+ 히어로가 무블러+소리로 자동재생되던 청소년보호 구멍 차단 → 등급 확정 후 재생/잠금 결정.
  //   (그 사이엔 썸네일 포스터만 노출.)
  const ratingKnown = g.rating != null;
  const useVideo = !g.isAgeLocked && ratingKnown && !!playUrl;
  // 클립이 없으면(=seek 이든 정지든) Bunny 애니메이션 미리보기(preview.webp)를 베이스로 표시.
  const usePreview = !g.isAgeLocked && ratingKnown && !isClip && !!src?.previewUrl;

  // 네이티브 <video> 사용(배경 영상 표준). playUrl 변경 시 노출 초기화 → 포스터부터 다시.
  useEffect(() => { setVideoReady(false); }, [playUrl]);

  // 음소거 토글을 네이티브 video 에 동기화
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, videoReady]);

  // 화면 밖이면 히어로 영상 정지(배터리·데이터 절약), 재진입 시 재생 — 아래로 스크롤 시 계속 재생되던 것 개선
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !useVideo) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) v.play?.().catch(() => {}); else v.pause?.(); },
      { threshold: 0.1 }
    );
    io.observe(v);
    return () => io.disconnect();
  }, [useVideo, playUrl]);

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
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${videoReady ? "opacity-0" : "opacity-100"}`}
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
              loop={isClip && !onEnded}
              playsInline
              preload="auto"
              onEnded={() => onEnded?.()}
              onLoadedMetadata={() => {
                // seek 재생: 메타데이터 로드 후 하이라이트 시작점으로 이동(best-effort).
                //   단, HERO_MAX_SEEK_SEC 로 상한 clamp — 너무 깊은 지점(296초 등)은 딥 seek 이 느려
                //   선명 프레임이 안 떠 저화질 고착되던 것 방지(얕은 지점이라도 선명 재생 우선).
                const v = videoRef.current;
                if (v && isSeek && src) { try { v.currentTime = Math.min(src.start, HERO_MAX_SEEK_SEC); } catch { /* 무시 */ } }
              }}
              onTimeUpdate={() => {
                const v = videoRef.current; if (!v) return;
                // 재생이 시작되면(위치 무관) 즉시 선명 영상 노출 — seek 완료를 기다리지 않는다.
                //   (프로덕션에서 88초 seek 이 느려 videoReady 가 영영 안 켜지던 문제 해결.
                //    seek 이 성공하면 하이라이트 지점, 느리면 잠깐 앞부분이 보였다가 이동.)
                if (v.currentTime > 0.05) setVideoReady(true);
                // (구간 되감기 제거 — 그대로 연속 재생, 전환은 30초 타이머/ended 가 담당)
              }}
              onPlaying={() => { if ((videoRef.current?.currentTime ?? 0) > 0.05) setVideoReady(true); }}
              onError={() => {
                // 이 렌디션이 없으면(404 등) 다음 렌디션으로 폴백(720→480→360→240). 다 실패해야 preview.
                if ((isClip || isSeek) && renIdx < activeRenditions.length - 1) { setRenIdx((i) => i + 1); return; }
                setVideoReady(false);   // 전부 실패 → preview.webp/포스터로 안전 폴백
              }}
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
});

// ────────────────────────────────────────────────────────────────────────────
// 카테고리 행 — 기본 자동 흐름(좌/우) + 데스크탑 화살표로 그 방향 추가 진행.
//  · 마우스 올리면 자동 흐름 일시정지(클릭/화살표 조작 편하게). 항목 2벌 복제로 무한 루프.
// ────────────────────────────────────────────────────────────────────────────
const CategoryRow = memo(function CategoryRow({
  category,
  videos,
  dir,
  highlighted,
  onClick,
  onAddToCart,
  ageGuard,
  seriesCounts,
  onUpload,
}: {
  category: string;
  videos: CarouselVideo[];
  dir: "left" | "right";
  highlighted?: boolean;
  onClick: (v: CarouselVideo) => void;
  onAddToCart?: (v: CarouselVideo) => void;   // 카드 '+' → 담기. 미주입 시 배지 숨김
  ageGuard: AgeGuard;
  seriesCounts?: Record<string, number>;
  onUpload?: () => void;   // BETA_MODE: 넘기면 베타 카드로 8칸 채움 + 우측 CTA
}) {
  const { t } = useTranslation();
  const { displayCount: likesDisplayCount, seedCount: seedLikeCount, displayViews, seedViews } = useLikes();
  // 좋아요·조회수 시드(seed-once) → 다른 피드와 같은 값 공유
  useEffect(() => {
    videos.forEach((v) => { seedLikeCount(v.id, v.likes); seedViews(v.id, v.views ?? undefined); });
  }, [videos, seedLikeCount, seedViews]);
  const style = getGenreStyle(category);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);     // hover 일시정지
  const visibleRef = useRef(true);     // 화면 밖이면 마퀴 reflow 스킵(성능) — pausedRef 와 별개

  // BETA_MODE: 복제(doubled) "전" 원본 배열에 베타 카드를 섞어 8칸까지 채운다(복제로 2배 방지).
  //   item: 실제 영상 { kind: "video" } 또는 베타 카드 { kind: "beta" }.
  const betaActive = BETA_MODE && !!onUpload;
  const betaFill = betaActive ? Math.max(0, BETA_ROW_TARGET - videos.length) : 0;
  type RowItem = { kind: "video"; v: CarouselVideo } | { kind: "beta"; i: number };
  const baseItems: RowItem[] = [
    ...videos.map((v) => ({ kind: "video", v } as RowItem)),
    ...Array.from({ length: betaFill }).map((_, i) => ({ kind: "beta", i } as RowItem)),
  ];
  const doubled = [...baseItems, ...baseItems]; // 무한 루프용 2벌 복제 (베타 카드 포함분 기준)

  // 기본 자동 흐름 (방향: dir) — hover 시 일시정지. 한 카피(주기) 지점에서 되감아 끊김 없음.
  // scrollLeft 는 정수 반올림되므로 소수 속도를 누적해 1px 이상 모일 때만 적용 (수동 스크롤과도 호환).
  //   주기 = 한 카피 + 한 gap = (scrollWidth + GAP)/2 (doubled=2벌). scrollWidth/2 로 감으면 gap/2(6px)씩
  //     덜 감아 매 바퀴 튀고, 한 카피가 뷰포트보다 좁으면(짧은 행) dir=left 는 오른끝에서 얼고 dir=right 는
  //     매 바퀴 튐(BETA_MODE 8칸 패딩으로 가려졌던 잠재버그) → period 기준 + "한 카피>뷰포트일 때만" 로 교정.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const GAP = 12; // gap-3 (px)
    const period0 = (el.scrollWidth + GAP) / 2;   // 한 카피(+gap) 주기
    if (dir === "right" && period0 > el.clientWidth + 4) el.scrollLeft = period0;
    let raf = 0;
    let acc = 0;
    const SPEED = 0.25; // px/frame (느린 흐름)
    const step = () => {
      const period = (el.scrollWidth + GAP) / 2;
      // 한 카피가 뷰포트보다 넓을 때만 흐름 — 짧은 행은 정적(스크롤 불가한 것 억지로 감다 얼거나 튀는 것 방지)
      if (!pausedRef.current && visibleRef.current && period > el.clientWidth + 4) {
        acc += SPEED;
        if (acc >= 1) {
          const inc = Math.floor(acc);
          acc -= inc;
          el.scrollLeft += dir === "left" ? inc : -inc;
          if (el.scrollLeft >= period) el.scrollLeft -= period;
          else if (el.scrollLeft <= 0) el.scrollLeft += period;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [dir, videos.length]);

  // 화면 밖 행은 마퀴 흐름(reflow) 스킵 — 행이 10+개라 전부 60fps reflow 하면 비용 큼. 보이는 동작은 불변.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { visibleRef.current = entry.isIntersecting; },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // BETA_MODE면 빈 카테고리도 베타 카드로 채워 노출. 끄면 기존대로 빈 행 숨김.
  if (videos.length === 0 && !betaActive) return null;

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
        {doubled.map((item, i) => {
            // BETA_MODE: 베타 선점 카드 (영상 부족분). OTT variant로 동일 크기 렌더.
            if (item.kind === "beta") {
              return <BetaCard key={`beta-${item.i}-${i}`} onUpload={onUpload!} variant="ott" />;
            }
            const v = item.v;
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
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      className={`w-full h-full object-cover group-hover/card:scale-105 transition-transform duration-500 ${g.isAgeLocked ? "blur-xl scale-110" : ""}`}
                    />
                  )}

                  {!g.isAgeLocked && (seriesCounts?.[v.id] ?? 0) > 1 && (
                    <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-[#6366f1]/85 backdrop-blur-sm text-white text-[11px] font-bold flex items-center gap-1 z-10">
                      <Layers className="w-3 h-3" />
                      {t("videoRow.seriesBadge", { count: seriesCounts![v.id], defaultValue: "시리즈 · {{count}}화" })}
                    </div>
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
                            {g.rating === "all" ? t("ageBadge.all") : g.rating === "19" ? "19+" : `${g.rating}+`}
                          </span>
                        )}
                        {likesDisplayCount(v.id, v.likes) > 0 && (
                          <span className="flex items-center gap-1 text-[11px] md:text-xs text-gray-200">
                            <Heart className="w-3.5 h-3.5 fill-[#f87171] text-[#f87171]" />{fmtCompact(likesDisplayCount(v.id, v.likes))}
                          </span>
                        )}
                        {displayViews(v.id, v.views) > 0 && (
                          <span className="flex items-center gap-1 text-[11px] md:text-xs text-gray-400">
                            <Eye className="w-3.5 h-3.5" />{fmtCompact(displayViews(v.id, v.views))}
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

                  {/* 카트(담기) 버튼 — hover 가능한 기기에서만 렌더.
                      터치 기기에선 hidden(display:none): opacity-0 만으론 투명해도 영역이 남아
                      우상단 탭을 가로채 담기가 오작동하므로 완전히 제거(카드 탭=영상 상세). */}
                  {!g.isAgeLocked && onAddToCart && (
                    <span
                      role="button"
                      aria-label={t("videoRow.addToCart", "장바구니")}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onAddToCart(v); }}
                      className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/50 backdrop-blur border border-white/30 hidden [@media(hover:hover)]:flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity hover:border-white hover:bg-black/70"
                    >
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

      {/* BETA_MODE: 라벨 패널 반대쪽 상단 빈 공간에 등록 CTA (마퀴 위, 라벨과 겹치지 않게) */}
      {betaActive && (
        <button
          onClick={onUpload}
          className={`absolute top-2 z-30 inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-white/15 bg-black/40 backdrop-blur-sm text-white/60 text-[11px] md:text-xs font-semibold hover:bg-white/10 hover:text-white/90 transition-colors ${labelOnLeft ? "right-3 md:right-16" : "left-3 md:left-16"}`}
        >
          <Plus className="w-3 h-3" /> {t("videoRow.uploadCta")}
        </button>
      )}

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
});
