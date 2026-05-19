import { useState, type MouseEvent } from "react";
import { Plus, Check, Loader2, UserPlus, UserCheck } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { useFollows } from "../hooks/useFollows";
import { useTranslation } from "react-i18next";

interface FollowButtonProps {
  creatorId: string;
  /** 호환용 (안 씀). 팔로우 상태는 useFollows() 캐시에서 자동 조회 */
  initialFollowing?: boolean;
  onSignInClick?: () => void;
  onChange?: (following: boolean) => void;
  size?: "sm" | "md";
}

export function FollowButton({
  creatorId,
  onSignInClick,
  onChange,
  size = "md",
}: FollowButtonProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isFollowing, toggleFollow } = useFollows();
  const [loading, setLoading] = useState(false);
  const following = isFollowing(creatorId);

  // 자기 자신은 팔로우 버튼 안 보임
  if (user?.id && user.id === creatorId) return null;

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    if (loading) return;
    setLoading(true);
    const result = await toggleFollow(creatorId, { onSignInClick });
    if (result !== null) onChange?.(result);
    setLoading(false);
  };

  // 영상 카드/상세에서 쓰는 sm: 원형 아이콘 (좋아요/댓글/공유와 통일된 스타일)
  if (size === "sm") {
    return (
      <motion.button
        whileTap={{ scale: 0.85 }}
        onClick={handleClick}
        disabled={loading}
        title={following ? t("follow.following") : t("follow.follow")}
        aria-label={following ? t("follow.following") : t("follow.follow")}
        className="flex-shrink-0"
      >
        <div
          className={`w-9 h-9 rounded-full backdrop-blur-xl flex items-center justify-center border-2 transition-all ${
            following
              ? "bg-[#8b5cf6]/30 border-[#a78bfa] shadow-[0_0_14px_rgba(139,92,246,0.5)]"
              : "bg-white/10 border-white/30 hover:bg-white/20"
          } ${loading ? "opacity-60 cursor-wait" : ""}`}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin text-white" />
          ) : following ? (
            <UserCheck className="w-[18px] h-[18px] text-white" strokeWidth={2} />
          ) : (
            <UserPlus className="w-[18px] h-[18px] text-white" strokeWidth={2} />
          )}
        </div>
      </motion.button>
    );
  }

  // 텍스트 버튼 — 팔로잉 시 sm과 동일한 보라 채움 (일관성)
  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={handleClick}
      disabled={loading}
      className={`px-4 py-2 text-sm gap-1.5 rounded-lg font-bold transition-all flex items-center justify-center whitespace-nowrap text-white ${
        following
          ? "bg-[#8b5cf6]/30 hover:bg-[#8b5cf6]/40 border border-[#a78bfa] shadow-[0_0_14px_rgba(139,92,246,0.4)]"
          : "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 shadow-sm border border-transparent"
      } ${loading ? "opacity-60 cursor-wait" : ""}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : following ? (
        <>
          <Check className="w-3.5 h-3.5" />
          {t("follow.following")}
        </>
      ) : (
        <>
          <Plus className="w-3.5 h-3.5" />
          {t("follow.follow")}
        </>
      )}
    </motion.button>
  );
}
