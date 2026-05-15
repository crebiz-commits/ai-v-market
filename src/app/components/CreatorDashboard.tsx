// ════════════════════════════════════════════════════════════════════════════
// Phase 21 — 크리에이터 수익 대시보드 (KPI + 일별 그래프 + 좋아요 통계)
// MyPage 판매 탭 최상단에 배치.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { DollarSign, Eye, Heart, TrendingUp, Calendar, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { supabase } from "../utils/supabaseClient";

interface Summary {
  total_revenue: number;
  total_views: number;
  total_likes: number;
  rpm: number;
  pending_payout: number;
  next_settlement_date: string;
}

interface DailyRevenue { day: string; revenue: number }
interface DailyEngagement { day: string; views: number; likes: number }

const RANGE_OPTIONS = [
  { days: 7, label: "7일" },
  { days: 14, label: "14일" },
  { days: 30, label: "30일" },
];

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatDay(iso: string, days: number): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (days <= 7) return `${m}/${day} (${["일", "월", "화", "수", "목", "금", "토"][d.getDay()]})`;
  return `${m}/${day}`;
}

export function CreatorDashboard() {
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<DailyRevenue[]>([]);
  const [engagement, setEngagement] = useState<DailyEngagement[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_creator_dashboard_summary");
    if (!error && Array.isArray(data) && data[0]) {
      const row = data[0] as any;
      setSummary({
        total_revenue: Number(row.total_revenue) || 0,
        total_views: Number(row.total_views) || 0,
        total_likes: Number(row.total_likes) || 0,
        rpm: Number(row.rpm) || 0,
        pending_payout: Number(row.pending_payout) || 0,
        next_settlement_date: row.next_settlement_date,
      });
    }
  }, []);

  const fetchCharts = useCallback(async (d: number) => {
    setChartLoading(true);
    const [revRes, engRes] = await Promise.all([
      supabase.rpc("get_creator_daily_revenue", { p_days: d }),
      supabase.rpc("get_creator_daily_engagement", { p_days: d }),
    ]);
    if (Array.isArray(revRes.data)) {
      setRevenue((revRes.data as any[]).map(r => ({ day: r.day, revenue: Number(r.revenue) || 0 })));
    }
    if (Array.isArray(engRes.data)) {
      setEngagement((engRes.data as any[]).map(r => ({ day: r.day, views: Number(r.views) || 0, likes: Number(r.likes) || 0 })));
    }
    setChartLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchSummary(), fetchCharts(days)]);
      setLoading(false);
    })();
  }, [fetchSummary, fetchCharts, days]);

  if (loading) {
    return (
      <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#8b5cf6]" />
      </div>
    );
  }

  const formattedRevenue = revenue.map(r => ({ ...r, day: formatDay(r.day, days) }));
  const formattedEngagement = engagement.map(r => ({ ...r, day: formatDay(r.day, days) }));

  return (
    <div className="space-y-4">
      {/* KPI 4개 */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label="누적 수익" value={`₩${(summary?.total_revenue ?? 0).toLocaleString()}`} color="text-[#6366f1]" bgColor="bg-[#6366f1]/10" />
        <KpiCard icon={Eye} label="총 조회수" value={formatNumber(summary?.total_views ?? 0)} color="text-[#10b981]" bgColor="bg-[#10b981]/10" />
        <KpiCard icon={Heart} label="총 좋아요" value={formatNumber(summary?.total_likes ?? 0)} color="text-[#ec4899]" bgColor="bg-[#ec4899]/10" />
        <KpiCard icon={TrendingUp} label="RPM (30일)" value={`₩${(summary?.rpm ?? 0).toLocaleString()}`} color="text-amber-400" bgColor="bg-amber-400/10" tooltip="1000회 시청당 평균 수익" />
      </motion.div>

      {/* 다음 정산 안내 */}
      {summary && summary.pending_payout > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-[#6366f1]/15 to-[#8b5cf6]/15 p-4 rounded-2xl border border-[#6366f1]/30 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#6366f1]/20 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-[#a78bfa]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white mb-0.5">다음 정산 예정</p>
            <p className="text-xs text-gray-400">
              {new Date(summary.next_settlement_date).toLocaleDateString("ko-KR", { month: "long", day: "numeric" })} ·
              <span className="font-bold text-[#a78bfa] ml-1">₩{summary.pending_payout.toLocaleString()}</span> 대기 중
            </p>
          </div>
        </motion.div>
      )}

      {/* 시간 범위 셀렉터 */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white">활동 추이</h3>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              disabled={chartLoading}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors disabled:opacity-50 ${
                days === opt.days
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-sm"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 일별 수익 차트 */}
      <div className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative">
        <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#6366f1]" />
          일별 수익
        </h4>
        {chartLoading && (
          <div className="absolute right-5 top-5">
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          </div>
        )}
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedRevenue} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
              <XAxis dataKey="day" stroke="#666" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#666" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 10000 ? `${v/10000}만` : `${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                formatter={(v: any) => [`₩${Number(v).toLocaleString()}`, "수익"]}
              />
              <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#8b5cf6' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 일별 조회수 + 좋아요 콤보 차트 */}
      <div className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative">
        <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Eye className="w-4 h-4 text-[#10b981]" />
          일별 조회수 · 좋아요
        </h4>
        {chartLoading && (
          <div className="absolute right-5 top-5">
            <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
          </div>
        )}
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedEngagement} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
              <XAxis dataKey="day" stroke="#666" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#666" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#999' }} iconType="circle" />
              <Line type="monotone" dataKey="views" name="조회수" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="likes" name="좋아요" stroke="#ec4899" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color, bgColor, tooltip }: { icon: any; label: string; value: string; color: string; bgColor: string; tooltip?: string }) {
  return (
    <div title={tooltip} className="bg-[#121212] p-4 rounded-xl border border-white/5 relative overflow-hidden">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider truncate">{label}</p>
      </div>
      <p className={`text-lg md:text-xl font-black ${color} truncate`}>{value}</p>
    </div>
  );
}
