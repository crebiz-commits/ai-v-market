// ════════════════════════════════════════════════════════════════════════════
// 크리에이터 스폰서십(협찬) 검수 — 실구현 (2026-07-11)
//   videos.sponsor_* + sponsor_review_status 를 관리.
//   RPC: admin_list_sponsored_videos(filter) / admin_review_sponsorship(id, approve, note, hide)
//   공정거래법: 공시 문구(sponsor_disclosure) 적정성 + 브랜드 위장 + 링크 안전성 검토.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState, useCallback } from "react";
import { Loader2, Check, X, ExternalLink, Sparkles, EyeOff, AlertTriangle } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

interface SponsoredVideo {
  id: string; title: string; thumbnail: string | null;
  creator_id: string; creator_name: string | null;
  sponsor_brand: string; sponsor_logo_url: string | null;
  sponsor_disclosure: string | null; sponsor_link_url: string | null;
  sponsor_review_status: "pending" | "approved" | "rejected" | null;
  sponsor_reviewed_at: string | null; sponsor_review_note: string | null;
  is_hidden: boolean; created_at: string;
}

type Filter = "pending" | "approved" | "rejected" | "all";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "pending", label: "미검수" },
  { key: "approved", label: "승인" },
  { key: "rejected", label: "반려" },
  { key: "all", label: "전체" },
];

// 공시 문구 적정성 간이 판정(관리자 참고용) — "유료 광고/협찬/제공" 등 표기 여부.
function disclosureLooksOk(d: string | null): boolean {
  if (!d || !d.trim()) return false;
  return /광고|협찬|제공|스폰서|유료|sponsor|ad\b|paid/i.test(d);
}

export function AdminSponsorships() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [items, setItems] = useState<SponsoredVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (f: Filter) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_sponsored_videos", { p_filter: f });
    if (error) toast.error("불러오기 실패: " + error.message);
    setItems((data as SponsoredVideo[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const review = async (v: SponsoredVideo, approve: boolean) => {
    let note: string | null = null;
    let hide = false;
    if (!approve) {
      const r = window.prompt("반려 사유 (크리에이터에게 알림으로 전달됩니다):", v.sponsor_review_note || "");
      if (r === null) return;                     // 취소
      note = r.trim();
      if (!note) { toast.error("반려 사유를 입력해 주세요."); return; }
      hide = window.confirm("반려하면서 이 영상을 숨김 처리할까요?\n\n확인 = 숨김(공시 수정 전까지 비공개)\n취소 = 숨김 안 함");
    }
    setBusyId(v.id);
    try {
      const { error } = await supabase.rpc("admin_review_sponsorship", {
        p_video_id: v.id, p_approve: approve, p_note: note, p_hide_on_reject: hide,
      });
      if (error) throw error;
      toast.success(approve ? "협찬 표시 승인됨" : (hide ? "반려 + 숨김 처리됨" : "반려 처리됨"));
      await load(filter);
    } catch (err: any) {
      toast.error(err?.message || "처리 실패");
    } finally {
      setBusyId(null);
    }
  };

  const statusBadge = (s: SponsoredVideo["sponsor_review_status"]) => {
    if (s === "approved") return <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 font-bold">승인됨</span>;
    if (s === "rejected") return <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-300 font-bold">반려됨</span>;
    return <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold">미검수</span>;
  };

  return (
    <div>
      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${
              filter === f.key ? "bg-[#6366f1] text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 text-[#6366f1] animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p>{filter === "pending" ? "검수 대기 중인 협찬 영상이 없습니다." : "해당하는 협찬 영상이 없습니다."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((v) => {
            const okDisc = disclosureLooksOk(v.sponsor_disclosure);
            return (
              <div key={v.id} className="bg-card border border-white/5 rounded-xl p-4">
                <div className="flex gap-4">
                  {/* 썸네일 → 영상 열기 */}
                  <a href={`/?video=${v.id}`} target="_blank" rel="noopener noreferrer"
                    className="w-32 h-20 rounded-lg overflow-hidden bg-black/30 flex-shrink-0 border border-white/10 hover:border-white/30 transition-colors">
                    {v.thumbnail
                      ? <img src={v.thumbnail} alt="" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
                      : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-500">썸네일 없음</div>}
                  </a>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-white truncate">{v.title || "(제목 없음)"}</p>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {statusBadge(v.sponsor_review_status)}
                        {v.is_hidden && <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-300 font-bold flex items-center gap-1"><EyeOff className="w-3 h-3" />숨김</span>}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">크리에이터: {v.creator_name || "—"}</p>

                    {/* 협찬 정보 */}
                    <div className="mt-2 flex items-center gap-2">
                      {v.sponsor_logo_url && (
                        <img src={v.sponsor_logo_url} alt="" className="w-6 h-6 rounded object-contain bg-white/5 border border-white/10"
                          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
                      )}
                      <span className="text-sm font-semibold text-white">🏷 {v.sponsor_brand}</span>
                      {v.sponsor_link_url && (
                        <a href={v.sponsor_link_url} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-[#8b5cf6] hover:underline break-all">
                          <ExternalLink className="w-3 h-3" />{v.sponsor_link_url}
                        </a>
                      )}
                    </div>

                    {/* 공시 문구 — 검수 핵심 (공정거래법) */}
                    <div className={`mt-2 text-xs rounded-lg px-2.5 py-1.5 border ${okDisc ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-200/90" : "bg-red-500/5 border-red-500/25 text-red-200"}`}>
                      <span className="inline-flex items-center gap-1 font-bold">
                        {okDisc ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        공시 문구:
                      </span>{" "}
                      {v.sponsor_disclosure?.trim() || <span className="italic text-red-300">없음 — 광고 표시 누락</span>}
                      {!okDisc && <span className="block mt-0.5 text-[11px] text-red-300/80">⚠ "광고/협찬/유료" 등 명시 표기가 안 보입니다 — 반려 검토</span>}
                    </div>

                    {v.sponsor_review_note && (
                      <p className="mt-1.5 text-[11px] text-gray-400">검수 메모: {v.sponsor_review_note}</p>
                    )}
                  </div>
                </div>

                {/* 액션 */}
                <div className="flex gap-2 mt-3">
                  <Button size="sm" disabled={busyId === v.id} onClick={() => review(v, true)}
                    className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-60">
                    {busyId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" />{v.sponsor_review_status === "approved" ? "승인 유지" : "승인"}</>}
                  </Button>
                  <Button size="sm" variant="outline" disabled={busyId === v.id} onClick={() => review(v, false)}
                    className="flex-1 gap-1.5 border-red-500/30 text-red-300 hover:bg-red-500/10 disabled:opacity-60">
                    <X className="w-4 h-4" />반려{v.sponsor_review_status === "rejected" ? " 유지" : ""}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
