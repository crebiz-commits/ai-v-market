-- ════════════════════════════════════════════════════════════════════════════
-- 검색 피드 2차 감사 수정 (2026-07-10)
--
--   [MED-3] 정지(is_suspended) 크리에이터 노출 비일관 — search_creators/get_popular_creators
--           는 정지 크리에이터를 제외하는데, search_videos·get_search_suggestions 는 그 사람
--           "영상·이름"을 그대로 검색·제안에 노출("리스트에선 사라지는데 영상은 뜸"=자기모순).
--           v_available_videos 는 is_hidden/visibility 만 필터(크리에이터 정지 미반영). admin_suspend_user
--           는 프로필 is_suspended 만 세팅(영상 is_hidden 미변경)이라 영상이 계속 검색됨.
--           → 검색 2면(영상검색·자동완성)에만 정지 크리에이터 제외 추가(다른 탐색면과 일관).
--           ※ v_available_videos 전체 변경은 시네마/OTT/홈 전면 blast radius 커서 하지 않음.
--
--   [MED-4] 검색 디스커버리 "지금 뜨는 영상"·카테고리 캐러셀 카드 조회수가 항상 0 —
--           get_home_feed_by_ids 가 v_home_feed_public 을 반환하는데 이 뷰에 views 컬럼이 없어
--           클라 r.views=undefined. (검색결과 그리드는 v_available_videos 라 정상.)
--           → v_home_feed_public 투영에 v.views 추가(공개지표, 민감정보 아님). 뷰 컬럼 "끝 추가"라
--             SETOF 뷰 반환 함수(get_home_feed/get_home_feed_by_ids)는 재생성 없이 자동 포함.
--             홈 mapVideoRow 는 views 미사용이라 홈 무영향(개선만).
--
--   [LOW-5] get_my_watch_history 가 SECURITY DEFINER 인데 인라인 SET search_path 부재 —
--           라이브는 스윕(20260707)이 방어하나 phase17 단독 재실행 시 회귀. ALTER 로 고정.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── MED-4: v_home_feed_public 에 views 추가(끝에 추가 → 의존 함수 안 깨짐) ──
--   기존 컬럼 순서·이름·타입 100% 보존 + 맨 끝에 v.views 만 추가.
CREATE OR REPLACE VIEW public.v_home_feed_public AS
SELECT
  v.id, v.thumbnail, v.title, v.creator, v.creator_id, v.likes, v.price_standard,
  v.duration, v.duration_seconds, v.resolution, v.ai_tool, v.category, v.genre,
  v.video_url, v.age_rating, v.description, v.tags, v.ai_model_version, v.prompt,
  v.seed, v.director, v.writer, v.composer, v.cast_credits, v.production_year,
  v.language, v.subtitle_language, v.visibility, v.highlight_start, v.highlight_end,
  v.series_id,
  v.show_on_home, v.show_on_ott, v.is_hidden, v.episode_number, v.created_at,
  v.views   -- 공개 조회수(실측 SSOT는 videos.views). 트렌딩/카테고리 캐러셀 카드 조회수 표시용.
FROM public.videos v;

-- ── MED-3: search_videos — 정지 크리에이터 영상 제외 (SSOT=search_feed_audit_20260710.sql 기준
--    = LIKE 이스케이프(v_esc)+결정적 tiebreak(v.id) 유지, WHERE 에 NOT EXISTS(정지) 추가) ──
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
    -- MED-3: 정지 크리에이터 영상 제외(크리에이터 검색·인기와 일관)
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = v.creator_id AND COALESCE(p2.is_suspended, false) = true
    )
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
    v.created_at DESC, v.id
  LIMIT GREATEST(p_limit, 1)
  OFFSET GREATEST(p_offset, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.search_videos(TEXT, TEXT, TEXT, INTEGER, INTEGER, INTEGER, TEXT, INTEGER, INTEGER) TO anon, authenticated;

-- ── MED-3: get_search_suggestions — 정지 크리에이터의 제목/이름 제안 제외 ──
CREATE OR REPLACE FUNCTION public.get_search_suggestions(
  p_query TEXT,
  p_limit INTEGER DEFAULT 8
)
RETURNS TABLE (
  suggestion TEXT,
  source     TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  WITH q AS (SELECT lower(btrim(p_query)) AS lq),
  matches AS (
    SELECT v.title AS suggestion, 'title'::TEXT AS source, 1 AS rank
    FROM public.v_available_videos v, q
    WHERE q.lq <> '' AND lower(v.title) LIKE q.lq || '%'
      AND NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = v.creator_id AND COALESCE(p2.is_suspended, false) = true)

    UNION

    SELECT v.title, 'title', 2
    FROM public.v_available_videos v, q
    WHERE q.lq <> '' AND lower(v.title) LIKE '%' || q.lq || '%'
      AND NOT (lower(v.title) LIKE q.lq || '%')
      AND NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = v.creator_id AND COALESCE(p2.is_suspended, false) = true)

    UNION

    SELECT COALESCE(p.display_name, v.creator), 'creator', 3
    FROM public.v_available_videos v
    LEFT JOIN public.profiles p ON p.id = v.creator_id, q
    WHERE q.lq <> ''
      AND lower(COALESCE(p.display_name, v.creator)) LIKE '%' || q.lq || '%'
      AND COALESCE(p.is_suspended, false) = false
  )
  SELECT suggestion, source FROM (
    SELECT DISTINCT ON (lower(suggestion)) suggestion, source, rank
    FROM matches
    ORDER BY lower(suggestion), rank
  ) d
  ORDER BY d.rank, d.suggestion
  LIMIT GREATEST(p_limit, 1);
$$;
GRANT EXECUTE ON FUNCTION public.get_search_suggestions(TEXT, INTEGER) TO anon, authenticated;

-- ── LOW-5: get_my_watch_history search_path 인라인 고정(스윕 재실행 없이도 방어) ──
ALTER FUNCTION public.get_my_watch_history(integer, integer) SET search_path = public;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   -- 뷰에 views 컬럼 생겼는지 + 트렌딩 조회수 채워지는지:
--   SELECT id, views FROM public.get_home_feed_by_ids(ARRAY(SELECT public.get_home_feed_order('popular') LIMIT 3));
--   -- 정지 크리에이터 영상/이름이 검색·제안서 사라지는지(정지 계정으로 테스트):
--   SELECT count(*) FROM public.search_videos('', p_limit => 500);
--   SELECT * FROM public.get_search_suggestions('a', 8);
--   -- search_path 고정 확인:
--   SELECT proname, proconfig FROM pg_proc WHERE proname = 'get_my_watch_history';
