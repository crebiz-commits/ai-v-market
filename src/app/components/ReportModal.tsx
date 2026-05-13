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

export type ReportTargetType = "video" | "comment" | "user" | "community_post";

interface ReportModalProps {
  open: boolean;
  targetType: ReportTargetType;
  targetId: string;
  targetTitle?: string;       // "이 영상", "이 댓글" 등 표시용
  onClose: () => void;
  onSignInClick?: () => void;
}

const REASONS: Array<{ key: string; label: string; icon: string; desc: string }> = [
  { key: "spam", label: "스팸 / 광고", icon: "🚫", desc: "광고성 또는 반복적인 콘텐츠" },
  { key: "inappropriate", label: "음란물 / 성적 내용", icon: "🔞", desc: "성적이거나 부적절한 콘텐츠" },
  { key: "copyright", label: "저작권 침해", icon: "©️", desc: "타인의 저작물을 무단 사용" },
  { key: "violence", label: "폭력 / 위험한 행위", icon: "⚠️", desc: "폭력적이거나 위험한 행동" },
  { key: "harassment", label: "괴롭힘 / 혐오", icon: "😡", desc: "특정 인물·집단에 대한 공격" },
  { key: "misinformation", label: "허위 정보", icon: "📰", desc: "거짓 정보 또는 사실 왜곡" },
  { key: "other", label: "기타", icon: "💬", desc: "위 사유에 해당하지 않는 경우" },
];

const TARGET_LABELS: Record<ReportTargetType, string> = {
  video: "영상",
  comment: "댓글",
  user: "사용자",
  community_post: "커뮤니티 글",
};

export function ReportModal({
  open,
  targetType,
  targetId,
  targetTitle,
  onClose,
  onSignInClick,
}: ReportModalProps) {
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
      toast.error("신고 사유를 선택해주세요");
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
          toast.error("이미 신고하신 콘텐츠입니다");
        } else {
          toast.error("신고 실패: " + error.message);
        }
        setSubmitting(false);
        return;
      }

      toast.success("신고가 접수되었습니다. 검토 후 처리됩니다.");
      setSelectedReason(null);
      setDescription("");
      onClose();
    } catch (err: any) {
      toast.error("신고 실패: " + (err?.message || err));
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
                  <h3 className="font-bold text-base">{TARGET_LABELS[targetType]} 신고</h3>
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
                신고 사유를 선택해주세요. 검토 후 가이드라인 위반 시 콘텐츠가 숨김 처리됩니다.
              </p>

              <div className="space-y-2">
                {REASONS.map((r) => (
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
                      <p className="font-semibold text-sm">{r.label}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* 상세 설명 (선택) */}
              <div>
                <label className="block text-xs font-semibold text-muted-foreground mb-1.5">
                  상세 설명 (선택)
                </label>
                <textarea
                  className="input-base min-h-[80px] w-full"
                  placeholder="추가로 설명할 내용이 있으면 적어주세요"
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
                  ⚠️ 허위/악성 신고는 계정 제재 사유가 될 수 있습니다.
                  같은 콘텐츠는 1회만 신고 가능합니다.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-card border-t border-border p-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                취소
              </Button>
              <Button
                className="flex-1 gap-2 bg-red-500 hover:bg-red-600 text-white"
                onClick={handleSubmit}
                disabled={submitting || !selectedReason}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    접수 중...
                  </>
                ) : (
                  <>
                    <Flag className="w-4 h-4" />
                    신고 접수
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
