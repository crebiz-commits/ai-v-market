// ════════════════════════════════════════════════════════════════════════════
// 어드민 전용 레이아웃 (Phase 10)
//
// YouTube Studio 스타일 — 좌측 사이드바 + 메인 영역
// 기존 메인 사이트와 완전히 분리된 디자인 (헤더/푸터 없음)
//
// 진입 경로: 마이페이지 → "관리자 페이지" 버튼 (어드민만 표시)
// 라우팅: App.tsx에서 activeTab === "admin" 시 이 컴포넌트 렌더링
// ════════════════════════════════════════════════════════════════════════════
import { useState, lazy, Suspense } from "react";
import {
  ShieldCheck, Megaphone, Settings, Coins, Flag, EyeOff,
  ArrowLeft, Menu, X, ShieldAlert, Loader2, LayoutDashboard,
  Users, Film, DollarSign
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "./ui/button";

// ── 관리자 이메일 목록 ──
const ADMIN_EMAILS = [
  "crebizlogistics@gmail.com",
];

// 지연 로드 (각 페이지)
const AdminOverview = lazy(() => import("./AdminOverview").then(m => ({ default: m.AdminOverview })));
const AdminDashboard = lazy(() => import("./AdminDashboard").then(m => ({ default: m.AdminDashboard })));
const AdminRevenuePolicy = lazy(() => import("./AdminRevenuePolicy").then(m => ({ default: m.AdminRevenuePolicy })));
const AdminRevenueSettlement = lazy(() => import("./AdminRevenueSettlement").then(m => ({ default: m.AdminRevenueSettlement })));
const AdminReports = lazy(() => import("./AdminReports").then(m => ({ default: m.AdminReports })));
const AdminUsers = lazy(() => import("./AdminUsers").then(m => ({ default: m.AdminUsers })));
const AdminContent = lazy(() => import("./AdminContent").then(m => ({ default: m.AdminContent })));
const AdminModeration = lazy(() => import("./AdminModeration").then(m => ({ default: m.AdminModeration })));
const AdminPayments = lazy(() => import("./AdminPayments").then(m => ({ default: m.AdminPayments })));

type AdminPage =
  | "overview"      // 대시보드 (한눈에 보기)
  | "ads"           // 광고 관리
  | "policy"        // 수익 정책
  | "settlement"    // 정산 관리
  | "payments"      // 결제/환불
  | "users"         // 사용자 관리
  | "content"       // 콘텐츠 관리
  | "reports"       // 신고 큐
  | "moderation";   // 숨김 콘텐츠

interface MenuItem {
  key: AdminPage;
  label: string;
  icon: typeof ShieldCheck;
  group: string;
}

const MENU: MenuItem[] = [
  { key: "overview",   label: "대시보드",   icon: LayoutDashboard, group: "📊 한눈에 보기" },
  { key: "users",      label: "사용자 관리", icon: Users,     group: "👥 운영" },
  { key: "content",    label: "콘텐츠 관리", icon: Film,      group: "👥 운영" },
  { key: "ads",        label: "광고 관리",  icon: Megaphone, group: "💰 수익화" },
  { key: "policy",     label: "수익 정책",  icon: Settings,  group: "💰 수익화" },
  { key: "settlement", label: "정산 관리",  icon: Coins,     group: "💰 수익화" },
  { key: "payments",   label: "결제·환불",  icon: DollarSign, group: "💰 수익화" },
  { key: "reports",    label: "신고 큐",    icon: Flag,      group: "🛡 안전·품질" },
  { key: "moderation", label: "숨김 콘텐츠", icon: EyeOff,    group: "🛡 안전·품질" },
];

const PAGE_META: Record<AdminPage, { title: string; subtitle: string }> = {
  overview:   { title: "대시보드",       subtitle: "사용자·콘텐츠·매출·시청·운영 통계를 한눈에 봅니다" },
  users:      { title: "사용자 관리",    subtitle: "사용자 검색, 정지, 어드민 권한 부여를 관리합니다" },
  content:    { title: "콘텐츠 관리",    subtitle: "전체 영상 검색, 강제 숨김, 영구 삭제를 처리합니다" },
  ads:        { title: "광고 관리",      subtitle: "Discovery Feed에 노출되는 광고를 관리합니다" },
  policy:     { title: "수익 정책",      subtitle: "크리에이터 분배율·CPM·정산 허들을 변경하고 이력을 추적합니다" },
  settlement: { title: "정산 관리",      subtitle: "월별 크리에이터 수익을 산출하고 지급 처리합니다" },
  payments:   { title: "결제·환불",      subtitle: "모든 결제 내역 조회 및 환불 처리 (구독/라이선스/광고예산)" },
  reports:    { title: "신고 큐",        subtitle: "사용자가 신고한 영상/댓글/사용자/커뮤니티 글을 검토합니다" },
  moderation: { title: "숨김 콘텐츠",    subtitle: "자동/수동 숨김된 콘텐츠와 정지된 계정을 통합 관리합니다" },
};

interface AdminLayoutProps {
  onBackToSite: () => void;   // 일반 사이트로 돌아가기
}

export function AdminLayout({ onBackToSite }: AdminLayoutProps) {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState<AdminPage>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);  // 모바일용

  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

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
        {currentPage === "ads" && <AdminDashboard />}
        {currentPage === "policy" && <AdminRevenuePolicy />}
        {currentPage === "settlement" && <AdminRevenueSettlement />}
        {currentPage === "payments" && <AdminPayments />}
        {currentPage === "reports" && <AdminReports />}
        {currentPage === "moderation" && <AdminModeration />}
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

