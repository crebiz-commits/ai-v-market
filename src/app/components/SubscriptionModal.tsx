import { useState } from "react";
import { Crown, Check, X, LogIn, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "./ui/button";
import { useAuth } from "../contexts/AuthContext";
import { usePayment } from "../hooks/usePayment";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { isAppWrapper, openWebSubscribe } from "../utils/appWrapper";

export type PaywallReason = "ott_block" | "cinema_cutoff" | "upgrade";

interface SubscriptionModalProps {
  open: boolean;
  reason: PaywallReason;
  onClose: () => void;
  onSignInClick?: () => void;
}

/**
 * 페이월 / 구독 안내 모달. CTA 클릭 시 usePayment().startSubscription 으로 실제 토스 결제 시작.
 *
 * reason 별 카피 (결제 동작은 동일):
 * - "ott_block": OTT 영상을 비구독자가 재생 시도할 때 (즉시 차단)
 * - "cinema_cutoff": 시네마 영상 미리보기 컷오프 도달 시
 * - "upgrade": 마이페이지 등 능동적 구독 진입 (일반 안내)
 */
export function SubscriptionModal({
  open,
  reason,
  onClose,
  onSignInClick,
}: SubscriptionModalProps) {
  const { t, i18n } = useTranslation();
  const isKo = (i18n.language || "en").startsWith("ko");
  const { isAuthenticated, user } = useAuth();
  const { startAutoBilling } = usePayment();
  const [paying, setPaying] = useState(false);

  const messages = {
    ott_block: {
      title: t("productDetail.paywall.premiumOtt"),
      subtitle: t("subscriptionModal.reasonOttBlock"),
    },
    cinema_cutoff: {
      title: t("productDetail.paywall.previewEnded"),
      subtitle: t("subscriptionModal.reasonCinemaCutoff"),
    },
    upgrade: {
      title: t("subscriptionModal.title"),
      subtitle: t("subscriptionModal.subtitle"),
    },
  };

  const msg = messages[reason];

  const handleSubscribe = async () => {
    if (!isAuthenticated) {
      onSignInClick?.();
      onClose();
      return;
    }

    if (!user?.id) return;

    // 리더앱: 네이티브 앱 안에서는 IAP 수수료 회피를 위해 인앱 결제 대신 웹으로 유도
    if (isAppWrapper()) {
      toast.info(t("subscription.subscribeOnWeb", "구독 결제는 웹(creaite.net)에서 진행됩니다. 브라우저로 이동합니다."));
      openWebSubscribe();
      onClose();
      return;
    }

    setPaying(true);
    try {
      await startAutoBilling({ customerKey: user.id, email: user?.email });
      // 성공 시 토스 카드 등록 페이지로 이동 — 여기 이후 코드는 실행 안 됨
    } catch (err: any) {
      // 사용자가 결제창에서 취소하거나 SDK 오류
      if (err?.code === "PAYMENTS_DISABLED") {
        // B-2: 결제 게이트 — 안내 토스트는 usePayment 에서 이미 표시됨
      } else if (err?.code === "USER_CANCEL") {
        toast.info(t("productDetail.toast.paymentCanceled"));
      } else {
        toast.error(t("productDetail.toast.paymentFailed") + (err?.message || t("productDetail.toast.unknownError")));
      }
      setPaying(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[101] mx-auto max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-[#1a1a1c] to-[#0f0f10] rounded-2xl border border-amber-500/20 shadow-2xl overflow-hidden">
              {/* Header — 그라디언트 배경 */}
              <div className="relative bg-gradient-to-br from-amber-500/20 via-orange-500/10 to-[#6366f1]/20 px-6 pt-8 pb-6 overflow-hidden">
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-400 transition-colors"
                  aria-label={t("common.close")}
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-xl">
                    <Crown className="w-8 h-8 text-white" />
                  </div>
                </div>

                <h2 className="text-2xl font-black text-white text-center mb-2">
                  {msg.title}
                </h2>
                <p className="text-sm text-gray-300 text-center leading-relaxed px-2">
                  {msg.subtitle}
                </p>
              </div>

              {/* Body — 혜택 리스트 */}
              <div className="px-6 py-6">
                <div className="bg-[#0a0a0a] border border-white/5 rounded-xl p-5 mb-5">
                  <div className="flex items-baseline justify-between mb-1">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">CREAITE PREMIUM</span>
                  </div>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-black text-white">₩4,900</span>
                    <span className="text-sm text-gray-500 font-medium">{t("subscriptionModal.perMonth")}</span>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      t("subscriptionModal.benefit1"),
                      t("subscriptionModal.benefit2"),
                      t("subscriptionModal.benefit3"),
                      t("subscriptionModal.benefit4"),
                    ].map((benefit, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
                          <Check className="w-3 h-3 text-amber-400" />
                        </div>
                        <span className="text-sm text-gray-300">{benefit}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA 버튼 */}
                <Button
                  onClick={handleSubscribe}
                  disabled={paying}
                  className="w-full h-12 gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white font-black text-base shadow-lg shadow-amber-500/20 rounded-xl border border-white/10 disabled:opacity-60"
                >
                  {paying ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {t("subscriptionModal.openingPayment")}
                    </>
                  ) : isAuthenticated ? (
                    <>
                      <Crown className="w-5 h-5" />
                      {isAppWrapper() ? t("subscription.subscribeOnWebCTA", "웹에서 구독하기") : t("subscriptionModal.subscribeCTA")}
                    </>
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" />
                      {t("subscriptionModal.signInToSubscribe")}
                    </>
                  )}
                </Button>

                {/* 전자상거래법 — 결제 전 정기결제·청약철회 고지 */}
                <p className="text-[10px] text-gray-500 text-center mt-2 leading-relaxed">
                  {isKo
                    ? "매월 ₩4,900 자동결제(정기결제) · 언제든 해지 가능. 청약철회·환불은 "
                    : "₩4,900/mo recurring · cancel anytime. Refund & withdrawal: "}
                  <a href="?info=terms" className="underline hover:text-gray-300">
                    {isKo ? "이용약관 제7조" : "Terms §7"}
                  </a>
                  {isKo ? " 참조." : "."}
                </p>

                <button
                  onClick={onClose}
                  className="w-full mt-3 text-sm text-gray-500 hover:text-gray-300 font-medium transition-colors py-2"
                >
                  {t("subscriptionModal.later")}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
