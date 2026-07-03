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

export type ToggleResult = "liked" | "unliked" | "needAuth" | "error";

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
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [ready, setReady] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());  // 영상별 더블클릭 경합 방지

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
    (id: string, base: number | null | undefined) => Math.max(0, commentCounts[id] ?? (base || 0)),
    [commentCounts],
  );
  const displayViews = useCallback(
    (id: string, base: number | null | undefined) => Math.max(0, viewCounts[id] ?? (base || 0)),
    [viewCounts],
  );

  const seedCount = useCallback(seedOnce(setCounts), []);
  const seedComments = useCallback(seedOnce(setCommentCounts), []);
  const seedViews = useCallback(seedOnce(setViewCounts), []);

  // 댓글 작성(+1)/삭제(-1) — 시드된 기준값에 증감 반영. 미시드면 0 기준(피드 진입 시 시드됨).
  const bumpComments = useCallback((videoId: string, delta: number) => {
    setCommentCounts((prev) => ({ ...prev, [videoId]: Math.max(0, (prev[videoId] ?? 0) + delta) }));
  }, []);

  const toggleLike = useCallback(async (videoId: string, base?: number | null): Promise<ToggleResult> => {
    if (!user) return "needAuth";
    if (inFlight.current.has(videoId)) return "error";
    inFlight.current.add(videoId);

    const wasLiked = liked.has(videoId);
    const next = !wasLiked;
    // 낙관적 업데이트 (하트 + 좋아요 수 ±1)
    setLiked((prev) => {
      const n = new Set(prev);
      next ? n.add(videoId) : n.delete(videoId);
      return n;
    });
    setCounts((prev) => {
      const cur = prev[videoId] ?? (base || 0);
      return { ...prev, [videoId]: Math.max(0, cur + (next ? 1 : -1)) };
    });

    try {
      if (next) {
        const { error } = await supabase.from("video_likes").insert({ video_id: videoId, user_id: user.id });
        if (error && (error as any).code !== "23505") throw error;  // 23505=이미 존재 → 멱등 처리
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
      setCounts((prev) => {
        const cur = prev[videoId] ?? 0;
        return { ...prev, [videoId]: Math.max(0, cur + (next ? -1 : 1)) };
      });
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
