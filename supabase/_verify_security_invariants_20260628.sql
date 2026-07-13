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
  -- 7) admin_* / get_admin_* SECURITY DEFINER 함수가 모두 보호되는가
  --    보호 = 본문 assert_admin/is_admin 게이트 OR EXECUTE 권한 회수(service_role 전용).
  --    anon/authenticated 가 실행 가능한데 본문 게이트도 없는 함수만 FAIL.
  SELECT 7,
    'admin_* 함수 권한게이트 누락 0건',
    CASE WHEN count(*) = 0 THEN '✅ PASS' ELSE '🔴 FAIL: '||count(*)||'개' END,
    COALESCE(string_agg(p.proname, ', '), '(없음)')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef
    AND (p.proname LIKE 'admin\_%' ESCAPE '\' OR p.proname LIKE 'get\_admin\_%' ESCAPE '\')
    AND pg_get_functiondef(p.oid) NOT LIKE '%assert_admin%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%is_admin%'
    -- service_role 전용(anon/authenticated 실행 불가)이면 안전 → 제외
    AND (has_function_privilege('anon', p.oid, 'EXECUTE')
         OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))

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

  UNION ALL
  -- 10) confirm_payment 가 anon/authenticated 에 직접 EXECUTE 부여돼 있지 않은가
  --     (Edge service_role 전용. 부여시 start_payment→confirm_payment 직접호출로
  --      무결제 완료주문 생성 우회 가능 — 2026-07-03 드리프트로 실제 뚫렸던 항목.)
  SELECT 10,
    'confirm_payment 직접호출 차단(무결제 우회)',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='confirm_payment'
        AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ) THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 hardening_live_20260703.sql 재적용(confirm_payment REVOKE)'

  UNION ALL
  -- 11) record_ad_impression 오버로드가 7-arg(dedup+과금) 1개뿐인가
  --     (6-arg 무과금·무dedup 잔존시 광고주 과금없이 크리에이터 수익 부풀림 +
  --      anon 스팸 — 2026-07-03 드리프트로 실제 존재했던 항목.)
  SELECT 11,
    'record_ad_impression 오버로드 1개(무과금 6-arg 부재)',
    CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public' AND p.proname='record_ad_impression') = 1
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 hardening_live_20260703.sql 재적용(6-arg DROP)'

  UNION ALL
  -- 12) get_revenue_distributions_by_period 가 admin 가드(assert_admin) 를 가지는가
  --     (무가드 재적용 시 전 크리에이터 은행계좌 덤프 — 2026-07-05 드리프트 감사 항목)
  SELECT 12,
    'get_revenue_distributions_by_period admin 가드(은행계좌 유출 방지)',
    CASE WHEN (SELECT bool_and(prosrc ~ 'assert_admin') FROM pg_proc
               WHERE proname='get_revenue_distributions_by_period')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 fix_revenue_period_guard_20260625.sql 재적용(payout_info 유출)'

  UNION ALL
  -- 13) get_creator_ad_stats / _by_video 가 IDOR 가드(is_admin) 를 가지는가
  --     (무가드 재적용 시 타 크리에이터 광고통계 조회 — 2026-07-05 드리프트 감사 항목)
  SELECT 13,
    'get_creator_ad_stats IDOR 가드',
    CASE WHEN (SELECT bool_and(prosrc ~ 'is_admin') FROM pg_proc
               WHERE proname IN ('get_creator_ad_stats','get_creator_ad_stats_by_video'))
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 high_fixes_20260614.sql 재적용(광고통계 IDOR)'

  UNION ALL
  -- 14) videos 민감컬럼 보호 가드 트리거 — self-approve/티어위조 차단 (2026-07-12)
  --     초기엔 REVOKE UPDATE 로 막았으나(07-11) 카운트 동기화 DEFINER 트리거까지 깨져
  --     좋아요 42501 회귀 → 가드 트리거(protect_video_update)로 전환. 비신뢰 current_user 의
  --     is_hidden/moderation_status/show_on_ott 등 직접 변경을 무효화(grant 무관). 트리거 존재 필수.
  SELECT 14,
    'videos 민감컬럼 보호 가드 트리거(self-approve/티어위조 차단)',
    CASE WHEN EXISTS (
      SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname='public' AND c.relname='videos'
        AND t.tgname='protect_video_update' AND NOT t.tgisinternal
    ) THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 fix_videos_update_guard_20260712.sql 재적용(BEFORE UPDATE 가드 트리거)'

  UNION ALL
  -- 15) 모더레이션 RPC 가 anon/authenticated/PUBLIC 에 노출되지 않는가 (2026-07-13)
  --     update_video_moderation 은 본문에 신원검증이 없는 SECURITY DEFINER — PUBLIC 기본
  --     EXECUTE 가 남아 있으면 anon key 만으로 타인 영상 숨김/점수 위조 가능(#7 게이트는
  --     admin_* 이름만 스캔해 못 잡음). apply_moderation_result 도 동일 원칙.
  SELECT 15,
    '모더레이션 RPC anon/PUBLIC 비노출(update_video_moderation 등)',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.routine_privileges
      WHERE routine_schema='public'
        AND routine_name IN ('update_video_moderation','apply_moderation_result')
        AND grantee IN ('PUBLIC','anon','authenticated')
    ) THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 fix_moderation_rpc_collab_count_20260713.sql ① 재적용(REVOKE FROM PUBLIC)'

) AS gate
ORDER BY sort;
