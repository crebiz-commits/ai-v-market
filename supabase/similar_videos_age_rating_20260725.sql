-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 유사영상 age_rating 반환 (2026-07-25, A6) — 관련영상 썸네일 청소년보호 로딩창 제거
--
--   get_similar_videos 는 age_rating 을 반환하지 않아, ProductDetail 의 "함께 시청된
--   콘텐츠"·"다음 영상" 카드가 useAgeRatings 훅의 별도 RPC 응답(~수백ms)을 기다리는
--   동안 19+ 썸네일이 무블러로 노출됐다(shouldBlur(undefined)=false=fail-open).
--   → RPC 가 age_rating 을 함께 실어주면 클라가 모듈 캐시를 즉시 seed 하여 창이 사라진다.
--
--   v_available_videos 뷰는 age_rating 을 노출하지 않으므로(명시적 컬럼목록) videos 를
--   LEFT JOIN 해서 원본 등급을 가져온다. 뷰 자체는 건드리지 않음(피드 SSOT 리스크 회피).
--   ★ get_similar_videos 새 정본. phase32_similar_videos.sql 재실행 금지(age_rating 누락으로 회귀).
--
-- 적용: Supabase SQL Editor → Run (멱등). 게이트 #58.
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
  category TEXT, genre TEXT, age_rating TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ, similarity_score NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public   -- 게이트 #9: CREATE OR REPLACE 는 sweep 이 ALTER 로 붙인 search_path 를 초기화 → 정의부에 직접 고정
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
    v.category, v.genre, COALESCE(src.age_rating, 'all'), v.ai_tool, v.duration, v.duration_seconds,
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
  LEFT JOIN public.videos src ON src.id = v.id   -- age_rating 원본 (뷰 미노출 컬럼)
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
  '기준 영상과 유사한 영상 추천 (같은 크리에이터·장르·카테고리 가중치 점수). age_rating 포함(A6).';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
-- ────────────────────────────────────────────────────────────────────────────
SELECT 'get_similar_videos age_rating 반환' AS check_name,
  CASE WHEN to_regprocedure('public.get_similar_videos(text,text,integer)') IS NOT NULL
    AND pg_get_function_result(to_regprocedure('public.get_similar_videos(text,text,integer)')) ~ 'age_rating'
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
