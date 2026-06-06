-- ════════════════════════════════════════════════════════════════════════════
-- get_recommended_videos 강화: 카테고리 취향 + "장르 취향" + 좋아요
--
-- 시네마 커버플로우(원통형)가 이 RPC 를 기준으로 영상을 뽑는다(상위 10개).
-- 기존엔 카테고리 취향 + 좋아요만 반영 → 홈피드(get_home_feed)와 동일하게
-- 장르 취향 가중치를 추가해 추천 정밀도를 맞춤.
--
--   - 로그인 + 이력: 카테고리 취향(좋아요 가중2/시청1) + 장르 취향(좋아요2/시청1) + 좋아요×0.1,
--                   본인 영상·이미 본 영상 제외.
--   - 비로그인 / 이력 없음: 좋아요×1 + 최근 24h 유효조회수×2 (변경 없음).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_recommended_videos(p_tier text DEFAULT 'all'::text, p_limit integer DEFAULT 20)
 RETURNS TABLE(id text, title text, thumbnail text, video_url text, creator text, creator_id uuid, creator_display_name text, creator_avatar text, category text, genre text, ai_tool text, duration text, duration_seconds integer, views bigint, likes integer, price_standard integer, highlight_start real, highlight_end real, created_at timestamp with time zone, score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $rec$
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
      v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
      COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
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
    SELECT v.category, 2 AS weight
    FROM public.video_likes l
    JOIN public.videos v ON v.id = l.video_id
    WHERE l.user_id = v_user_id AND v.category IS NOT NULL
    UNION ALL
    SELECT v.category, 1 AS weight
    FROM public.video_views vv
    JOIN public.videos v ON v.id = vv.video_id
    WHERE vv.viewer_user_id = v_user_id AND vv.is_valid = true AND v.category IS NOT NULL
  ),
  category_scores AS (
    SELECT category, SUM(weight)::NUMERIC AS total_score
    FROM user_categories
    GROUP BY category
  ),
  user_genres AS (
    SELECT v.genre, 2 AS weight
    FROM public.video_likes l
    JOIN public.videos v ON v.id = l.video_id
    WHERE l.user_id = v_user_id AND v.genre IS NOT NULL
    UNION ALL
    SELECT v.genre, 1 AS weight
    FROM public.video_views vv
    JOIN public.videos v ON v.id = vv.video_id
    WHERE vv.viewer_user_id = v_user_id AND vv.is_valid = true AND v.genre IS NOT NULL
  ),
  genre_scores AS (
    SELECT genre, SUM(weight)::NUMERIC AS total_score
    FROM user_genres
    GROUP BY genre
  ),
  watched_ids AS (
    SELECT DISTINCT video_id FROM public.video_views
    WHERE viewer_user_id = v_user_id AND is_valid = true
  )
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at,
    COALESCE(cs.total_score, 0) + COALESCE(gs.total_score, 0) + COALESCE(v.likes, 0) * 0.1 AS score
  FROM public.v_available_videos v
  LEFT JOIN category_scores cs ON cs.category = v.category
  LEFT JOIN genre_scores gs ON gs.genre = v.genre
  WHERE
    v.creator_id IS DISTINCT FROM v_user_id
    AND v.id NOT IN (SELECT video_id FROM watched_ids)
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY score DESC NULLS LAST, v.created_at DESC
  LIMIT p_limit;
END;
$rec$;
