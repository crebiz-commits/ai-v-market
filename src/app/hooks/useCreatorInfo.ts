import { useEffect, useState, useRef } from "react";
import { supabase } from "../utils/supabaseClient";

export interface CreatorInfo {
  name: string;
  avatar: string | null;
}

export type CreatorInfoMap = Record<string, CreatorInfo>;

/**
 * 여러 크리에이터의 이름·아바타를 한 번에 조회 (Phase 6.6).
 *
 * - creatorIds 배열을 받아 unique한 ID들만 get_creators_info RPC로 한 번에 fetch
 * - 결과를 { [creatorId]: { name, avatar } } 형태로 반환
 * - 캐시: 같은 ID 세트가 다시 들어오면 RPC 재호출 안 함
 *
 * 사용 예:
 *   const creatorInfo = useCreatorInfo(videos.map(v => v.creatorId).filter(Boolean));
 *   <CreatorAvatar avatarUrl={creatorInfo[v.creatorId]?.avatar} name={v.creator} />
 */
// UUID v4 형식 (Showcase Mock의 "demo-creator-1" 같은 가짜 ID는 RPC에 못 들어가게 차단)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useCreatorInfo(creatorIds: (string | null | undefined)[]): CreatorInfoMap {
  const [map, setMap] = useState<CreatorInfoMap>({});
  const lastKeyRef = useRef<string>("");

  // unique + sorted → key로 변환해 의존성 안정화
  // UUID 형식만 통과 (Showcase mock의 "demo-creator-X" 등 차단)
  const uniqueIds = Array.from(
    new Set(creatorIds.filter((id): id is string => !!id && UUID_RE.test(id)))
  ).sort();
  const key = uniqueIds.join(",");

  useEffect(() => {
    if (!key || key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_creators_info", {
        p_creator_ids: uniqueIds,
      });
      if (cancelled) return;
      if (error) {
        console.warn("[useCreatorInfo] get_creators_info 실패:", error.message);
        return;
      }
      const next: CreatorInfoMap = {};
      (data || []).forEach((row: any) => {
        next[row.creator_id] = {
          name: row.creator_name || "AI Creator",
          avatar: row.avatar_url || null,
        };
      });
      setMap((prev) => ({ ...prev, ...next }));
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return map;
}
