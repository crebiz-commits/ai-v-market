// ════════════════════════════════════════════════════════════════════════════
// Phase 21 — 크리에이터 수익 대시보드 (KPI + 일별 그래프 + 좋아요 통계)
// MyPage 판매 탭 최상단에 배치.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { DollarSign, Eye, Heart, TrendingUp, Calendar, Loader2, Users, CheckCircle2, Percent, BarChart3, Award, Clock as ClockIcon } from "lucide-react";
import { motion } from "motion/react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell } from "recharts";
import { supabase } from "../utils/supabaseClient";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { formatCompactNumber } from "../i18n/numberFormat";

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
interface DailyFollowers { day: string; gained: number; total: number }
interface AudienceStats {
  avg_watch_ratio: number;
  completion_rate: number;
  unique_viewers: number;
  total_views: number;
  avg_watch_seconds: number;
}
interface TopVideo {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  views_count: number;
  likes_count: number;
  avg_watch_ratio: number;
}
interface RetentionBucket {
  bucket: string;
  bucket_order: number;
  avg_watch_ratio: number;
  view_count: number;
}
type TopMetric = "views" | "likes" | "watch_ratio";

// labels resolved via i18n in component
const RANGE_OPTIONS = [
  { days: 7, key: "creatorDashboard.rangeLast7" },
  { days: 14, key: "creatorDashboard.rangeLast14" },
  { days: 30, key: "creatorDashboard.rangeLast30" },
];

const formatNumber = formatCompactNumber;

function formatDay(iso: string, days: number): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (days <= 7) return `${m}/${day} (${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()]})`;
  return `${m}/${day}`;
}

export function CreatorDashboard() {
  const { t, i18n } = useTranslation();
  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [revenue, setRevenue] = useState<DailyRevenue[]>([]);
  const [engagement, setEngagement] = useState<DailyEngagement[]>([]);
  const [followers, setFollowers] = useState<DailyFollowers[]>([]);
  const [audience, setAudience] = useState<AudienceStats | null>(null);
  const [retention, setRetention] = useState<RetentionBucket[]>([]);
  const [topVideos, setTopVideos] = useState<TopVideo[]>([]);
  const [topMetric, setTopMetric] = useState<TopMetric>("views");
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  const fetchSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc("get_creator_dashboard_summary");
    // 에러를 삼키면 함수가 터져도 KPI가 전부 0으로 보임(이번 버그가 숨었던 이유) → 표면화.
    if (error) {
      console.error("[CreatorDashboard] summary RPC 실패:", error.message);
      toast.error(t("creatorDashboard.loadFailed", "대시보드 통계를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
      return;
    }
    if (Array.isArray(data) && data[0]) {
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

  const fetchCharts = useCallback(async (d: number, metric: TopMetric) => {
    setChartLoading(true);
    const [revRes, engRes, folRes, audRes, retRes, topRes] = await Promise.all([
      supabase.rpc("get_creator_daily_revenue", { p_days: d }),
      supabase.rpc("get_creator_daily_engagement", { p_days: d }),
      supabase.rpc("get_creator_daily_followers", { p_days: d }),
      supabase.rpc("get_creator_audience_stats", { p_days: d }),
      supabase.rpc("get_creator_retention_by_duration", { p_days: d }),
      supabase.rpc("get_creator_top_videos", { p_metric: metric, p_days: d, p_limit: 5 }),
    ]);
    // 6개 중 하나라도 실패하면 해당 차트가 조용히 비므로 로그+알림(무증상 실패 방지)
    const firstErr = [revRes, engRes, folRes, audRes, retRes, topRes].find(r => r.error)?.error;
    if (firstErr) {
      console.error("[CreatorDashboard] 차트 RPC 실패:", firstErr.message);
      toast.error(t("creatorDashboard.loadFailed", "대시보드 통계를 불러오지 못했어요. 잠시 후 다시 시도해 주세요."));
    }
    if (Array.isArray(revRes.data)) {
      setRevenue((revRes.data as any[]).map(r => ({ day: r.day, revenue: Number(r.revenue) || 0 })));
    }
    if (Array.isArray(engRes.data)) {
      setEngagement((engRes.data as any[]).map(r => ({ day: r.day, views: Number(r.views) || 0, likes: Number(r.likes) || 0 })));
    }
    if (Array.isArray(folRes.data)) {
      setFollowers((folRes.data as any[]).map(r => ({ day: r.day, gained: Number(r.gained) || 0, total: Number(r.total) || 0 })));
    }
    if (Array.isArray(audRes.data) && audRes.data[0]) {
      const a = audRes.data[0] as any;
      setAudience({
        avg_watch_ratio: Number(a.avg_watch_ratio) || 0,
        completion_rate: Number(a.completion_rate) || 0,
        unique_viewers: Number(a.unique_viewers) || 0,
        total_views: Number(a.total_views) || 0,
        avg_watch_seconds: Math.round(Number(a.avg_watch_seconds) || 0),   // 소수 초("12.7s") 방지
      });
    }
    if (Array.isArray(retRes.data)) {
      setRetention((retRes.data as any[])
        .map(r => ({
          bucket: r.bucket,
          bucket_order: Number(r.bucket_order),
          avg_watch_ratio: Number(r.avg_watch_ratio) || 0,
          view_count: Number(r.view_count) || 0,
        }))
        .sort((a, b) => a.bucket_order - b.bucket_order));   // RPC 행 순서에 의존하지 않고 버킷 순서 보장
    }
    if (Array.isArray(topRes.data)) {
      setTopVideos((topRes.data as any[]).map(r => ({
        id: r.id,
        title: r.title,
        thumbnail: r.thumbnail || "",
        duration: r.duration || "",
        views_count: Number(r.views_count) || 0,
        likes_count: Number(r.likes_count) || 0,
        avg_watch_ratio: Number(r.avg_watch_ratio) || 0,
      })));
    }
    setChartLoading(false);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchSummary(), fetchCharts(days, topMetric)]);
      setLoading(false);
    })();
  }, [fetchSummary, fetchCharts, days, topMetric]);

  if (loading) {
    return (
      <div className="bg-[#121212] p-6 rounded-2xl border border-white/5 flex justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#8b5cf6]" />
      </div>
    );
  }

  const formattedRevenue = revenue.map(r => ({ ...r, day: formatDay(r.day, days) }));
  const formattedEngagement = engagement.map(r => ({ ...r, day: formatDay(r.day, days) }));
  const formattedFollowers = followers.map(r => ({ ...r, day: formatDay(r.day, days) }));
  // retention bucket 색상 (시청률에 따라 보간)
  const retentionColors = ["#ef4444", "#f59e0b", "#10b981", "#6366f1"];

  const TOP_METRIC_LABELS: Record<TopMetric, string> = {
    views: t("creatorDashboard.metricViews"),
    likes: t("creatorDashboard.metricLikes"),
    watch_ratio: t("creatorDashboard.metricWatchRatio"),
  };

  const formatSeconds = (s: number): string => {
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}m ${sec}s`;
  };

  // 다음 정산 날짜를 현재 로케일(한/영)에 맞춰 표시
  const localeTag = i18n.language?.startsWith("ko") ? "ko-KR" : "en-US";

  return (
    <div className="space-y-4">
      {/* KPI 4개 (누적) */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label={t("creatorDashboard.kpiRevenue")} value={`₩${(summary?.total_revenue ?? 0).toLocaleString()}`} color="text-[#6366f1]" bgColor="bg-[#6366f1]/10" />
        <KpiCard icon={Eye} label={t("creatorDashboard.kpiViews")} value={formatNumber(summary?.total_views ?? 0)} color="text-[#10b981]" bgColor="bg-[#10b981]/10" />
        <KpiCard icon={Heart} label={t("creatorDashboard.kpiLikes")} value={formatNumber(summary?.total_likes ?? 0)} color="text-[#ec4899]" bgColor="bg-[#ec4899]/10" />
        <KpiCard icon={TrendingUp} label={t("creatorDashboard.kpiRpm")} value={`₩${(summary?.rpm ?? 0).toLocaleString()}`} color="text-amber-400" bgColor="bg-amber-400/10" tooltip={t("creatorDashboard.tooltipRpm")} />
      </motion.div>

      {/* Phase 20: 시청자 인사이트 (선택 기간 기준) */}
      {audience && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={Percent}
            label={t("creatorDashboard.kpiWatchRatio")}
            value={`${Math.round((audience.avg_watch_ratio || 0) * 100)}%`}
            color="text-cyan-400" bgColor="bg-cyan-400/10"
            tooltip={t("creatorDashboard.tooltipWatchRatio")}
          />
          <KpiCard
            icon={CheckCircle2}
            label={t("creatorDashboard.kpiCompletion")}
            value={`${Math.round((audience.completion_rate || 0) * 100)}%`}
            color="text-[#10b981]" bgColor="bg-[#10b981]/10"
            tooltip={t("creatorDashboard.tooltipCompletion")}
          />
          <KpiCard
            icon={Users}
            label={t("creatorDashboard.kpiUniqueViewers")}
            value={formatNumber(audience.unique_viewers)}
            color="text-[#a78bfa]" bgColor="bg-[#a78bfa]/10"
          />
          <KpiCard
            icon={ClockIcon}
            label={t("creatorDashboard.kpiAvgWatchTime")}
            value={formatSeconds(audience.avg_watch_seconds)}
            color="text-orange-400" bgColor="bg-orange-400/10"
          />
        </motion.div>
      )}

      {/* 다음 정산 안내 */}
      {summary && summary.pending_payout > 0 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-[#6366f1]/15 to-[#8b5cf6]/15 p-4 rounded-2xl border border-[#6366f1]/30 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-[#6366f1]/20 flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5 text-[#a78bfa]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white mb-0.5">{t("creatorDashboard.nextPayoutTitle")}</p>
            <p className="text-xs text-gray-400">
              {summary.next_settlement_date && !isNaN(new Date(summary.next_settlement_date).getTime())
                ? `${new Date(summary.next_settlement_date).toLocaleDateString(localeTag, { month: "long", day: "numeric" })} · `
                : ""}
              <span className="font-bold text-[#a78bfa] ml-1">₩{summary.pending_payout.toLocaleString()}</span> {t("creatorDashboard.pendingSuffix")}
            </p>
          </div>
        </motion.div>
      )}

      {/* 시간 범위 셀렉터 */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-white">{t("creatorDashboard.dailyChartTitle")}</h3>
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
              {t(opt.key)}
            </button>
          ))}
        </div>
      </div>

      {/* Daily revenue */}
      <div className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative">
        <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-[#6366f1]" />
          {t("creatorDashboard.dailyChartTitle")}
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
              <YAxis stroke="#666" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactNumber(v)} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                formatter={(v: any) => [`₩${Number(v).toLocaleString()}`, t("creatorDashboard.kpiRevenue")]}
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
          {t("creatorDashboard.engagementChartTitle")}
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
              <Line type="monotone" dataKey="views" name={t("creatorDashboard.kpiViews")} stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="likes" name={t("creatorDashboard.kpiLikes")} stroke="#ec4899" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Phase 20: 일별 팔로워 증가 */}
      <div className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative">
        <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Users className="w-4 h-4 text-[#a78bfa]" />
          {t("creatorDashboard.followersChartTitle")}
        </h4>
        {chartLoading && (
          <div className="absolute right-5 top-5"><Loader2 className="w-4 h-4 animate-spin text-gray-500" /></div>
        )}
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={formattedFollowers} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
              <XAxis dataKey="day" stroke="#666" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#666" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                formatter={(v: any, name: any) => [Number(v).toLocaleString(), name]}
              />
              <Legend wrapperStyle={{ fontSize: 11, color: '#999' }} iconType="circle" />
              <Line type="monotone" dataKey="total" name={t("creatorDashboard.cumulativeFollowers")} stroke="#a78bfa" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
              <Line type="monotone" dataKey="gained" name={t("creatorDashboard.newFollowers")} stroke="#10b981" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Phase 20: 영상 길이 구간별 평균 시청률 */}
      {retention.length > 0 && (
        <div className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative">
          <h4 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            {t("creatorDashboard.retentionChartTitle")}
          </h4>
          <p className="text-[10px] text-gray-500 mb-4">{t("creatorDashboard.retentionSubtitle")}</p>
          {chartLoading && <div className="absolute right-5 top-5"><Loader2 className="w-4 h-4 animate-spin text-gray-500" /></div>}
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={retention} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="bucket" stroke="#666" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#666" tick={{ fontSize: 11 }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`} domain={[0, 1]} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                  contentStyle={{ backgroundColor: '#1a1a1c', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: 12 }}
                  labelStyle={{ color: '#fff' }}
                  itemStyle={{ color: '#fff' }}
                  formatter={(v: any, _name: any, p: any) => [
                    `${Math.round(Number(v) * 100)}% (${t("creatorDashboard.viewCountLabel", { count: p.payload.view_count })})`,
                    t("creatorDashboard.kpiWatchRatio")
                  ]}
                />
                {/* maxBarSize: 버킷이 1~2개일 때 막대가 화면 전체 폭으로 늘어나 '빨간 사각형'처럼
                    보이던 문제 방지 (recharts는 카테고리 적으면 막대를 최대한 넓게 그림) */}
                <Bar dataKey="avg_watch_ratio" radius={[6, 6, 0, 0]} maxBarSize={72}>
                  {retention.map((_, idx) => (
                    <Cell key={idx} fill={retentionColors[idx % retentionColors.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Phase 20: Top 영상 */}
      <div className="bg-[#121212] p-5 rounded-2xl border border-white/5 relative">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            {t("creatorDashboard.topVideosTitle")}
          </h4>
          <div className="flex gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
            {(["views", "likes", "watch_ratio"] as TopMetric[]).map(m => (
              <button
                key={m}
                onClick={() => setTopMetric(m)}
                disabled={chartLoading}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-colors disabled:opacity-50 ${
                  topMetric === m
                    ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white shadow-sm"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {TOP_METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        {topVideos.length === 0 ? (
          <p className="text-center text-xs text-gray-500 py-6">{t("creatorDashboard.noData")}</p>
        ) : (
          <div className="space-y-2">
            {topVideos.map((v, idx) => (
              <div key={v.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-lg transition-colors">
                <span className="text-base font-black text-amber-400 w-6 text-center">{idx + 1}</span>
                <div className="w-20 aspect-video rounded-md overflow-hidden bg-black flex-shrink-0">
                  {v.thumbnail && <img src={v.thumbnail} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{v.title}</p>
                  <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5">
                    <span className="flex items-center gap-0.5"><Eye className="w-3 h-3" />{formatNumber(v.views_count)}</span>
                    <span className="flex items-center gap-0.5"><Heart className="w-3 h-3" />{formatNumber(v.likes_count)}</span>
                    <span className="flex items-center gap-0.5"><Percent className="w-3 h-3" />{Math.round(v.avg_watch_ratio * 100)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
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
