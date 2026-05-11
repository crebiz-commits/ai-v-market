import { useState, useEffect, type MouseEvent } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../utils/supabaseClient";
import { toast } from "sonner";

interface FollowButtonProps {
  creatorId: string;
  initialFollowing?: boolean;
  onSignInClick?: () => void;
  onChange?: (following: boolean) => void;
  size?: "sm" | "md";
}

export function FollowButton({
  creatorId,
  initialFollowing = false,
  onSignInClick,
  onChange,
  size = "md",
}: FollowButtonProps) {
  const { user, isAuthenticated } = useAuth();
  const [following, setFollowing] = useState(initialFollowing);
  const [loading, setLoading] = useState(false);

  // 부모(Channel)가 비동기로 myFollows를 채우면 initialFollowing이 늦게 바뀜.
  // useState 초기값은 첫 렌더 때만 잡히므로 prop 변경을 따라가도록 동기화.
  useEffect(() => {
    setFollowing(initialFollowing);
  }, [initialFollowing]);

  // 자기 자신은 팔로우 버튼 안 보임
  if (user?.id && user.id === creatorId) return null;

  const handleClick = async (e: MouseEvent) => {
    e.stopPropagation();
    if (!isAuthenticated) {
      onSignInClick?.();
      return;
    }
    if (loading || !user) return;
    setLoading(true);

    const next = !following;
    setFollowing(next);
    onChange?.(next);

    try {
      if (next) {
        const { error } = await supabase
          .from("creator_followers")
          .insert({ follower_id: user.id, creator_id: creatorId });
        // 23505: unique violation — 이미 팔로우 중이라도 OK
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("creator_followers")
          .delete()
          .eq("follower_id", user.id)
          .eq("creator_id", creatorId);
        if (error) throw error;
      }
    } catch (err: any) {
      setFollowing(!next);
      onChange?.(!next);
      toast.error(err?.message || "팔로우 처리에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const sizeClasses =
    size === "sm" ? "px-3 py-1.5 text-xs gap-1" : "px-4 py-2 text-sm gap-1.5";

  return (
    <motion.button
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
      onClick={handleClick}
      disabled={loading}
      className={`${sizeClasses} rounded-lg font-bold transition-colors flex items-center justify-center whitespace-nowrap ${
        following
          ? "bg-white/10 hover:bg-white/15 text-gray-300 border border-white/15"
          : "bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:opacity-90 text-white shadow-sm border border-transparent"
      } ${loading ? "opacity-60 cursor-wait" : ""}`}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : following ? (
        <>
          <Check className="w-3.5 h-3.5" />
          팔로잉
        </>
      ) : (
        <>
          <Plus className="w-3.5 h-3.5" />
          팔로우
        </>
      )}
    </motion.button>
  );
}
