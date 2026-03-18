/**
 * AI-V-Market (AI 영상 특화 오픈마켓 플랫폼)
 * 
 * AI로 제작된 영상 콘텐츠를 창작자와 소비자가 직접 거래하는 C2C/B2B 오픈마켓
 * - 목적형 커머스: 카테고리별 검색 및 필터링
 * - 발견형 커머스: 틱톡/릴스 스타일의 세로 스와이프 피드
 * 
 * 주요 기능:
 * - 탐색: AI 추천 알고리즘 기반 숏폼 피드
 * - 마켓: 검색, 필터링, 다중 라이선스 옵션
 * - 업로드: 단건/대량 업로드, AI 제작 증빙, 저작권 서약
 * - 커뮤니티: 팁 공유, 챌린지, 프롬프트 공유
 * - 마이페이지: 구매/판매 내역, 정산 대시보드
 */

// 초기화 스크립트를 가장 먼저 import (콘솔 필터 설치)
import './init';

import { useState, useEffect } from "react";
import { Sparkles, Store, Upload as UploadIcon, MessageSquare, User, LogIn, LogOut } from "lucide-react";
import { DiscoveryFeed } from "./components/DiscoveryFeed";
import { Market } from "./components/Market";
import { Upload } from "./components/Upload";
import { Community } from "./components/Community";
import { MyPage } from "./components/MyPage";
import { ProductDetail } from "./components/ProductDetail";
import { SplashScreen } from "./components/SplashScreen";
import { AuthModal } from "./components/AuthModal";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Button } from "./components/ui/button";
import { handleBunnyError } from "./utils/bunnyErrorHandler";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { Toaster } from "./components/ui/sonner";

type Tab = "discovery" | "market" | "upload" | "community" | "mypage";

interface VideoProduct {
  id: string;
  thumbnail: string;
  title: string;
  creator: string;
  price: number;
  duration: string;
  resolution?: string;
  tool: string;
  category?: string;
  videoUrl: string;
}

function AppContent() {
  const [showSplash, setShowSplash] = useState(() => {
    // localStorage에서 마지막 방문 날짜 확인
    const lastVisitDate = localStorage.getItem('aivm_last_visit');
    const today = new Date().toDateString(); // 날짜만 비교 (시간 제외)
    
    // 오늘 처음 방문이면 스플래시 표시
    if (lastVisitDate !== today) {
      localStorage.setItem('aivm_last_visit', today);
      return true;
    }
    
    return false;
  });
  const [activeTab, setActiveTab] = useState<Tab>("market");
  const [selectedProduct, setSelectedProduct] = useState<VideoProduct | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, signOut, isAuthenticated, loading } = useAuth();

  useEffect(() => {
    document.title = "AI-V-Market | AI 영상 특화 오픈마켓";

    // Bunny.net 에러 감지를 위 전역 에러 핸들러
    const handleError = (event: ErrorEvent) => {
      // Bunny.net 관련 에러 자동 감지 및 로깅
      if (event.error) {
        handleBunnyError(event.error);
      } else if (event.message) {
        handleBunnyError({ message: event.message });
      }
    };

    // Unhandled promise rejection 핸들러
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

  // Auth 로딩 중에는 빈 화면 표시
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-2xl">AI</span>
          </div>
          <p className="text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />;
  }

  const renderContent = () => {
    switch (activeTab) {
      case "discovery":
        return <DiscoveryFeed onVideoClick={setSelectedProduct} />;
      case "market":
        return <Market onProductClick={setSelectedProduct} />;
      case "upload":
        return <Upload />;
      case "community":
        return <Community />;
      case "mypage":
        return <MyPage />;
      default:
        return <Market onProductClick={setSelectedProduct} />;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Desktop Header Navigation */}
      <header className="hidden md:block border-b border-border bg-card/50 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
              <span className="text-white font-bold text-lg">AI</span>
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] bg-clip-text text-transparent">
              AI-V-Market
            </h1>
          </div>

          {/* Desktop Navigation */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab("discovery")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === "discovery" 
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" 
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <Sparkles className="w-5 h-5" />
              <span>탐색</span>
            </button>

            <button
              onClick={() => setActiveTab("market")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === "market" 
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" 
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <Store className="w-5 h-5" />
              <span>마켓</span>
            </button>

            <button
              onClick={() => setActiveTab("upload")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === "upload" 
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" 
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <UploadIcon className="w-5 h-5" />
              <span>업로드</span>
            </button>

            <button
              onClick={() => setActiveTab("community")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === "community" 
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" 
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <MessageSquare className="w-5 h-5" />
              <span>커뮤니티</span>
            </button>

            <button
              onClick={() => setActiveTab("mypage")}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                activeTab === "mypage" 
                  ? "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white" 
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <User className="w-5 h-5" />
              <span>마이페이지</span>
            </button>

            {/* Auth Button */}
            <div className="ml-2 pl-2 border-l border-border">
              {isAuthenticated ? (
                <Button
                  onClick={signOut}
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <LogOut className="w-4 h-4" />
                  {user?.name}
                </Button>
              ) : (
                <Button
                  onClick={() => setShowAuthModal(true)}
                  className="gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]"
                  size="sm"
                >
                  <LogIn className="w-4 h-4" />
                  로그인
                </Button>
              )}
            </div>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {renderContent()}
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden border-t border-border bg-card backdrop-blur-lg bg-opacity-90">
        <div className="flex items-center justify-around h-20 px-4">
          <button
            onClick={() => setActiveTab("discovery")}
            className={`flex flex-col items-center justify-center gap-1 flex-1 transition-colors ${
              activeTab === "discovery" ? "text-[#6366f1]" : "text-muted-foreground"
            }`}
          >
            <div className="relative">
              <Sparkles className="w-6 h-6" />
              {activeTab === "discovery" && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#6366f1]" />
              )}
            </div>
            <span className="text-xs">탐색</span>
          </button>

          <button
            onClick={() => setActiveTab("market")}
            className={`flex flex-col items-center justify-center gap-1 flex-1 transition-colors ${
              activeTab === "market" ? "text-[#6366f1]" : "text-muted-foreground"
            }`}
          >
            <div className="relative">
              <Store className="w-6 h-6" />
              {activeTab === "market" && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#6366f1]" />
              )}
            </div>
            <span className="text-xs">마켓</span>
          </button>

          <button
            onClick={() => setActiveTab("upload")}
            className="relative -mt-6"
          >
            <div className="w-14 h-14 rounded-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-lg shadow-[#6366f1]/50">
              <UploadIcon className="w-7 h-7 text-white" />
            </div>
          </button>

          <button
            onClick={() => setActiveTab("community")}
            className={`flex flex-col items-center justify-center gap-1 flex-1 transition-colors ${
              activeTab === "community" ? "text-[#6366f1]" : "text-muted-foreground"
            }`}
          >
            <div className="relative">
              <MessageSquare className="w-6 h-6" />
              {activeTab === "community" && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#6366f1]" />
              )}
            </div>
            <span className="text-xs">커뮤니티</span>
          </button>

          <button
            onClick={() => setActiveTab("mypage")}
            className={`flex flex-col items-center justify-center gap-1 flex-1 transition-colors ${
              activeTab === "mypage" ? "text-[#6366f1]" : "text-muted-foreground"
            }`}
          >
            <div className="relative">
              <User className="w-6 h-6" />
              {activeTab === "mypage" && (
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#6366f1]" />
              )}
            </div>
            <span className="text-xs">마이</span>
          </button>
        </div>
      </nav>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <ProductDetail
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
        />
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} />
      )}

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