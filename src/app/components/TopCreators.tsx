// ════════════════════════════════════════════════════════════════════════════
// 이번 주 TOP 크리에이터 (2026-06-11)
//   - TopCreatorsRow: 시네마 맨 아래 가로 행 (10명 + 전체보기)
//   - TopCreatorsPage: 전용 페이지 (?tab=top-creators) — 이벤트 배너 목적지
//   데이터: get_weekly_top_creators RPC (최근 7일 조회수 + 팔로워·누적조회수)
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { ArrowLeft, ChevronRight, ChevronLeft, Trophy, Users, Eye, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { supabase } from "../utils/supabaseClient";
import { useTranslation } from "react-i18next";
import { formatCompactNumber as fmt } from "../i18n/numberFormat";
import { CreatorAvatar } from "./CreatorAvatar";
import { FollowButton } from "./FollowButton";
import { Footer } from "./Footer";
import { useAuth } from "../contexts/AuthContext";

export interface TopCreator {
  creator_id: string;
  creator_name: string;
  avatar_url: string | null;
  follower_count: number;
  weekly_views: number;
  total_views: number;
  video_count: number;
}

export async function fetchTopCreators(limit = 10): Promise<TopCreator[]> {
  const { data, error } = await supabase.rpc("get_weekly_top_creators", { p_limit: limit, p_days: 7 });
  if (error) { console.warn("[TopCreators] 조회 실패:", error.message); return []; }
  return (data || []) as TopCreator[];
}

// 순위별 테마 (링 그라데이션 · 글로우 · 배지 · 워터마크 숫자 색)
function rankTheme(rank: number) {
  if (rank === 0) return { ring: "from-[#fde68a] via-[#fbbf24] to-[#f59e0b]", glow: "rgba(251,191,36,0.38)", badge: "bg-gradient-to-r from-[#fde68a] to-[#f59e0b] text-black", num: "text-[#fbbf24]" };
  if (rank === 1) return { ring: "from-[#e5e7eb] via-[#cbd5e1] to-[#94a3b8]", glow: "rgba(203,213,225,0.30)", badge: "bg-gradient-to-r from-[#e5e7eb] to-[#94a3b8] text-black", num: "text-gray-300" };
  if (rank === 2) return { ring: "from-[#fdba74] via-[#f59e0b] to-[#b45309]", glow: "rgba(245,158,11,0.30)", badge: "bg-gradient-to-r from-[#fdba74] to-[#b45309] text-black", num: "text-[#f59e0b]" };
  return { ring: "from-[#6366f1] to-[#8b5cf6]", glow: "rgba(139,92,246,0.22)", badge: "bg-[#6366f1] text-white", num: "text-[#8b5cf6]" };
}

interface CardProps {
  c: TopCreator;
  rank: number;
  onViewCreator?: (creatorId: string) => void;
  onSignInClick?: () => void;
}

function TopCreatorCard({ c, rank, onViewCreator, onSignInClick }: CardProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isSelf = !!user?.id && user.id === c.creator_id;
  const th = rankTheme(rank);
  return (
    <div className="relative h-full rounded-2xl border border-white/[0.08] bg-gradient-to-b from-[#17171d] to-[#0d0d12] overflow-hidden hover:border-[#8b5cf6]/40 transition-colors">
      {/* 상위 3위 글로우 */}
      {rank < 3 && (
        <div className="pointer-events-none absolute -top-12 left-1/2 -translate-x-1/2 w-28 h-28 rounded-full blur-3xl" style={{ background: th.glow }} />
      )}
      {/* 순위 워터마크 숫자 */}
      <span className={`pointer-events-none absolute top-0.5 right-2.5 text-6xl font-black leading-none opacity-[0.07] ${th.num}`}>{rank + 1}</span>

      <div className="relative p-4 flex flex-col items-center text-center">
        {/* 아바타 + 그라데이션 링 */}
        <button onClick={() => onViewCreator?.(c.creator_id)} className="relative mb-2.5 hover:scale-105 transition-transform">
          <div className={`rounded-full p-[2.5px] bg-gradient-to-br ${th.ring}`}>
            <div className="rounded-full p-0.5 bg-[#0d0d12]">
              <CreatorAvatar avatarUrl={c.avatar_url} name={c.creator_name} size="xl" />
            </div>
          </div>
          <span className={`absolute -bottom-1 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] font-black shadow-md whitespace-nowrap ${th.badge}`}>
            {rank < 3 ? `TOP ${rank + 1}` : `#${rank + 1}`}
          </span>
        </button>

        <button onClick={() => onViewCreator?.(c.creator_id)} className="font-bold text-white text-[15px] leading-tight hover:text-[#a78bfa] transition-colors line-clamp-1 max-w-full mt-1.5">
          {c.creator_name}
        </button>
        <p className="text-[11px] text-gray-500 mt-0.5">{t("topCreators.videosCount", { count: c.video_count })}</p>

        {/* 스탯 칩 */}
        <div className="grid grid-cols-2 gap-1.5 w-full mt-3">
          <div className="rounded-lg bg-white/[0.04] border border-white/5 py-2">
            <p className="text-[15px] font-black text-white leading-none">{fmt(c.follower_count)}</p>
            <p className="text-[9px] text-gray-500 mt-1 flex items-center justify-center gap-0.5"><Users className="w-2.5 h-2.5" />{t("topCreators.subscribers")}</p>
          </div>
          <div className="rounded-lg bg-white/[0.04] border border-white/5 py-2">
            <p className="text-[15px] font-black text-white leading-none">{fmt(c.total_views)}</p>
            <p className="text-[9px] text-gray-500 mt-1 flex items-center justify-center gap-0.5"><Eye className="w-2.5 h-2.5" />{t("topCreators.views")}</p>
          </div>
        </div>

        {/* 액션 — 본인이면 "내 채널" (높이 통일) / 아니면 팔로우 */}
        <div className="w-full mt-3 min-h-[38px] flex items-center">
          {isSelf ? (
            <button
              onClick={() => onViewCreator?.(c.creator_id)}
              className="w-full py-2 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-colors"
            >
              {t("topCreators.myChannel")}
            </button>
          ) : (
            <FollowButton creatorId={c.creator_id} onSignInClick={onSignInClick} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── 시네마 맨 아래 가로 행 ───────────────────────────────────────────────────
interface RowProps {
  onViewCreator?: (creatorId: string) => void;
  onSignInClick?: () => void;
  onSeeAll?: () => void;
}
export function TopCreatorsRow({ onViewCreator, onSignInClick, onSeeAll }: RowProps) {
  const { i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const [creators, setCreators] = useState<TopCreator[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchTopCreators(10).then((cs) => { if (!cancelled) { setCreators(cs); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current; if (!el) return;
    el.scrollBy({ left: dir === "left" ? -el.clientWidth * 0.8 : el.clientWidth * 0.8, behavior: "smooth" });
  };

  if (loading || creators.length === 0) return null;

  return (
    <div className="mb-6 group/row">
      <div className="px-4 md:px-6 mb-2 flex items-center justify-between">
        <h2 className="text-base md:text-xl font-bold flex items-center gap-2">
          <Trophy className="w-5 h-5 text-[#fbbf24]" /> {isKo ? "이번 주 TOP 크리에이터" : "This Week's Top Creators"}
        </h2>
        {onSeeAll && (
          <button onClick={onSeeAll} className="text-xs md:text-sm font-semibold text-[#a78bfa] hover:underline flex items-center gap-0.5">
            {isKo ? "전체보기" : "See all"} <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <div className="relative">
        <button onClick={() => scroll("left")} className="hidden md:flex absolute left-0 top-0 bottom-0 z-10 w-12 items-center justify-center bg-gradient-to-r from-background/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity">
          <ChevronLeft className="w-8 h-8 text-white" />
        </button>
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto scrollbar-hide px-4 md:px-6 pb-2 snap-x" style={{ scrollbarWidth: "none" }}>
          {creators.map((c, i) => (
            <div key={c.creator_id} className="snap-start flex-shrink-0 w-44 md:w-52">
              <TopCreatorCard c={c} rank={i} onViewCreator={onViewCreator} onSignInClick={onSignInClick} />
            </div>
          ))}
        </div>
        <button onClick={() => scroll("right")} className="hidden md:flex absolute right-0 top-0 bottom-0 z-10 w-12 items-center justify-center bg-gradient-to-l from-background/90 to-transparent opacity-0 group-hover/row:opacity-100 transition-opacity">
          <ChevronRight className="w-8 h-8 text-white" />
        </button>
      </div>
    </div>
  );
}

// ── 전용 페이지 (?tab=top-creators) ──────────────────────────────────────────
interface PageProps {
  onBack: () => void;
  onNavigate?: (tab: string) => void;
  onViewCreator?: (creatorId: string) => void;
  onSignInClick?: () => void;
}
export function TopCreatorsPage({ onBack, onNavigate, onViewCreator, onSignInClick }: PageProps) {
  const { i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const [creators, setCreators] = useState<TopCreator[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchTopCreators(50).then((cs) => { if (!cancelled) { setCreators(cs); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="h-full overflow-y-auto bg-[#0a0a0a]">
      {/* 전체 폭 사용 (헤더·푸터와 동일한 max-w-[1800px]) — 좌우 여백 최소화 */}
      <div className="max-w-[1800px] mx-auto px-4 md:px-10 py-6 md:py-10 pb-20">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/15 text-sm font-semibold text-white shadow-sm transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> {isKo ? "뒤로" : "Back"}
        </button>
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-white mb-2 flex items-center gap-2">
            <Trophy className="w-8 h-8 text-[#fbbf24]" /> {isKo ? "이번 주 TOP 크리에이터" : "This Week's Top Creators"}
          </h1>
          <p className="text-gray-400 text-sm md:text-base">
            {isKo ? "최근 7일간 가장 사랑받은 AI 크리에이터들을 만나보세요." : "Meet the most loved AI creators of the past 7 days."}
          </p>
        </motion.div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
        ) : creators.length === 0 ? (
          <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
            <Trophy className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground/80">{isKo ? "아직 랭킹 데이터가 없어요" : "No ranking data yet"}</p>
            <p className="text-xs text-muted-foreground mt-1">{isKo ? "크리에이터들의 활동이 쌓이면 이곳에 표시됩니다." : "Rankings appear as creators get active."}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4">
            {creators.map((c, i) => (
              <TopCreatorCard key={c.creator_id} c={c} rank={i} onViewCreator={onViewCreator} onSignInClick={onSignInClick} />
            ))}
          </div>
        )}
      </div>
      <Footer onNavigate={onNavigate || (() => {})} />
    </div>
  );
}
