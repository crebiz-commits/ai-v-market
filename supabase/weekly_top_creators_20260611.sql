-- ════════════════════════════════════════════════════════════════════════════
-- 이번 주 TOP 크리에이터 RPC (2026-06-11)
--   최근 p_days(기본 7일) 유효 조회수 기준 랭킹 + 팔로워수·누적조회수 포함.
--   베타라 주간 조회가 적을 수 있어 동점은 팔로워수 → 누적조회수로 정렬.
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_weekly_top_creators(
  p_limit INTEGER DEFAULT 10,
  p_days  INTEGER DEFAULT 7
)
RETURNS TABLE (
  creator_id     UUID,
  creator_name   TEXT,
  avatar_url     TEXT,
  follower_count BIGINT,
  weekly_views   BIGINT,
  total_views    BIGINT,
  video_count    BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT v.id, v.creator_id
    FROM public.videos v
    WHERE v.creator_id IS NOT NULL
      AND COALESCE(v.visibility, 'public') = 'public'
      AND COALESCE(v.is_hidden, false) = false
  ),
  agg AS (
    SELECT
      b.creator_id,
      COUNT(DISTINCT b.id)::BIGINT AS vc,
      COUNT(vv.id) FILTER (WHERE vv.is_valid)::BIGINT AS total_v,
      COUNT(vv.id) FILTER (
        WHERE vv.is_valid AND vv.occurred_at >= now() - make_interval(days => p_days)
      )::BIGINT AS weekly_v
    FROM base b
    LEFT JOIN public.video_views vv ON vv.video_id = b.id
    GROUP BY b.creator_id
  ),
  followers AS (
    SELECT creator_id, COUNT(*)::BIGINT AS fc
    FROM public.creator_followers GROUP BY creator_id
  )
  SELECT
    p.id,
    COALESCE(NULLIF(p.display_name, ''), 'AI Creator'),
    p.avatar_url,
    COALESCE(f.fc, 0),
    COALESCE(a.weekly_v, 0),
    COALESCE(a.total_v, 0),
    COALESCE(a.vc, 0)
  FROM public.profiles p
  INNER JOIN agg a ON a.creator_id = p.id
  LEFT JOIN followers f ON f.creator_id = p.id
  WHERE COALESCE(p.is_suspended, false) = false
    AND a.vc > 0
  ORDER BY COALESCE(a.weekly_v, 0) DESC,
           COALESCE(f.fc, 0) DESC,
           COALESCE(a.total_v, 0) DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_weekly_top_creators(INTEGER, INTEGER) TO anon, authenticated;

-- 검증: SELECT * FROM public.get_weekly_top_creators(10, 7);
