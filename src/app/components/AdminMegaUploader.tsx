// ════════════════════════════════════════════════════════════════════════════
// 어드민 — 메가커피 "빅메가 업로더" 이벤트 (영화 30편 업로드마다 3만원권)
// upload_milestones 를 admin_list_upload_milestones RPC 로 조회 (작성자 이름·이메일 포함).
// 30편 달성 시 트리거가 자동 기록 → 여기 "대기"로 떠서 어드민이 쿠폰 발송 후 처리.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { Loader2, Coffee, RefreshCw, Mail, CheckCircle2, RotateCcw } from "lucide-react";
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

  const setStatus = async (id: string, status: Milestone["status"]) => {
    const prev = items;
    setItems((cur) => cur.map((it) => (it.id === id ? { ...it, status, rewarded_at: status === "coupon_sent" ? new Date().toISOString() : null } : it)));
    const { error } = await supabase
      .from("upload_milestones")
      .update({ status, rewarded_at: status === "coupon_sent" ? new Date().toISOString() : null })
      .eq("id", id);
    if (error) { toast.error("변경 실패: " + error.message); setItems(prev); }
  };

  const sendCoupon = async (it: Milestone) => {
    const to = it.creator_email || "";
    if (to.includes("@")) {
      try { await navigator.clipboard.writeText(to); } catch {}
      window.open("https://mail.zoho.com/zm/#compose", "_blank", "noopener");
      toast.success(`이메일(${to})을 복사했어요. Zoho 작성창에 붙여넣어 메가커피 3만원권을 보내세요.`, { duration: 5000 });
    } else {
      toast.info("이메일이 없어요. 크리에이터에게 직접 연락해 쿠폰을 보내주세요.", { duration: 5000 });
    }
  };

  const pendingCount = items.filter((i) => i.status === "pending").length;
  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  return (
    <div className="space-y-4">
      {/* 안내 */}
      <div className="bg-gradient-to-br from-[#FFD200]/15 to-[#FFB000]/10 border border-[#FFD200]/30 rounded-xl p-4">
        <p className="text-sm text-foreground/90 flex items-center gap-2">
          <Coffee className="w-4 h-4 text-[#d99a00]" />
          영화 <b>30편</b> 업로드마다 자동으로 달성자가 등록됩니다(30·60·90편…). <b>대기</b> 상태가 쿠폰 미발송이며, 발송 후 <b>지급완료</b>로 바꿔주세요.
        </p>
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
                    <p className="font-bold text-foreground">{it.creator_name || "크리에이터"}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap mt-0.5">
                      {it.creator_email && <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{it.creator_email}</span>}
                      <span>누적 {it.video_count}편</span>
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
