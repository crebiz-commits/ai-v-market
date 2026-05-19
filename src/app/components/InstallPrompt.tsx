import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Download, X, Smartphone, Share2, Plus, Check } from "lucide-react";
import { Button } from "./ui/button";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { useTranslation } from "react-i18next";

const DISMISS_KEY = "creaite_install_banner_dismissed";
const DISMISS_DAYS = 7;

// ──────────────────────────────────────────────
// 데스크탑 헤더용 작은 설치 버튼
// ──────────────────────────────────────────────
export function InstallButtonHeader() {
  const { t } = useTranslation();
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
        {t("installPrompt.install")}
      </motion.button>

      <IOSInstallGuideModal open={showIOSGuide} onClose={() => setShowIOSGuide(false)} />
    </>
  );
}

// ──────────────────────────────────────────────
// 모바일 하단 슬라이드인 배너 (첫 방문자용)
// ──────────────────────────────────────────────
export function InstallBannerMobile() {
  const { t } = useTranslation();
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
              aria-label={t("common.close")}
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3 pr-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm mb-0.5">{t("installPrompt.title")}</p>
                <p className="text-xs text-muted-foreground mb-2">
                  {t("installPrompt.description")}
                </p>
                {!isIOSSafari && (
                  <p className="text-[11px] text-amber-300/80 mb-2 leading-relaxed">
                    💡 Installation may take 1–3 min on Android (a real WebAPK is generated).
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleInstall}
                    className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-xs h-8 px-3"
                  >
                    {t("installPrompt.install")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={dismiss}
                    className="text-xs h-8 px-3 text-muted-foreground"
                  >
                    {t("installPrompt.later")}
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
  const { t } = useTranslation();
  const { canShowInstall, canInstallProgrammatic, isInstalled, isIOS, isIOSSafari, isAndroid, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  const platformLabel = isIOS ? "iOS" : isAndroid ? "Android" : "Desktop";

  return (
    <>
      <div className="bg-gradient-to-br from-[#1a1a1c] to-[#0f0f12] rounded-2xl border border-[#6366f1]/20 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-bold">{t("installPrompt.guideTitle")}</h3>
            <p className="text-xs text-muted-foreground">Platform: {platformLabel}</p>
          </div>
        </div>

        {isInstalled ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-[#10b981]/10 border border-[#10b981]/30">
            <Check className="w-5 h-5 text-[#10b981]" />
            <p className="text-sm font-medium text-[#10b981]">{t("installPrompt.guideInstalled")}</p>
          </div>
        ) : (
          <>
            <ul className="space-y-2 text-sm text-muted-foreground mb-4">
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                <span>Launch in 1 second from home screen</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                <span>Fullscreen — no browser address bar</span>
              </li>
              <li className="flex items-start gap-2">
                <Check className="w-4 h-4 text-[#10b981] mt-0.5 flex-shrink-0" />
                <span>Auto-updates — no app store review</span>
              </li>
            </ul>

            {/* Android 사용자에게 설치 시간 안내 */}
            {isAndroid && canInstallProgrammatic && (
              <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                <p className="text-xs text-amber-100/90 leading-relaxed">
                  💡 <strong>Installation may take 1–3 minutes.</strong>
                  Android Chrome generates a real WebAPK from Google's servers. You can use other apps during install; it continues in the background.
                </p>
              </div>
            )}

            {canInstallProgrammatic ? (
              <Button
                onClick={() => install()}
                className="w-full bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] gap-2"
              >
                <Download className="w-4 h-4" />
                {t("installPrompt.install")}
              </Button>
            ) : isIOSSafari ? (
              <Button
                onClick={() => setShowIOSGuide(true)}
                variant="outline"
                className="w-full gap-2 border-[#6366f1]/40"
              >
                <Smartphone className="w-4 h-4" />
                {t("installPrompt.ios")}
              </Button>
            ) : isIOS ? (
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-100/90">
                On iOS, you must access via <strong>Safari</strong>. In-app browsers (Chrome, Firefox, KakaoTalk, etc.) are not supported.
              </div>
            ) : !canShowInstall ? (
              <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-xs text-muted-foreground">
                Current browser does not support PWA installation. Use the latest Chrome / Edge / Safari to see the install option.
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
  const { t } = useTranslation();
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
              aria-label={t("common.close")}
            >
              <X className="w-4 h-4" />
            </button>
            <h3 className="font-bold text-lg mb-1">📱 Install on iOS</h3>
            <p className="text-xs text-muted-foreground mb-5">
              Install in 3 steps from Safari. (Instant.)
            </p>

            <ol className="space-y-4">
              <li className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6366f1]/20 border border-[#6366f1]/40 flex items-center justify-center text-sm font-bold text-[#a78bfa] flex-shrink-0">1</div>
                <div>
                  <p className="text-sm font-semibold mb-0.5 flex items-center gap-2">
                    Tap the <Share2 className="w-4 h-4 inline" /> share button at bottom
                  </p>
                  <p className="text-xs text-muted-foreground">Square + arrow icon at Safari's bottom center</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6366f1]/20 border border-[#6366f1]/40 flex items-center justify-center text-sm font-bold text-[#a78bfa] flex-shrink-0">2</div>
                <div>
                  <p className="text-sm font-semibold mb-0.5 flex items-center gap-2">
                    Select "<Plus className="w-3 h-3 inline" /> Add to Home Screen"
                  </p>
                  <p className="text-xs text-muted-foreground">Scroll the menu down to find it</p>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-[#6366f1]/20 border border-[#6366f1]/40 flex items-center justify-center text-sm font-bold text-[#a78bfa] flex-shrink-0">3</div>
                <div>
                  <p className="text-sm font-semibold mb-0.5">Tap "Add" at top right</p>
                  <p className="text-xs text-muted-foreground">CREAITE icon will appear on your home screen</p>
                </div>
              </li>
            </ol>

            <div className="mt-5 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-xs text-amber-100/90 leading-relaxed">
                <strong>Important:</strong> Installation only works in <strong>Safari</strong>. Chrome, Firefox, KakaoTalk, Instagram in-app browsers etc. are not supported.
              </p>
            </div>

            <Button onClick={onClose} className="w-full mt-5 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6]">
              {t("common.confirm")}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
