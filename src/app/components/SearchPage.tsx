// ════════════════════════════════════════════════════════════════════════════
// Phase 12 — 통합 검색 페이지
// 영상/크리에이터 검색 + 자동완성 + 필터 + 정렬 + 인기 검색어 + 검색 기록
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { Search, X, Loader2, TrendingUp, Clock, Filter, ChevronDown, Eye, Heart, Play, Users, ArrowLeft, Lock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Footer } from "./Footer";
import { ExternalAdSlot, EXTERNAL_ADS_ACTIVE } from "./ExternalAdSlot";
import { useBlockedUsers } from "../hooks/useBlockedUsers";
import { useAgeRatings } from "../hooks/useAgeRatings";
import { AgeBadge, shouldBlur } from "./AgeBadge";
import { mergeShowcase, shouldShowShowcase } from "../utils/showcase";
import type { ShowcaseVideo } from "../data/showcaseVideos";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getCategoryLabel, getAiToolLabel } from "../i18n/categoryLabels";
import { formatCompactNumber } from "../i18n/numberFormat";

function showcaseToVideoResult(s: ShowcaseVideo): VideoResult {
  return {
    id: s.id,
    title: s.title,
    thumbnail: s.thumbnail,
    video_url: null,
    creator: s.creator,
    creator_id: s.creatorId ?? null,
    creator_display_name: s.creator,
    creator_avatar: null,
    category: s.category,
    ai_tool: s.tool,
    duration: s.duration,
    duration_seconds: s.durationSeconds,
    views_count: s.views,
    likes: s.likes,
    price_standard: s.price,
  };
}

const HISTORY_KEY = "creaite_search_history";
const HISTORY_MAX = 10;
const DEBOUNCE_MS = 250;

type Tab = "videos" | "creators";
type SortOrder = "relevance" | "latest" | "views" | "likes";

interface VideoResult {
  id: string;
  title: string;
  thumbnail: string;
  video_url: string | null;
  creator: string;
  creator_id: string | null;
  creator_display_name: string | null;
  creator_avatar: string | null;
  category: string | null;
  ai_tool: string | null;
  duration: string | null;
  duration_seconds: number | null;
  views_count: number;
  likes: number;
  price_standard: number | null;
}

interface CreatorResult {
  creator_id: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  video_count: number;
  follower_count: number;
}

interface Suggestion {
  suggestion: string;
  source: string;
}

interface PopularQuery {
  query: string;
  hit_count: number;
}

interface SearchPageProps {
  onProductClick: (video: any) => void;
  onViewCreator?: (creatorId: string) => void;
  initialQuery?: string;   // 외부(홈 검색바 등)에서 넘긴 초기 검색어 → 마운트 시 자동 검색
  onClose?: () => void;
  onNavigate?: (tab: string) => void;
}

// 2026-05-27 카테고리·장르·AI툴 통일 (Upload 와 동일)
const CATEGORY_OPTIONS = ["전체", "영화", "드라마", "애니메이션", "다큐멘터리", "뮤직비디오", "기타"];
const AI_TOOL_OPTIONS = [
  "전체", "Sora", "Runway Gen-3", "Runway Gen-2", "Pika Labs", "Luma Dream Machine", "Kling AI",
  "Seedance 2.0", "Veo 2", "Veo 3", "Hailuo AI", "Wan 2.1", "Hunyuan Video",
  "Mochi 1", "LTX Studio", "Hedra", "Higgsfield", "Pixverse", "기타"
];
const DURATION_OPTIONS: { label: string; min: number | null; max: number | null }[] = [
  { label: "전체", min: null, max: null },
  { label: "1분 미만", min: null, max: 60 },
  { label: "1~5분", min: 60, max: 300 },
  { label: "5~10분", min: 300, max: 600 },
  { label: "10분 이상", min: 600, max: null },
];
const SORT_OPTIONS: { value: SortOrder; label: string }[] = [
  { value: "relevance", label: "관련도순" },
  { value: "latest", label: "최신순" },
  { value: "views", label: "조회수순" },
  { value: "likes", label: "좋아요순" },
];

const formatNumber = formatCompactNumber;

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string").slice(0, HISTORY_MAX) : [];
  } catch {
    return [];
  }
}

function saveHistory(query: string) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return;
  try {
    const prev = loadHistory().filter((q) => q !== trimmed);
    const next = [trimmed, ...prev].slice(0, HISTORY_MAX);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* localStorage 실패 무시 */
  }
}

export function SearchPage({ onProductClick, onViewCreator, initialQuery, onClose, onNavigate }: SearchPageProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState(initialQuery || "");
  const [submittedQuery, setSubmittedQuery] = useState(""); // 실제 검색이 실행된 쿼리
  const [tab, setTab] = useState<Tab>("videos");

  // 필터
  const [category, setCategory] = useState<string>("전체");
  const [aiTool, setAiTool] = useState<string>("전체");
  const [durationIdx, setDurationIdx] = useState(0);
  const [sort, setSort] = useState<SortOrder>("relevance");
  const [showFilters, setShowFilters] = useState(false);

  // 결과
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [creators, setCreators] = useState<CreatorResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);        // 검색결과 더보기 가능 여부(마지막 페이지가 60개면)
  const [loadingMore, setLoadingMore] = useState(false);

  // 자동완성 / 기록 / 인기
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [popular, setPopular] = useState<PopularQuery[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const { profile, user } = useAuth();
  const ageVerified = profile?.age_verified ?? false;
  const { isBlocked } = useBlockedUsers();
  const showcase = shouldShowShowcase(profile?.is_admin);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchSeqRef = useRef(0);   // race 가드: 늦게 도착한 이전 검색이 최신 결과 덮어쓰기 방지
  const suggestSeqRef = useRef(0);  // 자동완성 race 가드

  // 옵션 라벨은 언어에 따라 변환 (값은 그대로 유지)
  const durationLabels = useMemo(() => [
    t("category.all"),
    t("searchPage.durationUnder1"),
    t("searchPage.duration1to5"),
    t("searchPage.duration5to10"),
    t("searchPage.duration10plus"),
  ], [t]);
  const sortLabels = useMemo<Record<SortOrder, string>>(() => ({
    relevance: t("searchPage.sortRelevance"),
    latest: t("searchPage.sortLatest"),
    views: t("searchPage.sortViews"),
    likes: t("searchPage.sortLikes"),
  }), [t]);

  // 마운트: 검색 기록 + 인기 검색어 로드
  useEffect(() => {
    setHistory(loadHistory());
    (async () => {
      const { data } = await supabase.rpc("get_popular_searches", { p_limit: 10, p_days: 7 });
      if (Array.isArray(data)) setPopular(data as PopularQuery[]);
    })();
  }, []);

  // 자동완성 (debounced)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const seq = ++suggestSeqRef.current;
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.rpc("get_search_suggestions", { p_query: query.trim(), p_limit: 8 });
      if (seq !== suggestSeqRef.current) return;   // 늦게 도착한 이전 입력의 제안 폐기
      if (Array.isArray(data)) setSuggestions(data as Suggestion[]);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const runSearch = useCallback(async (q: string) => {
    const seq = ++searchSeqRef.current;
    const trimmed = q.trim();
    setSubmittedQuery(trimmed);
    setShowDropdown(false);

    if (trimmed) {
      saveHistory(trimmed);
      setHistory(loadHistory());
      // 검색 로깅 (백그라운드, 실패 무시)
      supabase.rpc("log_search_query", { p_query: trimmed }).then(() => {}, () => {});
    }

    setLoading(true);
    const dur = DURATION_OPTIONS[durationIdx];
    const rpcParams: Record<string, any> = { p_query: trimmed, p_sort: sort, p_limit: 60, p_offset: 0 };
    if (category !== "전체") rpcParams.p_category = category;
    if (aiTool !== "전체") rpcParams.p_ai_tool = aiTool;
    if (dur.min !== null) rpcParams.p_min_duration = dur.min;
    if (dur.max !== null) rpcParams.p_max_duration = dur.max;
    try {
      const [videosRes, creatorsRes] = await Promise.all([
        supabase.rpc("search_videos", rpcParams),
        trimmed
          ? supabase.rpc("search_creators", { p_query: trimmed, p_limit: 20 })
          : Promise.resolve({ data: [] as CreatorResult[], error: null }),
      ]);

      if (seq !== searchSeqRef.current) return;  // 더 최신 검색이 진행 중이면 폐기

      if (videosRes.error) {
        console.error("[SearchPage] search_videos error:", videosRes.error);
        toast.error(t("searchPage.searchFailed"));
        setVideos([]);
        setHasMore(false);
      } else {
        let realVideos = (videosRes.data ?? []) as VideoResult[];
        // Showcase: 검색어로 mock도 필터링해서 추가
        if (showcase && trimmed) {
          const lq = trimmed.toLowerCase();
          const merged = mergeShowcase(realVideos, showcaseToVideoResult).filter(
            (v) =>
              v.title.toLowerCase().includes(lq) ||
              (v.creator_display_name || v.creator || "").toLowerCase().includes(lq) ||
              (v.category || "").toLowerCase().includes(lq) ||
              (v.ai_tool || "").toLowerCase().includes(lq)
          );
          realVideos = merged;
        }
        setVideos(realVideos);
        setHasMore(((videosRes.data as any[] | null)?.length ?? 0) >= 60);  // RPC 원본이 60개면 다음 페이지 가능
      }

      if (creatorsRes.error) {
        console.error("[SearchPage] search_creators:", creatorsRes.error);
        setCreators([]);
      } else {
        setCreators((creatorsRes.data ?? []) as CreatorResult[]);
      }
    } finally {
      if (seq === searchSeqRef.current) setLoading(false);
    }
  }, [category, aiTool, durationIdx, sort]);

  // 검색결과 더보기 — 현재 필터/정렬 유지하며 다음 60개 이어붙임(중복 id 제외)
  const loadMoreResults = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const dur = DURATION_OPTIONS[durationIdx];
    const rpcParams: Record<string, any> = { p_query: submittedQuery, p_sort: sort, p_limit: 60, p_offset: videos.length };
    if (category !== "전체") rpcParams.p_category = category;
    if (aiTool !== "전체") rpcParams.p_ai_tool = aiTool;
    if (dur.min !== null) rpcParams.p_min_duration = dur.min;
    if (dur.max !== null) rpcParams.p_max_duration = dur.max;
    try {
      const { data, error } = await supabase.rpc("search_videos", rpcParams);
      if (!error && Array.isArray(data)) {
        setVideos((prev) => {
          const seen = new Set(prev.map((v) => v.id));
          return [...prev, ...(data as VideoResult[]).filter((v) => !seen.has(v.id))];
        });
        setHasMore((data as any[]).length >= 60);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, submittedQuery, sort, durationIdx, category, aiTool, videos.length]);

  // 활성 필터 여부 — 아래 useEffect 들보다 먼저 선언(선언순서 역전 TDZ 취약점 제거)
  const hasActiveFilter = useMemo(
    () => category !== "전체" || aiTool !== "전체" || durationIdx !== 0,
    [category, aiTool, durationIdx]
  );

  // 필터/정렬 변경 시 자동 재검색 (이미 검색을 했었던 경우만)
  useEffect(() => {
    if (submittedQuery !== "" || hasActiveFilter) {
      runSearch(submittedQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, aiTool, durationIdx, sort]);

  // 외부에서 초기 검색어를 받으면 마운트 시 1회 자동 검색 (홈 검색바 → 결과 페이지)
  useEffect(() => {
    if (initialQuery && initialQuery.trim()) runSearch(initialQuery.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    runSearch(query);
  };

  const handlePickSuggestion = (text: string) => {
    setQuery(text);
    runSearch(text);
  };

  const handleRemoveHistory = (q: string) => {
    const next = history.filter((h) => h !== q);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    setHistory(next);
  };

  const handleClearAllHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  const handleClickVideo = (v: VideoResult) => {
    onProductClick({
      id: v.id,
      title: v.title,
      thumbnail: v.thumbnail,
      creator: v.creator_display_name || v.creator,
      creatorId: v.creator_id || undefined,
      price: v.price_standard || 0,
      duration: v.duration || "0:00",
      durationSeconds: v.duration_seconds || 0,
      tool: v.ai_tool || "AI",
      category: v.category || undefined,
      videoUrl: v.video_url || "",
    });
  };

  // Phase 24: 차단 사용자 결과는 표시에서 제외 (useMemo — 타이핑마다 전체 결과 재필터 방지)
  const visibleVideos = useMemo(
    () => videos.filter((v) => !v.creator_id || !isBlocked(v.creator_id)),
    [videos, isBlocked]
  );
  const visibleCreators = useMemo(
    () => creators.filter((c) => !isBlocked(c.creator_id)),
    [creators, isBlocked]
  );

  // Phase 26 보강: 카드용 age_rating 일괄 조회
  const allVideoIds = useMemo(
    () => visibleVideos.map((v) => v.id).filter((id) => !id.startsWith("demo-")),
    [visibleVideos],
  );
  const ageRatings = useAgeRatings(allVideoIds);

  const showInitialState = !submittedQuery && !hasActiveFilter && !loading;

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      {/* 헤더: 입력 */}
      <div className="sticky top-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 -ml-1 rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors"
              aria-label={t("searchPage.closeAriaLabel")}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <form onSubmit={handleSubmit} className="flex-1 relative">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 focus-within:border-[#6366f1] rounded-full px-4 py-2.5 transition-colors">
              <Search className="w-5 h-5 text-gray-500 flex-shrink-0" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                placeholder={t("searchPage.placeholder")}
                className="flex-1 bg-transparent border-0 text-sm text-white placeholder-gray-500 focus:outline-none"
                autoComplete="off"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(""); inputRef.current?.focus(); }}
                  className="text-gray-500 hover:text-white transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* 자동완성 / 기록 / 인기 dropdown */}
            <AnimatePresence>
              {showDropdown && (query.trim().length >= 2 ? suggestions.length > 0 : history.length > 0 || popular.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute left-0 right-0 top-full mt-2 bg-[#1c1c1e] border border-white/10 rounded-xl shadow-2xl overflow-hidden max-h-[60vh] overflow-y-auto z-40"
                >
                  {/* 입력 중: 자동완성 */}
                  {query.trim().length >= 2 && suggestions.length > 0 && (
                    <div className="py-1">
                      {suggestions.map((s, i) => (
                        <button
                          key={`s-${i}`}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); handlePickSuggestion(s.suggestion); }}
                          className="w-full text-left px-4 py-2.5 text-sm text-gray-200 hover:bg-white/5 transition-colors flex items-center gap-2"
                        >
                          <Search className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                          <span className="truncate">{s.suggestion}</span>
                          {s.source === "creator" && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8b5cf6]/20 text-[#a78bfa] flex-shrink-0">{t("searchPage.creatorBadge")}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 입력 비어있음: 검색 기록 + 인기 검색어 */}
                  {query.trim().length < 2 && (
                    <>
                      {history.length > 0 && (
                        <div className="py-1">
                          <div className="flex items-center justify-between px-4 py-2">
                            <span className="text-[11px] font-bold text-gray-500 uppercase">{t("searchPage.recentSearches")}</span>
                            <button
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); handleClearAllHistory(); }}
                              className="text-[11px] text-gray-500 hover:text-white"
                            >
                              {t("searchPage.clearAll")}
                            </button>
                          </div>
                          {history.map((h) => (
                            <div key={h} className="flex items-center group hover:bg-white/5">
                              <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); handlePickSuggestion(h); }}
                                className="flex-1 text-left px-4 py-2 text-sm text-gray-200 flex items-center gap-2"
                              >
                                <Clock className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                                <span className="truncate">{h}</span>
                              </button>
                              <button
                                type="button"
                                onMouseDown={(e) => { e.preventDefault(); handleRemoveHistory(h); }}
                                className="px-3 text-gray-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {popular.length > 0 && (
                        <div className="py-1 border-t border-white/5">
                          <div className="px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">{t("searchPage.popularRealtime")}</div>
                          {popular.map((p, i) => (
                            <button
                              key={p.query}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); handlePickSuggestion(p.query); }}
                              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-white/5 transition-colors flex items-center gap-2"
                            >
                              <span className="text-xs font-bold text-[#8b5cf6] w-4">{i + 1}</span>
                              <TrendingUp className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                              <span className="truncate flex-1">{p.query}</span>
                              <span className="text-[10px] text-gray-600">{t("searchPage.hitCount", { count: p.hit_count })}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </form>

          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={`p-2.5 rounded-full border transition-colors ${
              showFilters || hasActiveFilter
                ? "bg-[#6366f1]/20 border-[#6366f1]/40 text-[#a78bfa]"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
            }`}
            aria-label={t("searchPage.filterAriaLabel")}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* 필터 패널 */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-white/5"
            >
              <div className="max-w-4xl mx-auto px-4 py-4 space-y-3">
                <FilterChips
                  label={t("searchPage.filterCategoryLabel")}
                  options={CATEGORY_OPTIONS}
                  value={category}
                  onChange={setCategory}
                  optionLabel={(opt) => opt === "전체" ? t("category.all") : getCategoryLabel(opt, t)}
                />
                <FilterChips
                  label={t("searchPage.filterAiToolLabel")}
                  options={AI_TOOL_OPTIONS}
                  value={aiTool}
                  onChange={setAiTool}
                  optionLabel={(opt) => getAiToolLabel(opt, t) || opt}
                />
                <FilterChips
                  label={t("searchPage.filterDurationLabel")}
                  options={DURATION_OPTIONS.map((d) => d.label)}
                  value={DURATION_OPTIONS[durationIdx].label}
                  onChange={(label) => setDurationIdx(DURATION_OPTIONS.findIndex((d) => d.label === label))}
                  optionLabel={(opt) => durationLabels[DURATION_OPTIONS.findIndex((d) => d.label === opt)] ?? opt}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 탭 + 정렬 */}
        {(submittedQuery || hasActiveFilter) && (
          <div className="max-w-4xl mx-auto px-4 pb-3 flex items-center justify-between gap-3">
            <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
              <button
                onClick={() => setTab("videos")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  tab === "videos" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {t("searchPage.tabVideos")} {visibleVideos.length > 0 && `(${visibleVideos.length})`}
              </button>
              <button
                onClick={() => setTab("creators")}
                disabled={!submittedQuery}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors disabled:opacity-40 ${
                  tab === "creators" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                {t("searchPage.tabCreators")} {visibleCreators.length > 0 && `(${visibleCreators.length})`}
              </button>
            </div>

            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOrder)}
                className="appearance-none bg-white/5 border border-white/10 text-xs text-gray-300 rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-[#6366f1] cursor-pointer"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{sortLabels[o.value]}</option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-gray-500 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* 결과 영역 */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#8b5cf6]" />
          </div>
        ) : showInitialState ? (
          <EmptyInitial popular={popular} onPick={handlePickSuggestion} />
        ) : tab === "videos" ? (
          visibleVideos.length === 0 ? (
            <EmptyResult query={submittedQuery} />
          ) : (
            <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {visibleVideos.map((v, i) => {
                const rating = ageRatings[v.id];
                const isMyVideo = !!user?.id && !!v.creator_id && user.id === v.creator_id;
                const isAgeLocked = !isMyVideo && shouldBlur(rating, ageVerified);
                const card = (
                  <VideoCard
                    key={v.id}
                    video={v}
                    onClick={() => handleClickVideo(v)}
                    rating={rating}
                    isAgeLocked={isAgeLocked}
                  />
                );
                // 결과 8개마다 노출광고 1개(전체 폭). 광고 비활성 시 미삽입(빈칸 방지), 마지막 뒤엔 안 넣음.
                if (EXTERNAL_ADS_ACTIVE && (i + 1) % 8 === 0 && i + 1 < visibleVideos.length) {
                  return (
                    <Fragment key={`row-${v.id}`}>
                      {card}
                      <div className="col-span-full flex justify-center py-2">
                        <ExternalAdSlot index={Math.floor(i / 8)} />
                      </div>
                    </Fragment>
                  );
                }
                return card;
              })}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={loadMoreResults}
                  disabled={loadingMore}
                  className="px-6 py-2.5 rounded-xl text-sm font-bold bg-white/5 border border-white/10 text-gray-200 hover:bg-white/10 disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? t("searchPage.loadingMore", "불러오는 중…") : t("searchPage.loadMore", "더 보기")}
                </button>
              </div>
            )}
            </>
          )
        ) : (
          // creators
          visibleCreators.length === 0 ? (
            <EmptyResult query={submittedQuery} subjectKey="searchPage.subjectCreator" />
          ) : (
            <div className="space-y-2">
              {visibleCreators.map((c) => (
                <CreatorRow key={c.creator_id} creator={c} onClick={() => onViewCreator?.(c.creator_id)} />
              ))}
            </div>
          )
        )}
      </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 보조 컴포넌트
// ────────────────────────────────────────────────────────────────────────────

function FilterChips({ label, options, value, onChange, optionLabel }: { label: string; options: string[]; value: string; onChange: (v: string) => void; optionLabel?: (opt: string) => string }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-500 uppercase mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt === value;
          return (
            <button
              key={opt}
              onClick={() => onChange(opt)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                active
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white"
                  : "bg-white/5 border border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              {optionLabel ? optionLabel(opt) : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VideoCard({
  video,
  onClick,
  rating,
  isAgeLocked,
}: {
  video: VideoResult;
  onClick: () => void;
  rating?: string;
  isAgeLocked?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group text-left bg-[#121212] rounded-xl overflow-hidden border border-white/5 hover:border-white/10 transition-colors"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt=""
            className={`w-full h-full object-cover group-hover:scale-105 transition-transform ${isAgeLocked ? "blur-xl scale-110" : ""}`}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-700">
            <Play className="w-10 h-10" />
          </div>
        )}
        {video.duration && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            {video.duration}
          </span>
        )}
        {/* Phase 26 보강: 19+ 잠금 + 연령 배지 */}
        {isAgeLocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/65 text-center pointer-events-none">
            <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center mb-1.5">
              <Lock className="w-5 h-5 text-white" />
            </div>
            <p className="text-xs font-black text-white">{t("video.ageGateLockTitle")}</p>
          </div>
        )}
        {rating && rating !== "all" && (
          <div className="absolute top-2 right-2">
            <AgeBadge rating={rating} size="xs" />
          </div>
        )}
      </div>
      <div className="p-2.5">
        <h3 className="text-sm font-bold text-white line-clamp-2 mb-1.5">{video.title}</h3>
        <p className="text-[11px] text-gray-500 mb-1.5 truncate">
          {video.creator_display_name || video.creator}
        </p>
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{formatNumber(video.views_count)}</span>
          <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{formatNumber(video.likes)}</span>
        </div>
      </div>
    </motion.button>
  );
}

function CreatorRow({ creator, onClick }: { creator: CreatorResult; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <motion.button
      whileHover={{ x: 2 }}
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 bg-[#121212] rounded-xl border border-white/5 hover:border-white/10 transition-colors text-left"
    >
      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center overflow-hidden flex-shrink-0">
        {creator.avatar_url ? (
          <img src={creator.avatar_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-white text-lg font-bold">{(creator.display_name || "?").charAt(0).toUpperCase()}</span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-white truncate">{creator.display_name || t("searchPage.nameless")}</p>
        {creator.bio && <p className="text-xs text-gray-500 truncate mt-0.5">{creator.bio}</p>}
        <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t("searchPage.followers", { count: formatNumber(Number(creator.follower_count)) })}</span>
          <span>{t("searchPage.videos", { count: formatNumber(Number(creator.video_count)) })}</span>
        </div>
      </div>
    </motion.button>
  );
}

function EmptyInitial({ popular, onPick }: { popular: PopularQuery[]; onPick: (q: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="py-12 text-center">
      <Search className="w-12 h-12 text-gray-700 mx-auto mb-3" />
      <p className="text-sm text-gray-500 mb-6">{t("searchPage.introHelper")}</p>
      {popular.length > 0 && (
        <div className="max-w-md mx-auto text-left">
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> {t("searchPage.trendingHeader")}
          </p>
          <div className="space-y-1">
            {popular.slice(0, 5).map((p, i) => (
              <button
                key={p.query}
                onClick={() => onPick(p.query)}
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-3"
              >
                <span className="text-sm font-bold text-[#8b5cf6] w-4">{i + 1}</span>
                <span className="text-sm text-gray-300 flex-1 truncate">{p.query}</span>
                <span className="text-[10px] text-gray-600">{t("searchPage.hitCount", { count: p.hit_count })}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyResult({ query, subjectKey = "searchPage.subjectVideo" }: { query: string; subjectKey?: string }) {
  const { t } = useTranslation();
  return (
    <div className="py-20 text-center">
      <Search className="w-12 h-12 text-gray-700 mx-auto mb-3" />
      <p className="text-sm text-gray-400 mb-1">
        {query ? t("searchPage.emptyTitle", { query }) : t("searchPage.emptyTitleNoQuery")}
      </p>
      <p className="text-xs text-gray-600">{t("searchPage.emptyHint")}</p>
      <p className="text-xs text-gray-700 mt-3">{t("searchPage.subjectResults", { subject: t(subjectKey) })}</p>
    </div>
  );
}
