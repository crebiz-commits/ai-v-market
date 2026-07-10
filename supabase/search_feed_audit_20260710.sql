-- ════════════════════════════════════════════════════════════════════════════
-- 검색 피드 감사 수정 (2026-07-10)
--
--   [M-2] search_videos 결정적 tiebreak 부재(cinema 하드닝에서 유일하게 누락) → 페이지네이션
--         중복/누락. ORDER BY 말미에 v.id 추가.
--   [M-4] LIKE 와일드카드(%, _) 미이스케이프 → "50%"/"a_b" 같은 검색어가 패턴으로 오작동. 이스케이프.
--   [M-1] 인기검색 조작(1인 반복 로깅) + anon 무제한 로깅. log_search_query 는 로그인 사용자만,
--         get_popular_searches 는 COUNT(DISTINCT user_id)로 1인 인플레 차단.
--
--   ※ [H-1] 미검수(pending) 영상이 직접 PostgREST INSERT(is_hidden 생략)로 검색·전 피드에 노출될
--     수 있는 defense-in-depth 갭은 별도 처리 예정 — v_available_videos/v_home_feed_public 에
--     moderation_status 백스톱 추가 + 시드 백필 + 벌크업로드(service_role) 경로 영향 확인이 필요.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── M-2 + M-4: search_videos — LIKE 이스케이프 + 결정적 tiebreak(v.id) ──
CREATE OR REPLACE FUNCTION public.search_videos(
  p_query        TEXT     DEFAULT '',
  p_category     TEXT     DEFAULT NULL,
  p_ai_tool      TEXT     DEFAULT NULL,
  p_min_duration INTEGER  DEFAULT NULL,
  p_max_duration INTEGER  DEFAULT NULL,
  p_max_price    INTEGER  DEFAULT NULL,
  p_sort         TEXT     DEFAULT 'relevance',
  p_limit        INTEGER  DEFAULT 30,
  p_offset       INTEGER  DEFAULT 0
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT, creator TEXT, creator_id UUID,
  creator_display_name TEXT, creator_avatar TEXT, category TEXT, tags TEXT, ai_tool TEXT,
  duration TEXT, duration_seconds INTEGER, views_count INTEGER, likes INTEGER,
  price_standard INTEGER, created_at TIMESTAMPTZ, match_score INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  v_lq  TEXT := lower(btrim(COALESCE(p_query, '')));
  -- LIKE 와일드카드(%,_)·이스케이프문자(\) 리터럴화 — 정상 검색어가 패턴으로 오동작하는 것 방지.
  v_esc TEXT := replace(replace(replace(lower(btrim(COALESCE(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_');
BEGIN
  RETURN QUERY
  SELECT
    v.id, v.title, v.thumbnail, v.video_url, v.creator, v.creator_id,
    v.creator_display_name, v.creator_avatar, v.category,
    COALESCE(array_to_string(v.tags, ','), '')::TEXT AS tags,
    v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(NULLIF(regexp_replace(COALESCE(v.views::TEXT, '0'), '[^0-9]', '', 'g'), '')::INTEGER, 0) AS views_count,
    v.likes, v.price_standard, v.created_at,
    (CASE
       WHEN v_lq = '' THEN 0
       WHEN lower(v.title) LIKE v_esc || '%' THEN 3
       WHEN lower(v.title) LIKE '%' || v_esc || '%' THEN 2
       WHEN lower(COALESCE(array_to_string(v.tags, ','), '')) LIKE '%' || v_esc || '%' THEN 1
       WHEN lower(COALESCE(v.creator_display_name, v.creator)) LIKE '%' || v_esc || '%' THEN 1
       ELSE 0
     END) AS match_score
  FROM public.v_available_videos v
  WHERE
    (v_lq = ''
      OR lower(v.title) LIKE '%' || v_esc || '%'
      OR lower(COALESCE(array_to_string(v.tags, ','), '')) LIKE '%' || v_esc || '%'
      OR lower(COALESCE(v.creator_display_name, v.creator)) LIKE '%' || v_esc || '%')
    AND (p_category IS NULL OR v.category = p_category)
    AND (p_ai_tool IS NULL OR v.ai_tool = p_ai_tool)
    AND (p_min_duration IS NULL OR v.duration_seconds >= p_min_duration)
    AND (p_max_duration IS NULL OR v.duration_seconds <= p_max_duration)
    AND (p_max_price IS NULL OR COALESCE(v.price_standard, 0) <= p_max_price)
  ORDER BY
    CASE WHEN p_sort = 'relevance' THEN
      (CASE
         WHEN v_lq = '' THEN 0
         WHEN lower(v.title) LIKE v_esc || '%' THEN 3
         WHEN lower(v.title) LIKE '%' || v_esc || '%' THEN 2
         WHEN lower(COALESCE(array_to_string(v.tags, ','), '')) LIKE '%' || v_esc || '%' THEN 1
         WHEN lower(COALESCE(v.creator_display_name, v.creator)) LIKE '%' || v_esc || '%' THEN 1
         ELSE 0
       END)
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'latest' THEN v.created_at END DESC NULLS LAST,
    CASE WHEN p_sort = 'views' THEN
      COALESCE(NULLIF(regexp_replace(COALESCE(v.views::TEXT, '0'), '[^0-9]', '', 'g'), '')::INTEGER, 0)
    END DESC NULLS LAST,
    CASE WHEN p_sort = 'likes' THEN v.likes END DESC NULLS LAST,
    v.created_at DESC, v.id   -- 결정적 tiebreak — 동일 시각 대량적재분 페이지 경계 중복/누락 차단
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.search_videos(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) TO anon, authenticated;

-- ── M-1: log_search_query — 로그인 사용자만 로깅(anon 인플레·스팸 차단) ──
CREATE OR REPLACE FUNCTION public.log_search_query(p_query TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_query TEXT := btrim(p_query);
  v_uid   UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;   -- 비로그인 로깅 차단(인기검색 어뷰징 표면 축소)
  IF v_query IS NULL OR char_length(v_query) < 2 OR char_length(v_query) > 100 THEN RETURN; END IF;
  INSERT INTO public.search_logs (user_id, query) VALUES (v_uid, v_query);
END;
$$;

-- ── M-1: get_popular_searches — COUNT(DISTINCT user_id)로 1인 반복 인플레 차단 ──
CREATE OR REPLACE FUNCTION public.get_popular_searches(
  p_limit INTEGER DEFAULT 10,
  p_days  INTEGER DEFAULT 7
)
RETURNS TABLE (query TEXT, hit_count BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT lower(query) AS query, COUNT(DISTINCT user_id) AS hit_count
  FROM public.search_logs
  WHERE created_at >= now() - (p_days || ' days')::INTERVAL
    AND char_length(query) >= 2
    AND user_id IS NOT NULL
  GROUP BY lower(query)
  ORDER BY hit_count DESC, MAX(created_at) DESC, lower(query)
  LIMIT GREATEST(p_limit, 1);
$$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT * FROM public.search_videos('50%', p_limit => 5);  -- '%' 리터럴 검색이 전체매칭 안 됨
--   SELECT * FROM public.get_popular_searches(10, 7);          -- 1인 반복해도 hit_count 1
