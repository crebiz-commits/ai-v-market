-- ════════════════════════════════════════════════════════════════════════════
-- 컬렉션·셀렉트 감사 — 공개 get_collections 숨김/비공개 영상 제외 + RPC 하드닝 (2026-07-16)
--
--   [갭1] get_collections()(공개 RPC)가 video_ids 를 is_hidden/visibility 필터 없이
--     반환 → ① 컬렉션 카드 "N편" 카운트가 실제 노출(상세는 숨김 제외)보다 과대계상,
--     ② CREAITE 셀렉트 배지 소스(_selectIds)에 숨김 영상 포함, ③ 이 목록을 필터 없이
--     쓰는 미래 소비처는 모더레이션 영상 노출 위험(현 소비처는 모두 개별 필터 중이나
--     단일 지점 방어가 견고). collections.ts 배지·Collections 카드 카운트가 상세와 일치.
--   [수정] get_collections 가 videos 를 조인해 array_agg FILTER 로 숨김/비공개 제외.
--     (활성 컬렉션은 그대로 반환 — 영상 0편이어도 카드는 노출)
--
--   [갭2] admin_* 컬렉션 RPC 5종이 기본 PUBLIC EXECUTE 에 의존(본문 assert_admin 이
--     최종 게이트라 유출은 없으나, 형제 페이지 하드닝 패턴과 비일관). → PUBLIC/anon 회수.
--
--   보안: 모두 SECURITY DEFINER + inline search_path 유지(게이트 #9 무WARN). get_collections
--     는 공개(anon/authenticated) 유지 — 큐레이션은 공개 정보.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 공개 읽기 RPC — 숨김/비공개 영상 제외(정본 갱신) ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_collections()
RETURNS TABLE (
  slug text, title text, tagline text, intro text,
  emoji text, gradient text, is_select boolean, video_ids text[]
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT c.slug, c.title, c.tagline, c.intro, c.emoji, c.gradient, c.is_select,
         COALESCE(
           array_agg(cv.video_id ORDER BY cv.position, cv.video_id)
             FILTER (
               WHERE cv.video_id IS NOT NULL
                 AND COALESCE(v.is_hidden, false) = false           -- 숨김/검수미통과 제외
                 AND (v.visibility IS NULL OR v.visibility = 'public') -- 비공개/미등록 제외
             ),
           '{}'::text[]
         ) AS video_ids
  FROM public.collections c
  LEFT JOIN public.collection_videos cv ON cv.collection_id = c.id
  LEFT JOIN public.videos v            ON v.id = cv.video_id
  WHERE c.is_active = true
  GROUP BY c.id
  ORDER BY c.sort_order, c.created_at;
$$;
GRANT EXECUTE ON FUNCTION public.get_collections() TO anon, authenticated;

-- ── 관리자 RPC 5종 — PUBLIC/anon EXECUTE 회수(assert_admin 은 그대로 최종 게이트) ──
REVOKE ALL ON FUNCTION public.admin_list_collections()                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_get_collection_videos(uuid)                     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_upsert_collection(uuid,text,text,text,text,text,text,integer,boolean,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_collection(uuid)                         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_collection_videos(uuid, text[])             FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.admin_list_collections()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_collection_videos(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_collection(uuid,text,text,text,text,text,text,integer,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_collection(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_collection_videos(uuid, text[])             TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 숨김 영상이 있는 컬렉션의 video_ids 개수가 상세(숨김 제외)와 일치하는지:
--   SELECT slug, array_length(video_ids,1) AS visible FROM public.get_collections();
--   -- 셀렉트 배지 소스에 숨김 영상이 빠졌는지:
--   SELECT video_ids FROM public.get_collections() WHERE is_select;
-- ════════════════════════════════════════════════════════════════════════════
