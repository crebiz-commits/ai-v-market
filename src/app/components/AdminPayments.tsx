// 결제/환불 관리 페이지 (Phase 10.6)
import { useEffect, useState } from "react";
import { Loader2, DollarSign, RotateCcw, RefreshCw } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface PaymentRow {
  id: number;
  order_id: string;
  user_id: string;
  user_name: string | null;
  user_email: string | null;
  payment_type: string;
  target_id: string | null;
  amount: number;
  method: string | null;
  status: string;
  approved_at: string | null;
  failure_reason: string | null;
  created_at: string;
}

const STATUS_FILTERS = [
  { key: "all", label: "전체" },
  { key: "completed", label: "완료" },
  { key: "pending", label: "진행 중" },
  { key: "failed", label: "실패" },
  { key: "refunded", label: "환불됨" },
];

const TYPE_FILTERS = [
  { key: "all", label: "전체" },
  { key: "subscription", label: "구독" },
  { key: "license", label: "라이선스" },
  { key: "ad_budget", label: "광고예산" },
];

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500/15 text-green-400",
  pending: "bg-amber-500/15 text-amber-300",
  failed: "bg-red-500/15 text-red-400",
  refunded: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

const TYPE_LABELS: Record<string, string> = {
  subscription: "💎 구독",
  license: "📜 라이선스",
  ad_budget: "📢 광고예산",
};

export function AdminPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [processingId, setProcessingId] = useState<number | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_all_payments", {
      p_status: statusFilter,
      p_payment_type: typeFilter,
      p_limit: 100,
      p_offset: 0,
    });
    if (error) {
      toast.error("결제 목록 조회 실패: " + error.message);
      setPayments([]);
    } else {
      setPayments(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [statusFilter, typeFilter]);

  const refund = async (p: PaymentRow) => {
    const reason = prompt(`${p.user_name || p.user_email}의 ₩${p.amount.toLocaleString()} 결제를 환불 처리합니다.\n환불 사유:`);
    if (reason === null) return;
    if (!confirm("환불 처리하면 사용자 권한도 즉시 회수됩니다.\n계속하시겠습니까?")) return;

    setProcessingId(p.id);
    const { error } = await supabase.rpc("admin_refund_payment", {
      p_payment_id: p.id,
      p_admin_note: reason,
    });
    setProcessingId(null);
    if (error) return toast.error("환불 실패: " + error.message);
    toast.success("환불 처리됨. 토스 API 환불은 별도 수동 처리 필요");
    load();
  };

  const totalCompleted = payments.filter(p => p.status === "completed").reduce((s, p) => s + p.amount, 0);
  const totalRefunded = payments.filter(p => p.status === "refunded").reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      {/* 합계 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">완료 합계</p>
          <p className="text-xl font-black text-green-400">₩{totalCompleted.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">환불 합계</p>
          <p className="text-xl font-black text-amber-400">₩{totalRefunded.toLocaleString()}</p>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-2">
        <span className="text-xs text-muted-foreground py-1.5">상태:</span>
        {STATUS_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === f.key ? "bg-[#6366f1] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >{f.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <span className="text-xs text-muted-foreground py-1.5">종류:</span>
        {TYPE_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setTypeFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              typeFilter === f.key ? "bg-[#6366f1] text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >{f.label}</button>
        ))}
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="ml-auto gap-1.5">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>
      ) : payments.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>결제 내역이 없습니다</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="bg-card border border-border rounded-xl p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted font-bold">
                      {TYPE_LABELS[p.payment_type] || p.payment_type}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[p.status] || ""}`}>
                      {STATUS_FILTERS.find(s => s.key === p.status)?.label || p.status}
                    </span>
                    {p.method && (
                      <span className="text-[10px] text-muted-foreground">{p.method}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold">{p.user_name || p.user_email || "이름 없음"}</p>
                  <p className="text-[11px] text-muted-foreground font-mono mt-0.5">{p.order_id.slice(0, 40)}...</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(p.created_at).toLocaleString("ko-KR")}
                    {p.approved_at && ` · 승인 ${new Date(p.approved_at).toLocaleString("ko-KR")}`}
                  </p>
                  {p.failure_reason && (
                    <p className="text-xs text-red-400/80 mt-1">{p.failure_reason}</p>
                  )}
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <p className="text-lg font-black text-[#8b5cf6]">₩{p.amount.toLocaleString()}</p>
                  {p.status === "completed" && (
                    <Button size="sm" variant="outline" onClick={() => refund(p)} disabled={processingId === p.id} className="gap-1 text-amber-300 border-amber-500/30">
                      <RotateCcw className="w-3.5 h-3.5" />환불
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
        ⚠️ 환불 처리는 DB만 갱신합니다. 실제 토스페이먼츠 환불은 별도로 토스 대시보드에서 처리해야 합니다.
        향후 Edge Function으로 자동 환불 호출 가능 (Phase 9.5 예정).
      </p>
    </div>
  );
}
