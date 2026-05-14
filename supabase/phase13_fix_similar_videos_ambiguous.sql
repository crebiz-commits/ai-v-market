-- ════════════════════════════════════════════════════════════════════════════
-- Phase 13 hotfix — get_similar_videos 의 "column reference category is ambiguous" 해결
--
-- 원인: RETURNS TABLE의 `category TEXT` 가 OUT 파라미터(변수)로 등록됨
--       함수 본문 `SELECT category INTO v_category FROM public.videos` 에서
--       PostgreSQL 이 변수와 컬럼을 구분 못 함 → 42702 에러
--
-- 수정: `videos.category` 로 컬럼을 명시 (변수 v_category 와 명확히 분리)
--
-- 적용:
--   Supabase Dashboard → SQL Editor → 새 쿼리 "+ New query" → 본 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

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
  -- 컬럼 출처를 videos.category 로 명시 (OUT 파라미터 category 와 충돌 회피)
  SELECT videos.category INTO v_category
  FROM public.videos
  WHERE videos.id = p_video_id;

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

-- 검증:
--   SELECT * FROM public.get_similar_videos('어떤_영상_ID', 3);
