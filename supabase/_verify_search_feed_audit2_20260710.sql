-- ════════════════════════════════════════════════════════════════════════════
-- 검색 피드 2차 감사 검증 (search_feed_audit2_20260710.sql 적용 확인용, 읽기전용)
--   단일 결과표 — 5행 모두 ok=true 여야 정상. Supabase SQL Editor → Run.
--   (여러 SELECT는 마지막 결과만 보이므로 하나로 합침)
-- ════════════════════════════════════════════════════════════════════════════
SELECT '1_views_컬럼추가(MED-4)' AS check_item,
       EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='v_home_feed_public' AND column_name='views') AS ok
UNION ALL
SELECT '2_트렌딩_조회수채워짐(MED-4)',
       (SELECT COUNT(*) FILTER (WHERE views IS NOT NULL) > 0
        FROM public.get_home_feed_by_ids(ARRAY(SELECT public.get_home_feed_order('popular') LIMIT 5)))
UNION ALL
SELECT '3a_search_videos_정지제외(MED-3)',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%is_suspended%') FROM pg_proc WHERE proname='search_videos')
UNION ALL
SELECT '3b_suggestions_정지제외(MED-3)',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%is_suspended%') FROM pg_proc WHERE proname='get_search_suggestions')
UNION ALL
SELECT '4_watch_history_search_path(LOW-5)',
       (SELECT bool_or(proconfig::text ILIKE '%search_path=public%') FROM pg_proc WHERE proname='get_my_watch_history')
ORDER BY check_item;
