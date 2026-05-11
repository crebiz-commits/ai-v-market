import { Crown, Check, X, LogIn } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "./ui/button";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export type PaywallReason = "ott_block" | "cinema_cutoff";

interface SubscriptionModalProps {
  open: boolean;
  reason: PaywallReason;
  onClose: () => void;
  onSignInClick?: () => void;
}

/**
 * 페이월 구독 안내 모달.
 *
 * 두 가지 reason:
 * - "ott_block": OTT 영상 (10분+)을 비구독자가 재생 시도할 때 (즉시 차단)
 * - "cinema_cutoff": 시네마 영상 (3분~10분)이 비구독자에게 3분 도달 시 (재생 중단)
 *
 * Phase 4 (현재): 구독 안내 + "준비 중" 알림. Phase 5에서 실제 결제 연동 예정.
 */
export function SubscriptionModal({
  open,
  reason,
  onClose,
  onSignInClick,
}: SubscriptionModalProps) {
  const { isAuthenticated } = useAuth();

  const messages = {
    ott_block: {
      title: "프리미엄 OTT 콘텐츠",
      subtitle: "10분 이상 시네마틱 작품을 시청하려면 구독이 필요합니다.",
    },
    cinema_cutoff: {
      title: "미리보기가 끝났어요",
      subtitle: "구독하시면 이 영상의 전체를 시청할 수 있습니다.",
    },
  };

  const msg = messages[reason];

  const handleSubscribe = () => {
    if (!isAuthenticated) {
      onSignInClick?.();
      onClose();
      return;
    }
    // TODO Phase 5: 실제 결제 모달/페이지로 이동
    toast.info("구독 결제는 곧 출시됩니다. 잠시만 기다려주세요!");
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
                  aria-label="닫기"
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
                    <span className="text-sm text-gray-500 font-medium">/ 월</span>
                  </div>

                  <div className="space-y-2.5">
                    {[
                      "홈 / 시네마 / OTT 모든 영상 무제한",
                      "10분 이상 시네마틱 작품 풀 시청",
                      "광고 없이 깔끔한 시청 경험",
                      "언제든 해지 가능",
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
                  className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-90 text-white font-black text-base shadow-lg shadow-amber-500/20 rounded-xl border border-white/10"
                >
                  {isAuthenticated ? (
                    <>
                      <Crown className="w-5 h-5" />
                      구독하기 — 월 ₩4,900
                    </>
                  ) : (
                    <>
                      <LogIn className="w-5 h-5" />
                      로그인하고 구독하기
                    </>
                  )}
                </Button>

                <button
                  onClick={onClose}
                  className="w-full mt-3 text-sm text-gray-500 hover:text-gray-300 font-medium transition-colors py-2"
                >
                  나중에 보기
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
