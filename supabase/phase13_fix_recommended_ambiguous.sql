-- ════════════════════════════════════════════════════════════════════════════
-- Phase 13 hotfix #2 — get_recommended_videos 의 PL/pgSQL 모호성 해결
--
-- 원인: RETURNS TABLE의 `category TEXT` OUT 파라미터가 함수 본문 CTE의
--       `category` 컬럼 참조와 충돌 → 42702 (column reference ambiguous)
--
-- 수정: `#variable_conflict use_column` pragma 추가
--       → 컬럼 참조가 변수보다 우선 (PL/pgSQL 표준 해법)
--
-- 적용: Supabase SQL Editor → 새 쿼리 "+ New query" → 본 파일 전체 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_recommended_videos(
  p_tier TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ, score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
#variable_conflict use_column
DECLARE
  v_user_id UUID := auth.uid();
  v_has_history BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.video_likes WHERE user_id = v_user_id
    UNION ALL
    SELECT 1 FROM public.video_views WHERE viewer_user_id = v_user_id AND is_valid = true
    LIMIT 1
  ) INTO v_has_history;

  IF v_user_id IS NULL OR NOT v_has_history THEN
    RETURN QUERY
    SELECT
      v.id::TEXT, v.title, v.thumbnail, v.video_url,
      v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
      v.category, v.ai_tool, v.duration, v.duration_seconds,
      COALESCE(v.views::BIGINT, 0), COALESCE(v.price_standard, 0),
      v.highlight_start, v.highlight_end,
      v.created_at,
      (COALESCE(v.likes, 0) * 1.0 +
        (SELECT COUNT(*) FROM public.video_views vv
         WHERE vv.video_id = v.id AND vv.is_valid = true
           AND vv.occurred_at >= now() - INTERVAL '24 hours') * 2.0
      )::NUMERIC AS score
    FROM public.v_available_videos v
    WHERE
      (p_tier = 'all' OR
       (p_tier = 'cinema' AND v.show_on_cinema = true) OR
       (p_tier = 'ott' AND v.show_on_ott = true))
    ORDER BY score DESC, v.created_at DESC
    LIMIT p_limit;
    RETURN;
  END IF;

  RETURN QUERY
  WITH user_categories AS (
    SELECT v.category AS cat, 2 AS weight
    FROM public.video_likes l
    JOIN public.videos v ON v.id = l.video_id
    WHERE l.user_id = v_user_id AND v.category IS NOT NULL
    UNION ALL
    SELECT v.category AS cat, 1 AS weight
    FROM public.video_views vv
    JOIN public.videos v ON v.id = vv.video_id
    WHERE vv.viewer_user_id = v_user_id AND vv.is_valid = true AND v.category IS NOT NULL
  ),
  category_scores AS (
    SELECT uc.cat, SUM(uc.weight)::NUMERIC AS total_score
    FROM user_categories uc
    GROUP BY uc.cat
  ),
  watched_ids AS (
    SELECT DISTINCT video_id FROM public.video_views
    WHERE viewer_user_id = v_user_id AND is_valid = true
  )
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at,
    COALESCE(cs.total_score, 0) + COALESCE(v.likes, 0) * 0.1 AS score
  FROM public.v_available_videos v
  LEFT JOIN category_scores cs ON cs.cat = v.category
  WHERE
    v.creator_id IS DISTINCT FROM v_user_id
    AND v.id NOT IN (SELECT video_id FROM watched_ids)
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY score DESC NULLS LAST, v.created_at DESC
  LIMIT p_limit;
END;
$$;

-- 검증:
--   SELECT * FROM public.get_recommended_videos('all', 5);
--   SELECT * FROM public.get_recommended_videos('cinema', 5);
