// ════════════════════════════════════════════════════════════════════════════
// 어드민 대시보드 메인 — 한눈에 보기 (Phase 10.5)
//
// YouTube Studio Analytics 스타일.
// 한 화면에서 사용자/콘텐츠/매출/시청/신고 전체 현황 파악.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useState } from "react";
import { UserAvatar } from "./UserAvatar";
import {
  Loader2, Users, Crown, Film, EyeOff, DollarSign, AlertCircle,
  Eye, Clock, TrendingUp, Megaphone, ShieldAlert, Flag, RefreshCw
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { supabase } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

interface Summary {
  total_users: number;
  premium_users: number;
  new_users_today: number;
  new_users_this_month: number;
  total_videos: number;
  hidden_videos: number;
  videos_uploaded_today: number;
  revenue_this_month: number;
  subscription_revenue: number;
  license_revenue: number;
  ad_budget_revenue: number;
  pending_reports: number;
  suspended_users: number;
  views_24h: number;
  valid_views_24h: number;
  total_watch_seconds_24h: number;
}

interface DailyRevenue { day: string; subscription: number; license: number; ad_budget: number; total: number; }
interface DailyUserGrowth { day: string; new_users: number; cumulative: number; }
interface DailyViews { day: string; total_views: number; valid_views: number; watch_hours: number; }
interface TopVideo { video_id: string; title: string; thumbnail: string; creator_name: string; valid_views: number; watch_hours: number; is_hidden: boolean; }
interface TopCreator { creator_id: string; display_name: string; avatar_url: string; video_count: number; total_valid_views: number; total_watch_hours: number; is_suspended: boolean; }
interface AdPerf {
  total_ads: number; active_ads: number; depleted_ads: number;
  total_impressions: number; total_clicks: number;
  total_spent: number; total_budget: number; avg_ctr: number;
}

function won(n: number) { return "₩" + (n || 0).toLocaleString(); }
function num(n: number) { return (n || 0).toLocaleString(); }

export function AdminOverview() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [userGrowth, setUserGrowth] = useState<DailyUserGrowth[]>([]);
  const [dailyViews, setDailyViews] = useState<DailyViews[]>([]);
  const [topVideos, setTopVideos] = useState<TopVideo[]>([]);
  const [topCreators, setTopCreators] = useState<TopCreator[]>([]);
  const [adPerf, setAdPerf] = useState<AdPerf | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [
        { data: s, error: sErr },
        { data: dr, error: drErr },
        { data: ug, error: ugErr },
        { data: dv, error: dvErr },
        { data: tv, error: tvErr },
        { data: tc, error: tcErr },
        { data: ap, error: apErr },
      ] = await Promise.all([
        supabase.rpc("get_admin_dashboard_summary"),
        supabase.rpc("get_daily_revenue", { p_days: 30 }),
        supabase.rpc("get_daily_user_growth", { p_days: 30 }),
        supabase.rpc("get_daily_views", { p_days: 30 }),
        supabase.rpc("get_top_videos", { p_limit: 10 }),
        supabase.rpc("get_top_creators", { p_limit: 10 }),
        supabase.rpc("get_ad_performance_summary"),
      ]);

      // supabase.rpc 는 실패해도 throw 하지 않고 {error} 를 반환 → 아래 try/catch 로는
      //   안 잡힘. 조용히 0으로 표시되면 "실제 데이터 0"으로 오해하므로 명시적으로 노출.
      const rpcErrors: [string, any][] = [
        ["요약", sErr], ["일별매출", drErr], ["가입추이", ugErr], ["조회수", dvErr],
        ["인기영상", tvErr], ["인기크리에이터", tcErr], ["광고성과", apErr],
      ].filter(([, e]) => e) as [string, any][];
      for (const [name, e] of rpcErrors) console.warn(`${name}:`, e);
      if (rpcErrors.length > 0) {
        toast.error(`대시보드 일부 지표 조회 실패: ${rpcErrors.map(([n]) => n).join(", ")}`);
      }

      if (s && s.length > 0) setSummary(s[0]);
      setDailyRevenue(dr || []);
      setUserGrowth(ug || []);
      setDailyViews(dv || []);
      setTopVideos(tv || []);
      setTopCreators(tc || []);
      if (ap && ap.length > 0) setAdPerf(ap[0]);
    } catch (err: any) {
      toast.error("대시보드 로딩 실패: " + err?.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" />
      </div>
    );
  }

  const watchHours24h = summary ? Math.round((summary.total_watch_seconds_24h || 0) / 3600) : 0;

  // 차트 데이터 포맷 — 날짜를 짧게 (MM/DD)
  const fmtDay = (d: string) => {
    const date = new Date(d);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };
  const revenueChartData = dailyRevenue.map(r => ({ ...r, day: fmtDay(r.day) }));
  const userGrowthChartData = userGrowth.map(r => ({ ...r, day: fmtDay(r.day) }));
  const viewsChartData = dailyViews.map(r => ({ ...r, day: fmtDay(r.day) }));

  return (
    <div className="space-y-6">
      {/* 새로고침 버튼 */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={loadAll} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" />
          새로고침
        </Button>
      </div>

      {/* ── 핵심 KPI 카드 (4개) ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          icon={Users}
          color="text-blue-400"
          label="전체 사용자"
          value={num(summary?.total_users || 0)}
          sub={`프리미엄 ${num(summary?.premium_users || 0)}`}
        />
        <KpiCard
          icon={Film}
          color="text-purple-400"
          label="전체 영상"
          value={num(summary?.total_videos || 0)}
          sub={`오늘 ${num(summary?.videos_uploaded_today || 0)}건 업로드`}
        />
        <KpiCard
          icon={DollarSign}
          color="text-green-400"
          label="이번 달 매출"
          value={won(summary?.revenue_this_month || 0)}
          sub={`구독 ${won(summary?.subscription_revenue || 0)}`}
        />
        <KpiCard
          icon={Eye}
          color="text-amber-400"
          label="24h 시청"
          value={num(summary?.valid_views_24h || 0) + " 회"}
          sub={`${watchHours24h}시간`}
        />
      </div>

      {/* ── 운영 알림 카드 ── */}
      {((summary?.pending_reports || 0) > 0 || (summary?.hidden_videos || 0) > 0 || (summary?.suspended_users || 0) > 0) && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-300 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            운영 알림 — 처리 필요
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            {(summary?.pending_reports || 0) > 0 && (
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-red-400" />
                <span className="text-muted-foreground">대기 신고:</span>
                <span className="font-bold text-red-400">{num(summary!.pending_reports)}건</span>
              </div>
            )}
            {(summary?.hidden_videos || 0) > 0 && (
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-amber-400" />
                <span className="text-muted-foreground">숨김 영상:</span>
                <span className="font-bold text-amber-400">{num(summary!.hidden_videos)}건</span>
              </div>
            )}
            {(summary?.suspended_users || 0) > 0 && (
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-400" />
                <span className="text-muted-foreground">정지 계정:</span>
                <span className="font-bold text-red-400">{num(summary!.suspended_users)}건</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 매출 추이 그래프 ── */}
      <ChartCard title="📈 일별 매출 추이 (최근 30일)">
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={revenueChartData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="day" stroke="#888" tick={{ fontSize: 11 }} />
            <YAxis stroke="#888" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 10000 ? `${(v/10000).toFixed(0)}만` : v.toString()} />
            <Tooltip
              contentStyle={{ backgroundColor: "#1c1c1e", border: "1px solid #333", borderRadius: 8 }}
              formatter={(value: any) => won(value)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="total" stroke="#8b5cf6" name="총 매출" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="subscription" stroke="#6366f1" name="구독" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="license" stroke="#10b981" name="라이선스" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="ad_budget" stroke="#f59e0b" name="광고예산" strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* ── 가입자 & 시청 그래프 (2단) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="👥 가입자 추이 (최근 30일)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={userGrowthChartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="day" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1c1c1e", border: "1px solid #333", borderRadius: 8 }} />
              <Bar dataKey="new_users" fill="#6366f1" name="신규 가입" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="👁 시청 추이 (최근 30일)">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={viewsChartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="day" stroke="#888" tick={{ fontSize: 11 }} />
              <YAxis stroke="#888" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1c1c1e", border: "1px solid #333", borderRadius: 8 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="valid_views" stroke="#10b981" name="유효 시청" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="total_views" stroke="#888" name="전체 시청" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* ── 인기 영상 + 인기 크리에이터 (2단) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="🎬 인기 영상 Top 10 (최근 30일)">
          {topVideos.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">시청 데이터 없음</p>
          ) : (
            <div className="space-y-2">
              {topVideos.map((v, i) => (
                <div key={v.video_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                  <span className="text-sm font-bold text-muted-foreground w-5">{i + 1}</span>
                  {v.thumbnail ? (
                    <img src={v.thumbnail} alt="" className="w-14 h-10 rounded object-cover" />
                  ) : (
                    <div className="w-14 h-10 rounded bg-muted flex items-center justify-center">
                      <Film className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{v.title}</p>
                    <p className="text-[11px] text-muted-foreground">{v.creator_name || "이름 없음"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#8b5cf6]">{num(v.valid_views)}회</p>
                    <p className="text-[10px] text-muted-foreground">{v.watch_hours}h</p>
                  </div>
                  {v.is_hidden && (
                    <EyeOff className="w-4 h-4 text-red-400 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard title="⭐ 인기 크리에이터 Top 10">
          {topCreators.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">크리에이터 데이터 없음</p>
          ) : (
            <div className="space-y-2">
              {topCreators.map((c, i) => (
                <div key={c.creator_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted">
                  <span className="text-sm font-bold text-muted-foreground w-5">{i + 1}</span>
                  <UserAvatar src={c.avatar_url} name={c.display_name || undefined} className="w-10 h-10" fallback={<Users className="w-5 h-5 text-white" />} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{c.display_name || "이름 없음"}</p>
                    <p className="text-[11px] text-muted-foreground">영상 {num(c.video_count)}개</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-[#8b5cf6]">{num(c.total_valid_views)}회</p>
                    <p className="text-[10px] text-muted-foreground">{c.total_watch_hours}h</p>
                  </div>
                  {c.is_suspended && (
                    <ShieldAlert className="w-4 h-4 text-red-400 flex-shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* ── 광고 성과 요약 ── */}
      {adPerf && (
        <ChartCard title="📢 광고 성과 요약">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MiniStat label="활성 광고" value={`${num(adPerf.active_ads)} / ${num(adPerf.total_ads)}`} />
            <MiniStat label="총 노출" value={num(adPerf.total_impressions)} />
            <MiniStat label="총 클릭" value={num(adPerf.total_clicks)} />
            <MiniStat label="평균 CTR" value={`${adPerf.avg_ctr}%`} />
            <MiniStat label="총 예산" value={won(adPerf.total_budget)} />
            <MiniStat label="총 집행" value={won(adPerf.total_spent)} />
            <MiniStat label="잔여" value={won(Math.max(adPerf.total_budget - adPerf.total_spent, 0))} />
            <MiniStat label="소진 광고" value={`${num(adPerf.depleted_ads)}개`} color="text-red-400" />
          </div>
        </ChartCard>
      )}
    </div>
  );
}

// ── 작은 컴포넌트들 ──

function KpiCard({
  icon: Icon, color, label, value, sub
}: { icon: typeof Users; color: string; label: string; value: string; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <Icon className={`w-5 h-5 mb-2 ${color}`} />
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-xl font-black mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-bold mb-3">{title}</h3>
      {children}
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${color || ""}`}>{value}</p>
    </div>
  );
}
