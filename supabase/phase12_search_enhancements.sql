-- ════════════════════════════════════════════════════════════════════════════
-- Phase 12 — 검색 강화 (자동완성·필터·정렬·인기 검색어)
-- 적용 일자: 2026-05-15
-- 선행: v_available_videos 뷰, profiles, videos
--
-- 목적:
--   1. 영상/크리에이터 통합 검색 (제목/태그/크리에이터명 매칭)
--   2. 필터 (카테고리·AI 도구·길이·가격)
--   3. 정렬 (관련도·최신·조회수·좋아요)
--   4. 자동완성 + 인기 검색어 (search_logs 집계)
--
-- 매칭 방식: ilike (단순 부분일치, 대소문자 무관). 한국어에 적합.
--   - title startsWith → match_score=3
--   - title contains   → match_score=2
--   - tag/크리에이터 contains → match_score=1
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: search_logs 테이블 (인기 검색어 집계용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.search_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query       TEXT NOT NULL CHECK (char_length(query) BETWEEN 2 AND 100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_logs_lower_query_created
  ON public.search_logs (lower(query), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_search_logs_created
  ON public.search_logs (created_at DESC);

ALTER TABLE public.search_logs ENABLE ROW LEVEL SECURITY;

-- 본인 검색만 본인이 조회 가능 (관리자 통계는 SECURITY DEFINER RPC가 처리)
DROP POLICY IF EXISTS "search_logs_select_own" ON public.search_logs;
CREATE POLICY "search_logs_select_own"
  ON public.search_logs FOR SELECT
  USING (auth.uid() = user_id);
-- INSERT는 RPC만

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 검색 로깅 RPC (검색 시점마다 호출)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_search_query(p_query TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_query TEXT := btrim(p_query);
BEGIN
  -- 너무 짧거나 비어있는 검색은 로그 안 남김
  IF v_query IS NULL OR char_length(v_query) < 2 OR char_length(v_query) > 100 THEN
    RETURN;
  END IF;
  INSERT INTO public.search_logs (user_id, query) VALUES (auth.uid(), v_query);
END;
$$;

COMMENT ON FUNCTION public.log_search_query IS
  '검색 시점마다 검색어 로깅. 인기 검색어 집계에 사용';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 인기 검색어 RPC (최근 N일 집계)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_popular_searches(
  p_limit INTEGER DEFAULT 10,
  p_days  INTEGER DEFAULT 7
)
RETURNS TABLE (
  query     TEXT,
  hit_count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT lower(query) AS query, COUNT(*) AS hit_count
  FROM public.search_logs
  WHERE created_at >= now() - (p_days || ' days')::INTERVAL
    AND char_length(query) >= 2
  GROUP BY lower(query)
  ORDER BY hit_count DESC, MAX(created_at) DESC
  LIMIT GREATEST(p_limit, 1);
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 자동완성 RPC (영상 제목 prefix + 최근 인기 검색어)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_search_suggestions(
  p_query TEXT,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  suggestion TEXT,
  source     TEXT      -- 'title' / 'tag' / 'creator' / 'popular'
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH q AS (SELECT lower(btrim(p_query)) AS lq),
  matches AS (
    SELECT v.title AS suggestion, 'title'::TEXT AS source, 1 AS rank
    FROM public.v_available_videos v, q
    WHERE q.lq <> '' AND lower(v.title) LIKE q.lq || '%'

    UNION

    SELECT v.title, 'title', 2
    FROM public.v_available_videos v, q
    WHERE q.lq <> '' AND lower(v.title) LIKE '%' || q.lq || '%'
      AND NOT (lower(v.title) LIKE q.lq || '%')

    UNION

    SELECT COALESCE(p.display_name, v.creator), 'creator', 3
    FROM public.v_available_videos v
    LEFT JOIN public.profiles p ON p.id = v.creator_id, q
    WHERE q.lq <> ''
      AND lower(COALESCE(p.display_name, v.creator)) LIKE '%' || q.lq || '%'
  )
  -- 동일 suggestion 은 최선 rank 1개만 남긴 뒤(내부), rank 순으로 정렬해 LIMIT
  -- (기존엔 가나다순으로 잘려 prefix 매칭이 상위에 안 오던 버그 — 2026-06-25)
  SELECT suggestion, source FROM (
    SELECT DISTINCT ON (lower(suggestion)) suggestion, source, rank
    FROM matches
    ORDER BY lower(suggestion), rank
  ) d
  ORDER BY d.rank, d.suggestion
  LIMIT GREATEST(p_limit, 1);
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: 영상 검색 RPC (필터·정렬 포함)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_videos(
  p_query        TEXT     DEFAULT '',
  p_category     TEXT     DEFAULT NULL,
  p_ai_tool      TEXT     DEFAULT NULL,
  p_min_duration INTEGER  DEFAULT NULL,
  p_max_duration INTEGER  DEFAULT NULL,
  p_max_price    INTEGER  DEFAULT NULL,
  p_sort         TEXT     DEFAULT 'relevance',  -- relevance / latest / views / likes
  p_limit        INTEGER  DEFAULT 30,
  p_offset       INTEGER  DEFAULT 0
)
RETURNS TABLE (
  id                    TEXT,
  title                 TEXT,
  thumbnail             TEXT,
  video_url             TEXT,
  creator               TEXT,
  creator_id            UUID,
  creator_display_name  TEXT,
  creator_avatar        TEXT,
  category              TEXT,
  tags                  TEXT,
  ai_tool               TEXT,
  duration              TEXT,
  duration_seconds      INTEGER,
  views_count           INTEGER,
  likes                 INTEGER,
  price_standard        INTEGER,
  created_at            TIMESTAMPTZ,
  match_score           INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_lq TEXT := lower(btrim(COALESCE(p_query, '')));
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.title,
    v.thumbnail,
    v.video_url,
    v.creator,
    v.creator_id,
    v.creator_display_name,
    v.creator_avatar,
    v.category,
    -- tags가 TEXT[] 배열이라 문자열로 변환 (콤마 구분)
    COALESCE(array_to_string(v.tags, ','), '')::TEXT AS tags,
    v.ai_tool,
    v.duration,
    v.duration_seconds,
    -- views가 TEXT/INTEGER 어느 쪽이어도 안전 캐스팅
    COALESCE(
      NULLIF(regexp_replace(COALESCE(v.views::TEXT, '0'), '[^0-9]', '', 'g'), '')::INTEGER,
      0
    ) AS views_count,
    v.likes,
    v.price_standard,
    v.created_at,
    (CASE
       WHEN v_lq = '' THEN 0
       WHEN lower(v.title) LIKE v_lq || '%' THEN 3
       WHEN lower(v.title) LIKE '%' || v_lq || '%' THEN 2
       WHEN lower(COALESCE(array_to_string(v.tags, ','), '')) LIKE '%' || v_lq || '%' THEN 1
       WHEN lower(COALESCE(v.creator_display_name, v.creator)) LIKE '%' || v_lq || '%' THEN 1
       ELSE 0
     END) AS match_score
  FROM public.v_available_videos v
  WHERE
    (v_lq = ''
      OR lower(v.title) LIKE '%' || v_lq || '%'
      OR lower(COALESCE(array_to_string(v.tags, ','), '')) LIKE '%' || v_lq || '%'
      OR lower(COALESCE(v.creator_display_name, v.creator)) LIKE '%' || v_lq || '%')
    AND (p_category IS NULL OR v.category = p_category)
    AND (p_ai_tool IS NULL OR v.ai_tool = p_ai_tool)
    AND (p_min_duration IS NULL OR v.duration_seconds >= p_min_duration)
    AND (p_max_duration IS NULL OR v.duration_seconds <= p_max_duration)
    AND (p_max_price IS NULL OR COALESCE(v.price_standard, 0) <= p_max_price)
  ORDER BY
    CASE WHEN p_sort = 'relevance' THEN
      (CASE
         WHEN v_lq = '' THEN 0
         WHEN lower(v.title) LIKE v_lq || '%' THEN 3
         WHEN lower(v.title) LIKE '%' || v_lq || '%' THEN 2
         WHEN lower(COALESCE(array_to_string(v.tags, ','), '')) LIKE '%' || v_lq || '%' THEN 1
         WHEN lower(COALESCE(v.creator_display_name, v.creator)) LIKE '%' || v_lq || '%' THEN 1
         ELSE 0
       END)
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'latest' THEN v.created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'views' THEN
      COALESCE(NULLIF(regexp_replace(COALESCE(v.views::TEXT, '0'), '[^0-9]', '', 'g'), '')::INTEGER, 0)
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'likes' THEN v.likes END DESC NULLS LAST,
    v.created_at DESC
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;

COMMENT ON FUNCTION public.search_videos IS
  '영상 검색. 제목/태그/크리에이터 ilike 매칭 + 카테고리·AI도구·길이·가격 필터 + 4종 정렬';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: 크리에이터 검색 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.search_creators(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  creator_id      UUID,
  display_name    TEXT,
  avatar_url      TEXT,
  bio             TEXT,
  video_count     BIGINT,
  follower_count  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH q AS (SELECT lower(btrim(COALESCE(p_query, ''))) AS lq)
  SELECT
    p.id AS creator_id,
    p.display_name,
    p.avatar_url,
    p.bio,
    COALESCE((SELECT COUNT(*) FROM public.v_available_videos v WHERE v.creator_id = p.id), 0) AS video_count,
    COALESCE((SELECT COUNT(*) FROM public.creator_followers cf WHERE cf.creator_id = p.id), 0) AS follower_count
  FROM public.profiles p, q
  WHERE q.lq <> ''
    AND lower(COALESCE(p.display_name, '')) LIKE '%' || q.lq || '%'
    AND COALESCE(p.is_suspended, false) = false
  ORDER BY follower_count DESC, video_count DESC
  LIMIT GREATEST(p_limit, 1);
$$;

COMMENT ON FUNCTION public.search_creators IS
  '크리에이터 검색. display_name ilike 매칭. 팔로워 많은 순으로 정렬';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 검색 (필터 없음)
--   SELECT id, title, match_score FROM public.search_videos('터미널');
--
--   -- 2. 카테고리 필터
--   SELECT id, title, category FROM public.search_videos('AI', 'cinema'::TEXT);
--
--   -- 3. 자동완성
--   SELECT * FROM public.get_search_suggestions('터');
--
--   -- 4. 검색 로그 + 인기 검색어
--   SELECT public.log_search_query('터미널');
--   SELECT public.log_search_query('학원물');
--   SELECT public.log_search_query('터미널');
--   SELECT * FROM public.get_popular_searches(5);
--
--   -- 5. 크리에이터 검색
--   SELECT * FROM public.search_creators('크리');
-- ════════════════════════════════════════════════════════════════════════════
