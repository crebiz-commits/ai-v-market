import { useState, useEffect } from "react";
import { Loader2, Play, Check, AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface Distribution {
  id: number;
  creator_id: string;
  creator_name: string | null;
  sale_revenue: number;
  ad_revenue: number;
  subscription_revenue: number;
  total_revenue: number;
  payout_status: "pending" | "paid" | "deferred";
  paid_at: string | null;
}

function won(n: number) {
  return "₩" + n.toLocaleString();
}

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: "지급 대기", color: "bg-amber-500/15 text-amber-300" },
  paid:    { text: "지급 완료", color: "bg-green-500/15 text-green-400" },
  deferred:{ text: "이월 (최소액 미달)", color: "bg-muted text-muted-foreground" },
};

export function AdminRevenueSettlement() {
  const now = new Date();
  // 직전 달이 기본값 (지나간 월만 정산 가능)
  const defaultMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defaultYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const [rows, setRows] = useState<Distribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);

  const loadDistributions = async (y: number, m: number) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_revenue_distributions_by_period", {
      p_year: y,
      p_month: m,
    });
    if (error) {
      toast.error("정산 내역 조회 실패: " + error.message);
      setRows([]);
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { loadDistributions(year, month); }, [year, month]);

  const runSettlement = async () => {
    if (!confirm(`${year}년 ${month}월 정산을 실행하시겠습니까?\n(재실행 안전 — 이미 지급된 항목은 보존됩니다)`)) {
      return;
    }
    setRunning(true);
    const { error } = await supabase.rpc("calculate_monthly_revenue", { p_year: year, p_month: month });
    setRunning(false);

    if (error) {
      toast.error("정산 실패: " + error.message);
      return;
    }
    toast.success(`${year}년 ${month}월 정산 완료`);
    loadDistributions(year, month);
  };

  const markPaid = async (id: number) => {
    if (!confirm("지급 완료로 표시하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)")) return;

    const { error } = await supabase.rpc("mark_revenue_paid", { p_distribution_id: id });
    if (error) {
      toast.error("처리 실패: " + error.message);
      return;
    }
    toast.success("지급 완료 처리됨");
    loadDistributions(year, month);
  };

  const totalPending = rows.filter(r => r.payout_status === "pending").reduce((s, r) => s + r.total_revenue, 0);
  const totalDeferred = rows.filter(r => r.payout_status === "deferred").reduce((s, r) => s + r.total_revenue, 0);
  const totalPaid = rows.filter(r => r.payout_status === "paid").reduce((s, r) => s + r.total_revenue, 0);

  const yearOptions: number[] = [];
  for (let y = now.getFullYear(); y >= now.getFullYear() - 3; y--) yearOptions.push(y);

  return (
    <div>
      {/* 정산 월 선택 + 실행 */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">정산 연도</label>
          <select
            className="input-base h-10 px-3"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          >
            {yearOptions.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-muted-foreground mb-1">정산 월</label>
          <select
            className="input-base h-10 px-3"
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{m}월</option>
            ))}
          </select>
        </div>
        <Button
          onClick={runSettlement}
          disabled={running}
          className="h-10 gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] font-bold"
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
          정산 실행
        </Button>
        <Button
          variant="outline"
          onClick={() => loadDistributions(year, month)}
          disabled={loading}
          className="h-10 gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold mb-0.5">정산 실행 안내</p>
          <ul className="text-blue-200/80 space-y-0.5">
            <li>• 정산은 <span className="font-semibold">월이 끝난 후</span> 실행 (해당 월의 매출이 확정된 다음)</li>
            <li>• 같은 월을 여러 번 실행해도 안전 (UPSERT). 이미 지급된 항목은 보존됨</li>
            <li>• 정산 시점의 분배율이 <span className="font-semibold">스냅샷</span>으로 저장되어 분쟁 대비 가능</li>
            <li>• ₩10,000 미만은 자동 이월 (deferred 상태)</li>
          </ul>
        </div>
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[11px] text-muted-foreground">지급 대기</p>
          <p className="text-xl font-bold text-amber-300 mt-1">{won(totalPending)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[11px] text-muted-foreground">지급 완료</p>
          <p className="text-xl font-bold text-green-400 mt-1">{won(totalPaid)}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-[11px] text-muted-foreground">이월</p>
          <p className="text-xl font-bold text-muted-foreground mt-1">{won(totalDeferred)}</p>
        </div>
      </div>

      {/* 정산 내역 */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-sm">아직 이 달 정산 내역이 없습니다.</p>
          <p className="text-xs mt-1">위의 [정산 실행] 버튼을 눌러 계산하세요.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {rows.map((r, i) => {
            const status = STATUS_LABEL[r.payout_status] || STATUS_LABEL.pending;
            return (
              <div key={r.id} className={`p-4 ${i > 0 ? "border-t border-border" : ""}`}>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{r.creator_name || r.creator_id.slice(0, 8)}</p>
                    <p className="text-[10px] text-muted-foreground font-mono">{r.creator_id.slice(0, 18)}…</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${status.color}`}>
                    {status.text}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground text-[10px]">판매</p>
                    <p className="font-mono">{won(r.sale_revenue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">광고</p>
                    <p className="font-mono">{won(r.ad_revenue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">구독료</p>
                    <p className="font-mono">{won(r.subscription_revenue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-[10px]">총액</p>
                    <p className="font-bold text-[#8b5cf6]">{won(r.total_revenue)}</p>
                  </div>
                </div>
                {r.payout_status === "pending" && (
                  <Button
                    onClick={() => markPaid(r.id)}
                    size="sm"
                    className="mt-3 w-full gap-1.5 bg-green-600 hover:bg-green-700"
                  >
                    <Check className="w-3.5 h-3.5" />
                    지급 완료 표시
                  </Button>
                )}
                {r.payout_status === "paid" && r.paid_at && (
                  <p className="text-[10px] text-muted-foreground mt-2">
                    지급일: {new Date(r.paid_at).toLocaleString("ko-KR")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
