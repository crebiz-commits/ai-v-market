// ════════════════════════════════════════════════════════════════════════════
// Phase 12 — 통합 검색 페이지
// 영상/크리에이터 검색 + 자동완성 + 필터 + 정렬 + 인기 검색어 + 검색 기록
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, X, Loader2, TrendingUp, Clock, Filter, ChevronDown, Eye, Heart, Play, Users, ArrowLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

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
  onClose?: () => void;
}

const CATEGORY_OPTIONS = ["전체", "drama", "action", "comedy", "thriller", "romance", "horror", "documentary", "animation", "music", "shorts", "ad", "tutorial"];
const AI_TOOL_OPTIONS = ["전체", "Sora", "Runway", "Pika", "Kling", "Luma", "Veo", "Midjourney", "기타"];
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

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

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

export function SearchPage({ onProductClick, onViewCreator, onClose }: SearchPageProps) {
  const [query, setQuery] = useState("");
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

  // 자동완성 / 기록 / 인기
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [popular, setPopular] = useState<PopularQuery[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase.rpc("get_search_suggestions", { p_query: query.trim(), p_limit: 8 });
      if (Array.isArray(data)) setSuggestions(data as Suggestion[]);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const runSearch = useCallback(async (q: string) => {
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

      if (videosRes.error) {
        console.error("[SearchPage] search_videos error:", videosRes.error);
        toast.error("영상 검색에 실패했습니다.");
        setVideos([]);
      } else {
        setVideos((videosRes.data ?? []) as VideoResult[]);
      }

      if (creatorsRes.error) {
        console.error("[SearchPage] search_creators:", creatorsRes.error);
        setCreators([]);
      } else {
        setCreators((creatorsRes.data ?? []) as CreatorResult[]);
      }
    } finally {
      setLoading(false);
    }
  }, [category, aiTool, durationIdx, sort]);

  // 필터/정렬 변경 시 자동 재검색 (이미 검색을 했었던 경우만)
  useEffect(() => {
    if (submittedQuery !== "" || hasActiveFilter) {
      runSearch(submittedQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, aiTool, durationIdx, sort]);

  const hasActiveFilter = useMemo(
    () => category !== "전체" || aiTool !== "전체" || durationIdx !== 0,
    [category, aiTool, durationIdx]
  );

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

  const showInitialState = !submittedQuery && !hasActiveFilter && !loading;

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      {/* 헤더: 입력 */}
      <div className="sticky top-0 z-30 bg-[#0a0a0a]/95 backdrop-blur-md border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-2">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 -ml-1 text-gray-400 hover:text-white rounded-lg transition-colors"
              aria-label="닫기"
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
                placeholder="영상, 크리에이터, 태그 검색..."
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
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#8b5cf6]/20 text-[#a78bfa] flex-shrink-0">크리에이터</span>
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
                            <span className="text-[11px] font-bold text-gray-500 uppercase">최근 검색</span>
                            <button
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); handleClearAllHistory(); }}
                              className="text-[11px] text-gray-500 hover:text-white"
                            >
                              모두 지우기
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
                          <div className="px-4 py-2 text-[11px] font-bold text-gray-500 uppercase">실시간 인기</div>
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
                              <span className="text-[10px] text-gray-600">{p.hit_count}회</span>
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
            aria-label="필터"
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
                <FilterChips label="카테고리" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
                <FilterChips label="AI 도구" options={AI_TOOL_OPTIONS} value={aiTool} onChange={setAiTool} />
                <FilterChips
                  label="영상 길이"
                  options={DURATION_OPTIONS.map((d) => d.label)}
                  value={DURATION_OPTIONS[durationIdx].label}
                  onChange={(label) => setDurationIdx(DURATION_OPTIONS.findIndex((d) => d.label === label))}
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
                영상 {videos.length > 0 && `(${videos.length})`}
              </button>
              <button
                onClick={() => setTab("creators")}
                disabled={!submittedQuery}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors disabled:opacity-40 ${
                  tab === "creators" ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" : "text-gray-400 hover:text-white"
                }`}
              >
                크리에이터 {creators.length > 0 && `(${creators.length})`}
              </button>
            </div>

            <div className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOrder)}
                className="appearance-none bg-white/5 border border-white/10 text-xs text-gray-300 rounded-lg pl-3 pr-7 py-1.5 focus:outline-none focus:border-[#6366f1] cursor-pointer"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
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
          videos.length === 0 ? (
            <EmptyResult query={submittedQuery} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {videos.map((v) => (
                <VideoCard key={v.id} video={v} onClick={() => handleClickVideo(v)} />
              ))}
            </div>
          )
        ) : (
          // creators
          creators.length === 0 ? (
            <EmptyResult query={submittedQuery} subject="크리에이터" />
          ) : (
            <div className="space-y-2">
              {creators.map((c) => (
                <CreatorRow key={c.creator_id} creator={c} onClick={() => onViewCreator?.(c.creator_id)} />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 보조 컴포넌트
// ────────────────────────────────────────────────────────────────────────────

function FilterChips({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
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
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VideoCard({ video, onClick }: { video: VideoResult; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="group text-left bg-[#121212] rounded-xl overflow-hidden border border-white/5 hover:border-white/10 transition-colors"
    >
      <div className="relative aspect-video bg-black overflow-hidden">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
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
        <p className="text-sm font-bold text-white truncate">{creator.display_name || "이름 없음"}</p>
        {creator.bio && <p className="text-xs text-gray-500 truncate mt-0.5">{creator.bio}</p>}
        <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-1">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" />팔로워 {formatNumber(Number(creator.follower_count))}</span>
          <span>영상 {formatNumber(Number(creator.video_count))}</span>
        </div>
      </div>
    </motion.button>
  );
}

function EmptyInitial({ popular, onPick }: { popular: PopularQuery[]; onPick: (q: string) => void }) {
  return (
    <div className="py-12 text-center">
      <Search className="w-12 h-12 text-gray-700 mx-auto mb-3" />
      <p className="text-sm text-gray-500 mb-6">영상 제목·태그·크리에이터로 검색해 보세요</p>
      {popular.length > 0 && (
        <div className="max-w-md mx-auto text-left">
          <p className="text-[11px] font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5" /> 실시간 인기 검색
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
                <span className="text-[10px] text-gray-600">{p.hit_count}회</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyResult({ query, subject = "영상" }: { query: string; subject?: string }) {
  return (
    <div className="py-20 text-center">
      <Search className="w-12 h-12 text-gray-700 mx-auto mb-3" />
      <p className="text-sm text-gray-400 mb-1">
        {query ? `"${query}" 검색 결과가 없습니다` : "검색 결과가 없습니다"}
      </p>
      <p className="text-xs text-gray-600">다른 키워드나 필터를 시도해 보세요</p>
      <p className="text-xs text-gray-700 mt-3">({subject} 결과)</p>
    </div>
  );
}
