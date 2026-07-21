// ════════════════════════════════════════════════════════════════════════════
// 결제 내역 + 환불 요청 (MyPage 설정 탭)
//
// 동작:
//   - 진입 시: get_my_payments RPC 로 본인 결제 내역 로드
//   - completed + 7일 이내 결제만 환불 요청 버튼 활성화
//   - refund_requested 상태는 "검토 중" 배지 + 버튼 비활성화
//   - 환불 요청 시 사유 입력 모달 → request_refund RPC 호출
//
// 약관 7조 ③항: "마이페이지 → 결제 내역 → 환불 요청" 이행
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { Receipt, Loader2, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

interface MyPayment {
  id: number;
  order_id: string;
  payment_type: string;
  target_id: string | null;
  amount: number;
  method: string | null;
  status: string;
  approved_at: string | null;
  created_at: string;
  failure_reason: string | null;
  refund_reason: string | null;
  refund_requested_at: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  completed: "bg-green-500/15 text-green-400",
  pending: "bg-amber-500/15 text-amber-300",
  failed: "bg-red-500/15 text-red-400",
  refunded: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
  refund_requested: "bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40",
};

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
}

// 결제 내역 페이지 크기 — RPC 는 p_offset 을 지원하는데 0 고정이라 51건째부터 못 보던 것 해소(2026-07-19)
const PAYMENTS_PAGE = 50;

export function MyPaymentsSection() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [payments, setPayments] = useState<MyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);   // 조회 실패를 "빈 내역"과 구분
  const [refundTarget, setRefundTarget] = useState<MyPayment | null>(null);
  const [refundReason, setRefundReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_payments", { p_limit: PAYMENTS_PAGE, p_offset: 0 });
    if (error) {
      console.error("[MyPaymentsSection] 조회 실패:", error);
      toast.error(t("myPayments.loadError"));
      setLoadError(true);
      setPayments([]);
      setHasMore(false);
    } else {
      setLoadError(false);
      const list = (data || []) as MyPayment[];
      setPayments(list);
      setHasMore(list.length >= PAYMENTS_PAGE);
    }
    setLoading(false);
  };

  // 더 보기 — 다음 페이지를 이어붙임. 환불 등으로 순서가 바뀌어도 중복되지 않게 id 로 dedup.
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const { data, error } = await supabase.rpc("get_my_payments", {
      p_limit: PAYMENTS_PAGE, p_offset: payments.length,
    });
    setLoadingMore(false);
    if (error || !Array.isArray(data)) { setHasMore(false); return; }
    const next = data as MyPayment[];
    setPayments((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...next.filter((p) => !seen.has(p.id))];
    });
    setHasMore(next.length >= PAYMENTS_PAGE);
  };

  useEffect(() => {
    if (!user?.id) return;
    load();
  }, [user?.id]);

  const handleRefundClick = (p: MyPayment) => {
    const refDate = p.approved_at || p.created_at;
    const days = daysSince(refDate);
    if (days > 7) {
      toast.error(t("myPayments.modal.exceedDays"));
      return;
    }
    setRefundTarget(p);
    setRefundReason("");
  };

  const submitRefund = async () => {
    if (!refundTarget) return;
    const reason = refundReason.trim();
    if (reason.length < 2) {
      toast.error(t("myPayments.modal.reasonRequired"));
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.rpc("request_refund", {
      p_payment_id: refundTarget.id,
      p_reason: reason,
    });
    setSubmitting(false);

    if (error) {
      toast.error(t("myPayments.modal.error") + error.message);
      return;
    }

    toast.success(t("myPayments.modal.success"));
    // 전체 재조회(load)는 더보기로 펼친 목록을 1페이지로 되돌리고 스피너를 띄운다 → 해당 행만 갱신
    setPayments((prev) => prev.map((p) => (p.id === refundTarget.id
      ? { ...p, status: "refund_requested", refund_reason: reason, refund_requested_at: new Date().toISOString() }
      : p)));
    setRefundTarget(null);
    setRefundReason("");
  };

  const localeTag = i18n.language?.startsWith("ko") ? "ko-KR" : "en-US";

  if (loading) {
    return (
      <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
        <h3 className="font-bold text-white mb-5 flex items-center gap-2">
          <Receipt className="w-4 h-4" />
          {t("myPayments.title")}
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#121212] p-5 md:p-6 rounded-2xl border border-white/5 shadow-sm">
      <h3 className="font-bold text-white mb-2 flex items-center gap-2">
        <Receipt className="w-4 h-4" />
        {t("myPayments.title")}
      </h3>
      <p className="text-sm text-gray-500 mb-5">{t("myPayments.subtitle")}</p>

      {loadError ? (
        <div className="text-center py-8 text-amber-400/80 text-sm">
          {t("myPayments.loadError")}
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          {t("myPayments.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const refDate = p.approved_at || p.created_at;
            const days = daysSince(refDate);
            const canRequestRefund = p.status === "completed" && days <= 7;
            const typeLabel = t(`myPayments.types.${p.payment_type}`, { defaultValue: p.payment_type });

            return (
              <div key={p.id} className="p-3 rounded-xl bg-[#1c1c1e] border border-white/5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 font-bold text-gray-300">
                        {typeLabel}
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[p.status] || ""}`}>
                        {t(`myPayments.status.${p.status}`, { defaultValue: p.status })}
                      </span>
                      {p.method && (
                        <span className="text-[10px] text-gray-500">{p.method}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 font-mono mt-0.5 break-all">
                      {p.order_id.length > 40 ? p.order_id.slice(0, 40) + "…" : p.order_id}
                    </p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {new Date(p.created_at).toLocaleString(localeTag)}
                    </p>
                    {p.status === "refund_requested" && p.refund_reason && (
                      <div className="mt-2 p-2 rounded-lg bg-orange-500/5 border border-orange-500/20">
                        <p className="text-[10px] font-bold text-orange-300 mb-0.5">
                          {t("myPayments.requestedReasonLabel")}
                        </p>
                        <p className="text-xs text-orange-200/90">{p.refund_reason}</p>
                      </div>
                    )}
                  </div>
                  <div className="text-right flex flex-col items-end gap-2 shrink-0">
                    <p className="text-base font-black text-[#8b5cf6]">₩{p.amount.toLocaleString()}</p>
                    {canRequestRefund && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRefundClick(p)}
                        className="gap-1 text-amber-300 border-amber-500/30 hover:bg-amber-500/10 text-[11px] h-7 px-2.5"
                      >
                        <RotateCcw className="w-3 h-3" />
                        {t("myPayments.refundButton")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore} className="gap-1.5">
                {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {t("common.more")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 환불 요청 모달 */}
      {refundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#121212] border border-white/10 rounded-2xl p-5 md:p-6 max-w-md w-full">
            <div className="flex items-start justify-between gap-2 mb-4">
              <h4 className="text-lg font-bold text-white flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-amber-300" />
                {t("myPayments.modal.title")}
              </h4>
              <button
                onClick={() => setRefundTarget(null)}
                className="p-1 rounded-full hover:bg-white/10 text-gray-400"
                aria-label={t("common.close")}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-white/[0.02] border border-white/5">
              <p className="text-xs text-gray-500 mb-1">{t("myPayments.modal.amountLabel")}</p>
              <p className="text-xl font-black text-[#8b5cf6]">₩{refundTarget.amount.toLocaleString()}</p>
              <p className="text-[11px] text-gray-500 mt-1 font-mono">
                {refundTarget.order_id.slice(0, 40)}…
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                {t("myPayments.modal.reasonLabel")} <span className="text-red-400">*</span>
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder={t("myPayments.modal.reasonPlaceholder")}
                rows={3}
                maxLength={200}
                className="w-full px-3 py-2 bg-[#1c1c1e] border border-white/5 rounded-lg text-sm text-white placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none resize-none"
              />
              <p className="text-[10px] text-gray-500 mt-1 text-right">{refundReason.length}/200</p>
            </div>

            <div className="mb-5 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
              <p className="text-[11px] text-amber-200/80 leading-relaxed">
                {t("myPayments.modal.notice")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setRefundTarget(null)}
                disabled={submitting}
                className="flex-1"
              >
                {t("myPayments.modal.cancel")}
              </Button>
              <Button
                onClick={submitRefund}
                disabled={submitting || refundReason.trim().length < 2}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("myPayments.modal.submit")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
