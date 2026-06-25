// Phase 26 보강 — 카드용 age_rating 일괄 조회 훅
// 영상 id 배열을 받아서 id → "all" | "13" | "15" | "19" 매핑을 반환.
//
// 2026-06-11: 깜빡임(나왔다가 사라짐) 수정.
//   기존엔 useState 로 관리한 ratings 가 videoIds 변동 시 캐시와 어긋나
//   한 번 표시된 등급이 다시 사라지는 문제가 있었음.
//   → module-level 캐시를 single source of truth 로 두고, 매 렌더마다
//     현재 videoIds 의 등급을 캐시에서 동기 구성해 반환 (한 번 채워지면 유지됨).
//     fetch 완료 시에만 force 리렌더.
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../utils/supabaseClient";

type RatingMap = Record<string, string>;

const cache: RatingMap = {};

// 외부에서도 동기적으로 조회 가능 (캐시 hit 한정)
export function getCachedAgeRating(videoId: string): string {
  return cache[videoId] || "all";
}

export function useAgeRatings(videoIds: string[]): RatingMap {
  const key = videoIds.join(",");
  const [version, force] = useState(0);

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
        if (!error && data) {
          for (const row of data as { video_id: string; age_rating: string }[]) {
            cache[row.video_id] = row.age_rating || "all";
          }
        }
        // 응답에 없는 id(목/DB 미존재 등)는 'all'로 캐시 → 재요청 방지
        for (const id of missing) if (!(id in cache)) cache[id] = "all";
        if (!cancelled) force((n) => n + 1);  // 캐시가 채워졌으니 1회 리렌더
      } catch {
        // 조용한 폴백 — 등급 표시만 안 함
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // 캐시에서 구성한 맵을 useMemo 로 안정화 — 매 렌더 새 객체면 소비처(memo 카드/행) 리렌더 유발
  return useMemo(() => {
    const map: RatingMap = {};
    for (const id of videoIds) if (id && cache[id]) map[id] = cache[id];
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}
