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
import { supabase, supabaseUrl, supabaseAnonKey } from "../utils/supabaseClient";
import { Button } from "./ui/button";
import { toast } from "sonner";

// 방문자 통계는 우리 DB 에 없다 — GA4 Data API 를 Edge 가 대신 호출해 숫자만 받아온다.
//   (관리자 대시보드의 "24h 시청"은 video_views = 영상 재생 기준이라 방문자와 다른 지표.
//    둘러보다 나간 사람·비로그인 방문자는 video_views 에 안 남는다.)
const VISITOR_ENDPOINT = `${supabaseUrl}/functions/v1/server/admin-visitor-stats`;

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
interface VisitorDay { date: string; users: number; sessions: number; views: number; }
interface VisitorStats {
  configured: boolean;
  ok?: boolean;
  reason?: string;        // configured=false 사유(시크릿 미설정 등)
  error?: string;         // GA API 오류(권한 누락이 가장 흔함)
  today?: VisitorDay;
  yesterday?: VisitorDay;
  last7Users?: number;
  daily?: VisitorDay[];
}

// ⚠️ get_admin_dashboard_summary·get_daily_* 는 지표를 BIGINT 로 반환 → PostgREST 가 JSON
//   문자열로 직렬화한다. 문자열에 .toLocaleString() 하면 천단위 구분이 안 붙으므로(무포맷)
//   반드시 Number() 로 캐스팅한 뒤 포맷한다(코드베이스 공통 관례 — AdminRevenueSettlement 등).
function won(n: number) { return "₩" + Number(n || 0).toLocaleString(); }
function num(n: number) { return Number(n || 0).toLocaleString(); }

export function AdminOverview() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [userGrowth, setUserGrowth] = useState<DailyUserGrowth[]>([]);
  const [dailyViews, setDailyViews] = useState<DailyViews[]>([]);
  const [topVideos, setTopVideos] = useState<TopVideo[]>([]);
  const [topCreators, setTopCreators] = useState<TopCreator[]>([]);
  const [adPerf, setAdPerf] = useState<AdPerf | null>(null);
  const [visitors, setVisitors] = useState<VisitorStats | null>(null);

  // 방문자 통계 — 외부 API(GA) 라 느리고 실패할 수 있어 대시보드 본체와 분리해서 로드한다.
  //   (같이 await 하면 GA 지연 때문에 매출·시청 지표까지 늦게 뜬다.)
  const loadVisitors = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(`${VISITOR_ENDPOINT}?days=30`, {
        headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabaseAnonKey },
      });
      if (!res.ok) { setVisitors({ configured: true, ok: false, error: `서버 오류(${res.status})` }); return; }
      setVisitors(await res.json());
    } catch (e: any) {
      setVisitors({ configured: true, ok: false, error: String(e?.message || e) });
    }
  };

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

  useEffect(() => { loadAll(); loadVisitors(); }, []);

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
  // BIGINT → 문자열 직렬화라 recharts 수치축이 어긋난다 → 명시적 Number() 캐스팅.
  const revenueChartData = dailyRevenue.map(r => ({
    day: fmtDay(r.day), subscription: Number(r.subscription), license: Number(r.license),
    ad_budget: Number(r.ad_budget), total: Number(r.total),
  }));
  const userGrowthChartData = userGrowth.map(r => ({
    day: fmtDay(r.day), new_users: Number(r.new_users), cumulative: Number(r.cumulative),
  }));
  // GA 는 'YYYY-MM-DD' 문자열로 오므로 fmtDay(MM/DD) 로 축만 짧게 맞춘다(다른 차트와 동일 표기).
  const visitorChartData = (visitors?.daily || []).map(r => ({
    day: fmtDay(r.date), users: Number(r.users), views: Number(r.views),
  }));
  const viewsChartData = dailyViews.map(r => ({
    day: fmtDay(r.day), total_views: Number(r.total_views), valid_views: Number(r.valid_views),
    watch_hours: Number(r.watch_hours),
  }));

  return (
    <div className="space-y-6">
      {/* 새로고침 버튼 */}
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => { loadAll(); loadVisitors(); }} className="gap-1.5">
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

      {/* ── 방문자 (GA4) ──
          우리 DB 엔 방문 기록이 없어 GA4 Data API 를 Edge 경유로 읽어온다.
          시크릿 미설정/권한 누락이면 숫자 대신 원인을 그대로 보여준다(조용한 0 방지). */}
      <ChartCard title="👣 방문자 (Google Analytics)">
        {!visitors ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-5 h-5 text-[#6366f1] animate-spin" /></div>
        ) : !visitors.configured ? (
          <div className="text-xs text-muted-foreground leading-relaxed">
            아직 GA 연동이 설정되지 않았습니다. <span className="text-amber-400">{visitors.reason}</span>
            <br />Supabase Edge 시크릿에 <code className="text-white">GA_PROPERTY_ID</code> ·{" "}
            <code className="text-white">GA_SERVICE_ACCOUNT_JSON</code> 을 등록하면 이 카드가 채워집니다.
            <br />설정 절차: <span className="text-white">docs/analytics-setup-guide.md</span>
          </div>
        ) : !visitors.ok ? (
          <div className="text-xs text-red-400 leading-relaxed">
            GA 조회 실패: {visitors.error}
            <br />
            <span className="text-muted-foreground">
              가장 흔한 원인은 서비스 계정을 GA 속성에 <strong className="text-white">뷰어로 추가하지 않은 것</strong>입니다
              (GA → 관리 → 속성 액세스 관리).
            </span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <MiniStat label="오늘 방문자" value={num(visitors.today?.users || 0) + "명"} color="text-cyan-400" />
              <MiniStat label="어제 방문자" value={num(visitors.yesterday?.users || 0) + "명"} />
              <MiniStat label="최근 7일 합계" value={num(visitors.last7Users || 0) + "명"} />
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={visitorChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="day" stroke="#888" fontSize={11} />
                <YAxis stroke="#888" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 8 }} />
                <Legend />
                <Line type="monotone" dataKey="users" stroke="#06b6d4" name="방문자" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="views" stroke="#8b5cf6" name="페이지뷰" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-[11px] text-muted-foreground mt-2">
              ※ 오늘 수치는 집계 확정 전이라 실제보다 낮게 보일 수 있습니다(확정까지 수 시간~24시간).
              광고 차단기 사용자는 GA 에 잡히지 않아 실제보다 다소 적게 나옵니다.
            </p>
          </>
        )}
      </ChartCard>

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
