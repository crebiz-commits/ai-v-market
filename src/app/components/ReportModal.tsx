// ════════════════════════════════════════════════════════════════════════════
// 신고 모달 — 공통 컴포넌트 (Phase 10)
//
// 사용처:
//   - ProductDetail: 영상 신고
//   - CommentPanel: 댓글 신고
//   - CreatorChannel: 사용자 신고
//   - Community: 커뮤니티 글 신고
//
// 사용 예:
//   <ReportModal
//     open={open}
//     targetType="video"
//     targetId={videoId}
//     targetTitle={videoTitle}
//     onClose={() => setOpen(false)}
//   />
// ════════════════════════════════════════════════════════════════════════════
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, Flag } from "lucide-react";
import { Button } from "./ui/button";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export type ReportTargetType = "video" | "comment" | "user" | "community_post";

interface ReportModalProps {
  open: boolean;
  targetType: ReportTargetType;
  targetId: string;
  targetTitle?: string;       // "이 영상", "이 댓글" 등 표시용
  onClose: () => void;
  onSignInClick?: () => void;
}

const REASON_KEYS: Array<{ key: string; icon: string }> = [
  { key: "spam", icon: "🚫" },
  { key: "inappropriate", icon: "🔞" },
  { key: "copyright", icon: "©️" },
  { key: "violence", icon: "⚠️" },
  { key: "harassment", icon: "😡" },
  { key: "misinformation", icon: "📰" },
  { key: "other", icon: "💬" },
];

export function ReportModal({
  open,
  targetType,
  targetId,
  targetTitle,
  onClose,
  onSignInClick,
}: ReportModalProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!isAuthenticated) {
      onSignInClick?.();
      onClose();
      return;
    }
    if (!selectedReason) {
      toast.error(t("reportModal.reasonRequired"));
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("create_report", {
        p_target_type: targetType,
        p_target_id: targetId,
        p_reason: selectedReason,
        p_description: description.trim() || null,
      });

      if (error) {
        // 중복 신고는 unique index 위반 에러
        if (error.code === "23505" || error.message?.includes("duplicate")) {
          toast.error(t("reportModal.alreadyReported"));
        } else {
          toast.error(t("reportModal.submitFailed") + " " + error.message);
        }
        setSubmitting(false);
        return;
      }

      toast.success(t("reportModal.submitSuccess"));
      setSelectedReason(null);
      setDescription("");
      onClose();
    } catch (err: any) {
      toast.error(t("reportModal.submitFailed") + " " + (err?.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[150]"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-[151] mx-auto max-w-md max-h-[85vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-red-400" />
                <div>
                  <h3 className="font-bold text-base">{t("reportModal.title")}</h3>
                  {targetTitle && (
                    <p className="text-xs text-muted-foreground truncate max-w-[260px]">{targetTitle}</p>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t("reportModal.subtitle")}
              </p>

              <div className="space-y-2">
                {REASON_KEYS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setSelectedReason(r.key)}
                    className={`w-full p-3 rounded-lg border-2 text-left transition-all flex items-start gap-3 ${
                      selectedReason === r.key
                        ? "border-red-400 bg-red-500/10"
                        : "border-border hover:border-red-400/40"
                    }`}
                  >
                    <span className="text-xl flex-shrink-0">{r.icon}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm">{t(`reportModal.reason${r.key.charAt(0).toUpperCase()}${r.key.slice(1)}`)}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* 상세 설명 (선택) */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  {t("reportModal.details")}
                </label>
                <textarea
                  className="input-base min-h-[80px] w-full"
                  placeholder={t("reportModal.detailsPlaceholder")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={500}
                />
                <p className="text-[10px] text-muted-foreground text-right mt-0.5">
                  {description.length}/500
                </p>
              </div>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  {t("reportModal.warningNote")}
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-card border-t border-border p-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                {t("reportModal.cancel")}
              </Button>
              <Button
                className="flex-1 gap-2 bg-red-500 hover:bg-red-600 text-white"
                onClick={handleSubmit}
                disabled={submitting || !selectedReason}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t("reportModal.submitting")}
                  </>
                ) : (
                  <>
                    <Flag className="w-4 h-4" />
                    {t("reportModal.submit")}
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
