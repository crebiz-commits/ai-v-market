// ════════════════════════════════════════════════════════════════════════════
// 팔로우 관리 훅 — module-level 캐시 + subscribers
// 본인이 팔로우 중인 creator_id Set을 한 번 fetch 후 모든 컴포넌트가 공유.
// FollowButton이 어디서든 상태/토글을 일관되게 호출.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { sendNotification, buildNewFollowerEmail } from "../utils/sendNotification";

let cache: Set<string> = new Set();
let fetched = false;
const subscribers = new Set<(s: Set<string>) => void>();

function notify() {
  subscribers.forEach((cb) => cb(new Set(cache)));
}

async function fetchFollowing(userId: string) {
  const { data, error } = await supabase
    .from("creator_followers")
    .select("creator_id")
    .eq("follower_id", userId);
  if (!error && Array.isArray(data)) {
    cache = new Set(data.map((r: any) => r.creator_id));
    fetched = true;
    notify();
  }
}

export function useFollows() {
  const { isAuthenticated, user } = useAuth();
  const [following, setFollowing] = useState<Set<string>>(cache);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user) {
      cache = new Set();
      fetched = true;
      notify();
      return;
    }
    await fetchFollowing(user.id);
  }, [isAuthenticated, user]);

  useEffect(() => {
    subscribers.add(setFollowing);
    if (!fetched) refresh();
    return () => {
      subscribers.delete(setFollowing);
    };
  }, [refresh]);

  // 로그인 상태 변경 시 재조회
  useEffect(() => {
    refresh();
  }, [isAuthenticated, user?.id, refresh]);

  const toggleFollow = useCallback(
    async (creatorId: string, opts?: { onSignInClick?: () => void }) => {
      if (!isAuthenticated || !user) {
        opts?.onSignInClick?.();
        return null;
      }
      if (user.id === creatorId) return null;

      const wasFollowing = cache.has(creatorId);
      const next = !wasFollowing;

      // Optimistic
      const optimistic = new Set(cache);
      if (next) optimistic.add(creatorId);
      else optimistic.delete(creatorId);
      cache = optimistic;
      fetched = true;
      notify();

      try {
        if (next) {
          const { error } = await supabase
            .from("creator_followers")
            .insert({ follower_id: user.id, creator_id: creatorId });
          // 23505 unique violation (이미 팔로우 중) → 무시
          if (error && error.code !== "23505") throw error;

          // Phase 34 — 새 팔로워 알림 (fire-and-forget)
          // INSERT 성공 시만 발송 (이미 팔로우 중인 23505 케이스는 skip)
          if (!error) {
            try {
              const { subject, html } = buildNewFollowerEmail({
                followerName: user.name || "익명",
              });
              void sendNotification({
                user_id: creatorId,  // 수신자: 피팔로우 당하는 사람
                type: "new_follower",
                // to 생략 — Edge Function이 user_id로 자동 조회
                subject,
                html,
              });
            } catch (mailErr) {
              console.warn("[useFollows] 새 팔로워 알림 메일 실패:", mailErr);
            }
          }
        } else {
          const { error } = await supabase
            .from("creator_followers")
            .delete()
            .eq("follower_id", user.id)
            .eq("creator_id", creatorId);
          if (error) throw error;
        }
        return next;
      } catch (err: any) {
        // 롤백
        const rollback = new Set(cache);
        if (next) rollback.delete(creatorId);
        else rollback.add(creatorId);
        cache = rollback;
        notify();
        toast.error(err?.message || "팔로우 처리에 실패했습니다.");
        return null;
      }
    },
    [isAuthenticated, user]
  );

  return {
    following,
    isFollowing: useCallback((id: string) => following.has(id), [following]),
    toggleFollow,
    refresh,
  };
}
