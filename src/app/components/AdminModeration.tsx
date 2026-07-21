// 어드민 모더레이션 페이지 (Phase 10.6 + Phase 25)
// 탭 1: 숨김 콘텐츠 관리 — 영상/댓글/커뮤니티글/정지 사용자 통합
// 탭 2: AI 검토 대기 — Google Vision SafeSearch 결과 (점수 70~90%)
import { useEffect, useState } from "react";
import {
  Loader2, EyeOff, Film, MessageSquare, FileText, User, RefreshCw,
  Shield, AlertTriangle, Check, X, Eye, RotateCw,
} from "lucide-react";
import { supabase, supabaseUrl, supabaseAnonKey } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface HiddenRow {
  target_type: string;
  target_id: string;
  title: string | null;
  thumbnail: string | null;
  reason: string | null;
  hidden_at: string | null;
  creator_name: string | null;
  // 2차 감사 보강 — 영상 AI 모더레이션 상태(사유 NULL 식별용) + 댓글 부모(딥링크)
  moderation_status?: string | null;
  moderation_score?: number | null;
  comment_video_id?: string | null;
  comment_post_id?: string | null;
  pending_reports?: number | null;   // 대상에 남은 미처리 신고(복원 전 경고, M-2)
}

// 사유 라벨 파생 — hidden_reason 이 NULL 인 AI/편집 숨김 영상을 식별 가능하게 (M-1/H-1)
function hiddenReason(r: HiddenRow): { text: string; cls: string } {
  // 크리에이터가 자기 영상에서 직접 숨긴 것(creator_hide_comment) — 플랫폼 모더레이션과 구분.
  //   창작자 자율 영역이라 색·문구를 분리해, 관리자가 "위반이라 숨겨진 것"으로 오인하지 않게 한다.
  //   (목록에서 빼지 않는 이유: 크리에이터가 정당한 비판을 전부 숨기는 남용도 감독해야 하므로)
  if (r.reason === "크리에이터 숨김") return { text: "👤 크리에이터 숨김 (창작자 판단)", cls: "text-sky-400/90" };
  if (r.reason) return { text: r.reason, cls: "text-red-400/80" };
  if (r.target_type === "video" && r.moderation_status) {
    const sc = r.moderation_score != null ? ` (${r.moderation_score})` : "";
    if (r.moderation_status === "rejected") return { text: `AI 자동숨김${sc}`, cls: "text-red-400/80" };
    if (r.moderation_status === "flagged")  return { text: `AI 검토 대기${sc}`, cls: "text-amber-400/90" };
    if (r.moderation_status === "pending")  return { text: "⏳ AI 검수 미완 — 복원 시 검수 우회 주의", cls: "text-amber-400/90" };
  }
  return { text: "사유 없음", cls: "text-muted-foreground" };
}

// 숨김 대상 딥링크 — 댓글은 부모(영상/글)로 이동
function hiddenHref(r: HiddenRow): string | null {
  if (r.target_type === "video") return `/?video=${encodeURIComponent(r.target_id)}`;
  if (r.target_type === "user") return `/?tab=channel&creator=${encodeURIComponent(r.target_id)}`;
  if (r.target_type === "community_post") return `/?tab=community&sub=posts&post=${encodeURIComponent(r.target_id)}`;
  if (r.target_type === "comment") {
    if (r.comment_video_id) return `/?video=${encodeURIComponent(r.comment_video_id)}`;
    if (r.comment_post_id) return `/?tab=community&sub=posts&post=${encodeURIComponent(r.comment_post_id)}`;
  }
  return null;
}

const TARGETS = [
  { key: "all", label: "전체" },
  { key: "video", label: "영상" },
  { key: "comment", label: "댓글" },
  { key: "community_post", label: "커뮤니티" },
  { key: "user", label: "정지 사용자" },
];

const ICONS: Record<string, typeof Film> = {
  video: Film,
  comment: MessageSquare,
  community_post: FileText,
  user: User,
};

export function AdminModeration() {
  const [tab, setTab] = useState<"hidden" | "ai">("hidden");
  const [aiCount, setAiCount] = useState<number>(0);

  // AI 검토 대기 카운트 미리 조회 (탭 배지)
  // L5(2026-05-31): 마운트 시 1회만 (이전 [tab] 의존 → 탭 전환마다 중복 조회). AI 탭의 onCountChange 가 이후 최신화.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("get_moderation_queue", {
        p_status: "flagged",
        p_limit: 100,
      });
      setAiCount(Array.isArray(data) ? data.length : 0);
    })();
  }, []);

  return (
    <div>
      {/* 탭 헤더 */}
      <div className="flex gap-2 mb-5 border-b border-white/10">
        <TabButton
          active={tab === "hidden"}
          icon={EyeOff}
          label="숨김 콘텐츠"
          onClick={() => setTab("hidden")}
        />
        <TabButton
          active={tab === "ai"}
          icon={Shield}
          label="AI 검토 대기"
          count={aiCount}
          onClick={() => setTab("ai")}
        />
      </div>

      {tab === "hidden" ? <HiddenContentTab /> : <AIModerationTab onCountChange={setAiCount} />}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 탭 버튼 컴포넌트
// ────────────────────────────────────────────────────────────────────────────
function TabButton({
  active, icon: Icon, label, count, onClick,
}: {
  active: boolean;
  icon: typeof Film;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors -mb-[1px] ${
        active
          ? "border-[#a78bfa] text-white"
          : "border-transparent text-muted-foreground hover:text-white"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
      {typeof count === "number" && count > 0 && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
          active ? "bg-[#a78bfa] text-white" : "bg-amber-500/20 text-amber-300"
        }`}>
          {/* L5: 조회 limit 100 cap 에서 잘리면 99+ 로 표시 */}
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 탭 1 — 숨김 콘텐츠 관리 (기존 Phase 10.6)
// ────────────────────────────────────────────────────────────────────────────
const HIDDEN_PAGE = 30;

function HiddenContentTab() {
  const [rows, setRows] = useState<HiddenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("all");
  const [processingKey, setProcessingKey] = useState<string | null>(null);

  const load = async (mode: "reset" | "more" = "reset") => {
    const off = mode === "reset" ? 0 : offset;
    if (mode === "reset") setLoading(true); else setLoadingMore(true);
    const { data, error } = await supabase.rpc("admin_get_hidden_content", {
      p_target_type: filter, p_limit: HIDDEN_PAGE, p_offset: off,
    });
    if (error) {
      toast.error("숨김 목록 조회 실패: " + error.message);
      if (mode === "reset") setRows([]);
    } else {
      const list = (data || []) as HiddenRow[];
      setRows(prev => (mode === "reset" ? list : [...prev, ...list]));
      setHasMore(list.length === HIDDEN_PAGE);
      setOffset(off + list.length);
    }
    if (mode === "reset") setLoading(false); else setLoadingMore(false);
  };

  useEffect(() => { load("reset"); }, [filter]);

  // H-1: pending(검수 미완) 영상 재검수 — 맹목 복원 대신 Vision 재실행(apply_moderation_result는 pending에서만 동작).
  //   Edge /moderate-video (관리자 호출 가능). Upload.tsx 동일 패턴.
  const rescan = async (r: HiddenRow) => {
    const key = `${r.target_type}:${r.target_id}`;
    if (!confirm(`AI 재검수를 실행하시겠습니까?\n[영상] ${r.title || "(제목 없음)"}\n(Google Vision으로 다시 분석 → 결과에 따라 자동 공개/숨김)`)) return;
    setProcessingKey(key);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${supabaseUrl}/functions/v1/server/moderate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": supabaseAnonKey },
        body: JSON.stringify({ video_id: r.target_id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.status === "pending") toast("아직 검수 대기 — 썸네일/인코딩 준비 중일 수 있습니다. 잠시 후 재시도하세요.");
      else toast.success(`재검수 완료: ${data.status}${data.score != null ? ` (${data.score})` : ""}`);
    } catch (e: any) {
      toast.error("재검수 실패: " + (e?.message || "알 수 없는 에러"));
    } finally {
      setProcessingKey(null);
      load("reset");
    }
  };

  const restore = async (r: HiddenRow) => {
    const key = `${r.target_type}:${r.target_id}`;
    const typeLabel = TARGETS.find(t => t.key === r.target_type)?.label || r.target_type;
    // 크리에이터 자율 영역 보호: 창작자가 자기 영상에서 직접 숨긴 댓글을 관리자가 복원하면
    //   그 판단을 뒤집는 것이라 명시 경고(실수 방지). 감독 자체는 막지 않는다 — 남용 확인 시 진행 가능.
    //   ※ 자동필터(is_filtered)는 RPC 단계에서 이미 목록에서 제외됨. 여기는 "수동 숨김"만 해당.
    const creatorHideWarn = r.reason === "크리에이터 숨김"
      ? `⚠️ 크리에이터가 자기 영상에서 직접 숨긴 댓글입니다.\n복원하면 창작자의 모더레이션 결정을 관리자가 뒤집게 됩니다 (남용 정황이 확인된 경우에만 진행하세요).\n\n`
      : "";
    // M-2: 미처리 신고가 남았으면 복원 전 경고(신고 큐에서 먼저 처리 권장)
    const reportWarn = (r.pending_reports && r.pending_reports > 0)
      ? `⚠️ 이 대상엔 미처리 신고 ${r.pending_reports}건이 남아 있습니다. 복원하면 신고가 미해결인 채 노출됩니다 (신고 큐에서 먼저 처리 권장).\n\n`
      : "";
    const baseMsg = r.target_type === "user"
      ? `이 사용자 계정 정지를 해제하시겠습니까?\n[${r.title || r.target_id}]`
      : r.target_type === "video" && r.moderation_status === "pending"
        ? `⚠️ 이 영상은 AI 검수 미완(pending) 상태입니다.\n복원하면 검수를 우회해 공개됩니다. 대신 '재검수'를 권장합니다.\n\n그래도 복원하시겠습니까? — [${typeLabel}] ${r.title || "(제목 없음)"}`
        : `복원하시겠습니까?\n[${typeLabel}] ${r.title || "(제목 없음)"}`;
    if (!confirm(creatorHideWarn + reportWarn + baseMsg)) return;
    setProcessingKey(key);
    let error;
    if (r.target_type === "video") {
      ({ error } = await supabase.rpc("admin_unhide_video", { p_video_id: r.target_id }));
    } else if (r.target_type === "user") {
      ({ error } = await supabase.rpc("admin_unsuspend_user", { p_user_id: r.target_id }));
    } else if (r.target_type === "comment") {
      // H5: 직접 UPDATE는 author-scoped RLS에 막혀 조용히 실패 → SECURITY DEFINER RPC 사용
      ({ error } = await supabase.rpc("admin_unhide_comment", { p_comment_id: r.target_id }));
    } else {
      ({ error } = await supabase.rpc("admin_unhide_post", { p_post_id: r.target_id }));
    }
    setProcessingKey(null);
    if (error) return toast.error("복원 실패: " + error.message);
    toast.success("복원됨");
    load("reset");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {TARGETS.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              filter === t.key ? "bg-[#6366f1] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >{t.label}</button>
        ))}
        <Button variant="outline" size="sm" onClick={() => load("reset")} disabled={loading} className="ml-auto gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <EyeOff className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{filter === "all" ? "숨김/정지 콘텐츠가 없습니다" : "이 유형의 숨김/정지 항목이 없습니다"}</p>
          {filter !== "all" && <p className="text-xs mt-1">'전체'에서 다른 유형을 확인하세요.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => {
            const Icon = ICONS[r.target_type] || EyeOff;
            const key = `${r.target_type}:${r.target_id}`;
            return (
              <div key={key} className="bg-card border border-red-500/20 rounded-xl p-3">
                <div className="flex items-start gap-3">
                  {r.thumbnail ? (
                    <img src={r.thumbnail} alt="" className="w-14 h-14 rounded object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-bold">
                        {TARGETS.find(t => t.key === r.target_type)?.label}
                      </span>
                      {/* M-2: 미처리 신고 경고 배지 */}
                      {(r.pending_reports ?? 0) > 0 && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />신고 {r.pending_reports}
                        </span>
                      )}
                      <p className="font-semibold text-sm truncate">{r.title || "(제목 없음)"}</p>
                    </div>
                    {(() => { const rl = hiddenReason(r); return (
                      <p className={`text-xs mt-1 ${rl.cls}`}>사유: {rl.text}</p>
                    ); })()}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {r.creator_name || ""} · {r.hidden_at ? new Date(r.hidden_at).toLocaleString("ko-KR") : "-"}
                    </p>
                  </div>
                  {(() => { const href = hiddenHref(r); return (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      {href && (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                           className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-white/10 text-muted-foreground hover:text-white hover:bg-white/5 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                          {r.target_type === "comment" ? "원본" : "보기"}
                        </a>
                      )}
                      {/* H-1: 검수 미완 영상은 맹목 복원 대신 재검수(권장) */}
                      {r.target_type === "video" && r.moderation_status === "pending" && (
                        <Button size="sm" onClick={() => rescan(r)} disabled={processingKey === key} className="bg-[#a78bfa] hover:bg-[#9370f0] text-white gap-1">
                          <RotateCw className="w-3.5 h-3.5" />
                          재검수
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => restore(r)} disabled={processingKey === key} className="text-green-400 border-green-500/30">
                        복원
                      </Button>
                    </div>
                  ); })()}
                </div>
              </div>
            );
          })}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={() => load("more")} disabled={loadingMore} className="gap-1.5">
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "더 보기"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 탭 2 — AI 검토 대기 (Phase 25)
// ────────────────────────────────────────────────────────────────────────────
interface ModerationRow {
  video_id: string;
  title: string | null;
  creator_id: string | null;
  creator_name: string | null;
  thumbnail: string | null;
  m_status: string;
  m_score: number | null;
  m_categories: Record<string, number> | null;
  m_checked_at: string | null;
  m_error: string | null;
  is_hidden: boolean;
  created_at: string;
}

const STATUS_FILTERS = [
  { key: "flagged", label: "검토 대기", color: "amber" },
  { key: "rejected", label: "자동 숨김", color: "red" },
  { key: "pending", label: "분석 안 됨", color: "muted" },
  { key: "passed", label: "통과", color: "green" },
];

const AI_PAGE = 30;

function AIModerationTab({ onCountChange }: { onCountChange: (n: number) => void }) {
  const [rows, setRows] = useState<ModerationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("flagged");
  const [processingId, setProcessingId] = useState<string | null>(null);
  // 3차 감사 — 분석 미완(pending) 백로그. Vision 키 미설정/오류 시 영상이 pending+숨김으로
  //   조용히 누적되나 flagged 배지(0)는 이를 못 잡음 → 별도 노출로 파이프라인 중단 인지.
  const [pendingCount, setPendingCount] = useState<number>(0);

  // 배지 카운트(리스트 페이지네이션과 분리) — flagged(탭 배지) + pending(백로그). 각 100건 cap.
  const refreshCounts = async () => {
    const [fl, pd] = await Promise.all([
      supabase.rpc("get_moderation_queue", { p_status: "flagged", p_limit: 100 }),
      supabase.rpc("get_moderation_queue", { p_status: "pending", p_limit: 100 }),
    ]);
    onCountChange(Array.isArray(fl.data) ? fl.data.length : 0);
    setPendingCount(Array.isArray(pd.data) ? pd.data.length : 0);
  };
  useEffect(() => { refreshCounts(); }, []);

  const load = async (mode: "reset" | "more" = "reset") => {
    const off = mode === "reset" ? 0 : offset;
    if (mode === "reset") setLoading(true); else setLoadingMore(true);
    const { data, error } = await supabase.rpc("get_moderation_queue", {
      p_status: statusFilter, p_limit: AI_PAGE, p_offset: off,
    });
    if (error) {
      toast.error("AI 검토 큐 조회 실패: " + error.message);
      if (mode === "reset") setRows([]);
    } else {
      const list = (data || []) as ModerationRow[];
      setRows(prev => (mode === "reset" ? list : [...prev, ...list]));
      setHasMore(list.length === AI_PAGE);
      setOffset(off + list.length);
    }
    if (mode === "reset") setLoading(false); else setLoadingMore(false);
  };

  useEffect(() => { load("reset"); }, [statusFilter]);

  const resolve = async (videoId: string, decision: "pass" | "reject") => {
    const confirmMsg = decision === "pass"
      ? "이 영상을 통과 처리하시겠습니까?\n(사용자에게 그대로 노출됩니다)"
      : "이 영상을 숨김 처리하시겠습니까?\n(사용자에게 노출되지 않습니다)";
    if (!confirm(confirmMsg)) return;

    setProcessingId(videoId);
    const { error } = await supabase.rpc("resolve_moderation_flag", {
      p_video_id: videoId,
      p_decision: decision,
    });
    setProcessingId(null);

    if (error) {
      toast.error("처리 실패: " + error.message);
      return;
    }
    toast.success(decision === "pass" ? "통과 처리됨" : "숨김 처리됨");
    load("reset");
    refreshCounts();
  };

  // H-1: pending(분석 안 됨) 영상 재검수 — Vision 재실행(apply_moderation_result는 pending에서만 동작)
  const rescan = async (videoId: string) => {
    if (!confirm("AI 재검수를 실행하시겠습니까?\n(Google Vision으로 다시 분석 → 결과에 따라 자동 공개/숨김)")) return;
    setProcessingId(videoId);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const res = await fetch(`${supabaseUrl}/functions/v1/server/moderate-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "apikey": supabaseAnonKey },
        body: JSON.stringify({ video_id: videoId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.status === "pending") toast("아직 검수 대기 — 썸네일/인코딩 준비 중일 수 있습니다.");
      else toast.success(`재검수 완료: ${data.status}${data.score != null ? ` (${data.score})` : ""}`);
    } catch (e: any) {
      toast.error("재검수 실패: " + (e?.message || "알 수 없는 에러"));
    } finally {
      setProcessingId(null);
      load("reset");
      refreshCounts();
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score == null) return "text-muted-foreground";
    if (score >= 90) return "text-red-400";
    if (score >= 70) return "text-amber-400";
    if (score >= 50) return "text-yellow-400";
    return "text-green-400";
  };

  return (
    <div>
      {/* 상태 필터 */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        {STATUS_FILTERS.map(s => (
          <button
            key={s.key}
            onClick={() => setStatusFilter(s.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === s.key ? "bg-[#a78bfa] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >{s.label}{s.key === "pending" && pendingCount > 0 ? ` (${pendingCount > 99 ? "99+" : pendingCount})` : ""}</button>
        ))}
        <Button variant="outline" size="sm" onClick={() => load("reset")} disabled={loading} className="ml-auto gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {/* 3차 감사 — 분석 대기 백로그 경고(파이프라인 중단 인지). 100+ 캡 도달 = 확실한 정체 */}
      {pendingCount >= 100 && (
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-3 mb-4 text-xs text-red-200">
          <p className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            분석 대기(pending) 100건 이상 누적
          </p>
          <p className="text-red-200/70 mt-0.5">
            AI 검수(Google Vision) 파이프라인이 지연·중단됐을 수 있습니다(키 미설정/웹훅 오류). 신규 영상이 계속 숨김 상태로 쌓입니다 — 점검이 필요합니다.
          </p>
        </div>
      )}

      {/* 안내문 */}
      {statusFilter === "flagged" && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-4 text-xs text-amber-200">
          <p className="font-semibold mb-0.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            AI 검토 대기 (점수 70~90)
          </p>
          <p className="text-amber-200/70">
            Google Vision SafeSearch가 정책 위반 가능성을 감지한 영상입니다. <span className="font-semibold">검토 대기(70~89) 영상도 안전을 위해 우선 숨김 상태</span>이니,
            "통과"로 공개하거나 "숨김"으로 유지하세요. 점수 90+ 영상은 자동 숨김(rejected) 처리됩니다.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#a78bfa] animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{STATUS_FILTERS.find(s => s.key === statusFilter)?.label} 영상이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => (
            <div key={r.video_id} className="bg-card border border-white/10 rounded-xl p-4">
              <div className="flex items-start gap-4">
                {r.thumbnail ? (
                  <img src={r.thumbnail} alt="" className="w-24 h-24 rounded object-cover flex-shrink-0" />
                ) : (
                  <div className="w-24 h-24 rounded bg-muted flex items-center justify-center flex-shrink-0">
                    <Film className="w-8 h-8 text-muted-foreground/40" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-2">
                    <p className="font-semibold text-base truncate flex-1">{r.title || "(제목 없음)"}</p>
                    {r.m_score != null && (
                      <span className={`text-xl font-black ${getScoreColor(r.m_score)} flex-shrink-0`}>
                        {r.m_score}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground mb-2">
                    {r.creator_name || "(작성자 미상)"} · {r.m_checked_at ? new Date(r.m_checked_at).toLocaleString("ko-KR") : "분석 안 됨"}
                  </p>

                  {/* 카테고리별 점수 */}
                  {r.m_categories && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {(["adult", "violence", "racy"] as const).map(cat => {
                        const score = r.m_categories?.[cat] ?? 0;
                        return (
                          <span
                            key={cat}
                            className={`text-[10px] px-2 py-1 rounded font-bold ${
                              score >= 75 ? "bg-red-500/15 text-red-300"
                                : score >= 50 ? "bg-amber-500/15 text-amber-300"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {cat}: {score}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {r.m_error && (
                    <p className="text-xs text-red-400/80 mb-2">에러: {r.m_error}</p>
                  )}

                  {r.is_hidden && (
                    <p className="text-xs text-red-400 mb-2 flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />
                      현재 숨김 상태
                    </p>
                  )}

                  {/* 액션 버튼 (flagged/rejected만) */}
                  {(statusFilter === "flagged" || statusFilter === "rejected") && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve(r.video_id, "pass")}
                        disabled={processingId === r.video_id}
                        className="text-green-400 border-green-500/30 gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        통과
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve(r.video_id, "reject")}
                        disabled={processingId === r.video_id}
                        className="text-red-400 border-red-500/30 gap-1.5"
                      >
                        <X className="w-3.5 h-3.5" />
                        숨김 처리
                      </Button>
                      <a
                        href={`/?video=${encodeURIComponent(r.video_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-white/10 text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        영상 보기
                      </a>
                    </div>
                  )}

                  {/* H-1: '분석 안 됨'(pending) 영상 — 재검수(Vision 재실행). pending 에서만 apply_moderation_result 동작 */}
                  {statusFilter === "pending" && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={() => rescan(r.video_id)}
                        disabled={processingId === r.video_id}
                        className="bg-[#a78bfa] hover:bg-[#9370f0] text-white gap-1.5"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        재검수
                      </Button>
                      <a
                        href={`/?video=${encodeURIComponent(r.video_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-white/10 text-muted-foreground hover:text-white hover:bg-white/5 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        영상 보기
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={() => load("more")} disabled={loadingMore} className="gap-1.5">
                {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "더 보기"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
