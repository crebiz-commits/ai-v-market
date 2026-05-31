import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Bell, X, Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { useAuth } from "../contexts/AuthContext";
import { isPushSupported, isPushSubscribed, subscribeToPush } from "../utils/webPush";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

// 카톡처럼 — 로그인하면 자동으로 한 번 뜨는 푸시 권한 프롬프트.
// 설정에 들어가 토글을 직접 켤 필요 없이, 한 번 탭하면 구독 완료.
const DISMISS_KEY = "creaite_push_prompt_dismissed";
const DISMISS_DAYS = 14; // 닫으면 2주간 다시 안 뜸 (구독 성공 시 영구 안 뜸)

export function PushPrompt() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !isPushSupported()) {
      setShow(false);
      return;
    }
    // 이미 거부한 기기는 브라우저가 재요청을 막으므로 노출 안 함
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return;
    // 최근에 닫았으면 노출 안 함
    const dismissedAt = localStorage.getItem(DISMISS_KEY);
    if (dismissedAt && (Date.now() - parseInt(dismissedAt, 10)) / 86400000 < DISMISS_DAYS) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;
    // 이미 구독돼 있으면 안 띄움
    isPushSubscribed()
      .then((subbed) => {
        if (cancelled || subbed) return;
        // 로그인 직후 잠깐 뒤에 노출 (덜 방해되게)
        timer = setTimeout(() => setShow(true), 3500);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isAuthenticated]);

  const enable = async () => {
    setBusy(true);
    try {
      await subscribeToPush();
      toast.success(t("pushPrompt.enabled", "알림을 켰습니다. 새 소식을 바로 받아보세요."));
      setShow(false);
      localStorage.setItem(DISMISS_KEY, Date.now().toString());
    } catch (err: any) {
      toast.error(err?.message || t("pushPrompt.failed", "알림 설정에 실패했습니다."));
    } finally {
      setBusy(false);
    }
  };

  const later = () => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 120, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 120, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed left-3 right-3 bottom-40 md:left-auto md:right-6 md:bottom-6 md:w-96 z-40 rounded-2xl bg-gradient-to-br from-[#1a1a1c] to-[#0f0f12] border border-[#6366f1]/30 shadow-[0_-10px_40px_rgba(99,102,241,0.3)] p-4"
        >
          <button
            onClick={later}
            className="absolute top-2 right-2 w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-muted-foreground"
            aria-label={t("common.close", "닫기")}
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3 pr-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center flex-shrink-0">
              <Bell className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm mb-0.5">{t("pushPrompt.title", "알림 받기")}</p>
              <p className="text-xs text-muted-foreground mb-2 leading-relaxed">
                {t("pushPrompt.description", "답글·공지·결제 등 새 소식을 잠금화면에서 바로 받아보세요.")}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={enable}
                  disabled={busy}
                  className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white text-xs h-8 px-3 gap-1.5"
                >
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bell className="w-3.5 h-3.5" />}
                  {t("pushPrompt.enable", "알림 켜기")}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={later}
                  className="text-xs h-8 px-3 text-muted-foreground"
                >
                  {t("pushPrompt.later", "나중에")}
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
