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
let fetchInFlight: string | null = null;   // 진행 중인 fetch 의 userId — 동시 중복 쿼리 차단
const subscribers = new Set<(s: Set<string>) => void>();
// 크리에이터별 토글 in-flight 가드(모듈 레벨) — 같은 크리에이터가 여러 피드 카드에 동시 노출될 때
// 카드마다 독립적인 per-instance loading 으론 못 막는 크로스카드 중복 토글을 차단.
const inFlightFollows = new Set<string>();

function notify() {
  subscribers.forEach((cb) => cb(new Set(cache)));
}

async function fetchFollowing(userId: string) {
  // 탐색 그리드엔 FollowButton 이 ~20개 동시 마운트되고 각 인스턴스가 refresh→fetchFollowing 을 부른다.
  //   같은 userId fetch 가 이미 진행 중이면 중복 쿼리를 건너뛴다(플래그는 await 앞에서 세팅 → 동일 tick 중복 차단).
  if (fetchInFlight === userId) return;
  fetchInFlight = userId;
  try {
    const { data, error } = await supabase
      .from("creator_followers")
      .select("creator_id")
      .eq("follower_id", userId);
    if (!error && Array.isArray(data)) {
      cache = new Set(data.map((r: any) => r.creator_id));
      fetched = true;
      notify();
    }
  } finally {
    fetchInFlight = null;
  }
}

// 서버 진실(get_creator_profile.am_i_following)로 팔로우 캐시를 즉시 반영 — 콜드 딥링크로 채널에
//   바로 진입했을 때 전역 팔로우 캐시 fetch 완료 전에도 FollowButton 이 올바른 상태로 렌더(RPC 값 사장 방지).
export function seedFollowing(creatorId: string, following: boolean) {
  if (cache.has(creatorId) === following) return;
  const next = new Set(cache);
  if (following) next.add(creatorId); else next.delete(creatorId);
  cache = next;
  notify();
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
      // 크로스카드 중복 토글 방지: 한 카드의 토글이 진행 중일 때 다른 카드 탭이 낙관값을 뒤집어
      //   INSERT/DELETE 가 동시에 나가 DB/캐시가 어긋나고 유령 팔로워 메일이 발송되던 것 차단.
      if (inFlightFollows.has(creatorId)) return null;
      inFlightFollows.add(creatorId);

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
          if (error) {
            // 23505(이미 팔로우 중 — 딥링크 등 캐시 fetch 전 클릭) → 실제 변화 없음 → null 반환
            //   (onChange 미호출 → follower_count 부풀림 차단). 캐시는 낙관적 following 이라 버튼은 정확.
            if (error.code === "23505") return null;
            throw error;   // 그 외 에러 → catch 롤백
          }

          // Phase 34 — 새 팔로워 알림 (fire-and-forget) — INSERT 성공 시만
          {
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
                // 딥링크 원칙: 클릭 시 팔로우한 사람의 채널로 직행
                link: `/?tab=channel&creator=${encodeURIComponent(user.id)}`,
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
      } finally {
        inFlightFollows.delete(creatorId);
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
