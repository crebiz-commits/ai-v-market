-- ════════════════════════════════════════════════════════════════════════════
-- #9 SECURITY DEFINER search_path 일괄 고정 스윕 (2026-07-07)
--
--   목적: 게이트 #9(WARN) — SECURITY DEFINER 인데 인라인 SET search_path 가 없는
--         함수를 전부 찾아 `ALTER FUNCTION ... SET search_path = public, pg_temp`
--         로 고정(search_path hijack 방어). **본문은 건드리지 않으므로** 다중정의
--         드리프트 위험 없이 안전.
--   방식: pg_proc 를 순회해 미고정 DEFINER 함수마다 ALTER 실행(멱등 — 이미 고정된
--         것은 애초에 대상에서 제외됨).
--   적용: Supabase SQL Editor → Run. NOTICE 로 고정된 함수 목록 출력.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
  v_cnt INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef                                  -- SECURITY DEFINER 만
      AND NOT EXISTS (                                 -- 아직 search_path 미고정
        SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
        WHERE c LIKE 'search_path=%'
      )
    ORDER BY 1
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    RAISE NOTICE 'search_path 고정: %', r.sig;
    v_cnt := v_cnt + 1;
  END LOOP;
  RAISE NOTICE '── 총 % 개 함수 search_path 고정 완료 ──', v_cnt;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(기대: 0개):
--   SELECT count(*) AS unpinned_definer_fns
--   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.prosecdef
--     AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
--                     WHERE c LIKE 'search_path=%');
-- ════════════════════════════════════════════════════════════════════════════
