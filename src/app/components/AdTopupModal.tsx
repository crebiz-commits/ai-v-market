// ════════════════════════════════════════════════════════════════════════════
// 광고 예산 충전 모달 — 광고주 셀프서비스 Phase 3
//   승인된 광고에 예산 충전. 기존 ad_budget Toss 결제(usePayment.startAdBudgetTopUp) 재사용.
//   결제 완료 → /?payment=success → PaymentResult → confirm_payment 가 budget_krw 증액.
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { usePayment } from "../hooks/usePayment";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  adId: string;
  adTitle: string;
  cpm?: number;        // ₩/노출 환산 표시용 (기본 2 = CPM 2000)
  onClose: () => void;
}

const PRESETS = [10000, 30000, 50000, 100000];
const MIN = 10000;

export function AdTopupModal({ open, adId, adTitle, cpm = 2, onClose }: Props) {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const { startAdBudgetTopUp } = usePayment();
  const isKo = (i18n.language || "en").startsWith("ko");
  const [amount, setAmount] = useState<number>(30000);
  const [busy, setBusy] = useState(false);

  const estImpressions = cpm > 0 ? Math.floor(amount / cpm) : 0;

  const pay = async () => {
    if (amount < MIN) { toast.error(isKo ? `최소 충전액은 ₩${MIN.toLocaleString()} 입니다.` : `Minimum ₩${MIN.toLocaleString()}.`); return; }
    setBusy(true);
    try {
      await startAdBudgetTopUp({ adId, amount, adTitle, email: user?.email, name: (user as any)?.name });
      // Toss 결제창으로 이동 — 이후 코드 실행 안 됨
    } catch (e: any) {
      setBusy(false);
      if (e?.code !== "USER_CANCEL") toast.error((isKo ? "오류: " : "Error: ") + (e?.message || ""));
    }
  };

  const inputCls = "w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-[#8b5cf6]";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose} className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]" />
          <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }} transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[151] mx-auto max-w-sm bg-card border border-border rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#a78bfa]" />
                <h3 className="font-bold text-base">{isKo ? "예산 충전" : "Top up budget"}</h3>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-400 truncate">「{adTitle}」</p>

              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <button key={p} onClick={() => setAmount(p)}
                    className={`py-2.5 rounded-lg text-sm font-bold border transition-colors ${amount === p ? "bg-[#8b5cf6] text-white border-[#8b5cf6]" : "bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"}`}>
                    ₩{p.toLocaleString()}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 mb-1.5">{isKo ? "직접 입력 (₩)" : "Custom (₩)"}</label>
                <input type="number" min={MIN} step={1000} value={amount}
                  onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value || "0", 10)))} className={inputCls} />
              </div>

              <div className="text-[11px] text-gray-500 bg-white/5 rounded-lg px-3 py-2 leading-relaxed">
                {isKo ? `예상 노출 약 ${estImpressions.toLocaleString()}회 (노출당 ₩${cpm}). 충전 후 즉시 노출에 반영됩니다.`
                      : `~${estImpressions.toLocaleString()} impressions (₩${cpm}/imp). Applied immediately.`}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-border">
              <Button onClick={pay} disabled={busy || amount < MIN}
                className="w-full h-12 gap-2 bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] text-white font-black">
                {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{isKo ? `₩${amount.toLocaleString()} 충전하기` : `Top up ₩${amount.toLocaleString()}`}</>}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
