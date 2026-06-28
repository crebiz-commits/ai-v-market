-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 보안 불변식 검증 게이트 (read-only, 멱등, 2026-06-28)
--
--   목적: 핵심 보안 함수가 "여러 SQL 파일에 중복 정의"되어 적용 순서 역전 시
--         회귀(권한상승·PII덤프·재심사우회·내부컬럼노출)가 발생하는 구조 리스크를
--         배포 후 1회 Run 으로 자동 점검한다. 🔴 FAIL 이 하나라도 있으면 해당 fix
--         파일을 (가장 나중에) 재적용할 것.
--   (객체 "존재" 점검은 _verify_migrations_applied.sql, 이 파일은 "상태/불변식" 점검)
--
--   사용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run.
--         결과 표의 status 가 전부 ✅ PASS 여야 정상.
--   참고 SSOT:
--     - protect 8컬럼  → fix_protect_is_admin_20260624.sql
--     - profiles GRANT → fix_profiles_column_exposure_20260625.sql
--     - admin 게이트   → admin_dashboard_assert_admin_20260624.sql, phase10_6_admin_management.sql
--     - 홈피드 보안본  → get_home_feed_safe_columns_20260620.sql
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (

  -- 1) protect_subscription_columns 가 보호 8컬럼(특히 is_admin)을 모두 덮는가
  SELECT 1 AS sort,
    'protect_subscription_columns: 보호 8컬럼(is_admin 포함)' AS check_name,
    CASE
      WHEN to_regproc('public.protect_subscription_columns') IS NULL THEN '❌ MISSING'
      WHEN (SELECT bool_and(pg_get_functiondef(to_regproc('public.protect_subscription_columns')) LIKE '%'||c||'%')
            FROM unnest(ARRAY['is_admin','payout_info','referral_code','referred_by','referral_count',
                              'subscription_tier','subscription_started_at','subscription_expires_at']) AS c)
        THEN '✅ PASS' ELSE '🔴 FAIL' END AS status,
    'FAIL시 fix_protect_is_admin_20260624.sql 재적용 (권한상승 회귀 위험)' AS detail

  UNION ALL
  -- 2) 위 트리거가 profiles 에 BEFORE UPDATE 로 실제 연결돼 있는가
  SELECT 2,
    'profiles BEFORE UPDATE 트리거 연결',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname='public' AND c.relname='profiles'
        AND p.proname='protect_subscription_columns' AND NOT t.tgisinternal
    ) THEN '✅ PASS' ELSE '🔴 FAIL' END,
    '트리거 미연결시 보호함수가 있어도 무력(profiles_table.sql 의 연결 확인)'

  UNION ALL
  -- 3) profiles 테이블단위 SELECT 가 anon/authenticated/PUBLIC 에 부여돼 있지 않은가
  SELECT 3,
    'profiles 테이블단위 SELECT 미부여(PII 금지선)',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='profiles' AND privilege_type='SELECT'
        AND grantee IN ('anon','authenticated','PUBLIC')
    ) THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL=GRANT SELECT ON profiles(컬럼미지정) 존재 → 전 사용자 PII 덤프 가능'

  UNION ALL
  -- 4) profiles 민감 13컬럼이 anon/authenticated 에 컬럼단위로도 부여돼 있지 않은가
  SELECT 4,
    'profiles 민감컬럼 GRANT 0건',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.role_column_grants
      WHERE table_schema='public' AND table_name='profiles' AND grantee IN ('anon','authenticated')
        AND column_name IN ('payout_info','is_admin','email','birthdate','business_number',
          'business_name','tax_invoice_email','tax_type','referral_code','referred_by',
          'referral_count','deletion_requested_at','is_suspended')
    ) THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 fix_profiles_column_exposure_20260625.sql 재적용'

  UNION ALL
  -- 5) 공개표시용 안전 7컬럼은 정상 부여돼 있는가(미달시 채널/검색 표시 깨짐)
  SELECT 5,
    'profiles 안전컬럼 7종 GRANT 유지',
    CASE WHEN (
      SELECT count(DISTINCT column_name) FROM information_schema.role_column_grants
      WHERE table_schema='public' AND table_name='profiles' AND grantee IN ('anon','authenticated')
        AND privilege_type='SELECT'
        AND column_name IN ('id','display_name','avatar_url','banner_url','bio','subscription_tier','created_at')
    ) = 7 THEN '✅ PASS' ELSE '⚠️ WARN' END,
    'id/display_name/avatar_url/banner_url/bio/subscription_tier/created_at'

  UNION ALL
  -- 6) get_home_feed 가 보안 투영뷰를 반환하는가(SETOF videos 면 moderation_* 노출)
  SELECT 6,
    'get_home_feed 보안본(moderation 비노출)',
    CASE
      WHEN to_regprocedure('public.get_home_feed(integer,integer,text)') IS NULL THEN '❌ MISSING'
      WHEN pg_get_function_result(to_regprocedure('public.get_home_feed(integer,integer,text)'))
           LIKE '%v_home_feed_public%' THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 get_home_feed_safe_columns_20260620.sql 재적용(SETOF v_home_feed_public 여야)'

  UNION ALL
  -- 7) admin_* / get_admin_* SECURITY DEFINER 함수가 모두 권한게이트(assert_admin/is_admin)를 가지는가
  SELECT 7,
    'admin_* 함수 권한게이트 누락 0건',
    CASE WHEN count(*) = 0 THEN '✅ PASS' ELSE '🔴 FAIL: '||count(*)||'개' END,
    COALESCE(string_agg(p.proname, ', '), '(없음)')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND (p.proname LIKE 'admin\_%' ESCAPE '\' OR p.proname LIKE 'get\_admin\_%' ESCAPE '\')
    AND pg_get_functiondef(p.oid) NOT LIKE '%assert_admin%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%is_admin%'

  UNION ALL
  -- 8) 인가 SSOT 함수 존재
  SELECT 8,
    'assert_admin() / is_admin() 정의 존재',
    CASE WHEN to_regproc('public.assert_admin') IS NOT NULL
          AND to_regproc('public.is_admin') IS NOT NULL
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    '관리자 인가 SSOT'

  UNION ALL
  -- 9) (정보) SECURITY DEFINER 인데 인라인 SET search_path 가 없는 함수 목록 — search_path hijack 방어 권장
  SELECT 9,
    'SECURITY DEFINER 함수 인라인 search_path 고정',
    CASE WHEN count(*) = 0 THEN '✅ PASS' ELSE '⚠️ WARN: '||count(*)||'개' END,
    COALESCE(string_agg(p.proname, ', '), '(없음)')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND NOT EXISTS (
      SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
      WHERE cfg LIKE 'search_path=%'
    )

) AS gate
ORDER BY sort;
