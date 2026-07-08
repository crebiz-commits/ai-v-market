// ════════════════════════════════════════════════════════════════════════════
// 전역 영상 통계 스토어 — 좋아요 · 댓글수 · 조회수 (2026-07-03)
//
// 목적: 한 피드에서 좋아요/댓글이 바뀌면 같은 세션의 모든 비디오 피드(홈·시네마·
//       OTT·상세·풀스크린·트렌딩)에 즉시 반영. 카운트도 피드마다 어긋나지 않게 통일.
//       (파일/훅 이름은 useLikes 유지 — 좋아요에서 출발해 댓글·조회수까지 확장됨)
//
// 원리(가벼움 — DB 부하 불변):
//   · liked         : 유저가 좋아요한 video_id 집합(하트 채움의 단일 출처)
//   · counts        : 좋아요 수. seed-once(첫 표시 때 1회 시드) 후 토글로만 ±1.
//   · commentCounts : 댓글 수. seed-once 후 작성/삭제로 ±1(bump).
//   · viewCounts    : 조회수. seed-once 표시 통일(증가는 서버가 처리 → 재조회 시 반영).
//   seed-once 라 여러 피드가 서로 다른 시점 값으로 덮어쓰며 깜빡이는 문제를 원천 차단.
// ════════════════════════════════════════════════════════════════════════════
import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from "react";
import { supabase } from "../utils/supabaseClient";
import { useAuth } from "./AuthContext";

// "busy" = 더블탭 등 in-flight 중복 호출(무시 대상 — 실패 아님). "error" 는 진짜 실패만.
export type ToggleResult = "liked" | "unliked" | "needAuth" | "error" | "busy";

interface LikesContextValue {
  ready: boolean;
  // ── 좋아요 ──
  isLiked: (videoId: string) => boolean;
  displayCount: (videoId: string, baseCount: number | null | undefined) => number;
  seedCount: (videoId: string, count: number | null | undefined) => void;
  toggleLike: (videoId: string, base?: number | null) => Promise<ToggleResult>;
  // ── 댓글 수 ──
  displayComments: (videoId: string, baseCount: number | null | undefined) => number;
  seedComments: (videoId: string, count: number | null | undefined) => void;
  bumpComments: (videoId: string, delta: number) => void;
  // ── 조회수 ──
  displayViews: (videoId: string, baseCount: number | null | undefined) => number;
  seedViews: (videoId: string, count: number | null | undefined) => void;
}

const LikesContext = createContext<LikesContextValue | null>(null);

// seed-once 헬퍼: 이미 값이 있으면 무시(경합/깜빡임 방지)
function seedOnce(set: React.Dispatch<React.SetStateAction<Record<string, number>>>) {
  return (id: string, count: number | null | undefined) => {
    if (count == null) return;
    set((prev) => (prev[id] !== undefined ? prev : { ...prev, [id]: Math.max(0, count) }));
  };
}

export function LikesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [liked, setLiked] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Record<string, number>>({});
  // 댓글수 = 서버 기준값(seed-once) + 이 세션의 증감(delta). base+delta 라 미시드여도 base 반영
  //   → 미시드 상태서 작성 시 1로 고착되던 문제 제거(H6). 화면엔 max(0, base+delta).
  const [commentBase, setCommentBase] = useState<Record<string, number>>({});
  const [commentDelta, setCommentDelta] = useState<Record<string, number>>({});
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());  // 영상별 더블클릭 경합 방지
  const toggledRef = useRef<Set<string>>(new Set()); // H8: 이 세션에 사용자가 좋아요 토글한 영상(재시드 시 낙관값 보존)

  // 유저 로그인/변경 시 좋아요 목록 1회 로드. 로그아웃이면 초기화.
  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!user) { setLiked(new Set()); setReady(true); return; }
    (async () => {
      const { data } = await supabase.from("video_likes").select("video_id").eq("user_id", user.id);
      if (cancelled) return;
      setLiked(new Set((data || []).map((r: any) => r.video_id)));
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const isLiked = useCallback((videoId: string) => liked.has(videoId), [liked]);

  const displayCount = useCallback(
    (id: string, base: number | null | undefined) => Math.max(0, counts[id] ?? (base || 0)),
    [counts],
  );
  const displayComments = useCallback(
    (id: string, base: number | null | undefined) =>
      Math.max(0, (commentBase[id] ?? (base || 0)) + (commentDelta[id] ?? 0)),
    [commentBase, commentDelta],
  );
  const displayViews = useCallback(
    (id: string, base: number | null | undefined) => Math.max(0, viewCounts[id] ?? (base || 0)),
    [viewCounts],
  );

  // H8: 좋아요 수는 "미토글 영상은 더 신선한(큰) 값으로 갱신, 토글한 영상은 낙관값 보존".
  //   → 여러 피드 중 먼저 온 stale 값으로 세션 내내 고착되던 문제 해소. unlike 낙관값은
  //     toggledRef 로 보호(덮지 않음). 좋아요는 대체로 단조증가라 max(grow)가 안전.
  const seedCount = useCallback((id: string, count: number | null | undefined) => {
    if (count == null) return;
    setCounts((prev) => {
      if (toggledRef.current.has(id)) return prev;          // 사용자가 토글한 건 낙관값 유지
      const inc = Math.max(0, count);
      const cur = prev[id];
      return (cur === undefined || inc > cur) ? { ...prev, [id]: inc } : prev;  // 미토글은 더 큰 값으로만
    });
  }, []);
  const seedComments = useCallback(seedOnce(setCommentBase), []);  // 서버 기준값만 seed-once
  const seedViews = useCallback(seedOnce(setViewCounts), []);

  // 댓글 작성(+1)/삭제(-1) — delta 에 누적(base 와 분리). 화면은 base+delta 라 미시드여도 정확.
  const bumpComments = useCallback((videoId: string, delta: number) => {
    setCommentDelta((prev) => ({ ...prev, [videoId]: (prev[videoId] ?? 0) + delta }));
  }, []);

  const toggleLike = useCallback(async (videoId: string, base?: number | null): Promise<ToggleResult> => {
    if (!user) return "needAuth";
    if (inFlight.current.has(videoId)) return "busy";   // 더블탭 중복 — 실패 토스트 금지(무시)
    inFlight.current.add(videoId);
    toggledRef.current.add(videoId);   // H8: 이후 재시드가 이 영상의 낙관값을 덮지 않도록

    const wasLiked = liked.has(videoId);
    const next = !wasLiked;
    // 낙관적 업데이트 (하트 + 좋아요 수 ±1)
    setLiked((prev) => {
      const n = new Set(prev);
      next ? n.add(videoId) : n.delete(videoId);
      return n;
    });
    let prevCount: number | undefined;
    setCounts((prev) => {
      prevCount = prev[videoId];  // 토글 이전 값 캡처(정확 복원용)
      const cur = prev[videoId] ?? (base || 0);
      return { ...prev, [videoId]: Math.max(0, cur + (next ? 1 : -1)) };
    });
    // 롤백/중복 시 낙관적 이전 값으로 정확 복원(apply/rollback 대칭 — H7)
    const restoreCount = () =>
      setCounts((prev) => {
        const n = { ...prev };
        if (prevCount === undefined) delete n[videoId];
        else n[videoId] = prevCount;
        return n;
      });

    try {
      if (next) {
        const { error } = await supabase.from("video_likes").insert({ video_id: videoId, user_id: user.id });
        if (error) {
          if ((error as any).code === "23505") {
            // 이미 좋아요됨(다른 기기 등) → 서버 카운트에 이미 반영. 낙관적 +1 취소(중복 방지), 하트는 유지.
            restoreCount();
          } else throw error;
        }
      } else {
        const { error } = await supabase.from("video_likes").delete().match({ video_id: videoId, user_id: user.id });
        if (error) throw error;
      }
      return next ? "liked" : "unliked";
    } catch (err) {
      console.error("[LikesContext] toggle 실패, 롤백:", err);
      setLiked((prev) => {
        const n = new Set(prev);
        next ? n.delete(videoId) : n.add(videoId);
        return n;
      });
      restoreCount();
      return "error";
    } finally {
      inFlight.current.delete(videoId);
    }
  }, [user, liked]);

  const value = useMemo<LikesContextValue>(
    () => ({
      ready, isLiked,
      displayCount, seedCount, toggleLike,
      displayComments, seedComments, bumpComments,
      displayViews, seedViews,
    }),
    [ready, isLiked, displayCount, seedCount, toggleLike, displayComments, seedComments, bumpComments, displayViews, seedViews],
  );

  return <LikesContext.Provider value={value}>{children}</LikesContext.Provider>;
}

export function useLikes(): LikesContextValue {
  const ctx = useContext(LikesContext);
  if (!ctx) throw new Error("useLikes must be used within LikesProvider");
  return ctx;
}
