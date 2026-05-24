-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY DEFINER 함수 search_path 일괄 보강 (2026-05-24)
--
-- 목적:
--   SECURITY DEFINER 함수가 search_path 미명시 시 search_path hijacking 위험.
--   (호출자가 set_config('search_path', ...)로 다른 schema 우선시키면
--    SECURITY DEFINER 함수가 의도하지 않은 테이블/함수를 참조)
--
-- 동작:
--   pg_proc 에서 SECURITY DEFINER + search_path 미설정 함수를 찾아
--   ALTER FUNCTION ... SET search_path = public, pg_temp 일괄 적용
--
-- 안전성:
--   - ALTER FUNCTION SET search_path 는 함수 본문을 변경하지 않음 (메타데이터만)
--   - 이미 SET 된 함수는 건드리지 않음 (proconfig 체크)
--   - public schema 의 SECURITY DEFINER 함수만 대상 (system schema 제외)
--   - 회귀 위험 없음
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
--
-- 결과:
--   상단에 "보강된 함수 개수" 메시지 출력 (NOTICE)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  r RECORD;
  v_fixed_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args,
      p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true   -- SECURITY DEFINER 만
  LOOP
    -- proconfig 가 NULL 또는 search_path 미포함이면 적용
    IF r.proconfig IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM unnest(r.proconfig) AS c
         WHERE c LIKE 'search_path=%'
       )
    THEN
      BEGIN
        EXECUTE format(
          'ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp',
          r.proname, r.args
        );
        v_fixed_count := v_fixed_count + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '실패: public.%(%) - %', r.proname, r.args, SQLERRM;
      END;
    ELSE
      v_skipped_count := v_skipped_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '✅ search_path 보강 완료';
  RAISE NOTICE '   - 새로 보강된 함수: % 개', v_fixed_count;
  RAISE NOTICE '   - 이미 설정된 함수 (skip): % 개', v_skipped_count;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 (실행 후 확인)
--
--   -- 1. 모든 SECURITY DEFINER 함수에 search_path 설정됐는지 확인
--   --    (결과: 0 행이면 모두 보강됨)
--   SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.prosecdef = true
--     AND (p.proconfig IS NULL
--          OR NOT EXISTS (
--            SELECT 1 FROM unnest(p.proconfig) AS c
--            WHERE c LIKE 'search_path=%'
--          ));
--
--   -- 2. 보강된 search_path 확인 (샘플)
--   SELECT p.proname, p.proconfig
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosecdef = true
--   ORDER BY p.proname
--   LIMIT 10;
-- ────────────────────────────────────────────────────────────────────────────
