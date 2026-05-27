-- ════════════════════════════════════════════════════════════════════════════
-- Phase 31 — 캐러셀 RPC 에 genre, likes 컬럼 반환 추가 (2026-05-28)
--
-- 목적: 시네마/OTT 카드 메타에 장르·좋아요 인라인 표시 (옵션 C — 인라인 미니)
-- 대상 RPC 5개:
--   - get_recommended_videos
--   - get_trending_videos
--   - get_new_releases
--   - get_continue_watching
--   - get_videos_by_category
--
-- 추가 컬럼:
--   - genre TEXT          (videos.genre)
--   - likes INTEGER       (videos.likes — Phase 23.1 video_likes 자동 동기화 컬럼)
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 → 본 파일 내용 전체 복붙 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 0-1. videos.genre 컬럼 보장 (없으면 추가)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS genre TEXT;

-- ────────────────────────────────────────────────────────────────────────────
-- 0-2. v_available_videos 뷰 재정의 (genre 컬럼 추가 — 맨 마지막에 위치)
-- ────────────────────────────────────────────────────────────────────────────
-- 주의: CREATE OR REPLACE VIEW 는 기존 컬럼 순서·이름을 변경할 수 없으므로
-- 기존 컬럼 순서 유지 + genre 는 맨 마지막에 추가
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
  p.avatar_url AS creator_avatar,
  v.genre
FROM public.videos v
LEFT JOIN public.profiles p ON p.id = v.creator_id
WHERE
  COALESCE(v.visibility, 'public') = 'public'
  AND COALESCE(v.is_hidden, false) = false;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. get_recommended_videos
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_recommended_videos(TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.get_recommended_videos(
  p_tier TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, genre TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
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
    COALESCE(cs.total_score, 0) + COALESCE(v.likes, 0) * 0.1 AS score
  FROM public.v_available_videos v
  LEFT JOIN category_scores cs ON cs.category = v.category
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

-- ────────────────────────────────────────────────────────────────────────────
-- 2. get_trending_videos
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_trending_videos(TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_trending_videos(
  p_tier TEXT DEFAULT 'all',
  p_hours INTEGER DEFAULT 24,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, genre TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
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
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
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
           v.creator_display_name, v.creator_avatar, v.category, v.genre, v.ai_tool,
           v.duration, v.duration_seconds, v.views, v.likes, v.price_standard,
           v.highlight_start, v.highlight_end, v.created_at
  HAVING COUNT(vv.id) > 0
  ORDER BY recent_views DESC, v.created_at DESC
  LIMIT p_limit;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. get_new_releases
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_new_releases(TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_new_releases(
  p_tier TEXT DEFAULT 'all',
  p_days INTEGER DEFAULT 14,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, genre TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
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
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
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
-- 4. get_continue_watching
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_continue_watching(INTEGER);

CREATE OR REPLACE FUNCTION public.get_continue_watching(
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, genre TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
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
    RETURN;
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
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
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
-- 5. get_videos_by_category
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_videos_by_category(TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION public.get_videos_by_category(
  p_category TEXT,
  p_tier TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, genre TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
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
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
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
-- 검증 쿼리 (실행 후 확인용)
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT id, title, category, genre, views, likes
-- FROM public.get_trending_videos('all', 168, 5);
