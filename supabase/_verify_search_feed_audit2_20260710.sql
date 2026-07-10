-- ════════════════════════════════════════════════════════════════════════════
-- 검색 피드 2차 감사 검증 (search_feed_audit2_20260710.sql 적용 확인용, 읽기전용)
--   각 결과가 아래 "기대"와 맞으면 정상. Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- [1] MED-4 — v_home_feed_public 에 views 컬럼이 생겼는지 (기대: 1행, column_name=views)
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'v_home_feed_public' AND column_name = 'views';

-- [2] MED-4 — 트렌딩(인기 홈피드)이 조회수를 실제로 반환하는지 (기대: views 값이 채워짐, NULL 아님)
SELECT id, views
FROM public.get_home_feed_by_ids(ARRAY(SELECT public.get_home_feed_order('popular') LIMIT 5));

-- [3] MED-3 — search_videos/get_search_suggestions 에 정지 크리에이터 제외 로직이 들어갔는지
--     (기대: 두 함수 모두 is_suspended 문구가 정의에 존재 = true 2행)
SELECT proname, (pg_get_functiondef(oid) ILIKE '%is_suspended%') AS has_suspended_filter
FROM pg_proc
WHERE proname IN ('search_videos', 'get_search_suggestions')
ORDER BY proname;

-- [4] LOW-5 — get_my_watch_history search_path 고정 확인
--     (기대: proconfig 에 search_path=public 포함)
SELECT proname, proconfig
FROM pg_proc
WHERE proname = 'get_my_watch_history';
