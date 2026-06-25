// 시리즈 카드 배지용 — 영상 id 배열을 받아 id → 시리즈 회차수(episode_count) 매핑 반환.
// useAgeRatings 와 동일 패턴: module-level 캐시를 single source of truth 로 두고
// 매 렌더마다 현재 videoIds 의 회차수를 캐시에서 동기 구성(한 번 채워지면 유지).
// 시리즈가 아닌(또는 1화뿐인) 영상은 맵에 0/미포함 → 카드에서 배지 미표시.
import { useEffect, useState, useMemo } from "react";
import { supabase } from "../utils/supabaseClient";

type CountMap = Record<string, number>;

const cache: CountMap = {};

export function useSeriesCounts(videoIds: string[]): CountMap {
  const key = videoIds.join(",");
  const [version, force] = useState(0);

  useEffect(() => {
    const missing = videoIds.filter((id) => id && !(id in cache));
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_series_counts_for_videos", {
          p_video_ids: missing,
        });
        if (!error && data) {
          for (const row of data as { video_id: string; episode_count: number }[]) {
            cache[row.video_id] = row.episode_count || 0;
          }
        }
        // 응답에 없는 id(시리즈 아님 등)는 0으로 캐시 → 재요청 방지
        for (const id of missing) if (!(id in cache)) cache[id] = 0;
        if (!cancelled) force((n) => n + 1);
      } catch {
        // 조용한 폴백 — 배지만 안 보임
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // useMemo 로 안정화 — 매 렌더 새 객체면 소비처(memo 카드/행) 리렌더 유발
  return useMemo(() => {
    const map: CountMap = {};
    for (const id of videoIds) if (id && cache[id]) map[id] = cache[id];
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);
}
