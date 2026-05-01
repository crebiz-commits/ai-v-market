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

import { useState, useEffect, useCallback } from "react";
import { Home, Film, Upload as UploadIcon, MessageSquare, User, LogIn, LogOut, Search, Bell, ShieldCheck, ShoppingCart } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { DiscoveryFeed } from "./components/DiscoveryFeed";
import { Market } from "./components/Market";
import { Upload } from "./components/Upload";
import { Community } from "./components/Community";
import { MyPage } from "./components/MyPage";
import { AdminDashboard } from "./components/AdminDashboard";
import { ProductDetail } from "./components/ProductDetail";
import { SplashScreen } from "./components/SplashScreen";
import { AuthModal } from "./components/AuthModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { CartPanel, CartItem } from "./components/CartPanel";
import { NotificationPanel } from "./components/NotificationPanel";
import { LogoPreview } from "./components/LogoPreview";
import { NewLogoPreview } from "./components/NewLogoPreview";
import { LogoDesigns } from "./components/LogoDesigns";
import { LogoDesignsV2 } from "./components/LogoDesignsV2";
import { LogoFish } from "./components/LogoFish";
import { LogoFishPlay } from "./components/LogoFishPlay";
import { CinemaIconPreview } from "./components/CinemaIconPreview";
import { UploadButtonPreview } from "./components/UploadButtonPreview";
import { InstallButtonHeader, InstallBannerMobile } from "./components/InstallPrompt";
import { CreaiteText } from "./components/CreaiteText";
import { CreaiteLogo } from "./components/CreaiteLogo";
import { useBackButton } from "./hooks/useBackButton";
import { Button } from "./components/ui/button";
import { handleBunnyError } from "./utils/bunnyErrorHandler";
import { supabase } from "./utils/supabaseClient";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

type Tab = "discovery" | "market" | "upload" | "community" | "mypage" | "admin";
type Panel = "cart" | "notifications" | null;

interface VideoProduct {
  // 기본 정보
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  price: number;              // 하위 호환 — priceStandard와 동일
  duration: string;
  resolution?: string;
  tool: string;
  category?: string;
  genre?: string;
  videoUrl: string;
  description?: string;
  tags?: string[];

  // 라이선스 가격 (3종)
  priceStandard?: number;
  priceCommercial?: number;
  priceExclusive?: number;

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
  // 로고 프리뷰 모드 (URL ?preview=logo)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "logo") {
    return <LogoPreview />;
  }
  // 새 로고 프리뷰 (URL ?preview=newlogo)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "newlogo") {
    return <NewLogoPreview />;
  }
  // SVG 로고 디자인 비교 (URL ?preview=designs)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "designs") {
    return <LogoDesigns />;
  }
  // SVG 로고 디자인 V2 — 새로운 컨셉 (URL ?preview=designs2)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "designs2") {
    return <LogoDesignsV2 />;
  }
  // 물고기 컨셉 로고 (URL ?preview=fish)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "fish") {
    return <LogoFish />;
  }
  // 물고기 + 플레이 버튼 변형 (URL ?preview=fishplay)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "fishplay") {
    return <LogoFishPlay />;
  }
  // 시네마 탭 아이콘 후보 (URL ?preview=cinema)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "cinema") {
    return <CinemaIconPreview />;
  }
  // 인트로 스플래시 미리보기 (URL ?preview=splash)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "splash") {
    return <SplashScreen onComplete={() => { window.location.search = ""; }} />;
  }
  // 하단 업로드 버튼 디자인 비교 (URL ?preview=uploadbtn)
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("preview") === "uploadbtn") {
    return <UploadButtonPreview />;
  }

  const [showSplash, setShowSplash] = useState(() => {
    const lastVisitDate = localStorage.getItem('aivm_last_visit');
    const today = new Date().toDateString();
    if (lastVisitDate !== today) {
      localStorage.setItem('aivm_last_visit', today);
      return true;
    }
    return false;
  });
  const [activeTab, setActiveTab] = useState<Tab>("discovery");
  const [selectedProduct, setSelectedProduct] = useState<VideoProduct | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [pendingCartAdd, setPendingCartAdd] = useState<{ product: VideoProduct; licenseType: "standard" | "commercial" | "extended" } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const { user, signOut, isAuthenticated, loading } = useAuth();

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

  // 장바구니 추가 (Supabase 영구 저장) — 인증 통과 시 true, 미로그인 시 false 반환
  const addToCart = useCallback(async (product: VideoProduct, licenseType: "standard" | "commercial" | "extended" = "standard"): Promise<boolean> => {
    // 비로그인 시: 로그인 모달 띄우고 항목을 보류 → 로그인 후 자동 추가
    if (!isAuthenticated || !user) {
      setPendingCartAdd({ product, licenseType });
      toast.info("로그인 후 자동으로 장바구니에 담깁니다.");
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
        toast.info("이미 장바구니에 담겨 있습니다.");
      } else {
        console.error("[addToCart]", error);
        toast.error("장바구니 추가에 실패했습니다.");
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
    toast.success("장바구니에 담았습니다!", {
      action: {
        label: "장바구니 보기",
        onClick: () => setActivePanel("cart"),
      },
    });
    return true;
  }, [isAuthenticated, user]);

  const removeFromCart = useCallback(async (itemId: string) => {
    const { error } = await supabase.from("cart_items").delete().eq("id", itemId);
    if (error) {
      toast.error("삭제에 실패했습니다.");
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
      <div className="h-screen flex items-center justify-center bg-background">
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
          <p className="text-muted-foreground font-medium">로딩 중...</p>
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
        return <DiscoveryFeed onVideoClick={setSelectedProduct} onSignInClick={() => setShowAuthModal(true)} />;
      case "market":
        return <Market onProductClick={setSelectedProduct} />;
      case "upload":
        return <Upload onSignInClick={() => setShowAuthModal(true)} onViewMyProducts={() => setActiveTab("mypage")} />;
      case "community":
        return <Community />;
      case "mypage":
        return <MyPage onSignInClick={() => setShowAuthModal(true)} />;
      case "admin":
        return <AdminDashboard />;
      default:
        return <DiscoveryFeed onVideoClick={setSelectedProduct} onSignInClick={() => setShowAuthModal(true)} />;
    }
  };

  const ADMIN_EMAILS = ["crebizlogistics@gmail.com"];
  const isAdmin = user && ADMIN_EMAILS.includes(user.email);

  const desktopTabs: { id: Tab; label: string; icon: any }[] = [
    { id: "discovery", label: "홈", icon: Home },
    { id: "market", label: "시네마", icon: Film },
    { id: "upload", label: "업로드", icon: UploadIcon },
    { id: "community", label: "커뮤니티", icon: MessageSquare },
    { id: "mypage", label: "마이페이지", icon: User },
    ...(isAdmin ? [{ id: "admin" as Tab, label: "광고관리", icon: ShieldCheck }] : []),
  ];

  const springTransition: any = { type: "spring", stiffness: 500, damping: 30 };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden selection:bg-[#6366f1]/30">

      {/* Mobile Top Header */}
      <motion.header
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="md:hidden border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50 shadow-sm"
      >
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveTab("discovery")}>
            <CreaiteLogo className="w-9 h-9" />
            <CreaiteText className="text-[17px] font-extrabold" />
          </div>
          <div className="flex items-center gap-1">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setActiveTab("market")}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
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
                title="광고관리"
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
          </div>
        </div>
      </motion.header>

      {/* Desktop Header Navigation */}
      <motion.header
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="hidden md:block border-b border-white/5 bg-background/80 backdrop-blur-xl sticky top-0 z-50 shadow-sm"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
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
          <nav className="flex items-center gap-1.5 bg-white/5 p-1 rounded-xl border border-white/5">
            {desktopTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`relative flex items-center gap-2 px-4 py-2 rounded-lg transition-colors duration-200 text-sm font-semibold select-none
                    ${isActive ? "text-white" : "text-muted-foreground hover:text-gray-200 hover:bg-white/5"}
                  `}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span>{tab.label}</span>
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
                {user?.name}
              </Button>
            ) : (
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={() => setShowAuthModal(true)}
                  className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 border border-white/10 shadow-lg shadow-[#6366f1]/20 font-bold"
                  size="sm"
                >
                  <LogIn className="w-4 h-4" />
                  로그인
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </motion.header>

      {/* Main Content + Side Panel Layout */}
      <div className="flex-1 relative overflow-hidden bg-[#0A0A0A] flex">
        {/* Content */}
        <div className={`flex-1 overflow-hidden transition-all duration-300 ${activePanel ? "md:mr-80" : ""}`}>
          {renderContent()}
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
              {activePanel === "cart" && (
                <CartPanel
                  items={cartItems}
                  onRemove={removeFromCart}
                  onClose={() => setActivePanel(null)}
                />
              )}
              {activePanel === "notifications" && (
                <NotificationPanel
                  onClose={() => setActivePanel(null)}
                  onUnreadCountChange={setUnreadNotifications}
                />
              )}
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
                {activePanel === "cart" && (
                  <CartPanel
                    items={cartItems}
                    onRemove={removeFromCart}
                    onClose={() => setActivePanel(null)}
                  />
                )}
                {activePanel === "notifications" && (
                  <NotificationPanel
                    onClose={() => setActivePanel(null)}
                    onUnreadCountChange={setUnreadNotifications}
                  />
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Mobile Bottom Navigation */}
      <motion.nav
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
        className="md:hidden border-t border-white/5 bg-background/80 backdrop-blur-xl sticky bottom-0 z-50 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-around h-20 px-2 pb-safe">
          {["discovery", "market"].map((tabId) => {
            const isDiscovery = tabId === "discovery";
            const Icon = isDiscovery ? Home : Film;
            const label = isDiscovery ? "홈" : "시네마";
            const isActive = activeTab === tabId && !activePanel;
            return (
              <button
                key={tabId}
                onClick={() => { setActivePanel(null); setActiveTab(tabId as Tab); }}
                className={`relative flex flex-col items-center justify-center gap-1.5 flex-1 h-full select-none
                  ${isActive ? "text-[#8b5cf6]" : "text-muted-foreground hover:text-gray-300"}
                  transition-colors duration-200
                `}
              >
                <Icon className={`w-6 h-6 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[11px] font-bold tracking-wide">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="mobile-active-tab"
                    transition={springTransition}
                    className="absolute top-1 w-10 h-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-full shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                  />
                )}
              </button>
            );
          })}

          {/* Upload Button — CREAITE 로고를 시그니처 액션 버튼으로 사용 */}
          <div className="flex items-center justify-center flex-1 h-full">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => { setActivePanel(null); setActiveTab("upload"); }}
              className="relative -mt-8 outline-none group"
              aria-label="업로드"
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

          {["community", "mypage"].map((tabId) => {
            const isCommunity = tabId === "community";
            const Icon = isCommunity ? MessageSquare : User;
            const label = isCommunity ? "커뮤니티" : "마이";
            const isActive = activeTab === tabId && !activePanel;
            return (
              <button
                key={tabId}
                onClick={() => { setActivePanel(null); setActiveTab(tabId as Tab); }}
                className={`relative flex flex-col items-center justify-center gap-1.5 flex-1 h-full select-none
                  ${isActive ? "text-[#8b5cf6]" : "text-muted-foreground hover:text-gray-300"}
                  transition-colors duration-200
                `}
              >
                <Icon className={`w-6 h-6 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
                <span className="text-[11px] font-bold tracking-wide">{label}</span>
                {isActive && (
                  <motion.div
                    layoutId="mobile-active-tab"
                    transition={springTransition}
                    className="absolute top-1 w-10 h-1 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] rounded-full shadow-[0_0_8px_rgba(139,92,246,0.8)]"
                  />
                )}
              </button>
            );
          })}
        </div>
      </motion.nav>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={addToCart}
        />
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}

      {/* PWA 앱 설치 배너 (모바일, 첫 방문자) */}
      <InstallBannerMobile />

      {/* Toast Notifications */}
      <Toaster />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </AuthProvider>
    </ErrorBoundary>
  );
}
