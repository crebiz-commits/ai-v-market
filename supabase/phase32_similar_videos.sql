-- ════════════════════════════════════════════════════════════════════════════
-- Phase 32 — 함께 시청된 콘텐츠 RPC (2026-05-30)
--
-- 목적: ProductDetail 영상 상세 페이지 하단에 "함께 시청된 콘텐츠" 가로 캐러셀
-- 알고리즘: 같은 크리에이터(3점) > 같은 장르(2점) > 같은 카테고리(1점) 가중치
-- 자기 자신은 제외, 영상 길이/공개 조건은 v_available_videos 뷰가 처리
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 → 본 파일 전체 복붙 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- 기존 get_similar_videos 모든 시그니처 일괄 삭제 (UUID/TEXT 등 다른 인자 변형 대비)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'get_similar_videos'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_similar_videos(
  p_video_id TEXT,                    -- 기준 영상 ID
  p_tier TEXT DEFAULT 'all',          -- 'cinema' / 'ott' / 'all'
  p_limit INTEGER DEFAULT 8           -- 반환 개수
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, genre TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ, similarity_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_creator_id UUID;
  v_category TEXT;
  v_genre TEXT;
BEGIN
  -- 1) 기준 영상의 크리에이터·카테고리·장르 조회
  SELECT v.creator_id, v.category, v.genre
    INTO v_creator_id, v_category, v_genre
  FROM public.videos v
  WHERE v.id::TEXT = p_video_id;

  -- 영상이 없으면 빈 결과
  IF v_creator_id IS NULL AND v_category IS NULL AND v_genre IS NULL THEN
    RETURN;
  END IF;

  -- 2) 유사 영상 검색 (가중치 점수 기반)
  RETURN QUERY
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at,
    (
      -- 같은 크리에이터 3점
      CASE WHEN v.creator_id = v_creator_id AND v_creator_id IS NOT NULL THEN 3 ELSE 0 END
      -- 같은 장르 2점
      + CASE WHEN v.genre = v_genre AND v_genre IS NOT NULL THEN 2 ELSE 0 END
      -- 같은 카테고리 1점
      + CASE WHEN v.category = v_category AND v_category IS NOT NULL THEN 1 ELSE 0 END
    )::NUMERIC AS similarity_score
  FROM public.v_available_videos v
  WHERE
    v.id::TEXT != p_video_id  -- 자기 자신 제외
    AND (
      v.creator_id = v_creator_id
      OR v.genre = v_genre
      OR v.category = v_category
    )
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY
    similarity_score DESC,
    v.likes DESC NULLS LAST,
    v.created_at DESC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_similar_videos IS
  '기준 영상과 유사한 영상 추천 (같은 크리에이터·장르·카테고리 가중치 점수)';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 확인용)
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT id, title, creator_display_name, category, genre, similarity_score
-- FROM public.get_similar_videos('<영상-UUID>', 'all', 5);
