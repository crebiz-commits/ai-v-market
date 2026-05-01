import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Download, X, Smartphone, Share2, Plus, Check } from "lucide-react";
import { Button } from "./ui/button";
import { usePWAInstall } from "../hooks/usePWAInstall";

const DISMISS_KEY = "creaite_install_banner_dismissed";
const DISMISS_DAYS = 7;

// ──────────────────────────────────────────────
// 데스크탑 헤더용 작은 설치 버튼
// ──────────────────────────────────────────────
export function InstallButtonHeader() {
  const { canShowInstall, canInstallProgrammatic, install, isIOSSafari } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (!canShowInstall) return null;

  const handleClick = async () => {
    if (canInstallProgrammatic) {
      await install();
    } else if (isIOSSafari) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <motion.button
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleClick}
        className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-[#6366f1]/15 to-[#8b5cf6]/15 border border-[#6366f1]/30 text-sm font-semibold text-[#a78bfa] hover:from-[#6366f1]/25 hover:to-[#8b5cf6]/25 transition-colors"
      >
        <Download className="w-4 h-4" />
        앱 설치
      </motion.button>

      <IOSInstallGuideModal open={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    </>
  );
}

// ──────────────────────────────────────────────
// 모바일 하단 슬라이드인 배너 (첫 방문자용)
// ──────────────────────────────────────────────
export function InstallBannerMobile() {
  const { canShowInstall, canInstallProgrammatic, install, isIOSSafari } = usePWAInstall();
  const [show, setShow] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (!canShowInstall) {
      setShow(false);
      return;
    }
    // 7일 이내 닫은 적 있으면 안 보이게
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt) {
      const days = (Date.now() - parseInt(dismissedAt, 10)) / (1000 * 60 * 60 * 24);
      if (days < DISMISS_DAYS) {
        setShow(false);
        return;
      }
    }
    // 첫 진입 후 6초 뒤에 슬라이드인 (덜 방해되게)
    const t = setTimeout(() => setShow(true), 6000);
    return () => clearTimeout(t);
  }, [canShowInstall]);

  const dismiss = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  const handleInstall = async () => {
    if (canInstallProgrammatic) {
      const ok = await install();
      if (ok) setShow(false);
    } else if (isIOSSafari) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ y: 200, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 200, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="md:hidden fixed left-3 right-3 bottom-24 z-40 rounded-2xl bg-gradient-to-br from-[#1a1a1c] to-[#0f0f12] border border-[#6366f1]/30 shadow-[0_-10px_40px_rgba(99,102,241,0.3)] p-4"
          >
            <button
              onClick={dismiss}
              className="absolute top-2 right-2 w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-muted-foreground"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm mb-0.5">CREAITE를 앱처럼 사용하기</p>
                <p className="text-xs text-muted-foreground mb-3">
                  더 빠른 로딩 · 홈 화면 바로가기 · 자동 업데이트
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleInstall}
                    className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-xs h-8 px-3"
                  >
                    {isIOSSafari ? "설치 방법 보기" : "지금 설치"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={dismiss}
                    className="text-xs h-8 px-3 text-muted-foreground"
                  >
                    나중에
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <IOSInstallGuideModal open={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    </>
  );
}

// ──────────────────────────────────────────────
// MyPage용 상세 안내 카드
// ──────────────────────────────────────────────
export function InstallGuideCard() {
  const { canShowInstall, canInstallProgrammatic, isInstalled, isIOS, isIOSSafari, isAndroid, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const platformLabel = isIOS ? "iOS" : isAndroid ? "Android" : "데스크탑";

  return (
    <>
      <div className="bg-gradient-to-br from-[#1a1a1c] to-[#0f0f12] rounded-2xl border border-[#6366f1]/20 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold">앱으로 사용하기</h3>
            <p className="text-xs text-muted-foreground">현재 환경: {platformLabel}</p>
          </div>
        </div>

        {isInstalled ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[#10b981]/10 border border-[#10b981]/30">
            <Check className="w-5 h-5 text-[#10b981]" />
            <p className="text-sm font-medium text-[#10b981]">이미 앱으로 설치되어 사용 중입니다</p>
          </div>
        ) : (
          <>
            <ul className="space-y-2 text-sm text-muted-foreground mb-4">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                <span>홈 화면 바로가기로 1초 만에 실행</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                <span>풀스크린 — 브라우저 주소창 없이 깔끔하게</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                <span>업데이트 자동 적용 — 앱스토어 심사 X</span>
              </li>
            </ul>

            {canInstallProgrammatic ? (
              <Button
                onClick={() => install()}
                className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] gap-2"
              >
                <Download className="w-4 h-4" />
                지금 설치
              </Button>
            ) : isIOSSafari ? (
              <Button
                onClick={() => setShowIOSGuide(true)}
                variant="outline"
                className="w-full gap-2 border-[#6366f1]/40"
              >
                <Smartphone className="w-4 h-4" />
                iOS 설치 방법 보기
              </Button>
            ) : isIOS ? (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-100/90">
                iOS에서는 <strong>Safari 브라우저</strong>로 접속해야 설치 가능합니다.
                Chrome·Firefox 등 다른 앱 내 브라우저는 미지원.
              </div>
            ) : !canShowInstall ? (
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground">
                현재 브라우저는 PWA 설치를 지원하지 않거나, 이미 설치 가능 조건을 만족하지 않습니다.
                Chrome·Edge·Safari 최신 버전을 사용하시면 설치 옵션이 나타납니다.
              </div>
            ) : null}
          </>
        )}
      </div>

      <IOSInstallGuideModal open={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    </>
  );
}

// ──────────────────────────────────────────────
// iOS Safari 수동 설치 안내 모달 (공통)
// ──────────────────────────────────────────────
function IOSInstallGuideModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
        >
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1a1a1c] rounded-2xl border border-white/10 max-w-md w-full p-6 relative"
          >
            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"
              aria-label="닫기"
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-lg mb-1">📱 iOS에서 설치하기</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Safari 브라우저에서 아래 3단계로 설치하세요.
            </p>

            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6366f1]/20 border border-[#6366f1]/40 flex items-center justify-center text-sm font-bold text-[#a78bfa] flex-shrink-0">1</div>
                <div>
                  <p className="text-sm font-semibold mb-0.5 flex items-center gap-2">
                    하단 <Share2 className="w-4 h-4 inline" /> 공유 버튼 탭
                  </p>
                  <p className="text-xs text-muted-foreground">Safari 화면 하단 중앙의 사각형+화살표 아이콘</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6366f1]/20 border border-[#6366f1]/40 flex items-center justify-center text-sm font-bold text-[#a78bfa] flex-shrink-0">2</div>
                <div>
                  <p className="text-sm font-semibold mb-0.5 flex items-center gap-2">
                    "<Plus className="w-3 h-3 inline" /> 홈 화면에 추가" 선택
                  </p>
                  <p className="text-xs text-muted-foreground">메뉴를 아래로 스크롤하면 보입니다</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6366f1]/20 border border-[#6366f1]/40 flex items-center justify-center text-sm font-bold text-[#a78bfa] flex-shrink-0">3</div>
                <div>
                  <p className="text-sm font-semibold mb-0.5">우측 상단 "추가" 탭</p>
                  <p className="text-xs text-muted-foreground">홈 화면에 CREAITE 아이콘이 추가됩니다</p>
                </div>
              </li>
            </ol>

            <div className="mt-5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-xs text-amber-100/90 leading-relaxed">
                <strong>중요:</strong> Chrome·Firefox 등 다른 브라우저나 카카오톡·인스타그램 인앱 브라우저에서는 설치가 안 됩니다. <strong>반드시 Safari 앱</strong>으로 접속해주세요.
              </p>
            </div>

            <Button onClick={onClose} className="w-full mt-5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
              확인
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
