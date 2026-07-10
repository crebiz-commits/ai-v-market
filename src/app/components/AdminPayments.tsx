// 결제/환불 관리 페이지 (Phase 10.6 + C3: 토스 API 환불 통합)
import { useEffect, useState } from "react";
import { Loader2, DollarSign, RotateCcw, RefreshCw } from "lucide-react";
import { supabase, supabaseUrl, supabaseAnonKey } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { sendNotification, buildRefundCompletedEmail } from "../utils/sendNotification";

const REFUND_ENDPOINT = `${supabaseUrl}/functions/v1/server/refund-payment`;

// payment_type → 한글 라벨 (메일 제목용)
const TYPE_LABEL_FOR_EMAIL: Record<string, string> = {
  subscription: "CREAITE 프리미엄 구독",
  license: "라이선스 구매",
  ad_budget: "광고 예산 충전",
};

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
  refund_reason?: string | null;
  refund_requested_at?: string | null;
}

const STATUS_FILTERS = [
  { key: "all", label: "전체" },
  { key: "refund_requested", label: "🔔 환불 요청" },
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
  refund_requested: "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40",
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
    const isUserRequested = p.status === "refund_requested";
    const promptMsg = isUserRequested
      ? `${p.user_name || p.user_email}의 환불 요청을 승인하시겠습니까?\n\n사용자 사유: ${p.refund_reason || "(없음)"}\n금액: ₩${p.amount.toLocaleString()}\n\n어드민 메모 (선택):`
      : `${p.user_name || p.user_email}의 ₩${p.amount.toLocaleString()} 결제를 환불 처리합니다.\n환불 사유:`;
    const reason = prompt(promptMsg);
    if (reason === null) return;
    if (!confirm("환불 처리하면 토스 카드 환불 + 사용자 권한 회수 + 사용자에게 알림 메일이 자동 발송됩니다.\n계속하시겠습니까?")) return;

    setProcessingId(p.id);
    try {
      // 1) Authorization 토큰 확보 (어드민 본인)
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        toast.error("재로그인이 필요합니다.");
        return;
      }

      // 2) Edge Function 호출 — 토스 API cancel + admin_refund_payment RPC
      const adminNote = reason || (isUserRequested ? "사용자 환불 요청 승인" : "관리자 환불");
      const res = await fetch(REFUND_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ payment_id: p.id, admin_note: adminNote }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        // 토스 환불 실패 또는 DB 갱신 실패
        if (body?.toss_canceled) {
          // 토스는 환불됐으나 DB 갱신 실패 — 운영 위험 상태
          toast.error(
            `⚠️ 토스 환불 완료, DB 갱신 실패. 운영팀 확인 필요:\n${body.db_error}`,
            { duration: 10000 }
          );
        } else {
          toast.error(body?.error || `환불 실패 (HTTP ${res.status})`);
        }
        return;
      }

      toast.success("환불 완료 (토스 + DB + 권한 회수)");

      // R6(2026-06-11): 이미 확정된 월 정산과 겹치는 환불 — 재정산 필요 경고
      if (body?.settlement_warning) {
        toast.warning(`⚠️ ${body.settlement_warning}`, { duration: 12000 });
      }

      // 3) 환불 완료 메일 발송 (fire-and-forget)
      const recipient = body?.payment?.user_id;
      if (recipient) {
        const { subject, html } = buildRefundCompletedEmail({
          orderName: TYPE_LABEL_FOR_EMAIL[p.payment_type] || p.payment_type,
          amount: p.amount,
          refundReason: p.refund_reason || adminNote,
          paymentMethod: p.method || "카드",
        });
        void sendNotification({
          user_id: recipient,
          type: "refund_completed",
          subject,
          html,
        });
      }

      load();
    } catch (err: any) {
      console.error("[AdminPayments] refund 예외:", err);
      toast.error("환불 처리 중 오류: " + (err?.message || err));
    } finally {
      setProcessingId(null);
    }
  };

  const totalCompleted = payments.filter(p => p.status === "completed").reduce((s, p) => s + p.amount, 0);
  const totalRefunded = payments.filter(p => p.status === "refunded").reduce((s, p) => s + p.amount, 0);

  return (
    <div>
      {/* 합계 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">완료 합계 <span className="text-muted-foreground/60">(현재 목록)</span></p>
          <p className="text-xl font-black text-green-400">₩{totalCompleted.toLocaleString()}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-xs text-muted-foreground">환불 합계 <span className="text-muted-foreground/60">(현재 목록)</span></p>
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
                  {p.status === "refund_requested" && p.refund_reason && (
                    <div className="mt-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/20">
                      <p className="text-[10px] font-bold text-orange-300 mb-0.5">사용자 환불 요청 사유</p>
                      <p className="text-xs text-orange-200/90">{p.refund_reason}</p>
                      {p.refund_requested_at && (
                        <p className="text-[10px] text-muted-foreground mt-1">
                          요청 시각: {new Date(p.refund_requested_at).toLocaleString("ko-KR")}
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right flex flex-col items-end gap-2">
                  <p className="text-lg font-black text-[#8b5cf6]">₩{p.amount.toLocaleString()}</p>
                  {(p.status === "completed" || p.status === "refund_requested") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refund(p)}
                      disabled={processingId === p.id}
                      className={p.status === "refund_requested"
                        ? "gap-1 text-orange-300 border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20"
                        : "gap-1 text-amber-300 border-amber-500/30"
                      }
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {p.status === "refund_requested" ? "요청 승인" : "환불"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground mt-4 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
        ✅ 환불 처리 시 토스 카드 환불 + DB 상태 + 권한 회수 + 사용자 알림 메일이 자동 진행됩니다.
        🔔 "환불 요청" 필터에서 사용자가 요청한 건을 검토·승인할 수 있습니다.
      </p>
    </div>
  );
}
