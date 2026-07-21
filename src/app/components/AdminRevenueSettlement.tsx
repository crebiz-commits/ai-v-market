import { useState, useEffect } from "react";
import { Loader2, Play, Check, AlertCircle, RefreshCw, Download } from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { AdminPager } from "./AdminPager";
import { sendNotification, buildRevenueSettledEmail } from "../utils/sendNotification";

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
  // Phase 32: 세금 컬럼
  tax_withholding?: number;
  net_amount?: number;
  tax_type_snapshot?: string | null;
  // 정산 계좌 (지급 송금용)
  payout_bank?: string | null;
  payout_account?: string | null;
  payout_holder?: string | null;
}

// F3: 정산 클로백(지급완료 월 환불 → 수동 차감) 원장 행
interface Clawback {
  id: number;
  creator_id: string | null;
  creator_name: string | null;
  period_start: string;
  amount: number;
  source_type: string;
  source_ref: string | null;
  reason: string | null;
  status: string;
  note: string | null;
  created_at: string;
  resolved_at: string | null;
}

const TAX_TYPE_LABEL: Record<string, string> = {
  individual: "비사업자",
  business_simple: "간이과세자",
  business_general: "일반과세자",
  business_corp: "법인",
};

// CSV 셀 안전 escape (쉼표/줄바꿈/큰따옴표 + 수식 인젝션 방어)
//   크리에이터 입력(상호·이름)이 =,+,-,@,탭,개행 으로 시작하면 Excel/Sheets 가 수식으로
//   실행(=HYPERLINK·DDE 등 관리자 PC 공격) → 작은따옴표 prefix 로 무력화(OWASP 권고).
function csvEscape(v: any): string {
  let s = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  if (s.includes(",") || s.includes("\n") || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [sums, setSums] = useState({ pending: 0, deferred: 0, paid: 0 });
  const [clawbackTotal, setClawbackTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);
  const [payingId, setPayingId] = useState<number | null>(null);
  const [clawbacks, setClawbacks] = useState<Clawback[]>([]);
  const [resolvingId, setResolvingId] = useState<number | null>(null);

  // Phase 32 — 연말정산 CSV 다운로드 (현재 선택된 연도 기준)
  const handleDownloadCsv = async () => {
    setDownloadingCsv(true);
    const { data, error } = await supabase.rpc("admin_get_tax_annual_report", { p_year: year });
    setDownloadingCsv(false);

    if (error) {
      toast.error("연말정산 자료 조회 실패: " + error.message);
      return;
    }
    if (!data || data.length === 0) {
      toast.info(`${year}년 지급 완료된 정산 내역이 없습니다.`);
      return;
    }

    const header = [
      "creator_id", "creator_name", "tax_type", "business_number",
      "business_name", "total_gross", "total_withholding", "total_net", "distribution_count",
    ];
    const headerKo = [
      "크리에이터 ID", "크리에이터명", "세금유형", "사업자등록번호",
      "상호", "세전합계(원)", "원천징수합계(원)", "세후합계(원)", "정산건수",
    ];
    const rows = (data as any[]).map((r) =>
      header.map((h) => {
        if (h === "tax_type") return csvEscape(TAX_TYPE_LABEL[r[h]] || r[h]);
        return csvEscape(r[h] ?? "");
      }).join(",")
    );
    // BOM + 한글 헤더 + 데이터
    const csv = "﻿" + [headerKo.join(","), ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `creaite_tax_report_${year}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${data.length}건 다운로드 완료`);
  };

  // 정산 분배는 크리에이터 수 × 월로 늘어남 → 페이지 단위 조회.
  //   상태별 합계(미지급/이월/지급완료)는 목록에서 reduce 하면 '이 페이지 합계'가 되므로
  //   RPC 가 기간 전체 기준 윈도우 집계(sum_pending/deferred/paid)를 함께 반환한다.
  const loadDistributions = async (y: number, m: number, targetPage = 0) => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_revenue_distributions_by_period", {
      p_year: y,
      p_month: m,
      p_limit: pageSize,
      p_offset: targetPage * pageSize,
    });
    if (error) {
      toast.error("정산 내역 조회 실패: " + error.message);
      setRows([]);
      setTotal(0);
      setSums({ pending: 0, deferred: 0, paid: 0 });
    } else {
      const list = (data || []) as any[];
      setRows(list);
      setTotal(Number(list[0]?.total_count) || 0);
      setSums({
        pending: Number(list[0]?.sum_pending) || 0,
        deferred: Number(list[0]?.sum_deferred) || 0,
        paid: Number(list[0]?.sum_paid) || 0,
      });
      setPage(targetPage);
      // 지급 처리로 줄어 빈 페이지가 되면 첫 페이지로 자가복구
      if (list.length === 0 && targetPage > 0) { setLoading(false); void loadDistributions(y, m, 0); return; }
    }
    setLoading(false);
  };

  // 월·페이지크기 변경 시 첫 페이지로
  useEffect(() => { loadDistributions(year, month, 0); }, [year, month, pageSize]);

  // F3: 지급완료 월 환불로 등록된 클로백(수동 차감 대기) 조회
  const loadClawbacks = async () => {
    const { data, error } = await supabase.rpc("admin_list_clawbacks", { p_status: "pending", p_limit: 50, p_offset: 0 });
    if (error) { console.warn("[AdminRevenueSettlement] 클로백 조회 실패:", error.message); return; }
    const list = (data || []) as any[];
    setClawbacks(list as Clawback[]);
    setClawbackTotal(Number(list[0]?.total_count) || 0);   // 배너 건수는 전체 기준(50건 상한 밖 포함)
  };
  useEffect(() => { loadClawbacks(); }, []);

  // 월 횡단 미지급(pending) 요약 — deferred→pending 승격(R7)된 과거월 행이 단일 월
  //   화면에서 안 보여 영구 미지급되던 위험 방지(2026-07-14). RPC 미적용 시 조용히 숨김.
  const [pendingMonths, setPendingMonths] = useState<{ period_start: string; cnt: number; total: number }[]>([]);
  const loadPendingMonths = async () => {
    const { data, error } = await supabase.rpc("admin_list_pending_payouts");
    if (error) return;   // 미적용(PGRST202) 등 — 배너 숨김
    setPendingMonths((data as any[]) || []);
  };
  useEffect(() => { loadPendingMonths(); }, [rows]);   // 지급/재계산 후 rows 갱신 시 함께 재조회

  const resolveClawback = async (c: Clawback, status: "applied" | "waived") => {
    const label = status === "applied" ? "차감 반영 완료" : "면제";
    let note: string | null = null;
    if (status === "waived") {
      const r = window.prompt("면제 사유 (선택):", "");
      if (r === null) return;              // 취소
      note = r.trim() || null;
    }
    if (!confirm(`[${c.creator_name || "크리에이터"}] ₩${c.amount.toLocaleString()} 클로백을 '${label}' 처리할까요?`)) return;
    setResolvingId(c.id);
    try {
      const { error } = await supabase.rpc("admin_resolve_clawback", { p_id: c.id, p_status: status, p_note: note });
      if (error) { toast.error("처리 실패: " + error.message); return; }
      toast.success(`클로백 ${label} 처리됨`);
      setClawbacks((cur) => cur.filter((x) => x.id !== c.id));
      void loadClawbacks();   // 배너 총계(clawbackTotal)는 서버값 — 낙관적 제거만 하면 숫자가 낡는다
    } finally {
      setResolvingId(null);
    }
  };

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
    loadDistributions(year, month, page);
  };

  const markPaid = async (id: number) => {
    // F6: 더블클릭 중복 실행 방지. mark_revenue_paid 는 payout_status='pending' 가드로
    //     금전은 멱등(2번째 호출 no-op)이지만, 가드가 없으면 클라가 이메일을 두 번 발송함.
    if (payingId !== null) return;
    if (!confirm("지급 완료로 표시하시겠습니까?\n(이 작업은 되돌릴 수 없습니다)")) return;

    setPayingId(id);
    try {
      const { error } = await supabase.rpc("mark_revenue_paid", { p_distribution_id: id });
      if (error) {
        toast.error("처리 실패: " + error.message);
        return;
      }

      // F6 보강: 아래 재조회가 일시 실패해도 버튼이 남아 재클릭→중복메일 되는 것을 막기 위해
      //   지급완료를 즉시 로컬 반영(버튼은 payout_status==='pending' 에서만 노출).
      setRows((prev) => prev.map((r) =>
        r.id === id ? { ...r, payout_status: "paid" as const, paid_at: new Date().toISOString() } : r));

      // 갱신된 정산 데이터 재조회 — net_amount/원천징수 확보 + UI 반영.
      //   ⚠️ 페이지 인자를 빼면 SQL 기본값(LIMIT 50 OFFSET 0)이 적용돼 ①현재 페이지가 1페이지로
      //      바뀌고 ②51번째 이후 행은 fresh 에 없어 아래 메일이 지급 전 스냅샷(net_amount=null)을
      //      쓰게 된다 → buildRevenueSettledEmail 이 netAmount ?? totalAmount 로 폴백해
      //      **세전 금액**으로 메일이 나간다(실지급액과 불일치).
      const { data: fresh } = await supabase.rpc("get_revenue_distributions_by_period", {
        p_year: year,
        p_month: month,
        p_limit: pageSize,
        p_offset: page * pageSize,
      });
      if (fresh) {
        const list = fresh as any[];
        setRows(list);
        setTotal(Number(list[0]?.total_count) || 0);
        setSums({
          pending: Number(list[0]?.sum_pending) || 0,
          deferred: Number(list[0]?.sum_deferred) || 0,
          paid: Number(list[0]?.sum_paid) || 0,
        });
      }

      // Phase 34 — 크리에이터에게 정산 완료 메일 (세후 net 금액 기준, fire-and-forget)
      try {
        // 현재 페이지 재조회분에 없으면(다른 페이지로 밀렸을 때) 그 행만 콕 집어 다시 읽는다 —
        //   지급 전 스냅샷으로 폴백하면 세전 금액이 나가므로 절대 안 된다.
        let row: any = (fresh as any[] | null)?.find((r: Distribution) => r.id === id);
        if (!row?.net_amount) {
          const { data: one } = await supabase.rpc("get_revenue_distributions_by_period", {
            p_year: year, p_month: month, p_limit: 1000, p_offset: 0,
          });
          row = (one as any[] | null)?.find((r: Distribution) => r.id === id) || row;
        }
        if (!row) row = rows.find((r) => r.id === id);
        if (row?.creator_id) {
          const { subject, html } = buildRevenueSettledEmail({
            year,
            month,
            totalAmount: row.total_revenue,
            saleAmount: row.sale_revenue,
            adAmount: row.ad_revenue,
            subscriptionAmount: row.subscription_revenue,
            taxWithholding: row.tax_withholding,
            netAmount: row.net_amount,
          });
          void sendNotification({
            user_id: row.creator_id,
            type: "revenue_settled",
            // to 생략 — Edge Function이 user_id로 자동 조회
            subject,
            html,
          });
        }
      } catch (mailErr) {
        console.warn("[AdminRevenueSettlement] 정산 알림 메일 실패:", mailErr);
      }

      toast.success("지급 완료 처리됨");
    } finally {
      setPayingId(null);
    }
  };

  // 기간 전체 기준 서버 집계 — 페이지에서 reduce 하면 정산 합계가 실제보다 작게 표시됨
  const totalPending = sums.pending;
  const totalDeferred = sums.deferred;
  const totalPaid = sums.paid;
  const hasMore = (page + 1) * pageSize < total;

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
          onClick={() => loadDistributions(year, month, page)}
          disabled={loading}
          className="h-10 gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
        <Button
          variant="outline"
          onClick={handleDownloadCsv}
          disabled={downloadingCsv}
          className="h-10 gap-2 ml-auto"
          title={`${year}년 연말정산 CSV`}
        >
          {downloadingCsv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          연말정산 CSV
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
            <li>• 최소 지급액(수익 정책의 payout_minimum_krw) 미만은 자동 이월 (deferred 상태)</li>
          </ul>
        </div>
      </div>

      {/* F3: 클로백 대기 — 지급완료 월에 환불 발생 → 다음 정산에서 수동 차감 */}
      {/* 월 횡단 미지급 배너 — 현재 보고 있는 월 외에 pending 이 남은 월 안내(영구 미지급 방지) */}
      {(() => {
        const others = pendingMonths.filter((p) => {
          const d = new Date(p.period_start);
          return !(d.getFullYear() === year && d.getMonth() + 1 === month);
        });
        if (others.length === 0) return null;
        return (
          <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-sm font-bold text-amber-300 mb-1.5">
              ⚠️ 다른 월에 미지급(pending) 정산이 남아 있습니다 — 이월 승격분 포함, 지급 누락 주의
            </p>
            <div className="flex flex-wrap gap-2">
              {others.map((p) => {
                const d = new Date(p.period_start);
                return (
                  <button
                    key={p.period_start}
                    onClick={() => { setYear(d.getFullYear()); setMonth(d.getMonth() + 1); }}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/30 text-xs text-amber-200 hover:bg-amber-500/25 transition-colors"
                  >
                    {d.getFullYear()}년 {d.getMonth() + 1}월 · {p.cnt}건 · ₩{Number(p.total).toLocaleString()}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {clawbacks.length > 0 && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
          <p className="text-sm font-bold text-red-300 flex items-center gap-1.5 mb-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            클로백 대기 {clawbackTotal || clawbacks.length}건 — 지급완료 월에 환불 발생, 다음 정산에서 차감 필요
          </p>
          <div className="space-y-2">
            {clawbacks.map((c) => (
              <div key={c.id} className="flex items-center gap-2 flex-wrap bg-card border border-border rounded-lg p-2.5 text-xs">
                <span className="font-semibold">{c.creator_name || (c.creator_id ? c.creator_id.slice(0, 8) : "—")}</span>
                <span className="text-muted-foreground">
                  {new Date(c.period_start).toLocaleDateString("ko-KR", { year: "numeric", month: "long" })}
                </span>
                <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-bold">{c.source_type}</span>
                <span className="font-mono font-bold text-red-300">-{won(c.amount)}</span>
                {c.reason && <span className="text-muted-foreground/80 truncate max-w-[220px]">{c.reason}</span>}
                <div className="ml-auto flex gap-1.5">
                  <Button
                    size="sm" variant="outline" disabled={resolvingId === c.id}
                    onClick={() => resolveClawback(c, "applied")}
                    className="h-7 gap-1 text-green-400 border-green-500/30"
                  >
                    {resolvingId === c.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    차감 완료
                  </Button>
                  <Button
                    size="sm" variant="outline" disabled={resolvingId === c.id}
                    onClick={() => resolveClawback(c, "waived")}
                    className="h-7 text-muted-foreground"
                  >
                    면제
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-red-200/70 mt-2">
            [차감 완료] = 다음 지급 시 이 금액만큼 차감해 반영했음. [면제] = 회수하지 않고 플랫폼 부담.
          </p>
        </div>
      )}

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

                {/* Phase 32: 세금 정보 (paid 행만 표시) */}
                {r.payout_status === "paid" && r.tax_type_snapshot && (
                  <div className="mt-2 pt-2 border-t border-border/50 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground text-[10px]">세금유형</p>
                      <p className="text-xs">{TAX_TYPE_LABEL[r.tax_type_snapshot] || r.tax_type_snapshot}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[10px]">원천징수</p>
                      <p className="font-mono text-amber-300">{won(r.tax_withholding || 0)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[10px]">세후 지급</p>
                      <p className="font-mono font-bold text-green-400">{won(r.net_amount || 0)}</p>
                    </div>
                  </div>
                )}
                {/* 정산 계좌 (지급 송금용) — 미지급 행에 표시 */}
                {r.payout_status !== "paid" && (
                  r.payout_bank ? (
                    <div className="mt-2 pt-2 border-t border-border/50 text-xs">
                      <p className="text-muted-foreground text-[10px] mb-0.5">정산 계좌</p>
                      <p className="font-mono">
                        {r.payout_bank} {r.payout_account}
                        {r.payout_holder && <span className="text-muted-foreground"> ({r.payout_holder})</span>}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 pt-2 border-t border-border/50 text-[11px] text-amber-400">
                      ⚠️ 정산 계좌 미등록 — 크리에이터에게 등록 요청 필요
                    </p>
                  )
                )}
                {r.payout_status === "pending" && (
                  <Button
                    onClick={() => markPaid(r.id)}
                    size="sm"
                    disabled={payingId !== null}
                    className="mt-3 w-full gap-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60"
                  >
                    {payingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
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
          <AdminPager
            page={page} pageSize={pageSize} hasMore={hasMore} loading={loading} total={total}
            onPageChange={(pg) => void loadDistributions(year, month, pg)} onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  );
}
