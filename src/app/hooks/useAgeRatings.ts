// Phase 26 보강 — 카드용 age_rating 일괄 조회 훅
// 영상 id 배열을 받아서 id → "all" | "13" | "15" | "19" 매핑을 반환.
// 동일 id 셋에 대해 fetch 1회 + 컴포넌트 unmount 후 재 mount에도 사용 가능한
// module-level 캐시. (useBlockedUsers와 같은 패턴)
import { useEffect, useState } from "react";
import { supabase } from "../utils/supabaseClient";

type RatingMap = Record<string, string>;

const cache: RatingMap = {};

// 외부에서도 동기적으로 조회 가능 (캐시 hit 한정)
export function getCachedAgeRating(videoId: string): string {
  return cache[videoId] || "all";
}

export function useAgeRatings(videoIds: string[]): RatingMap {
  const [ratings, setRatings] = useState<RatingMap>(() => {
    const initial: RatingMap = {};
    for (const id of videoIds) if (cache[id]) initial[id] = cache[id];
    return initial;
  });

  useEffect(() => {
    // 캐시 miss인 id만 fetch
    const missing = videoIds.filter((id) => id && !(id in cache));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_age_ratings_for_videos", {
          p_video_ids: missing,
        });
        if (error || !data) return;
        if (cancelled) return;
        for (const row of data as { video_id: string; age_rating: string }[]) {
          cache[row.video_id] = row.age_rating || "all";
        }
        // missing 중 응답에 없는 id는 'all'로 캐시 (Mock 영상 등 DB 미존재)
        for (const id of missing) {
          if (!(id in cache)) cache[id] = "all";
        }
        const next: RatingMap = {};
        for (const id of videoIds) next[id] = cache[id] || "all";
        setRatings(next);
      } catch {
        // 조용한 폴백 — 등급 표시만 안 함
      }
    })();
    return () => { cancelled = true; };
    // videoIds 배열 reference 변동을 join key로 안정화
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoIds.join(",")]);

  return ratings;
}
