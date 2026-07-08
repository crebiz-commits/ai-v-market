-- ════════════════════════════════════════════════════════════════════════════
-- 시네마/OTT RPC 명시적 EXECUTE GRANT — 드리프트 보험 (2026-07-08)
--
--   배경: cinema_rpc_hardening_20260708.sql 에서 get_videos_by_genre 는 명시적
--         GRANT(:156)가 있으나, 나머지 시네마/OTT RPC 4종은 명시 GRANT 없이 PostgreSQL
--         기본 PUBLIC EXECUTE 에 의존한다. 현재는 anon 호출 정상(시네마·OTT 행 동작).
--   위험: 향후 `REVOKE EXECUTE ON ALL FUNCTIONS ... FROM PUBLIC` 하드닝 스윕이 들어오면
--         이 4종만 조용히 anon 에서 끊겨 시네마/OTT 행이 빈다. 라이브 재배포 시 grant 가
--         PUBLIC 기본으로 리셋된다는 점도 hardening_live_20260703 헤더가 경고.
--   조치: genre RPC 와 동일하게 나머지 4종에도 명시적 GRANT 부여(멱등). 전체 RPC 집합의
--         권한 패턴을 일관화해 드리프트에 견고하게 만든다.
--   적용: Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.get_trending_videos(text, integer, integer)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_videos_by_category(text, text, integer)   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_new_releases(text, integer, integer)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recommended_videos(text, integer)         TO anon, authenticated;
-- (get_videos_by_genre 는 cinema_rpc_hardening_20260708.sql:156 에서 이미 부여됨)

-- 검증:
--   SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
--   FROM pg_proc p
--   WHERE p.proname IN ('get_trending_videos','get_videos_by_category','get_new_releases',
--                       'get_recommended_videos','get_videos_by_genre');
--   -- 기대: 다섯 함수 모두 anon_exec = true
