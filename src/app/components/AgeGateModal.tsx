// ════════════════════════════════════════════════════════════════════════════
// 연령 게이트 모달 (Phase 26)
// 19+ 영상 진입 시 본인 인증 (MVP: 생일 자가 입력)
// 인증 결과 onResult(verified) 콜백으로 전달
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { X, Lock, AlertTriangle, Loader2, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

interface AgeGateModalProps {
  open: boolean;
  onClose: () => void;
  onResult?: (verified: boolean) => void;
}

export function AgeGateModal({ open, onClose, onResult }: AgeGateModalProps) {
  const { isAuthenticated, refreshProfile } = useAuth();
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [day, setDay] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleVerify = async () => {
    if (!isAuthenticated) {
      toast.error("로그인이 필요합니다.");
      return;
    }
    const y = parseInt(year, 10);
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (!y || !m || !d || y < 1900 || y > new Date().getFullYear() || m < 1 || m > 12 || d < 1 || d > 31) {
      toast.error("올바른 생년월일을 입력해주세요.");
      return;
    }
    const birthdate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("verify_my_age", { p_birthdate: birthdate });
      if (error) throw error;
      const result = Array.isArray(data) && data[0] ? data[0] : null;
      if (result?.verified) {
        toast.success(result.message || "본인 인증 완료");
        await refreshProfile();
        onResult?.(true);
        onClose();
      } else {
        toast.error(result?.message || "만 19세 미만은 시청할 수 없습니다.");
        onResult?.(false);
      }
    } catch (e: any) {
      console.error("[AgeGate] verify error:", e);
      toast.error(e?.message || "인증에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.92, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.92, y: 20 }}
          onClick={e => e.stopPropagation()}
          className="bg-[#111] rounded-2xl border-2 border-red-500/30 shadow-2xl w-full max-w-md overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600/20 to-rose-600/20 px-5 py-4 border-b border-red-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-red-600 flex items-center justify-center">
                <Lock className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">19+ 콘텐츠 인증</h2>
                <p className="text-[11px] text-red-300/80">성인 콘텐츠를 시청하시려면 본인 인증이 필요합니다</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-200/90 leading-relaxed">
                만 19세 이상만 19+ 콘텐츠를 시청할 수 있습니다.<br />
                <span className="text-amber-200/60">정확한 생년월일을 입력해주세요. 허위 입력 시 서비스 이용이 제한될 수 있습니다.</span>
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 mb-2 block flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                생년월일
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="numeric"
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  placeholder="1990"
                  maxLength={4}
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-400"
                />
                <span className="self-center text-gray-500 text-xs">년</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  placeholder="01"
                  maxLength={2}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-400 text-center"
                />
                <span className="self-center text-gray-500 text-xs">월</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={day}
                  onChange={e => setDay(e.target.value)}
                  placeholder="01"
                  maxLength={2}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-400 text-center"
                />
                <span className="self-center text-gray-500 text-xs">일</span>
              </div>
            </div>

            <p className="text-[10px] text-gray-600 leading-relaxed">
              ※ 입력한 생년월일은 본인 인증 및 연령 제한 콘텐츠 보호 목적으로만 사용됩니다.
              개인정보처리방침에 따라 안전하게 보관됩니다.
            </p>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 py-4 border-t border-white/10 bg-[#0a0a0a]">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 bg-white/5 text-gray-300 border-white/10 hover:bg-white/10"
              disabled={submitting}
            >
              취소
            </Button>
            <Button
              onClick={handleVerify}
              disabled={submitting || !year || !month || !day}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              인증하기
            </Button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
