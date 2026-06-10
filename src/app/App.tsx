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
import { Home, Film, Upload as UploadIcon, MessageSquare, User, LogIn, LogOut, Search, Bell, ShieldCheck, ShoppingCart, Loader2, Crown, Users } from "lucide-react";
import { HamburgerMenu } from "./components/HamburgerMenu";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
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
import { useBackButton, isInternalBackEvent } from "./hooks/useBackButton";
import { Button } from "./components/ui/button";
import { handleBunnyError } from "./utils/bunnyErrorHandler";
import { supabase } from "./utils/supabaseClient";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { SettingsProvider } from "./contexts/SettingsContext";
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
const PaymentResult = lazy(() => import("./components/PaymentResult").then(m => ({ default: m.PaymentResult })));
const SearchPage = lazy(() => import("./components/SearchPage").then(m => ({ default: m.SearchPage })));

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

type Tab = "discovery" | "market" | "ott" | "upload" | "community" | "channel" | "mypage" | "admin" | "business" | "about" | "terms" | "privacy" | "search";
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
        // 홈 진입 시 ?tab= 제거
        params.delete("tab");
        const newSearch = params.toString();
        const newUrl = newSearch ? `${window.location.pathname}?${newSearch}` : window.location.pathname;
        window.history.pushState({ tab: "discovery" }, "", newUrl);
      }
    } else if (currentTabInUrl !== activeTab) {
      // 새 탭 진입 시 ?tab=XXX 추가 (history 스택 적립 → 뒤로가기로 복원 가능)
      params.set("tab", activeTab);
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
    // 첫 마운트만 — loadAndOpenVideo 는 closure 로 안정적
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  // OTT 홈 풀블리드 히어로: 헤더를 투명 오버레이로, 스크롤 내려가면 배경 생김
  const [heroScrolled, setHeroScrolled] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [pendingCartAdd, setPendingCartAdd] = useState<{ product: VideoProduct; licenseType: "standard" | "commercial" | "extended" } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { user, profile, signOut, isAuthenticated, loading, passwordRecovery } = useAuth();
  // 비로그인 사용자가 〈둘러보기〉 클릭 시 LandingPage → DiscoveryFeed 로 전환
  const [hasExplored, setHasExplored] = useState(false);

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

  useEffect(() => {
    document.title = "CREAITE | 세계 최초 AI 시네마 OTT";
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
      setPendingCartAdd({ product, licenseType });
      toast.info(t("app.cartPending"));
      setShowAuthModal(true);
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
    setCartItems(prev => [...prev, newItem]);
    toast.success(t("app.cartAddSuccess"), {
      action: {
        label: t("common.viewCart"),
        onClick: () => setActivePanel("cart"),
      },
    });
    return true;
  }, [isAuthenticated, user]);

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
    (async () => {
      const { data, error } = await supabase
        .from("cart_items")
        .select("id, video_id, license_type, price, videos(title, creator, thumbnail)")
        .eq("user_id", user.id);
      if (error) {
        console.error("[loadCart]", error);
        return;
      }
      const items: CartItem[] = (data || []).map((row: any) => ({
        id: row.id,
        videoId: row.video_id,
        thumbnail: row.videos?.thumbnail || "",
        title: row.videos?.title || "",
        creator: row.videos?.creator || "",
        licenseType: row.license_type,
        price: row.price,
      }));
      setCartItems(items);
    })();
  }, [isAuthenticated, user?.id]);

  // 로그인 후 보류된 장바구니 항목 자동 추가
  useEffect(() => {
    if (isAuthenticated && pendingCartAdd) {
      const { product, licenseType } = pendingCartAdd;
      setPendingCartAdd(null);
      addToCart(product, licenseType);
    }
  }, [isAuthenticated, pendingCartAdd, addToCart]);

  const togglePanel = (panel: Panel) => {
    setActivePanel(prev => prev === panel ? null : panel);
  };

  // ESC 키로 뒤로가기 (어떤 모달이든 닫힘 — useBackButton이 popstate를 처리)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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

  if (loading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-background">
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

  const renderContent = () => {
    switch (activeTab) {
      case "discovery":
        // 〈둘러보기〉 미클릭 → Netflix 패턴 랜딩 페이지 (로그인/로그아웃 통일 — 모두 랜딩 먼저)
        if (!hasExplored) {
          return (
            <LandingPage
              isAuthenticated={isAuthenticated}
              onLogin={() => setShowAuthModal(true)}
              onExplore={() => setHasExplored(true)}
              onSubscribe={() => setShowAuthModal(true)}
              onNavigate={(tab) => setActiveTab(tab as Tab)}
            />
          );
        }
        return <DiscoveryFeed onVideoClick={setSelectedProduct} onSignInClick={() => setShowAuthModal(true)} onViewCreator={handleViewCreator} />;
      case "market":
        return <Cinema onProductClick={setSelectedProduct} onAddToCart={(p) => addToCart(p)} tier="cinema" onNavigate={(tab, sub) => { setActiveTab(tab as Tab); if (tab === "community" && sub) setPendingCommunityTab(sub); }} />;
      case "ott":
        return <Ott onProductClick={setSelectedProduct} onPlayProduct={playProduct} onNavigate={(tab) => setActiveTab(tab as Tab)} onHeroScroll={setHeroScrolled} />;
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
      case "search":
        return (
          <SearchPage
            onProductClick={setSelectedProduct}
            onViewCreator={handleViewCreator}
            onClose={() => setActiveTab("discovery")}
            onNavigate={(tab) => setActiveTab(tab as Tab)}
          />
        );
      default:
        return <DiscoveryFeed onVideoClick={setSelectedProduct} onSignInClick={() => setShowAuthModal(true)} />;
    }
  };

  const ADMIN_EMAILS = ["crebizlogistics@gmail.com"];
  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

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
    <div className="relative h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden selection:bg-[#6366f1]/30">

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
              onClick={() => setActiveTab("search")}
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
            <HamburgerMenu onNavigate={(tab) => setActiveTab(tab)} />
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
        <div className="max-w-[1800px] mx-auto px-5 md:px-10 h-16 flex items-center justify-between gap-4">
          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="flex items-center gap-3 cursor-pointer select-none"
            onClick={() => setActiveTab("discovery")}
          >
            <CreaiteLogo className="w-10 h-10" />
            <span className="hidden lg:block">
              <CreaiteText className="text-xl font-extrabold" />
            </span>
          </motion.div>

          {/* Desktop Navigation */}
          <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/5">
            {desktopTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  title={tab.label}
                  className={`relative flex items-center gap-2 px-3 py-2 rounded-lg transition-colors duration-200 text-sm font-semibold select-none whitespace-nowrap shrink-0
                    ${isActive ? "text-white" : "text-muted-foreground hover:text-gray-200 hover:bg-white/5"}
                  `}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span className="hidden xl:inline">{tab.label}</span>
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

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* PWA 앱 설치 버튼 (설치 가능 + 미설치일 때만 표시) */}
            <InstallButtonHeader />

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

            {/* Auth */}
            {isAuthenticated ? (
              <Button
                onClick={signOut}
                variant="outline"
                size="sm"
                className="gap-2 bg-transparent border-white/10 hover:bg-white/5 font-semibold"
              >
                <LogOut className="w-4 h-4" />
                {profile?.display_name || user?.name}
              </Button>
            ) : (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={() => setShowAuthModal(true)}
                  className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 border border-white/10 shadow-lg shadow-[#6366f1]/20 font-bold"
                  size="sm"
                >
                  <LogIn className="w-4 h-4" />
                  {t("auth.signIn")}
                </Button>
              </motion.div>
            )}
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

      {/* Mobile Bottom Navigation — 6탭 + 중앙 업로드 버튼 (좌 3 / 중앙 / 우 3) */}
      <motion.nav
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
        className="md:hidden border-t border-white/5 bg-background/80 backdrop-blur-xl sticky bottom-0 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-around h-20 px-1 pb-safe">
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
      </motion.nav>

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
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </SettingsProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
