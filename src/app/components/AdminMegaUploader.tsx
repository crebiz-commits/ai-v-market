// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 메가커피 "빅메가 업로더" 이벤트 (영화 30편 업로드마다 3만원권)
// upload_milestones 를 admin_list_upload_milestones RPC 로 조회 (작성자 이름·이메일 포함).
// 30편 달성 시 트리거가 자동 기록 → 여기 "대기"로 떠서 어드민이 쿠폰 발송 후 처리.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { Loader2, Coffee, RefreshCw, Mail, CheckCircle2, RotateCcw, ExternalLink, AlertTriangle } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

interface Milestone {
  id: string;
  user_id: string;
  milestone: number;
  video_count: number;
  status: "pending" | "coupon_sent";
  note: string | null;
  created_at: string;
  rewarded_at: string | null;
  creator_name: string | null;
  creator_email: string | null;
  current_visible: number | null;   // 현재 게시(검수통과) 영상 수 — 지급 전 검토 신호
}

function fmt(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AdminMegaUploader() {
  const [items, setItems] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "coupon_sent">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_upload_milestones");
    if (error) {
      console.warn("[AdminMegaUploader] 조회 실패:", error.message);
      toast.error("달성자 조회 실패: " + error.message);
    }
    setItems((data || []) as Milestone[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const setStatus = async (id: string, status: Milestone["status"]): Promise<boolean> => {
    const prev = items;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status, rewarded_at: status === "coupon_sent" ? new Date().toISOString() : null } : it)));
    // 직접 UPDATE → RPC(admin_logs 기록). 지급완료는 금전(쿠폰) 지급 기록이라 감사추적 필수.
    const { error } = await supabase.rpc("admin_set_milestone_status", { p_id: id, p_status: status });
    if (error) { toast.error("변경 실패: " + error.message); setItems(prev); return false; }
    return true;
  };

  // 메가커피 발송: Zoho 열고 이메일 복사 + '지급완료' 자동 기록(별도 버튼 클릭 불필요).
  //   미발송 시 토스트의 '실행취소'로 '대기'로 되돌린다. (이메일 없으면 기록하지 않음)
  const sendCoupon = async (it: Milestone) => {
    const to = it.creator_email || "";
    if (!to.includes("@")) {
      toast.info("이메일이 없어요. 크리에이터에게 직접 연락해 쿠폰을 보내주세요.", { duration: 5000 });
      return;
    }
    try { await navigator.clipboard.writeText(to); } catch {}
    window.open("https://mail.zoho.com/zm/#compose", "_blank", "noopener");

    const guide = `이메일(${to})을 복사했어요. Zoho 작성창에 붙여넣어 메가커피 3만원권을 보내세요.`;
    if (it.status === "coupon_sent") { toast.success(guide, { duration: 5000 }); return; }
    const ok = await setStatus(it.id, "coupon_sent");   // 실패 시 롤백+에러토스트
    if (!ok) return;
    toast.success(`${guide} '지급완료'로 기록했어요.`, {
      duration: 6000,
      action: { label: "실행취소", onClick: () => { void setStatus(it.id, "pending"); } },
    });
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="space-y-4">
      {/* 안내 */}
      <div className="bg-gradient-to-br from-[#FFD200]/15 to-[#FFB000]/10 border border-[#FFD200]/30 rounded-xl p-4">
        <div className="flex items-start gap-2.5">
          <Coffee className="w-5 h-5 text-[#d99a00] flex-shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/90 leading-relaxed">
            영화 <b className="text-foreground">30편</b> 업로드마다 자동으로 달성자가 등록됩니다 (30·60·90편…).
            {" "}<b className="text-foreground">대기</b>는 쿠폰 미발송, 발송 후 <b className="text-foreground">지급완료</b>로 바꿔주세요.
            {" "}지급 전 <b className="text-foreground">채널 확인</b>·<b className="text-foreground">현재 게시</b> 편수로 실제 콘텐츠를 검토하세요(<span className="text-amber-400">⚠️ 게시 수가 적으면 정크 업로드 의심</span>).
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {([
          { key: "pending" as const, label: `대기 ${pendingCount}` },
          { key: "coupon_sent" as const, label: "지급완료" },
          { key: "all" as const, label: `전체 ${items.length}` },
        ]).map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-colors ${filter === f.key ? "bg-[#6366f1] text-white border-transparent" : "bg-card text-muted-foreground border-border hover:border-[#6366f1]/50"}`}>
            {f.label}
          </button>
        ))}
        <button onClick={() => void load()} className="ml-auto p-2 rounded-lg hover:bg-muted text-muted-foreground" title="새로고침">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#6366f1]" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Coffee className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>{filter === "pending" ? "쿠폰 발송 대기 중인 달성자가 없습니다." : "해당 상태의 달성자가 없습니다."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((it) => {
            const sent = it.status === "coupon_sent";
            return (
              <div key={it.id} className={`bg-card rounded-xl border p-4 ${sent ? "border-border/50 opacity-70" : "border-[#FFD200]/40"}`}>
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-[#FFD200] to-[#FFB000] text-[#1a1a1a] font-black text-sm flex-shrink-0">
                    {it.milestone}편
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-foreground flex items-center gap-2">
                      {it.creator_name || "크리에이터"}
                      <a href={`?tab=channel&creator=${it.user_id}`} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#a5b4fc] hover:text-[#c7d2fe]" title="달성자 채널을 새 탭에서 확인(지급 전 검토)">
                        채널 확인 <ExternalLink className="w-3 h-3" />
                      </a>
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-0.5">
                      {it.creator_email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{it.creator_email}</span>}
                      <span>달성 {it.video_count}편</span>
                      {it.current_visible != null && (
                        <span className={`flex items-center gap-1 ${it.current_visible < it.milestone ? "text-amber-400 font-semibold" : ""}`}>
                          {it.current_visible < it.milestone && <AlertTriangle className="w-3.5 h-3.5" />}
                          현재 게시 {it.current_visible}편
                        </span>
                      )}
                      <span>· {fmt(it.created_at)} 달성</span>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold border flex-shrink-0 ${sent ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-amber-500/20 text-amber-300 border-amber-500/40"}`}>
                    {sent ? "지급완료" : "대기"}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 mt-3 flex-wrap justify-end">
                  <button onClick={() => void sendCoupon(it)}
                    className="px-3 py-1.5 rounded-md text-xs font-bold bg-gradient-to-r from-[#FFD200] to-[#FFB000] text-[#1a1a1a] inline-flex items-center gap-1">
                    <Coffee className="w-3.5 h-3.5" /> 메가커피 보내기
                  </button>
                  {sent ? (
                    <button onClick={() => void setStatus(it.id, "pending")}
                      className="px-3 py-1.5 rounded-md text-xs font-semibold border border-border text-muted-foreground hover:bg-muted inline-flex items-center gap-1">
                      <RotateCcw className="w-3.5 h-3.5" /> 대기로
                    </button>
                  ) : (
                    <button onClick={() => void setStatus(it.id, "coupon_sent")}
                      className="px-3 py-1.5 rounded-md text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 지급완료 처리
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
