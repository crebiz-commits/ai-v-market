-- ════════════════════════════════════════════════════════════════════════════
-- 시네마 보조 RPC 견고화 — 3차 심화감사 SQL 결함 2건 (2026-07-09)
--
--   ① get_age_ratings_for_videos: SECURITY DEFINER 인데 SET search_path 누락
--      (형제 카드 RPC들은 모두 있음 — 이 5번째만 빠짐). role-mutable search_path
--      경고 + 재실행 회귀 위험 → 명시.
--   ② get_popular_creators: ORDER BY 에 고유 tiebreak 없음(follower/views/video_count 만).
--      영상 행 RPC 와 동일한 비결정성 → TopCreatorsRow 가 방문마다 뒤섞임.
--      → 최종키 cs.creator_id 추가로 결정적 순서 고정.
--
--   둘 다 본문은 정본 그대로, 목표부만 수정. CREATE OR REPLACE(반환컬럼 불변)·멱등.
--   적용: Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① get_age_ratings_for_videos: SET search_path 추가 ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_age_ratings_for_videos(
  p_video_ids TEXT[]
)
RETURNS TABLE (
  video_id    TEXT,
  age_rating  TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT v.id::TEXT, COALESCE(v.age_rating, 'all')
  FROM public.videos v
  WHERE v.id::TEXT = ANY(p_video_ids);
$$;
GRANT EXECUTE ON FUNCTION public.get_age_ratings_for_videos(TEXT[]) TO authenticated, anon;

-- ── ② get_popular_creators: 결정적 정렬(creator_id 2차키) ──────────────────────
CREATE OR REPLACE FUNCTION public.get_popular_creators(p_limit INT DEFAULT 20)
RETURNS TABLE (
  creator_id UUID, creator_name TEXT, avatar_url TEXT, video_count BIGINT,
  follower_count BIGINT, total_views BIGINT, recent_thumbnails TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH creator_stats AS (
    SELECT v.creator_id, COUNT(*) AS video_count,
      SUM(CASE WHEN v.views ~ '^\d+$' THEN v.views::BIGINT ELSE 0 END) AS total_views
    FROM public.videos v
    WHERE (v.visibility='public' OR v.visibility IS NULL)
      AND COALESCE(v.is_hidden,false)=false
      AND v.creator_id IS NOT NULL
    GROUP BY v.creator_id
  ),
  ranked_videos AS (
    SELECT creator_id, thumbnail,
      ROW_NUMBER() OVER (PARTITION BY creator_id ORDER BY created_at DESC) AS rn
    FROM public.videos
    WHERE (visibility='public' OR visibility IS NULL)
      AND COALESCE(is_hidden,false)=false
      AND creator_id IS NOT NULL AND thumbnail IS NOT NULL AND thumbnail <> ''
  ),
  recent_thumbs AS (
    SELECT creator_id, ARRAY_AGG(thumbnail ORDER BY rn) AS thumbnails
    FROM ranked_videos WHERE rn <= 3 GROUP BY creator_id
  ),
  follower_counts AS (
    SELECT creator_id, COUNT(*) AS follower_count FROM public.creator_followers GROUP BY creator_id
  )
  SELECT cs.creator_id,
    COALESCE(NULLIF(p.display_name,''), NULLIF(u.raw_user_meta_data->>'name',''),
             NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(split_part(u.email,'@',1),''),
             'AI Creator') AS creator_name,
    COALESCE(NULLIF(p.avatar_url,''), NULLIF(u.raw_user_meta_data->>'avatar_url',''),
             NULLIF(u.raw_user_meta_data->>'picture','')) AS avatar_url,
    cs.video_count, COALESCE(fc.follower_count,0) AS follower_count, cs.total_views,
    COALESCE(rt.thumbnails, ARRAY[]::TEXT[]) AS recent_thumbnails
  FROM creator_stats cs
  LEFT JOIN public.profiles p ON p.id = cs.creator_id
  LEFT JOIN auth.users u ON u.id = cs.creator_id
  LEFT JOIN recent_thumbs rt ON rt.creator_id = cs.creator_id
  LEFT JOIN follower_counts fc ON fc.creator_id = cs.creator_id
  ORDER BY COALESCE(fc.follower_count,0) DESC, cs.total_views DESC, cs.video_count DESC, cs.creator_id
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_popular_creators(INT) TO anon, authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT proname, proconfig FROM pg_proc WHERE proname IN ('get_age_ratings_for_videos','get_popular_creators');
--   -- 기대: 둘 다 proconfig 에 search_path 포함.
--   SELECT creator_id FROM public.get_popular_creators(10);  -- 2회 호출 순서 동일해야 함.
