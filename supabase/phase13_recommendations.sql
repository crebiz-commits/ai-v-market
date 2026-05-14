-- ════════════════════════════════════════════════════════════════════════════
-- Phase 13 — 추천 알고리즘 + 카테고리 캐러셀 RPC
-- 적용 일자: 2026-05-14
-- 선행: videos (category, tags, show_on_*, visibility, is_hidden),
--       video_likes (Phase 추정), video_views (Phase 8)
--
-- 시네마/OTT를 넷플릭스 스타일 가로 행 캐러셀로 재구성하기 위한 RPC들.
-- v1 룰 기반 (협업 필터링은 Phase 14+에서 도입).
--
-- 모든 함수 공통 필터:
--   - visibility = 'public'
--   - is_hidden = false (또는 NULL)
--   - 본인 업로드 영상 제외 (p_exclude_self = true일 때)
--
-- p_tier 파라미터: 'cinema' (3분+) / 'ott' (10분+) / 'all'
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 공통 헬퍼 뷰 (자주 사용하는 필터 + JOIN을 캡슐화)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_available_videos AS
SELECT
  v.id,
  v.title,
  v.thumbnail,
  v.video_url,
  v.creator,
  v.creator_id,
  v.category,
  v.tags,
  v.ai_tool,
  v.duration,
  v.duration_seconds,
  v.views,
  v.likes,
  v.price_standard,
  v.show_on_home,
  v.show_on_cinema,
  v.show_on_ott,
  v.highlight_start,
  v.highlight_end,
  v.created_at,
  p.display_name AS creator_display_name,
  p.avatar_url AS creator_avatar
FROM public.videos v
LEFT JOIN public.profiles p ON p.id = v.creator_id
WHERE
  COALESCE(v.visibility, 'public') = 'public'
  AND COALESCE(v.is_hidden, false) = false;

COMMENT ON VIEW public.v_available_videos IS
  '공개 + 숨김 아님 영상 (모든 추천 RPC에서 재사용)';

-- ────────────────────────────────────────────────────────────────────────────
-- A. 추천 영상 (For You)
--    사용자가 좋아요한 영상의 카테고리/태그 기반.
--    좋아요/시청 이력 없으면 fallback으로 최신 인기 영상.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_recommended_videos(
  p_tier TEXT DEFAULT 'all',     -- 'cinema' / 'ott' / 'all'
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
DECLARE
  v_user_id UUID := auth.uid();
  v_has_history BOOLEAN;
BEGIN
  -- 사용자 좋아요 또는 시청 이력 존재 여부
  SELECT EXISTS (
    SELECT 1 FROM public.video_likes WHERE user_id = v_user_id
    UNION ALL
    SELECT 1 FROM public.video_views WHERE viewer_user_id = v_user_id AND is_valid = true
    LIMIT 1
  ) INTO v_has_history;

  IF v_user_id IS NULL OR NOT v_has_history THEN
    -- 비로그인 또는 신규 사용자 → 최근 인기 영상 (24h 시청수 + 좋아요수)
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

  -- 로그인 + 이력 있음 → 카테고리 + 태그 기반 추천
  RETURN QUERY
  WITH user_categories AS (
    -- 좋아요한 영상의 카테고리 (가중치 2) + 시청한 영상의 카테고리 (가중치 1)
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
  LEFT JOIN category_scores cs ON cs.category = v.category
  WHERE
    v.creator_id IS DISTINCT FROM v_user_id    -- 본인 영상 제외
    AND v.id NOT IN (SELECT video_id FROM watched_ids)  -- 이미 본 영상 제외
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY score DESC NULLS LAST, v.created_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_recommended_videos IS
  '사용자 좋아요/시청 이력 기반 카테고리·태그 추천. 신규/비로그인은 인기 영상 fallback';

-- ────────────────────────────────────────────────────────────────────────────
-- B. 인기 영상 (Trending Now) — 최근 N시간 시청수 기반
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_trending_videos(
  p_tier TEXT DEFAULT 'all',
  p_hours INTEGER DEFAULT 24,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ, recent_views BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at,
    COUNT(vv.id)::BIGINT AS recent_views
  FROM public.v_available_videos v
  LEFT JOIN public.video_views vv
    ON vv.video_id = v.id
    AND vv.is_valid = true
    AND vv.occurred_at >= now() - (p_hours || ' hours')::INTERVAL
  WHERE
    (p_tier = 'all' OR
     (p_tier = 'cinema' AND v.show_on_cinema = true) OR
     (p_tier = 'ott' AND v.show_on_ott = true))
  GROUP BY v.id, v.title, v.thumbnail, v.video_url, v.creator, v.creator_id,
           v.creator_display_name, v.creator_avatar, v.category, v.ai_tool,
           v.duration, v.duration_seconds, v.views, v.price_standard,
           v.highlight_start, v.highlight_end, v.created_at
  HAVING COUNT(vv.id) > 0
  ORDER BY recent_views DESC, v.created_at DESC
  LIMIT p_limit;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- C. 새로 추가됨 (New Releases) — 최근 N일 업로드
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_new_releases(
  p_tier TEXT DEFAULT 'all',
  p_days INTEGER DEFAULT 14,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at
  FROM public.v_available_videos v
  WHERE
    v.created_at >= now() - (p_days || ' days')::INTERVAL
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- D. 이어 보기 (Continue Watching) — 30~85% 시청 중인 영상
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_continue_watching(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ,
  last_watched_ratio NUMERIC, last_watched_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;  -- 비로그인 빈 결과
  END IF;

  RETURN QUERY
  WITH last_views AS (
    SELECT DISTINCT ON (vv.video_id)
      vv.video_id,
      vv.watch_ratio,
      vv.occurred_at
    FROM public.video_views vv
    WHERE vv.viewer_user_id = v_user_id
      AND vv.is_valid = true
      AND vv.watch_ratio BETWEEN 0.30 AND 0.85
    ORDER BY vv.video_id, vv.occurred_at DESC
  )
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at,
    lv.watch_ratio AS last_watched_ratio,
    lv.occurred_at AS last_watched_at
  FROM public.v_available_videos v
  JOIN last_views lv ON lv.video_id = v.id
  ORDER BY lv.occurred_at DESC
  LIMIT p_limit;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- E. 카테고리별 영상
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_videos_by_category(
  p_category TEXT,
  p_tier TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at
  FROM public.v_available_videos v
  WHERE
    v.category = p_category
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- F. 사용 가능한 카테고리 목록 (영상이 있는 카테고리만)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_categories_with_count(
  p_tier TEXT DEFAULT 'all',
  p_min_count INTEGER DEFAULT 1
)
RETURNS TABLE (
  category TEXT,
  video_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    v.category,
    COUNT(*)::BIGINT AS video_count
  FROM public.v_available_videos v
  WHERE
    v.category IS NOT NULL
    AND v.category <> ''
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  GROUP BY v.category
  HAVING COUNT(*) >= p_min_count
  ORDER BY video_count DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- G. 비슷한 영상 (영상 상세 페이지 "다음 영상" — 같은 카테고리/태그)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_similar_videos(
  p_video_id TEXT,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_category TEXT;
BEGIN
  SELECT category INTO v_category FROM public.videos WHERE id = p_video_id;

  RETURN QUERY
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at
  FROM public.v_available_videos v
  WHERE
    v.id <> p_video_id
    AND (v_category IS NULL OR v.category = v_category)
  ORDER BY COALESCE(v.likes, 0) DESC, v.created_at DESC
  LIMIT p_limit;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT * FROM public.get_recommended_videos('cinema', 5);
--   SELECT * FROM public.get_trending_videos('cinema', 24, 5);
--   SELECT * FROM public.get_new_releases('cinema', 14, 5);
--   SELECT * FROM public.get_continue_watching(5);
--   SELECT * FROM public.get_categories_with_count('cinema', 1);
--   SELECT * FROM public.get_videos_by_category('AI영화', 'cinema', 5);
--   SELECT * FROM public.get_similar_videos('영상ID', 5);
-- ════════════════════════════════════════════════════════════════════════════
