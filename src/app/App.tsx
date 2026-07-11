/**
 * CREAITE (세계 최초 AI 시네마 OTT 플랫폼 — 크리에이터 마켓 기능 포함)
 *
 * 주요 기능:
 * - 홈: AI 추천 알고리즘 기반 숏폼 피드
 * - 시네마(마켓): 검색, 필터링, All-in-One 라이선스
 * - 업로드: 단건/대량 업로드, AI 제작 증빙, 저작권 서약
 * - 커뮤니티: 팁 공유, 챌린지, 프롬프트 공유
 * - 마이페이지: 구매/판매 내역, 정산 대시보드
 */

// 초기화 스크립트를 가장 먼저 import (콘솔 필터 설치)
import './init';

import { useState, useEffect, useCallback, Suspense, type ReactElement, type CSSProperties } from "react";
import { lazyRetry as lazy } from "./utils/lazyRetry";
import { isNegotiationOnly } from "./utils/licensePricing";
import { usePayment } from "./hooks/usePayment";
import { loadCollections } from "./data/collections";
import { Home, Film, Upload as UploadIcon, MessageSquare, User, LogIn, LogOut, Search, Bell, ShieldCheck, ShoppingCart, Loader2, Crown, Users } from "lucide-react";
import { HamburgerMenu } from "./components/HamburgerMenu";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";

// ────────────────────────────────────────────────────
// Eager imports — 항상 즉시 필요한 코어 컴포넌트
// ────────────────────────────────────────────────────
import { SplashScreen } from "./components/SplashScreen";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CartItem } from "./components/CartPanel";
import { InstallButtonHeader, InstallBannerMobile } from "./components/InstallPrompt";
import { PushPrompt } from "./components/PushPrompt";
import { CreaiteText } from "./components/CreaiteText";
import { CreaiteLogo } from "./components/CreaiteLogo";
import { useBackButton, isInternalBackEvent, hasBackHandlers } from "./hooks/useBackButton";
import { Button } from "./components/ui/button";
import { handleBunnyError } from "./utils/bunnyErrorHandler";
import { supabase } from "./utils/supabaseClient";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
import { LikesProvider } from "./contexts/LikesContext";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

// ────────────────────────────────────────────────────
// Lazy imports — 라우트 진입 시점에 동적 로드 (code split)
// 사용자가 해당 화면을 보지 않으면 다운로드 안 됨
// ────────────────────────────────────────────────────

// 메인 탭 (각각 별도 chunk로 분리)
const DiscoveryFeed = lazy(() => import("./components/DiscoveryFeed").then(m => ({ default: m.DiscoveryFeed })));
const Cinema = lazy(() => import("./components/Cinema").then(m => ({ default: m.Cinema })));
const Ott = lazy(() => import("./components/Ott").then(m => ({ default: m.Ott })));
const Upload = lazy(() => import("./components/Upload").then(m => ({ default: m.Upload })));
const Community = lazy(() => import("./components/Community").then(m => ({ default: m.Community })));
const Channel = lazy(() => import("./components/Channel").then(m => ({ default: m.Channel })));
const MyPage = lazy(() => import("./components/MyPage").then(m => ({ default: m.MyPage })));
const AdminLayout = lazy(() => import("./components/AdminLayout").then(m => ({ default: m.AdminLayout })));
const BusinessPage = lazy(() => import("./components/BusinessPage").then(m => ({ default: m.BusinessPage })));
const AboutPage = lazy(() => import("./components/StaticPages").then(m => ({ default: m.AboutPage })));
const TermsPage = lazy(() => import("./components/StaticPages").then(m => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import("./components/StaticPages").then(m => ({ default: m.PrivacyPage })));
const YouthProtectionPage = lazy(() => import("./components/StaticPages").then(m => ({ default: m.YouthProtectionPage })));
const FaqPage = lazy(() => import("./components/StaticPages").then(m => ({ default: m.FaqPage })));
const NoticesPage = lazy(() => import("./components/StaticPages").then(m => ({ default: m.NoticesPage })));
const MagazinePage = lazy(() => import("./components/Magazine").then(m => ({ default: m.MagazinePage })));
const CollectionsPage = lazy(() => import("./components/Collections").then(m => ({ default: m.CollectionsPage })));
const SpotlightPage = lazy(() => import("./components/Spotlight").then(m => ({ default: m.SpotlightPage })));
const BugReportPage = lazy(() => import("./components/StaticPages").then(m => ({ default: m.BugReportPage })));
const TopCreatorsPage = lazy(() => import("./components/TopCreators").then(m => ({ default: m.TopCreatorsPage })));
const SupportPage = lazy(() => import("./components/SupportPage").then(m => ({ default: m.SupportPage })));
const SubscriptionPage = lazy(() => import("./components/SubscriptionPage").then(m => ({ default: m.SubscriptionPage })));
const PaymentResult = lazy(() => import("./components/PaymentResult").then(m => ({ default: m.PaymentResult })));
const BillingResult = lazy(() => import("./components/BillingResult").then(m => ({ default: m.BillingResult })));
const SearchPage = lazy(() => import("./components/SearchPage").then(m => ({ default: m.SearchPage })));
const AdvertiserDashboard = lazy(() => import("./components/AdvertiserDashboard").then(m => ({ default: m.AdvertiserDashboard })));

// 모달·패널 (열릴 때만 로드)
const ProductDetail = lazy(() => import("./components/ProductDetail").then(m => ({ default: m.ProductDetail })));
const AuthModal = lazy(() => import("./components/AuthModal").then(m => ({ default: m.AuthModal })));
const PasswordResetScreen = lazy(() => import("./components/PasswordResetScreen").then(m => ({ default: m.PasswordResetScreen })));
const CartPanel = lazy(() => import("./components/CartPanel").then(m => ({ default: m.CartPanel })));
const NotificationPanel = lazy(() => import("./components/NotificationPanel").then(m => ({ default: m.NotificationPanel })));

// 개발자 전용 프리뷰 페이지 (URL ?preview=* 진입 시만 로드)
const LogoPreview = lazy(() => import("./components/LogoPreview").then(m => ({ default: m.LogoPreview })));
const NewLogoPreview = lazy(() => import("./components/NewLogoPreview").then(m => ({ default: m.NewLogoPreview })));
const LogoDesigns = lazy(() => import("./components/LogoDesigns").then(m => ({ default: m.LogoDesigns })));
const LogoDesignsV2 = lazy(() => import("./components/LogoDesignsV2").then(m => ({ default: m.LogoDesignsV2 })));
const LogoFish = lazy(() => import("./components/LogoFish").then(m => ({ default: m.LogoFish })));
const LogoFishPlay = lazy(() => import("./components/LogoFishPlay").then(m => ({ default: m.LogoFishPlay })));
const CinemaIconPreview = lazy(() => import("./components/CinemaIconPreview").then(m => ({ default: m.CinemaIconPreview })));
const UploadButtonPreview = lazy(() => import("./components/UploadButtonPreview").then(m => ({ default: m.UploadButtonPreview })));
const OttDesignPreview = lazy(() => import("./components/OttDesignPreview").then(m => ({ default: m.OttDesignPreview })));
const OgPreview = lazy(() => import("./components/OgPreview").then(m => ({ default: m.OgPreview })));
const PreviewBadgePreview = lazy(() => import("./components/PreviewBadgePreview").then(m => ({ default: m.PreviewBadgePreview })));
const TrendingCardPreview = lazy(() => import("./components/TrendingCardPreview").then(m => ({ default: m.TrendingCardPreview })));
const NetflixCardPreview = lazy(() => import("./components/NetflixCardPreview").then(m => ({ default: m.NetflixCardPreview })));
const ProductDetailPreview = lazy(() => import("./components/ProductDetailPreview").then(m => ({ default: m.ProductDetailPreview })));
const CommunityMockShowcase = lazy(() => import("./components/CommunityMockShowcase").then(m => ({ default: m.CommunityMockShowcase })));
const EventBannerPreview = lazy(() => import("./components/EventBannerPreview").then(m => ({ default: m.EventBannerPreview })));
const OttRedesignPreview = lazy(() => import("./components/OttRedesignPreview").then(m => ({ default: m.OttRedesignPreview })));
const ExternalAdPreview = lazy(() => import("./components/ExternalAdPreview").then(m => ({ default: m.ExternalAdPreview })));
const DesktopHeaderPreview = lazy(() => import("./components/DesktopHeaderPreview").then(m => ({ default: m.DesktopHeaderPreview })));
const TrendingRankPreview = lazy(() => import("./components/TrendingRankPreview").then(m => ({ default: m.TrendingRankPreview })));
const CoupangBannerPreview = lazy(() => import("./components/CoupangBannerPreview").then(m => ({ default: m.CoupangBannerPreview })));
const CreatorRevenueGuide = lazy(() => import("./components/CreatorRevenueGuide").then(m => ({ default: m.CreatorRevenueGuide })));

// 비로그인 사용자 첫 화면 (Netflix 패턴 랜딩)
const LandingPage = lazy(() => import("./components/LandingPage").then(m => ({ default: m.LandingPage })));

// ────────────────────────────────────────────────────
// 로딩 fallback (lazy 컴포넌트 다운로드 중 표시)
// ────────────────────────────────────────────────────
function PageLoading() {
  return (
    <div className="flex-1 flex items-center justify-center bg-background">
      <Loader2 className="w-10 h-10 animate-spin text-[#6366f1]" />
    </div>
  );
}

type Tab = "discovery" | "market" | "ott" | "upload" | "community" | "channel" | "mypage" | "admin" | "business" | "about" | "terms" | "privacy" | "youth" | "faq" | "notices" | "bug-report" | "top-creators" | "support" | "subscription" | "search" | "advertiser";
type Panel = "cart" | "notifications" | null;

interface VideoProduct {
  // 기본 정보
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  price: number;              // 하위 호환 — priceStandard와 동일
  duration: string;
  durationSeconds?: number;   // 페이월 게이트 결정용 (Phase 4)
  createdAt?: string;         // 업로드 일시 (JSON-LD uploadDate 용 — GSC 2026-06-11)
  resolution?: string;
  tool: string;
  category?: string;
  genre?: string;
  videoUrl: string;
  description?: string;
  tags?: string[];

  // 라이선스 가격 (All-in-One 단일가)
  priceStandard?: number;

  // AI 제작 증빙
  aiModelVersion?: string;
  prompt?: string;
  seed?: string;

  // 시네마 메타데이터
  director?: string;
  writer?: string;
  composer?: string;
  castCredits?: string;
  productionYear?: number;
  language?: string;
  subtitleLanguage?: string;

  // 공개 설정 + 하이라이트
  visibility?: "public" | "unlisted" | "private";
  highlightStart?: number;
  highlightEnd?: number;
}

// OAuth(구글·카카오) 리다이렉트 실패/취소 스냅샷 — Supabase SDK(detectSessionInUrl)가
//   URL 해시를 지우기 전(모듈 로드 시점)에 캡처. implicit flow는 #error=, PKCE는 ?error=.
const OAUTH_REDIRECT_ERROR: { code: string; desc: string } | null = (() => {
  if (typeof window === "undefined") return null;
  try {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const q = new URLSearchParams(window.location.search);
    const code = h.get("error") || q.get("error");
    if (!code) return null;
    return { code, desc: h.get("error_description") || q.get("error_description") || "" };
  } catch { return null; }
})();

function AppContent() {
  // 개발자 전용 프리뷰 모드 (URL ?preview=*) — 모두 lazy load됨
  const previewParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("preview") : null;
  if (previewParam) {
    const previewMap: Record<string, ReactElement> = {
      logo: <LogoPreview />,
      newlogo: <NewLogoPreview />,
      designs: <LogoDesigns />,
      designs2: <LogoDesignsV2 />,
      fish: <LogoFish />,
      fishplay: <LogoFishPlay />,
      cinema: <CinemaIconPreview />,
      splash: <SplashScreen onComplete={() => { window.location.search = ""; }} />,
      uploadbtn: <UploadButtonPreview />,
      "ott-design": <OttDesignPreview />,
      og: <OgPreview />,
      "preview-badge": <PreviewBadgePreview />,
      "trending-card": <TrendingCardPreview />,
      "netflix-card": <NetflixCardPreview />,
      "product-detail": <ProductDetailPreview />,
      "community-mock": <CommunityMockShowcase />,
      "event-banner": <EventBannerPreview />,
      "ott-redesign": <OttRedesignPreview />,
      "external-ad": <ExternalAdPreview />,
      "desktop-header": <DesktopHeaderPreview />,
      "trending-rank": <TrendingRankPreview />,
      coupang: <CoupangBannerPreview />,
    };
    if (previewMap[previewParam]) {
      return <Suspense fallback={<PageLoading />}>{previewMap[previewParam]}</Suspense>;
    }
  }

  // Phase 9 — 토스페이먼츠 결제 결과 라우팅 (?payment=success|fail)
  const paymentParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("payment") : null;
  if (paymentParam === "success" || paymentParam === "fail") {
    const handleClose = () => {
      // URL 쿼리 제거 후 강제 리로드 (정상 흐름으로 복귀)
      window.location.href = window.location.pathname;
    };
    return (
      <Suspense fallback={<PageLoading />}>
        <PaymentResult onClose={handleClose} />
      </Suspense>
    );
  }

  // 자동결제 카드 등록 결과 라우팅 (?billing=success|fail)
  const billingParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("billing") : null;
  if (billingParam === "success" || billingParam === "fail") {
    const handleClose = () => { window.location.href = window.location.pathname + "?tab=subscription"; };
    return (
      <Suspense fallback={<PageLoading />}>
        <BillingResult onClose={handleClose} />
      </Suspense>
    );
  }

  // 정보 페이지 라우팅 (?info=creator-revenue 등) — 직접 링크·공유·SEO 가능
  const infoParam = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("info") : null;
  if (infoParam) {
    const goBack = () => {
      // history.back() 시도 → 사이트 내부 navigation이면 이전 페이지로 복귀
      // 외부 진입(URL 직접 입력·카톡 공유 등)이면 URL이 바뀌지 않음 → 100ms 후 메인으로 fallback
      const beforeUrl = window.location.href;
      window.history.back();
      setTimeout(() => {
        if (window.location.href === beforeUrl) {
          // history.back() 작동 안 함 → 외부 진입으로 판단, 메인으로 이동
          window.location.href = window.location.pathname;
        }
      }, 100);
    };
    if (infoParam === "creator-revenue") {
      return (
        <Suspense fallback={<PageLoading />}>
          <CreatorRevenueGuide onBack={goBack} />
        </Suspense>
      );
    }
    if (infoParam === "about") {
      return (
        <Suspense fallback={<PageLoading />}>
          <AboutPage onBack={goBack} onNavigate={(tab) => { window.location.href = `${window.location.pathname}?tab=${tab}`; }} />
        </Suspense>
      );
    }
    if (infoParam === "terms") {
      return (
        <Suspense fallback={<PageLoading />}>
          <TermsPage onBack={goBack} />
        </Suspense>
      );
    }
    if (infoParam === "privacy") {
      return (
        <Suspense fallback={<PageLoading />}>
          <PrivacyPage onBack={goBack} />
        </Suspense>
      );
    }
    if (infoParam === "youth") {
      return (
        <Suspense fallback={<PageLoading />}>
          <YouthProtectionPage onBack={goBack} />
        </Suspense>
      );
    }
    if (infoParam === "faq") {
      return (
        <Suspense fallback={<PageLoading />}>
          <FaqPage onBack={goBack} />
        </Suspense>
      );
    }
    if (infoParam === "notices") {
      return (
        <Suspense fallback={<PageLoading />}>
          <NoticesPage onBack={goBack} />
        </Suspense>
      );
    }
    if (infoParam === "magazine") {
      return (
        <Suspense fallback={<PageLoading />}>
          <MagazinePage onBack={goBack} onNavigate={(tab) => { window.location.href = `${window.location.pathname}?tab=${tab}`; }} />
        </Suspense>
      );
    }
    if (infoParam === "collections") {
      return (
        <Suspense fallback={<PageLoading />}>
          <CollectionsPage onBack={goBack} onNavigate={(tab) => { window.location.href = `${window.location.pathname}?tab=${tab}`; }} />
        </Suspense>
      );
    }
    if (infoParam === "spotlight") {
      return (
        <Suspense fallback={<PageLoading />}>
          <SpotlightPage onBack={goBack} onNavigate={(tab) => { window.location.href = `${window.location.pathname}?tab=${tab}`; }} />
        </Suspense>
      );
    }
  }

  const { t, i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const [showSplash, setShowSplash] = useState(() => {
    const lastVisitDate = localStorage.getItem('aivm_last_visit');
    const today = new Date().toDateString();
    if (lastVisitDate !== today) {
      localStorage.setItem('aivm_last_visit', today);
      return true;
    }
    return false;
  });
  // 첫 마운트 시 URL ?tab= 파라미터에서 활성 탭 복원
  // (다른 우선 라우팅 ?info=/?payment=/?preview=/?video= 있으면 그쪽이 우선, 메인은 "discovery"로 시작)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    if (typeof window === "undefined") return "discovery";
    const params = new URLSearchParams(window.location.search);
    if (params.has("info") || params.has("payment") || params.has("preview") || params.has("video")) {
      return "discovery";
    }
    const tabFromUrl = params.get("tab") as Tab | null;
    return tabFromUrl || "discovery";
  });

  // activeTab 변경 시 URL 동기화 (브라우저 뒤로가기 지원)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    // 다른 우선 라우팅 활성 시 ?tab= 처리 안 함 (?info=, ?payment= 등이 처리 중)
    if (params.has("info") || params.has("payment") || params.has("preview") || params.has("video")) return;

    const currentTabInUrl = params.get("tab");
    if (activeTab === "discovery") {
      if (currentTabInUrl) {
        // 홈 진입 시 ?tab= 제거 (검색어 q 도 함께 정리)
        params.delete("tab");
        params.delete("q");
        const newSearch = params.toString();
        const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
        window.history.pushState({ tab: "discovery" }, "", newUrl);
      }
    } else if (currentTabInUrl !== activeTab) {
      // 새 탭 진입 시 ?tab=XXX 추가 (history 스택 적립 → 뒤로가기로 복원 가능)
      params.set("tab", activeTab);
      if (activeTab !== "search") params.delete("q");   // 검색 외 탭엔 q 불필요
      window.history.pushState({ tab: activeTab }, "", `${window.location.pathname}?${params.toString()}`);
    }
  }, [activeTab]);

  // 브라우저 뒤로가기 (popstate) → URL ?tab=과 activeTab 동기화
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      // useBackButton 의 내부 history.back() 호출로 인한 popstate 는 무시
      // (햄버거 메뉴 닫힘 등으로 인한 가상 history 항목 제거 시 다른 navigation 트리거 방지)
      if (isInternalBackEvent()) return;
      const params = new URLSearchParams(window.location.search);
      if (params.has("info") || params.has("payment") || params.has("preview") || params.has("video")) {
        // 다른 우선 라우팅이 처리할 영역 — App 컴포넌트 재마운트로 자동 처리
        return;
      }
      const tabFromUrl = params.get("tab") as Tab | null;
      // 검색 탭으로 복귀 시 URL 의 q 를 검색어로 반영(SearchPage remount 시 그 검색어로 자동검색)
      if (tabFromUrl === "search") setPendingSearchQuery(params.get("q") || "");
      setActiveTab(tabFromUrl || "discovery");
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  const [selectedProduct, setSelectedProductRaw] = useState<VideoProduct | null>(null);
  // 알림(답글) 클릭으로 진입 시 ProductDetail 의 댓글창 자동 열기
  const [openCommentsOnOpen, setOpenCommentsOnOpen] = useState(false);
  // OTT "지금 보기" 진입 시 플레이어 자동 전체화면
  const [productFullscreen, setProductFullscreen] = useState(false);
  // Showcase Mode: demo- prefix 영상은 진입 차단 + 안내 토스트
  const setSelectedProduct = (product: VideoProduct | null) => {
    if (product?.id?.startsWith("demo-")) {
      // 동적 import로 토스트만 띄우고 진입 차단
      import("./utils/showcase").then(m => m.handleShowcaseClick(product.id));
      return;
    }
    setOpenCommentsOnOpen(false); // 일반 진입은 댓글 자동 열기 안 함 (loadAndOpenVideo 가 필요 시 직후 true 설정)
    setProductFullscreen(false);  // "작품 정보"/카드 진입은 전체화면 아님
    setSelectedProductRaw(product);
  };
  // OTT "지금 보기" — 상세 진입 + 플레이어 자동 전체화면
  const playProduct = (product: VideoProduct | null) => {
    if (product?.id?.startsWith("demo-")) {
      import("./utils/showcase").then(m => m.handleShowcaseClick(product.id));
      return;
    }
    setOpenCommentsOnOpen(false);
    setProductFullscreen(true);
    setSelectedProductRaw(product);
  };
  // 채널 탭 외부에서 "채널 보기" 클릭 시 어떤 크리에이터를 열지 신호 (Channel이 mount 후 selectedCreatorId로 채택)
  const [pendingCreatorId, setPendingCreatorId] = useState<string | null>(null);
  // 알림 클릭 등으로 마이페이지 특정 탭(결제내역=settings 등)으로 진입할 때 신호
  const [pendingMyPageTab, setPendingMyPageTab] = useState<string | null>(null);
  // 시네마 콘테스트 배너 등으로 커뮤니티 특정 탭(챌린지 등)으로 진입할 때 신호
  const [pendingCommunityTab, setPendingCommunityTab] = useState<string | null>(null);
  // 협업 문의 알림 딥링크 → 해당 협업 글 상세 모달 자동 열기
  const [pendingCollabPostId, setPendingCollabPostId] = useState<string | null>(null);
  // 데스크탑 홈 검색바 → SearchPage 초기 검색어 전달 (2026-06-11)
  //   초기값은 URL(?tab=search&q=)에서 시드 → 새로고침·링크공유 시 검색어 복원 (2026-07-10)
  const [pendingSearchQuery, setPendingSearchQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    const p = new URLSearchParams(window.location.search);
    return p.get("tab") === "search" ? (p.get("q") || "") : "";
  });
  // 고객센터 답변 알림(?support=) → 해당 문의로 스크롤 (2026-06-11)
  const [pendingSupportId, setPendingSupportId] = useState<string | null>(null);
  // R3(2026-06-11): 커뮤니티 글/챌린지 공유·알림 딥링크 → 해당 상세 자동 열기
  const [pendingCommunityPostId, setPendingCommunityPostId] = useState<string | null>(null);
  const [pendingChallengeId, setPendingChallengeId] = useState<string | null>(null);
  // 챌린지 '참가하기' → 업로드 진입 시 출품작 태그 컨텍스트 전달
  const [pendingChallenge, setPendingChallenge] = useState<{ tag: string; title: string } | null>(null);
  const handleViewCreator = (creatorId: string) => {
    setPendingCreatorId(creatorId);
    setSelectedProduct(null);
    setActiveTab("channel");
  };
  // 검색 확정 → URL(?tab=search&q=) 동기화. replaceState 라 검색마다 history 스택 안 쌓임.
  //   새로고침·링크공유 시 pendingSearchQuery 초기 시드가 이 q 를 읽어 검색어 복원.
  const handleSearchQueryCommit = useCallback((query: string) => {
    setPendingSearchQuery(query);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "search");
    if (query) params.set("q", query); else params.delete("q");
    window.history.replaceState({ tab: "search" }, "", `${window.location.pathname}?${params.toString()}`);
  }, []);
  // Phase 16/17: 영상 ID로 ProductDetail 열기 (시청 기록 클릭, 연속 재생 등에서 재사용)
  const loadAndOpenVideo = async (videoId: string, opts?: { openComments?: boolean }) => {
    try {
      const { data, error } = await supabase
        .from("videos")
        .select("*")
        .eq("id", videoId)
        .single();
      if (error || !data) {
        toast.error(t("app.videoNotFound"));
        return;
      }
      setSelectedProduct({
        id: data.id,
        thumbnail: data.thumbnail || "",
        title: data.title,
        creator: data.creator || "",
        creatorId: data.creator_id,
        price: data.price_standard || 0,
        duration: data.duration || "",
        durationSeconds: data.duration_seconds,
        createdAt: data.created_at || undefined,
        resolution: data.resolution || "",
        tool: data.ai_tool || "",
        category: data.category || "",
        videoUrl: data.video_url || "",
        description: data.description || "",
        tags: Array.isArray(data.tags) ? data.tags : [],
        priceStandard: data.price_standard || 0,
        aiModelVersion: data.ai_model_version || "",
        seed: data.seed || "",
        highlightStart: data.highlight_start || 0,
        highlightEnd: data.highlight_end || 15,
        // Phase 28: Sponsorship
        sponsorBrand: data.sponsor_brand || null,
        sponsorLogoUrl: data.sponsor_logo_url || null,
        sponsorDisclosure: data.sponsor_disclosure || null,
        sponsorLinkUrl: data.sponsor_link_url || null,
      } as VideoProduct);
      // setSelectedProduct 가 먼저 false 로 리셋하므로, 댓글 자동 열기는 그 직후 설정
      if (opts?.openComments) setOpenCommentsOnOpen(true);
    } catch (err: any) {
      toast.error(t("app.videoFetchFailed", { message: err?.message || err }));
    }
  };

  // 알림(벨) 클릭 시 link 파싱 → 영상/탭으로 이동
  const handleNotificationNavigate = (link: string) => {
    setActivePanel(null);
    if (!link || link === "/") return;
    try {
      const url = new URL(link, window.location.origin);
      const video = url.searchParams.get("video");
      const tab = url.searchParams.get("tab");
      const section = url.searchParams.get("section");
      const sub = url.searchParams.get("sub");
      const post = url.searchParams.get("post");
      const challenge = url.searchParams.get("challenge");
      const creator = url.searchParams.get("creator");
      if (video) { void loadAndOpenVideo(video, { openComments: url.searchParams.get("comment") === "1" }); return; }
      const support = url.searchParams.get("support");
      if (support) { setPendingSupportId(support); setActiveTab("support"); return; }
      if (tab) {
        if (tab === "mypage" && section) setPendingMyPageTab(section);
        if (tab === "community" && sub) {
          setPendingCommunityTab(sub);
          if (sub === "collab" && post) setPendingCollabPostId(post);
          if (sub === "posts" && post) setPendingCommunityPostId(post);          // R3: 글 상세 딥링크
          if (sub === "challenges" && challenge) setPendingChallengeId(challenge); // R3: 챌린지 딥링크
        }
        if (tab === "channel" && creator) setPendingCreatorId(creator);  // 새 팔로워 알림 → 그 사람 채널
        setActiveTab(tab as Tab);
        return;
      }
      // R3: tab 없는 단축 공유 링크 (?post=, ?challenge=)
      if (challenge) {
        setPendingCommunityTab("challenges");
        setPendingChallengeId(challenge);
        setActiveTab("community");
        return;
      }
      if (post) {
        setPendingCommunityTab("posts");
        setPendingCommunityPostId(post);
        setActiveTab("community");
        return;
      }
    } catch { /* 잘못된 link 무시 */ }
  };

  // 웹푸시 클릭 → SW(sw.js notificationclick)가 postMessage 로 보낸 URL 을 SPA 네비게이션으로 처리
  // (이전엔 client.navigate 가 조용히 실패해 창 포커스만 되고 이동이 안 되는 경우가 있었음 — 2026-06-11)
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "push-navigate" && typeof e.data.url === "string") {
        handleNotificationNavigate(e.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
    // handleNotificationNavigate 는 안정적인 setState/클로저만 사용 — 첫 등록으로 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 첫 마운트 시 URL ?video=<id> 있으면 ProductDetail 자동 열기
  // (공유 링크, OG 봇 이후 일반 사용자 진입, 외부 사이트 링크 모두 대상)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const videoId = params.get("video");
    if (videoId && videoId.trim()) {
      loadAndOpenVideo(videoId.trim());
    }
    // 웹푸시 클릭·새로고침 등 URL 직접 진입 시 딥링크 파라미터 처리
    // (activeTab 초기값은 ?tab= 만 읽으므로 sub/post/section/creator 는 여기서 처리)
    // 딥링크 원칙: 알림 클릭 = 사건 발생 지점까지 직행 — 벨 클릭(handleNotificationNavigate)과 동일하게
    const tabParam = params.get("tab");
    const sub = params.get("sub");
    const post = params.get("post");
    const challengeParam = params.get("challenge");
    const section = params.get("section");
    const creator = params.get("creator");
    if (tabParam === "community" && sub) {
      setPendingCommunityTab(sub);
      if (sub === "collab" && post) setPendingCollabPostId(post);
      if (sub === "posts" && post) setPendingCommunityPostId(post);            // R3: 글 상세 딥링크
      if (sub === "challenges" && challengeParam) setPendingChallengeId(challengeParam);
    }
    // R3: tab 없는 단축 공유 링크 (?post=, ?challenge=) — 커뮤니티로 진입해 해당 상세 오픈
    if (!tabParam && challengeParam) {
      setPendingCommunityTab("challenges");
      setPendingChallengeId(challengeParam);
      setActiveTab("community");
    } else if (!tabParam && post && !videoId) {
      setPendingCommunityTab("posts");
      setPendingCommunityPostId(post);
      setActiveTab("community");
    }
    if (tabParam === "mypage" && section) setPendingMyPageTab(section);      // 결제·정산 알림
    if (tabParam === "channel" && creator) setPendingCreatorId(creator);     // 새 팔로워 알림
    if (params.get("support")) { setPendingSupportId(params.get("support")); setActiveTab("support"); }  // 고객센터 답변 알림
    // 첫 마운트만 — loadAndOpenVideo 는 closure 로 안정적
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // OAuth(구글·카카오) 로그인 실패·취소 안내 — 성공만 파싱하던 갭 보완(취소 시 조용히 홈 복귀하던 것).
  useEffect(() => {
    if (!OAUTH_REDIRECT_ERROR) return;
    const { code, desc } = OAUTH_REDIRECT_ERROR;
    const canceled = /access_denied|cancel|denied/i.test(`${code} ${desc}`);
    if (canceled) toast.info(t("auth.oauthCanceled"));
    else toast.error(t("auth.loginFail") + (desc ? `: ${desc}` : ""));
    window.history.replaceState({}, "", window.location.pathname);  // 에러 흔적 제거
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  // OTT 홈 풀블리드 히어로: 헤더를 투명 오버레이로, 스크롤 내려가면 배경 생김
  const [heroScrolled, setHeroScrolled] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [pendingCartAdd, setPendingCartAdd] = useState<{ product: VideoProduct; licenseType: "standard" | "commercial" | "extended"; at: number } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { user, profile, signOut, isAuthenticated, loading, passwordRecovery } = useAuth();
  const { startLicensePurchase } = usePayment();
  // CREAITE 컬렉션·셀렉트를 DB에서 1회 로드(실패 시 정적 폴백 유지). 관리자 편집분 반영.
  useEffect(() => { void loadCollections(); }, []);
  // 비로그인 사용자가 〈둘러보기〉 클릭 시 LandingPage → DiscoveryFeed 로 전환.
  // 이번 세션에 이미 둘러봤으면 새로고침해도 랜딩 재노출 안 함 (2026-06-11)
  const [hasExplored, setHasExplored] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return sessionStorage.getItem("aivm_explored") === "1"; } catch { return false; }
  });

  // 성능: auth getSession 이 TWA 웹뷰/다중탭에서 hang(2~4초)하면 앱 전체가 블랭크 스피너에 갇힌다.
  //   ~700ms 지나도 세션 미해결이면 일단 콘텐츠(anon)를 렌더하고, 로그인 상태는 해결되는 대로 채운다.
  //   (빠른 auth 는 그 전에 loading 이 풀려 이 타임아웃과 무관 → 평상시 깜빡임 없음.)
  const [authGateTimedOut, setAuthGateTimedOut] = useState(false);
  useEffect(() => {
    if (!loading) return;
    const id = window.setTimeout(() => setAuthGateTimedOut(true), 700);
    return () => window.clearTimeout(id);
  }, [loading]);

  // R4(2026-06-11): 구독 만료 임박(D-3) 안내 — 자동갱신이 없어 조용히 free 로 떨어지는 것 방지.
  // 같은 만료일에 대해 1회만 (localStorage 가드), 클릭 시 마이페이지로 이동해 연장.
  useEffect(() => {
    if (!profile?.subscription_expires_at || profile.subscription_tier === "free") return;
    const expiresMs = new Date(profile.subscription_expires_at).getTime();
    const daysLeft = Math.ceil((expiresMs - Date.now()) / 86400000);
    if (daysLeft < 0 || daysLeft > 3) return;
    const key = `creaite_sub_expiry_notice_${profile.id}_${profile.subscription_expires_at}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    const isKo = (i18n.language || "en").startsWith("ko");
    toast.info(
      daysLeft === 0
        ? (isKo ? "프리미엄 구독이 오늘 만료돼요. 마이페이지에서 연장할 수 있어요." : "Your Premium expires today. Extend it in My Page.")
        : (isKo ? `프리미엄 구독이 ${daysLeft}일 후 만료돼요. 마이페이지에서 연장할 수 있어요.` : `Your Premium expires in ${daysLeft} day(s). Extend it in My Page.`),
      {
        duration: 10000,
        action: {
          label: isKo ? "연장하기" : "Extend",
          onClick: () => setActiveTab("mypage"),
        },
      }
    );
  }, [profile?.subscription_expires_at, profile?.subscription_tier]);  // eslint-disable-line react-hooks/exhaustive-deps

  // 앱을 켜둔 동안(포그라운드) 새 알림 실시간 수신 → 벨 배지 즉시 갱신 + 화면 내 토스트
  // (다른 앱처럼 앱 열어둔 상태에서도 공지/알림이 바로 뜨도록. 잠금화면 푸시는 서비스워커가 별도 담당)
  // + 진입 시 안 읽은 알림 수 초기 로드
  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      setUnreadNotifications(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("read", false);
      if (!cancelled && typeof count === "number") setUnreadNotifications(count);
    })();

    const channel = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload: any) => {
          const n = payload.new || {};
          setUnreadNotifications((c) => c + 1);
          toast(n.title || "새 알림", {
            description: n.body || undefined,
            action:
              n.link && n.link !== "/"
                ? { label: "보기", onClick: () => handleNotificationNavigate(n.link) }
                : undefined,
          });
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
    // handleNotificationNavigate 는 매 렌더 재생성되나 재구독 불필요 → 의존성 제외
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.id]);

  // YouTube 패턴: 어떤 영상이든 재생되면 다른 모든 영상을 즉시 일시정지
  // + 우선순위 영상(data-priority-video) 보호: 모달/전체화면 영상은 백그라운드 autoplay에 의해 멈추지 않음
  useEffect(() => {
    const handleVideoPlay = (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLVideoElement)) return;
      // 우선순위 영상이 존재하면 그것만 재생 가능
      const priority = document.querySelector<HTMLVideoElement>("video[data-priority-video]");
      if (priority && target !== priority) {
        target.pause();
        return;
      }
      // 일반 모드: 다른 모든 영상 pause
      document.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
        if (v !== target && !v.paused) v.pause();
      });
    };
    // capture phase로 등록 — play 이벤트는 bubble 안 되므로 필수
    document.addEventListener("play", handleVideoPlay, true);
    return () => document.removeEventListener("play", handleVideoPlay, true);
  }, []);

  // 문서 제목·설명 언어 반응 — t 가 바뀌는(=언어 전환) 시점마다 갱신. <html lang> 동기화(i18n/index.ts)와 짝.
  useEffect(() => {
    document.title = t("meta.title", "CREAITE | 세계 최초 AI 시네마 OTT");
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", t("meta.description", desc.getAttribute("content") || ""));
  }, [t]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.error) handleBunnyError(event.error);
      else if (event.message) handleBunnyError({ message: event.message });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      handleBunnyError(event.reason);
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  // ProductDetail 모달이 열릴 때 다른 비디오(DiscoveryFeed 등) 일시정지
  // iframe은 다른 document이므로 'play' 이벤트 리스너가 작동 안 함 → 명시적 처리
  useEffect(() => {
    if (selectedProduct) {
      document.querySelectorAll<HTMLVideoElement>("video").forEach((v) => {
        if (!v.paused) v.pause();
      });
    }
  }, [selectedProduct]);

  // 장바구니 추가 (Supabase 영구 저장) — 인증 통과 시 true, 미로그인 시 false 반환
  const addToCart = useCallback(async (product: VideoProduct, licenseType: "standard" | "commercial" | "extended" = "standard"): Promise<boolean> => {
    // 비로그인 시: 로그인 모달 띄우고 항목을 보류 → 로그인 후 자동 추가
    if (!isAuthenticated || !user) {
      setPendingCartAdd({ product, licenseType, at: Date.now() });
      toast.info(t("app.cartPending"));
      setShowAuthModal(true);
      return false;
    }

    // 판매 불가 상품은 장바구니 담기 차단(카드 '+' 버튼 포함): 무료(₩0=라이선스 미판매) /
    // 협의 전용(₩1,000만+, 토스 결제 불가). ProductDetail 구매 가드와 동일 정책.
    if (!(product.price > 0)) {
      toast.info(t("video.notForSaleToast", "무료 시청 전용 영상입니다 (라이선스 미판매)"));
      return false;
    }
    if (isNegotiationOnly(product.price)) {
      toast.info(t("video.negotiationToast", "별도 협의 상품입니다 — 상세에서 문의해주세요"));
      return false;
    }

    const price = licenseType === "standard" ? product.price
      : licenseType === "commercial" ? product.price * 2
      : product.price * 5;

    const { data, error } = await supabase
      .from("cart_items")
      .insert({
        user_id: user.id,
        video_id: product.id,
        license_type: licenseType,
        price,
      })
      .select()
      .single();

    if (error) {
      // 23505 = unique constraint (이미 담긴 항목)
      if ((error as any).code === "23505") {
        toast.info(t("app.alreadyInCart"));
      } else {
        console.error("[addToCart]", error);
        toast.error(t("app.cartAddFailed"));
      }
      return false;
    }

    const newItem: CartItem = {
      id: (data as any).id,
      videoId: product.id,
      thumbnail: product.thumbnail,
      title: product.title,
      creator: product.creator,
      licenseType,
      price,
    };
    // 로드 경합으로 이미 들어와 있을 수 있음 → id 중복 append 방지(React key 중복 회피)
    setCartItems(prev => prev.some(i => i.id === newItem.id) ? prev : [...prev, newItem]);
    toast.success(t("app.cartAddSuccess"), {
      action: {
        label: t("common.viewCart"),
        onClick: () => setActivePanel("cart"),
      },
    });
    return true;
  }, [isAuthenticated, user]);

  // 카트 항목 라이선스 구매 — ProductDetail 단건 흐름(startLicensePurchase) 재사용.
  //   토스는 결제당 1주문이라 항목별 구매(진짜 일괄 단일결제는 멀티아이템 주문=출시 후 백엔드).
  const handleCartPurchase = useCallback(async (item: CartItem) => {
    if (!isAuthenticated) { setShowAuthModal(true); return; }
    if (!item.price || item.price <= 0 || isNegotiationOnly(item.price)) {
      toast.info(t("app.cartItemNotDirectBuy", "이 영상은 카트에서 바로 결제할 수 없어요. 영상 상세에서 확인해 주세요."));
      return;
    }
    try {
      await startLicensePurchase({
        videoId: item.videoId,
        amount: item.price,
        videoTitle: item.title,
        email: user?.email,
        name: profile?.display_name || user?.name || user?.email,
      });
      // 토스 결제창으로 이동 — 이후 코드 실행 안 됨
    } catch (err: any) {
      if (err?.code === "USER_CANCEL") return;
      toast.error(t("app.paymentStartFailed", "결제 시작 실패: ") + (err?.message || ""));
    }
  }, [isAuthenticated, startLicensePurchase, user, profile, t]);

  const removeFromCart = useCallback(async (itemId: string) => {
    const { error } = await supabase.from("cart_items").delete().eq("id", itemId);
    if (error) {
      toast.error(t("app.cartDeleteFailed"));
      return;
    }
    setCartItems(prev => prev.filter(item => item.id !== itemId));
  }, []);

  // 로그인 시 Supabase에서 장바구니 로드, 로그아웃 시 로컬 state 비우기
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCartItems([]);
      return;
    }
    // 로그아웃/유저전환 중 늦게 도착한 응답이 이전 유저 장바구니를 되살리는 것 방지
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("cart_items")
        .select("id, video_id, license_type, price, videos(title, creator, thumbnail)")
        .eq("user_id", user.id)
        .order("added_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[loadCart]", error);
        return;
      }
      const items: CartItem[] = (data || [])
        // 숨김·비공개·삭제된 영상은 videos 조인이 null(RLS) → 빈 카드가 되므로 표시에서 제외
        .filter((row: any) => row.videos)
        .map((row: any) => ({
          id: row.id,
          videoId: row.video_id,
          thumbnail: row.videos?.thumbnail || "",
          title: row.videos?.title || "",
          creator: row.videos?.creator || "",
          licenseType: row.license_type,
          price: row.price,
        }));
      // 로그인 직후 '보류 항목 자동추가'(INSERT)가 이 로드(SELECT)와 경합할 수 있음
      //   → id 기준 병합으로 방금 담은 항목이 사라지지 않게 보존.
      setCartItems((prev) => {
        const byId = new Map<string, CartItem>(items.map((i) => [i.id, i]));
        for (const local of prev) if (!byId.has(local.id)) byId.set(local.id, local);
        return Array.from(byId.values());
      });
    })();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.id]);

  // 로그인 후 보류된 장바구니 항목 자동 추가
  //   담기 시도 직후 로그인한 경우에만 이어서 추가. 로그인 없이 모달을 닫고 한참 뒤
  //   무관한 로그인을 하면 '잊은 항목'이 몰래 담기므로, 10분 시간창을 벗어나면 폐기.
  //   (AuthModal이 로그인 성공 시 onClose를 동기 호출 + isAuthenticated는 비동기 갱신이라,
  //    '미인증이면 클리어' 방식은 자동추가를 깨뜨려 위험 → 타이밍 무관한 만료 방식 사용.)
  useEffect(() => {
    if (isAuthenticated && pendingCartAdd) {
      const { product, licenseType, at } = pendingCartAdd;
      setPendingCartAdd(null);
      if (Date.now() - at < 10 * 60 * 1000) addToCart(product, licenseType);
    }
  }, [isAuthenticated, pendingCartAdd, addToCart]);

  const togglePanel = (panel: Panel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };

  // ESC 키로 뒤로가기 — 열린 오버레이(useBackButton 등록분)가 있을 때만 back().
  //   ⚠️ 스택이 비었는데 back() 하면 사이트 밖으로 이탈. hasBackHandlers() 로 가드하면
  //   App 레벨 오버레이(상품/패널/Auth)뿐 아니라 페이지 레벨 모달(햄버거·댓글패널·편집 등)도 LIFO 로 닫힘.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && hasBackHandlers()) {
        window.history.back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 모바일 뒤로가기로 모달 닫기
  useBackButton(!!selectedProduct, () => setSelectedProduct(null));
  useBackButton(!!activePanel, () => setActivePanel(null));
  useBackButton(showAuthModal, () => setShowAuthModal(false));

  // 탭 청크 프리페치: 앱 idle 시 메인 탭 lazy 청크를 미리 받아둠 → 첫 탭 전환 시 다운로드 대기(스피너) 제거.
  // (이미 받은 청크는 브라우저가 dedup, 실패해도 무해)
  useEffect(() => {
    const prefetch = () => {
      void import("./components/Cinema").catch(() => {});
      void import("./components/Ott").catch(() => {});
      void import("./components/Community").catch(() => {});
      void import("./components/Channel").catch(() => {});
      void import("./components/MyPage").catch(() => {});
      void import("./components/Upload").catch(() => {});
      void import("./components/SearchPage").catch(() => {});
    };
    const ric: any = (window as any).requestIdleCallback;
    if (ric) { const id = ric(prefetch, { timeout: 4000 }); return () => (window as any).cancelIdleCallback?.(id); }
    const tmr = setTimeout(prefetch, 2500);
    return () => clearTimeout(tmr);
  }, []);

  if (loading && !authGateTimedOut) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-[0_0_30px_rgba(99,102,241,0.5)]"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
          >
            <span className="text-white font-bold text-2xl">AI</span>
          </motion.div>
          <p className="text-muted-foreground font-medium">{t("app.loading")}</p>
        </motion.div>
      </div>
    );
  }

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  // 랜딩 스위치 — 아래 case "discovery" 주석 참고. false=비로그인도 바로 콘텐츠(랜딩 끔).
  const SHOW_LANDING = false;

  const renderContent = () => {
    switch (activeTab) {
      case "discovery":
        // 비로그인 첫화면 랜딩 노출 여부.
        //  false = 콘텐츠 우선(비로그인도 바로 DiscoveryFeed) — 애드핏 심사·SEO·신규유입 위해 끔(2026-06-18).
        //  true  = 기존 랜딩 흐름 복원(비로그인 1회 노출, 둘러보면 sessionStorage 기억). LandingPage 컴포넌트는 보존.
        if (SHOW_LANDING && !hasExplored && !isAuthenticated) {
          return (
            <LandingPage
              isAuthenticated={isAuthenticated}
              onLogin={() => setShowAuthModal(true)}
              onExplore={() => { try { sessionStorage.setItem("aivm_explored", "1"); } catch {} setHasExplored(true); }}
              onSubscribe={() => setShowAuthModal(true)}
              onNavigate={(tab) => setActiveTab(tab as Tab)}
            />
          );
        }
        return <DiscoveryFeed onVideoClick={setSelectedProduct} onAddToCart={(v) => addToCart(v)} onSignInClick={() => setShowAuthModal(true)} onViewCreator={handleViewCreator} onOpenSearch={(q) => { setPendingSearchQuery(q || ""); setActiveTab("search"); }} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case "market":
        return <Cinema onProductClick={setSelectedProduct} onAddToCart={(p) => addToCart(p)} tier="cinema" onNavigate={(tab, sub) => { setActiveTab(tab as Tab); if (tab === "community" && sub) setPendingCommunityTab(sub); }} onViewCreator={handleViewCreator} onSignInClick={() => setShowAuthModal(true)} />;
      case "ott":
        return <Ott onProductClick={setSelectedProduct} onPlayProduct={playProduct} onAddToCart={(p) => addToCart(p)} onNavigate={(tab) => setActiveTab(tab as Tab)} onHeroScroll={setHeroScrolled} />;
      case "upload":
        return <Upload onSignInClick={() => setShowAuthModal(true)} onViewMyProducts={() => setActiveTab("mypage")} onNavigate={(tab) => setActiveTab(tab as Tab)} challengeContext={pendingChallenge} onChallengeContextConsumed={() => setPendingChallenge(null)} />;
      case "community":
        return (
          <Community
            onNavigate={(tab) => setActiveTab(tab as Tab)}
            initialTab={pendingCommunityTab}
            onInitialTabConsumed={() => setPendingCommunityTab(null)}
            onChallengeParticipate={(challenge) => {
              if (!isAuthenticated) { setShowAuthModal(true); return; }
              if (challenge.tag) setPendingChallenge({ tag: challenge.tag, title: challenge.title });
              setActiveTab("upload");
            }}
            onPlayVideo={(videoId) => loadAndOpenVideo(videoId)}
            initialCollabPostId={pendingCollabPostId}
            onInitialCollabPostConsumed={() => setPendingCollabPostId(null)}
            initialPostId={pendingCommunityPostId}
            onInitialPostConsumed={() => setPendingCommunityPostId(null)}
            initialChallengeId={pendingChallengeId}
            onInitialChallengeConsumed={() => setPendingChallengeId(null)}
          />
        );
      case "channel":
        return (
          <Channel
            onSignInClick={() => setShowAuthModal(true)}
            onProductClick={setSelectedProduct}
            initialCreatorId={pendingCreatorId}
            onCreatorOpened={() => setPendingCreatorId(null)}
            onNavigate={(tab) => setActiveTab(tab as Tab)}
          />
        );
      case "mypage":
        return (
          <MyPage
            onSignInClick={() => setShowAuthModal(true)}
            onViewMyChannel={user?.id ? () => handleViewCreator(user.id) : undefined}
            onVideoClick={loadAndOpenVideo}
            onNavigate={(tab) => setActiveTab(tab as Tab)}
            initialTab={pendingMyPageTab}
            onInitialTabConsumed={() => setPendingMyPageTab(null)}
          />
        );
      case "admin":
        return <AdminLayout onBackToSite={() => setActiveTab("discovery")} />;
      // 햄버거 메뉴/푸터 등에서 진입한 정적 페이지 — onBack 은 브라우저 history.back() 으로 이전 화면 복귀
      // (햄버거 열기 직전 페이지로 자연스럽게 돌아감. setActiveTab("discovery") 로 강제 이동 시 LandingPage 또는 홈으로 가버리는 문제 해결)
      case "business":
        return <BusinessPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case "about":
        return <AboutPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case "terms":
        return <TermsPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case "privacy":
        return <PrivacyPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case "youth":
        return <YouthProtectionPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case "faq":
        return <FaqPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case "notices":
        return <NoticesPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
      case "bug-report":
        return <BugReportPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} onSignInClick={() => setShowAuthModal(true)} />;
      case "top-creators":
        return <TopCreatorsPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} onViewCreator={handleViewCreator} onSignInClick={() => setShowAuthModal(true)} />;
      case "support":
        return <SupportPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} onSignInClick={() => setShowAuthModal(true)} initialInquiryId={pendingSupportId} />;
      case "subscription":
        return <SubscriptionPage onBack={() => window.history.back()} onNavigate={(tab) => setActiveTab(tab as Tab)} onSignInClick={() => setShowAuthModal(true)} />;
      case "advertiser":
        return <AdvertiserDashboard onBack={() => window.history.back()} onSignInClick={() => setShowAuthModal(true)} />;
      case "search":
        return (
          <SearchPage
            onProductClick={setSelectedProduct}
            onViewCreator={handleViewCreator}
            initialQuery={pendingSearchQuery}
            onQueryCommit={handleSearchQueryCommit}
            onClose={() => { setPendingSearchQuery(""); setActiveTab("discovery"); }}
            onNavigate={(tab) => setActiveTab(tab as Tab)}
          />
        );
      default:
        // discovery 케이스와 동일한 props — 폴백 경로에서도 크리에이터 이동·데스크탑 검색이 살아있게.
        return <DiscoveryFeed onVideoClick={setSelectedProduct} onAddToCart={(v) => addToCart(v)} onSignInClick={() => setShowAuthModal(true)} onViewCreator={handleViewCreator} onOpenSearch={(q) => { setPendingSearchQuery(q || ""); setActiveTab("search"); }} onNavigate={(tab) => setActiveTab(tab as Tab)} />;
    }
  };

  // 어드민 권한: DB profiles.is_admin 단일 source of truth (이메일 화이트리스트 폐기)
  const isAdmin = !!profile?.is_admin;

  const desktopTabs: { id: Tab; label: string; icon: any }[] = [
    { id: "discovery", label: t("nav.home"), icon: Home },
    { id: "market", label: t("nav.cinema"), icon: Film },
    { id: "ott", label: t("nav.ottShort"), icon: Crown },
    { id: "upload", label: t("nav.upload"), icon: UploadIcon },
    { id: "community", label: t("nav.community"), icon: MessageSquare },
    { id: "channel", label: t("nav.channel"), icon: Users },
    { id: "mypage", label: t("nav.mypage"), icon: User },
    ...(isAdmin ? [{ id: "admin" as Tab, label: t("nav.admin"), icon: ShieldCheck }] : []),
  ];

  const springTransition: any = { type: "spring", stiffness: 500, damping: 30 };

  // OTT 홈만 풀블리드 히어로 → 헤더를 투명 오버레이로 띄움 (스크롤 내려가면 배경)
  const isOttHome = activeTab === "ott" && !activePanel;
  const headerTransparent = isOttHome && !heroScrolled;
  // 인라인 style 로 position 강제 (framer-motion 이 className 의 absolute 를 덮어쓰는 문제 방지)
  const headerPosStyle: CSSProperties = isOttHome
    ? { position: "absolute", top: 0, left: 0, right: 0 }
    : { position: "sticky", top: 0 };
  const headerBgClass = headerTransparent
    ? "bg-transparent"
    : "bg-background/80 backdrop-blur-xl border-b border-white/5 shadow-sm";

  return (
    <div className="relative h-full flex flex-col bg-background text-foreground overflow-hidden selection:bg-[#6366f1]/30">

      {/* Mobile Top Header */}
      <motion.header
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={headerPosStyle}
        className={`md:hidden z-50 transition-colors duration-300 ${headerBgClass}`}
      >
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab("discovery")}>
            <CreaiteLogo className="w-9 h-9" />
            <CreaiteText className="text-[17px] font-extrabold" />
          </div>
          <div className="flex items-center gap-1">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => { setActivePanel(null); setActiveTab("search"); }}
              aria-label={t("header.search", "검색")}
              className={`p-2 transition-colors ${activeTab === "search" ? "text-[#8b5cf6]" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Search className="w-[22px] h-[22px]" />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => togglePanel("notifications")}
              className="p-2 relative text-muted-foreground hover:text-foreground transition-colors"
            >
              <Bell className={`w-[22px] h-[22px] ${activePanel === "notifications" ? "text-[#8b5cf6]" : ""}`} />
              {unreadNotifications > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => togglePanel("cart")}
              className="p-2 relative text-muted-foreground hover:text-foreground transition-colors"
              title={t("app.cart", "장바구니")}
              aria-label={t("app.cart", "장바구니")}
            >
              <ShoppingCart className={`w-[22px] h-[22px] ${activePanel === "cart" ? "text-[#8b5cf6]" : ""}`} />
              {cartItems.length > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 bg-[#6366f1] rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                  {cartItems.length}
                </span>
              )}
            </motion.button>
            {isAdmin && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setActiveTab("admin")}
                className="p-2 transition-colors"
                title={t("app.adManage")}
              >
                <ShieldCheck className={`w-[22px] h-[22px] ${activeTab === "admin" ? "text-[#8b5cf6]" : "text-muted-foreground"}`} />
              </motion.button>
            )}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => isAuthenticated ? setActiveTab("mypage") : setShowAuthModal(true)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <User className="w-[22px] h-[22px]" />
            </motion.button>
            {/* Language Switcher (Phase 35) */}
            <LanguageSwitcher />
            <HamburgerMenu onNavigate={(tab) => setActiveTab(tab as Tab)} />
          </div>
        </div>
      </motion.header>

      {/* Desktop Header Navigation */}
      <motion.header
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        style={headerPosStyle}
        className={`hidden md:block z-50 transition-colors duration-300 ${headerBgClass}`}
      >
        {/* 좌(로고)·우(액션)를 flex-1 동일 비율로 → 가운데 nav 가 페이지 정중앙에 고정 */}
        <div className="max-w-[1800px] mx-auto px-5 md:px-10 h-16 flex items-center gap-4">
          <div className="flex-1 flex justify-start min-w-0">
            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex items-center gap-3 cursor-pointer select-none"
              onClick={() => { setActivePanel(null); setActiveTab("discovery"); }}
            >
              <CreaiteLogo className="w-10 h-10" />
              <span className="hidden lg:block">
                <CreaiteText className="text-xl font-extrabold" />
              </span>
            </motion.div>
          </div>

          {/* Desktop Navigation — 정중앙 */}
          <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5 shrink-0">
            {desktopTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { setActivePanel(null); setActiveTab(tab.id as Tab); }}
                  title={tab.label}
                  className={`relative flex items-center gap-2 px-3 py-2 rounded-lg transition-colors duration-200 text-sm font-semibold select-none whitespace-nowrap shrink-0
                    ${isActive ? "text-white" : "text-muted-foreground hover:text-gray-200 hover:bg-white/5"}
                  `}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="hidden 2xl:inline">{tab.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="desktop-active-tab"
                      className="absolute inset-0 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-lg -z-10 shadow-[0_4px_12px_rgba(99,102,241,0.3)] border border-white/10"
                      initial={false}
                      transition={springTransition}
                    />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Actions — flex-1 로 좌측 로고 영역과 동일 비율 (nav 중앙 고정) */}
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            {/* PWA 앱 설치 버튼 — xl(1280px) 이상에서만. 좁은 데스크탑 폭에서 중앙 메뉴와 겹쳐서 숨김 (2026-06-11) */}
            <div className="hidden xl:flex items-center">
              <InstallButtonHeader />
            </div>

            {/* Language Switcher (Phase 35) */}
            <LanguageSwitcher variant="compact" />

            {/* Notifications */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => togglePanel("notifications")}
              className={`relative p-2 rounded-lg hover:bg-white/5 transition-colors ${
                activePanel === "notifications" ? "text-[#8b5cf6]" : "text-muted-foreground hover:text-white"
              }`}
            >
              <Bell className="w-5 h-5" />
              {unreadNotifications > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                  {unreadNotifications > 9 ? "9+" : unreadNotifications}
                </span>
              )}
            </motion.button>

            {/* Cart */}
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => togglePanel("cart")}
              title={t("app.cart", "장바구니")}
              aria-label={t("app.cart", "장바구니")}
              className={`relative p-2 rounded-lg hover:bg-white/5 transition-colors ${
                activePanel === "cart" ? "text-[#8b5cf6]" : "text-muted-foreground hover:text-white"
              }`}
            >
              <ShoppingCart className="w-5 h-5" />
              {cartItems.length > 0 && (
                <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#6366f1] rounded-full text-[10px] text-white font-bold flex items-center justify-center">
                  {cartItems.length}
                </span>
              )}
            </motion.button>

            {/* 멤버십(구독) — 상시 노출 진입 버튼 */}
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setActiveTab("subscription")}
              title={t("nav.membership", "멤버십")}
              className="hidden md:flex shrink-0 whitespace-nowrap items-center gap-1.5 px-3 h-9 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm font-bold shadow-md shadow-amber-500/20 hover:opacity-90"
            >
              <Crown className="w-4 h-4 shrink-0" />
              <span className="hidden xl:inline">{t("nav.membership", "멤버십")}</span>
            </motion.button>

            {/* Auth — 프로필 아바타(그라데이션 링) 드롭다운: 마이페이지 / 로그아웃 */}
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    aria-label={t("header.myAccount", "내 계정")}
                    className="w-9 h-9 rounded-full p-[2px] shrink-0 bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] transition-shadow hover:shadow-lg hover:shadow-[#8b5cf6]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/60"
                  >
                    {profile?.avatar_url ? (
                      <img src={profile.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="w-full h-full rounded-full bg-[#0d0d16] grid place-items-center text-[#a5b4fc] font-extrabold text-sm">
                        {(profile?.display_name || user?.name || "C").charAt(0).toUpperCase()}
                      </span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[190px]">
                  <div className="px-2 py-1.5 text-sm font-semibold text-white truncate">{profile?.display_name || user?.name}</div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { setActivePanel(null); setActiveTab("mypage"); }} className="cursor-pointer gap-2">
                    <User className="w-4 h-4" /> {t("header.myPage", "마이페이지")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={signOut} className="cursor-pointer gap-2 text-red-400 focus:text-red-400">
                    <LogOut className="w-4 h-4" /> {t("header.signOut", "로그아웃")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={() => setShowAuthModal(true)}
                  className="gap-2 shrink-0 whitespace-nowrap bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 border border-white/10 shadow-lg shadow-[#6366f1]/20 font-bold"
                  size="sm"
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  {t("auth.signIn")}
                </Button>
              </motion.div>
            )}

            {/* 더보기(햄버거) — 데스크탑은 무한스크롤로 하단 푸터 도달이 어려워 상단에서 광고주센터·약관·문의 등 진입 (2026-06-15) */}
            <HamburgerMenu onNavigate={(tab) => setActiveTab(tab as Tab)} />
          </div>
        </div>
      </motion.header>

      {/* Main Content + Side Panel Layout — 푸터는 각 페이지가 자체 스크롤 영역 끝에 포함 (Netflix 패턴) */}
      <div className="flex-1 relative overflow-hidden bg-[#0A0A0A] flex">
        {/* Content */}
        <div className={`flex-1 overflow-hidden transition-all duration-300 ${activePanel ? "md:mr-80" : ""}`}>
          <Suspense fallback={<PageLoading />}>
            {renderContent()}
          </Suspense>
        </div>

        {/* Desktop Side Panel */}
        <AnimatePresence>
          {activePanel && (
            <motion.div
              initial={{ x: 320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 320, opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="hidden md:flex absolute right-0 top-0 bottom-0 w-80 z-40 flex-col shadow-2xl"
            >
              <Suspense fallback={null}>
                {activePanel === "cart" && (
                  <CartPanel
                    items={cartItems}
                    onRemove={removeFromCart}
                    onViewVideo={loadAndOpenVideo}
                    onPurchase={handleCartPurchase}
                    onClose={() => setActivePanel(null)}
                  />
                )}
                {activePanel === "notifications" && (
                  <NotificationPanel
                    onClose={() => setActivePanel(null)}
                    onUnreadCountChange={setUnreadNotifications}
                    onNavigate={handleNotificationNavigate}
                  />
                )}
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile Bottom Sheet for panels */}
        <AnimatePresence>
          {activePanel && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActivePanel(null)}
                className="md:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
              />
              <motion.div
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="md:hidden fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl overflow-hidden"
                style={{ height: "85vh" }}
              >
                <Suspense fallback={null}>
                  {activePanel === "cart" && (
                    <CartPanel
                      items={cartItems}
                      onRemove={removeFromCart}
                      onViewVideo={loadAndOpenVideo}
                      onPurchase={handleCartPurchase}
                      onClose={() => setActivePanel(null)}
                    />
                  )}
                  {activePanel === "notifications" && (
                    <NotificationPanel
                      onClose={() => setActivePanel(null)}
                      onUnreadCountChange={setUnreadNotifications}
                      onNavigate={handleNotificationNavigate}
                    />
                  )}
                </Suspense>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Bottom Navigation — 6탭 + 중앙 업로드 버튼 (좌 3 / 중앙 / 우 3)
          진입 애니메이션(y:50 슬라이드업) 제거: 루트가 overflow-hidden 이라 마운트 시 아래로 밀린 네비
          하단이 clip 되어, 첫 시작(무거운 JS)에 애니메이션이 지연되면 "절반 잘림"으로 멈춰 보이던 버그.
          항상 최종 위치에 즉시 렌더해 잘림 원천 차단. (루트 높이는 h-[100dvh]→h-full 로 통일해
          html/body/#root 의 height:100% 고정과 정합 — dvh↔100% 불일치로 인한 하단 여백/잘림 제거.)
          pb-safe 를 <nav>(고정높이 없음)에 두어 아이콘 행(h-20) 아래로 safe-area 만큼 배경이 확장 →
          viewport-fit=cover 로 edge-to-edge 시 홈 인디케이터/제스처바 영역을 nav 배경이 채워 검은 띠 방지.
          안전영역 없는 기기(env=0)면 패딩 0 이라 무변화(부작용 없음). */}
      <nav
        className={`md:hidden shrink-0 border-t border-white/5 bg-background/80 backdrop-blur-xl sticky bottom-0 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] pb-safe ${activePanel ? "hidden" : ""}`}
      >
        <div className="flex items-center justify-around h-20 px-1">
          {/* 좌측 3탭: 홈 / 시네마 / OTT */}
          {([
            { id: "discovery", label: t("nav.home"), icon: Home },
            { id: "market", label: t("nav.cinema"), icon: Film },
            { id: "ott", label: t("nav.ottShort"), icon: Crown },
          ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id && !activePanel;
            return (
              <button
                key={id}
                onClick={() => { setActivePanel(null); setActiveTab(id); }}
                className={`relative flex flex-col items-center justify-center gap-1 flex-1 h-full select-none
                  ${isActive ? "text-[#8b5cf6]" : "text-muted-foreground hover:text-gray-300"}
                  transition-colors duration-200
                `}
              >
                <Icon className={`w-[20px] h-[20px] transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[10px] font-bold tracking-tight">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="mobile-active-tab"
                    transition={springTransition}
                    className="absolute top-1 w-8 h-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-full shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                  />
                )}
              </button>
            );
          })}

          {/* Upload Button — 중앙 시그니처 액션 버튼 (CREAITE 로고) */}
          <div className="flex items-center justify-center flex-1 h-full">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => { setActivePanel(null); setActiveTab("upload"); }}
              className="relative -mt-8 outline-none group"
              aria-label={t("app.uploadAria")}
            >
              <div className={`w-14 h-14 rounded-full transition-all duration-300 border-[3px] border-background flex items-center justify-center
                ${activeTab === "upload"
                  ? "bg-gradient-to-tr from-[#6366f1] via-[#ec4899] to-[#06b6d4] shadow-[0_0_25px_rgba(139,92,246,0.6)] p-[2px]"
                  : "bg-[#1a1a1c] hover:bg-[#2a2a2c] shadow-lg"}
              `}>
                <div className={`w-full h-full rounded-full flex items-center justify-center transition-colors duration-300
                  ${activeTab === "upload" ? "bg-[#0a0a0a]" : "bg-transparent"}
                `}>
                  <CreaiteLogo
                    className="w-7 h-7 -rotate-90"
                    still={activeTab !== "upload"}
                  />
                </div>
              </div>
            </motion.button>
          </div>

          {/* 우측 3탭: 커뮤니티 / 채널 / 마이 */}
          {([
            { id: "community", label: t("nav.community"), icon: MessageSquare },
            { id: "channel", label: t("nav.channel"), icon: Users },
            { id: "mypage", label: t("nav.mypage"), icon: User },
          ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => {
            const isActive = activeTab === id && !activePanel;
            return (
              <button
                key={id}
                onClick={() => { setActivePanel(null); setActiveTab(id); }}
                className={`relative flex flex-col items-center justify-center gap-1 flex-1 h-full select-none
                  ${isActive ? "text-[#8b5cf6]" : "text-muted-foreground hover:text-gray-300"}
                  transition-colors duration-200
                `}
              >
                <Icon className={`w-[20px] h-[20px] transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[10px] font-bold tracking-tight">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="mobile-active-tab"
                    transition={springTransition}
                    className="absolute top-1 w-8 h-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-full shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Product Detail Modal (lazy) */}
      {selectedProduct && (
        <Suspense fallback={null}>
          <ProductDetail
            product={selectedProduct}
            onClose={() => { setProductFullscreen(false); setSelectedProduct(null); }}
            onSignInClick={() => setShowAuthModal(true)}
            onAddToCart={addToCart}
            onViewCreator={handleViewCreator}
            onNavigateToVideo={loadAndOpenVideo}
            autoOpenComments={openCommentsOnOpen}
            startFullscreen={productFullscreen}
          />
        </Suspense>
      )}

      {/* Auth Modal (lazy) */}
      {showAuthModal && (
        <Suspense fallback={null}>
          <AuthModal onClose={() => setShowAuthModal(false)} />
        </Suspense>
      )}

      {/* H8: 비밀번호 재설정 화면 (재설정 메일 링크 진입 시) */}
      {passwordRecovery && (
        <Suspense fallback={null}>
          <PasswordResetScreen />
        </Suspense>
      )}

      {/* PWA 앱 설치 배너 (모바일, 첫 방문자) */}
      <InstallBannerMobile />

      {/* 카톡식 푸시 권한 자동 프롬프트 (로그인 후 1회, 한 번 탭하면 구독) */}
      <PushPrompt />

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <SettingsProvider>
          <LikesProvider>
            <ErrorBoundary>
              <AppContent />
            </ErrorBoundary>
          </LikesProvider>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
