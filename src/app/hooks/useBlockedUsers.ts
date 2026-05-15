// ════════════════════════════════════════════════════════════════════════════
// Phase 24 — 차단 사용자 관리 훅
//
// 사용 예:
//   const { blockedIds, blockUser, unblockUser, isBlocked } = useBlockedUsers();
//
// 단순 module-level 캐시 + 변경 시 구독자 모두 갱신.
// 여러 컴포넌트가 동시에 사용해도 fetch는 한 번만.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

let cache: Set<string> = new Set();
let fetched = false;
const subscribers = new Set<(s: Set<string>) => void>();

function notify() {
  subscribers.forEach((cb) => cb(new Set(cache)));
}

async function fetchBlockedIds() {
  const { data, error } = await supabase.rpc("get_my_blocked_user_ids");
  if (!error && Array.isArray(data)) {
    cache = new Set(data as string[]);
    fetched = true;
    notify();
  }
}

export function useBlockedUsers() {
  const { isAuthenticated, user } = useAuth();
  const [blockedIds, setBlockedIds] = useState<Set<string>>(cache);

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !user) {
      cache = new Set();
      fetched = true;
      notify();
      return;
    }
    await fetchBlockedIds();
  }, [isAuthenticated, user]);

  useEffect(() => {
    subscribers.add(setBlockedIds);
    if (!fetched) {
      refresh();
    }
    return () => {
      subscribers.delete(setBlockedIds);
    };
  }, [refresh]);

  // 로그인 상태 변경 시 재조회
  useEffect(() => {
    refresh();
  }, [isAuthenticated, user?.id, refresh]);

  const blockUser = useCallback(async (targetId: string, name?: string) => {
    if (!isAuthenticated) {
      toast.error("로그인이 필요합니다.");
      return false;
    }
    if (targetId === user?.id) {
      toast.error("본인은 차단할 수 없습니다.");
      return false;
    }
    if (!confirm(`${name || "이 사용자"}를 차단할까요?\n앞으로 이 사용자의 영상·댓글·글이 회원님 화면에 보이지 않습니다.`)) {
      return false;
    }
    const { error } = await supabase.rpc("block_user", { p_target_user_id: targetId });
    if (error) {
      toast.error("차단에 실패했습니다.");
      return false;
    }
    cache = new Set(cache).add(targetId);
    fetched = true;
    notify();
    toast.success(name ? `${name} 차단 완료` : "차단 완료");
    return true;
  }, [isAuthenticated, user?.id]);

  const unblockUser = useCallback(async (targetId: string) => {
    const { error } = await supabase.rpc("unblock_user", { p_target_user_id: targetId });
    if (error) {
      toast.error("차단 해제에 실패했습니다.");
      return false;
    }
    const next = new Set(cache);
    next.delete(targetId);
    cache = next;
    notify();
    toast.success("차단 해제됐습니다.");
    return true;
  }, []);

  return {
    blockedIds,
    isBlocked: useCallback((id: string) => blockedIds.has(id), [blockedIds]),
    blockUser,
    unblockUser,
    refresh,
  };
}
