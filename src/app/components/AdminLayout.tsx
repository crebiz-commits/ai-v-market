// ════════════════════════════════════════════════════════════════════════════
// 어드민 전용 레이아웃 (Phase 10)
//
// YouTube Studio 스타일 — 좌측 사이드바 + 메인 영역
// 기존 메인 사이트와 완전히 분리된 디자인 (헤더/푸터 없음)
//
// 진입 경로: 마이페이지 → "관리자 페이지" 버튼 (어드민만 표시)
// 라우팅: App.tsx에서 activeTab === "admin" 시 이 컴포넌트 렌더링
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, lazy, Suspense } from "react";
import {
  ShieldCheck, Megaphone, Settings, Coins, Flag, EyeOff,
  ArrowLeft, Menu, X, ShieldAlert, Loader2, LayoutDashboard,
  Users, Film, DollarSign, Send, ClipboardList, MessageSquare,
  Globe, Sparkles, Inbox, Trophy, Image as ImageIcon, Bug, Coffee, LifeBuoy, ClipboardCheck, Crown
} from "lucide-react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/button";

// 지연 로드 (각 페이지)
const AdminOverview = lazy(() => import("./AdminOverview").then(m => ({ default: m.AdminOverview })));
const AdminDashboard = lazy(() => import("./AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const AdminRevenuePolicy = lazy(() => import("./AdminRevenuePolicy").then(m => ({ default: m.AdminRevenuePolicy })));
const AdminRevenueSettlement = lazy(() => import("./AdminRevenueSettlement").then(m => ({ default: m.AdminRevenueSettlement })));
const AdminReports = lazy(() => import("./AdminReports").then(m => ({ default: m.AdminReports })));
const AdminUsers = lazy(() => import("./AdminUsers").then(m => ({ default: m.AdminUsers })));
const AdminContent = lazy(() => import("./AdminContent").then(m => ({ default: m.AdminContent })));
const AdminModeration = lazy(() => import("./AdminModeration").then(m => ({ default: m.AdminModeration })));
const AdminComments = lazy(() => import("./AdminComments").then(m => ({ default: m.AdminComments })));
const AdminPayments = lazy(() => import("./AdminPayments").then(m => ({ default: m.AdminPayments })));
const AdminBroadcast = lazy(() => import("./AdminBroadcast").then(m => ({ default: m.AdminBroadcast })));
const AdminActivityLog = lazy(() => import("./AdminActivityLog").then(m => ({ default: m.AdminActivityLog })));
const AdminExternalAds = lazy(() => import("./AdminExternalAds").then(m => ({ default: m.AdminExternalAds })));
const AdminAdReview = lazy(() => import("./AdminAdReview").then(m => ({ default: m.AdminAdReview })));
const AdminSponsorships = lazy(() => import("./AdminSponsorships").then(m => ({ default: m.AdminSponsorships })));
const AdminInquiries = lazy(() => import("./AdminInquiries").then(m => ({ default: m.AdminInquiries })));
const AdminSupportInquiries = lazy(() => import("./AdminSupportInquiries").then(m => ({ default: m.AdminSupportInquiries })));
const AdminChallenges = lazy(() => import("./AdminChallenges").then(m => ({ default: m.AdminChallenges })));
const AdminBanners = lazy(() => import("./AdminBanners").then(m => ({ default: m.AdminBanners })));
const AdminBugReports = lazy(() => import("./AdminBugReports").then(m => ({ default: m.AdminBugReports })));
const AdminMegaUploader = lazy(() => import("./AdminMegaUploader").then(m => ({ default: m.AdminMegaUploader })));
const AdminGrantPremium = lazy(() => import("./AdminGrantPremium").then(m => ({ default: m.AdminGrantPremium })));

type AdminPage =
  | "overview"      // 대시보드 (한눈에 보기)
  | "ads"           // 자체 광고 (CREAITE House Ads)
  | "ad_reviews"    // 광고 심사 (광고주 셀프서비스 제출 큐)
  | "external_ads"  // 외부 광고 (Google AdSense / 쿠팡 등) — placeholder
  | "sponsorships"  // 크리에이터 스폰서십 검수 — placeholder
  | "policy"        // 수익 정책
  | "settlement"    // 정산 관리
  | "payments"      // 결제/환불
  | "users"         // 사용자 관리
  | "content"       // 콘텐츠 관리
  | "reports"       // 신고 큐
  | "moderation"    // 숨김 콘텐츠
  | "comments"      // 댓글 관리
  | "broadcast"     // 공지 발송
  | "inquiries"     // 비즈니스 문의
  | "support"       // 고객 1:1 문의
  | "challenges"    // 챌린지(공모전) 관리
  | "banners"       // 이벤트 배너 관리
  | "bugs"          // 버그 제보 관리
  | "mega"          // 메가커피 업로더 이벤트
  | "grant_premium" // 프리미엄 수동 지급 (챌린지 보상 등)
  | "activity";     // 활동 로그

interface MenuItem {
  key: AdminPage;
  label: string;
  icon: typeof ShieldCheck;
  group: string;
}

const MENU: MenuItem[] = [
  { key: "overview",     label: "대시보드",        icon: LayoutDashboard, group: "📊 한눈에 보기" },
  { key: "users",        label: "사용자 관리",      icon: Users,           group: "👥 운영" },
  { key: "content",      label: "콘텐츠 관리",      icon: Film,            group: "👥 운영" },
  { key: "broadcast",    label: "공지 발송",       icon: Send,            group: "👥 운영" },
  { key: "support",      label: "고객 문의",       icon: LifeBuoy,        group: "👥 운영" },
  { key: "inquiries",    label: "비즈니스 문의",    icon: Inbox,           group: "👥 운영" },
  { key: "challenges",   label: "챌린지·공모전",    icon: Trophy,          group: "👥 운영" },
  { key: "banners",      label: "이벤트 배너",      icon: ImageIcon,       group: "👥 운영" },
  { key: "bugs",         label: "버그 제보",       icon: Bug,             group: "👥 운영" },
  { key: "mega",         label: "메가 업로더",      icon: Coffee,          group: "👥 운영" },
  { key: "ads",          label: "자체 광고",       icon: Megaphone,       group: "📢 광고 관리" },
  { key: "ad_reviews",   label: "광고 심사",       icon: ClipboardCheck,  group: "📢 광고 관리" },
  { key: "external_ads", label: "외부 광고",       icon: Globe,           group: "📢 광고 관리" },
  { key: "sponsorships", label: "크리에이터 스폰서십", icon: Sparkles,        group: "📢 광고 관리" },
  { key: "policy",       label: "수익 정책",       icon: Settings,        group: "💰 수익화" },
  { key: "settlement",   label: "정산 관리",       icon: Coins,           group: "💰 수익화" },
  { key: "payments",     label: "결제·환불",       icon: DollarSign,      group: "💰 수익화" },
  { key: "grant_premium", label: "프리미엄 지급",    icon: Crown,           group: "💰 수익화" },
  { key: "reports",      label: "신고 큐",         icon: Flag,            group: "🛡 안전·품질" },
  { key: "moderation",   label: "숨김 콘텐츠",      icon: EyeOff,          group: "🛡 안전·품질" },
  { key: "comments",     label: "댓글 관리",       icon: MessageSquare,   group: "🛡 안전·품질" },
  { key: "activity",     label: "활동 로그",       icon: ClipboardList,   group: "🛡 안전·품질" },
];

const PAGE_META: Record<AdminPage, { title: string; subtitle: string }> = {
  overview:   { title: "대시보드",       subtitle: "사용자·콘텐츠·매출·시청·운영 통계를 한눈에 봅니다" },
  users:      { title: "사용자 관리",    subtitle: "사용자 검색, 정지, 어드민 권한 부여를 관리합니다" },
  content:    { title: "콘텐츠 관리",    subtitle: "전체 영상 검색, 강제 숨김, 영구 삭제를 처리합니다" },
  broadcast:  { title: "공지 발송",      subtitle: "전체/세그먼트 사용자에게 인앱 공지를 발송합니다" },
  support:    { title: "고객 문의",       subtitle: "일반 고객의 1:1 문의를 확인하고 사이트 내에서 답변합니다 (답변 시 고객에게 알림)" },
  inquiries:  { title: "비즈니스 문의",   subtitle: "광고·투자·제휴·B2B 라이선스 등 외부 문의를 확인하고 상태를 관리합니다" },
  challenges: { title: "챌린지·공모전",   subtitle: "매월 공모전을 등록·관리합니다 — 커뮤니티 챌린지 탭에 바로 노출됩니다" },
  banners:    { title: "이벤트 배너",     subtitle: "시네마 상단 이벤트 배너를 등록·수정·정렬·노출 관리합니다" },
  bugs:       { title: "버그 제보",       subtitle: "\"버그를 잡아라\" 이벤트 제보를 검토하고 커피 쿠폰 지급을 관리합니다" },
  mega:       { title: "메가 업로더 이벤트", subtitle: "영화 30편 업로드 달성자를 확인하고 메가커피 3만원권 지급을 관리합니다" },
  ads:          { title: "자체 광고",          subtitle: "CREAITE House Ads — 영상 pre-roll, 피드 카드 광고 등록·관리" },
  ad_reviews:   { title: "광고 심사",          subtitle: "광고주가 제출한 광고를 검토하고 승인·반려합니다" },
  external_ads: { title: "외부 광고",          subtitle: "애드핏·쿠팡·애드센스 수익 대시보드 바로가기 + 현재 상태" },
  sponsorships: { title: "크리에이터 스폰서십", subtitle: "크리에이터가 영상에 등록한 협찬·스폰서 배지 검수 (공시문구·승인/반려)" },
  policy:     { title: "수익 정책",      subtitle: "크리에이터 분배율·CPM·정산 허들을 변경하고 이력을 추적합니다" },
  settlement: { title: "정산 관리",      subtitle: "월별 크리에이터 수익을 산출하고 지급 처리합니다" },
  payments:   { title: "결제·환불",      subtitle: "모든 결제 내역 조회 및 환불 처리 (구독/라이선스/광고예산)" },
  grant_premium: { title: "프리미엄 지급", subtitle: "이메일로 사용자에게 프리미엄 구독을 수동 지급합니다 (챌린지 우승 보상 등)" },
  reports:    { title: "신고 큐",        subtitle: "사용자가 신고한 영상/댓글/사용자/커뮤니티 글을 검토합니다" },
  moderation: { title: "숨김 콘텐츠",    subtitle: "자동/수동 숨김된 콘텐츠와 정지된 계정을 통합 관리합니다" },
  comments:   { title: "댓글 관리",      subtitle: "전체 댓글을 검색·필터링하고 강제 숨김/복원/삭제합니다 (스팸·도배 능동 대응)" },
  activity:   { title: "활동 로그",      subtitle: "어드민이 변경한 모든 작업의 이력을 추적합니다 (감사용)" },
};

interface AdminLayoutProps {
  onBackToSite: () => void;   // 일반 사이트로 돌아가기
}

export function AdminLayout({ onBackToSite }: AdminLayoutProps) {
  const { user, profile } = useAuth();
  const [currentPage, setCurrentPage] = useState<AdminPage>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);  // 모바일용
  // 미처리 알림 배지 — 메가 업로더 달성(쿠폰 대기) / 신규 버그 제보
  const [badges, setBadges] = useState<Partial<Record<AdminPage, number>>>({});

  useEffect(() => {
    if (!user || profile?.is_admin !== true) return;
    let cancelled = false;
    (async () => {
      try {
        const [megaRes, bugRes, supRes, sponRes] = await Promise.all([
          supabase.rpc("admin_list_upload_milestones"),
          supabase.from("bug_reports").select("id", { count: "exact", head: true }).eq("status", "new"),
          supabase.from("support_inquiries").select("id", { count: "exact", head: true }).eq("status", "open"),
          supabase.rpc("admin_list_sponsored_videos", { p_filter: "pending" }),
        ]);
        if (cancelled) return;
        const megaPending = ((megaRes.data as any[]) || []).filter((m) => m.status === "pending").length;
        const sponPending = ((sponRes.data as any[]) || []).length;
        setBadges({ mega: megaPending, bugs: bugRes.count || 0, support: supRes.count || 0, sponsorships: sponPending });
      } catch { /* 배지는 부가기능 — 실패 무시 */ }
    })();
    return () => { cancelled = true; };
  }, [user, profile?.is_admin, currentPage]);

  // 어드민 권한: DB profiles.is_admin 단일 source of truth
  // (AuthContext에서 fetchProfile 시 select 됨 — line 62)
  // 변경/회수는 AdminUsers의 admin_set_admin_role RPC (서버에서 동일 필드 체크)
  const isAdmin = !!user && profile?.is_admin === true;

  // ── 접근 제한 ──
  if (!user) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground p-6">
        <ShieldAlert className="w-12 h-12 text-[#6366f1]" />
        <p className="text-lg font-semibold">로그인이 필요합니다</p>
        <Button onClick={onBackToSite}>홈으로</Button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 bg-background text-muted-foreground p-6">
        <ShieldAlert className="w-12 h-12 text-red-500" />
        <p className="text-lg font-semibold text-foreground">접근 권한이 없습니다</p>
        <p className="text-sm">관리자 계정으로 로그인해 주세요</p>
        <p className="text-xs text-muted-foreground/50">현재 계정: {user.email}</p>
        <p className="text-xs text-muted-foreground/60 max-w-xs text-center">
          최근 관리자 권한을 부여받으셨다면, 로그아웃 후 다시 로그인하시면 메뉴가 표시됩니다.
        </p>
        <Button onClick={onBackToSite} variant="outline">홈으로</Button>
      </div>
    );
  }

  // ── 그룹별 메뉴 ──
  const grouped: Record<string, MenuItem[]> = {};
  for (const item of MENU) {
    if (!grouped[item.group]) grouped[item.group] = [];
    grouped[item.group].push(item);
  }

  const renderPage = () => {
    return (
      <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-[#6366f1] animate-spin" /></div>}>
        {currentPage === "overview" && <AdminOverview />}
        {currentPage === "users" && <AdminUsers />}
        {currentPage === "content" && <AdminContent />}
        {currentPage === "broadcast" && <AdminBroadcast />}
        {currentPage === "support" && <AdminSupportInquiries />}
        {currentPage === "inquiries" && <AdminInquiries />}
        {currentPage === "challenges" && <AdminChallenges />}
        {currentPage === "banners" && <AdminBanners />}
        {currentPage === "bugs" && <AdminBugReports />}
        {currentPage === "mega" && <AdminMegaUploader />}
        {currentPage === "ads" && <AdminDashboard />}
        {currentPage === "ad_reviews" && <AdminAdReview />}
        {currentPage === "external_ads" && <AdminExternalAds />}
        {currentPage === "sponsorships" && <AdminSponsorships />}
        {currentPage === "policy" && <AdminRevenuePolicy />}
        {currentPage === "settlement" && <AdminRevenueSettlement />}
        {currentPage === "payments" && <AdminPayments />}
        {currentPage === "grant_premium" && <AdminGrantPremium />}
        {currentPage === "reports" && <AdminReports />}
        {currentPage === "moderation" && <AdminModeration />}
        {currentPage === "comments" && <AdminComments />}
        {currentPage === "activity" && <AdminActivityLog />}
      </Suspense>
    );
  };

  const meta = PAGE_META[currentPage];

  return (
    <div className="h-full flex bg-background">
      {/* ── 좌측 사이드바 (데스크톱 항상 표시 / 모바일 토글) ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 bg-card border-r border-border flex flex-col
          transform transition-transform duration-200
          md:relative md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* 사이드바 헤더 */}
        <div className="p-4 border-b border-border flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-[#6366f1]" />
          <div>
            <h1 className="font-black text-base leading-none">관리자</h1>
            <p className="text-[10px] text-muted-foreground mt-0.5">CREAITE Admin</p>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto p-1.5 rounded-lg hover:bg-muted md:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 메뉴 */}
        <nav className="flex-1 overflow-y-auto py-3">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="mb-4">
              <p className="text-[10px] font-bold text-muted-foreground px-4 mb-1 uppercase tracking-wider">
                {group}
              </p>
              {items.map(({ key, label, icon: Icon }) => {
                const isActive = currentPage === key;
                const badge = badges[key] || 0;
                return (
                  <button
                    key={key}
                    onClick={() => { setCurrentPage(key); setSidebarOpen(false); }}
                    className={`w-full px-4 py-2.5 flex items-center gap-2.5 text-sm transition-colors ${
                      isActive
                        ? "bg-[#6366f1]/15 text-[#6366f1] font-semibold border-l-2 border-[#6366f1]"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground border-l-2 border-transparent"
                    }`}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {label}
                    {badge > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* 하단 — 일반 사이트로 돌아가기 */}
        <div className="p-3 border-t border-border">
          <button
            onClick={onBackToSite}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            일반 사이트로
          </button>
          <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">{user.email}</p>
        </div>
      </aside>

      {/* ── 모바일 사이드바 배경 ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── 메인 영역 ── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 상단 헤더 */}
        <header className="bg-card border-b border-border px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-lg hover:bg-muted md:hidden"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-none">{meta.title}</h2>
            <p className="text-xs text-muted-foreground mt-1 truncate">{meta.subtitle}</p>
          </div>
        </header>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <div className="max-w-5xl mx-auto pb-16">
            {renderPage()}
          </div>
        </div>
      </main>
    </div>
  );
}

