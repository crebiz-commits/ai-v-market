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

  UNION ALL
  -- 16) track_video_ad_event(VAST 과금 RPC)가 anon/authenticated 에 직접 EXECUTE 부여돼 있지 않은가 (2026-07-17)
  --     노출 시 PostgREST 직접호출로 Edge /vast-track 의 HMAC·레이트리밋 우회 →
  --     경쟁 예산광고 소진·크리에이터 광고수익 부풀리기(정산 과지급). 형제 집계 4종은
  --     service_role 전용인데 이것만 기본 PUBLIC EXECUTE 잔존했던 항목.
  SELECT 16,
    'track_video_ad_event anon/authenticated 비노출(VAST 과금 우회 차단)',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='track_video_ad_event'
        AND (has_function_privilege('anon', p.oid, 'EXECUTE')
             OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    ) THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 ads_track_event_lockdown_20260717.sql 재적용(REVOKE FROM PUBLIC,anon,authenticated)'

  UNION ALL
  -- 17) pick_random_video_preroll 안전본만 존재하는가 (2026-07-17)
  --     무인자 SETOF ads 판(budget/spent/owner_id/review_note 전 내부컬럼·status 무필터)이
  --     옛 파일 재실행으로 재유입되면 anon 내부컬럼 노출 + 미승인 광고 서빙(안전본 ⑥ 우회).
  SELECT 17,
    'pick_random_video_preroll 안전본(오버로드 1개·내부컬럼 미반환)',
    CASE WHEN (
      SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='pick_random_video_preroll'
    ) = 1 AND NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='pick_random_video_preroll'
        AND pg_get_function_result(p.oid) LIKE '%budget_krw%'
    ) THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 ads_preroll_overload_guard_20260717.sql 재적용(0-arg SETOF ads 판 DROP)'

  UNION ALL
  -- 18) get_ad_for_video 가 status=approved 게이트를 갖는가 (2026-07-17)
  --     phase28 판이 status 필터 없이 CREATE OR REPLACE 로 정본을 덮으면 미승인 광고 서빙
  --     (is_active 게이트가 대부분 방어하나 관리자 수동 is_active 엣지케이스 노출).
  SELECT 18,
    'get_ad_for_video status=approved 게이트',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname='get_ad_for_video'
    ) OR (SELECT bool_and(prosrc ~ 'approved') FROM pg_proc WHERE proname='get_ad_for_video')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 advertiser_self_service_phase1_20260614.sql 의 get_ad_for_video 재적용(status 게이트)'

  UNION ALL
  -- 19) 대시보드 분석 RPC 7종이 assert_admin 가드를 갖는가 (2026-07-17)
  --     phase10_5 원본은 무가드 SQL 이라 비관리자가 supabase-js 직접호출로 매출·사용자수·
  --     시청·인기영상/크리에이터·광고성과를 조회 가능했음. admin_dashboard_assert_admin_
  --     20260624.sql 에서 plpgsql+assert_admin 전환(REVOKE 대신 내부 가드). 내부 가드라
  --     authenticated EXECUTE 는 열려 있어, #7(admin_*/get_admin_* 이름 스캔)이 get_daily_*/
  --     get_top_*/get_ad_performance/get_report_stats 를 못 잡는 사각지대 → 원본 재유입 시 유출.
  SELECT 19,
    '대시보드 분석 RPC assert_admin 가드(매출·통계 비관리자 유출 차단)',
    CASE WHEN (SELECT bool_and(prosrc ~ 'assert_admin') FROM pg_proc
               WHERE proname IN ('get_daily_revenue','get_daily_user_growth','get_daily_views',
                                 'get_top_videos','get_top_creators','get_ad_performance_summary','get_report_stats'))
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 admin_dashboard_assert_admin_20260624.sql + admin_dashboard_kst_20260718.sql 재적용(후자가 요약/일별 KST 정본 — 순서 이 대로)'

  UNION ALL
  -- 20) videos 가드가 sponsor_review_status 자가승인을 차단하는가 (2026-07-18)
  --     #14 는 protect_video_update 트리거 "존재"만 확인 → 옛 가드(fix_videos_update_guard_
  --     20260712.sql)엔 sponsor 검수컬럼이 빠져 크리에이터가 직접 UPDATE 로 자가승인 가능
  --     (미검수 공시를 "승인됨" 위장, 공정거래법 리스크). 가드 본문이 sponsor_review_status
  --     를 되돌리는지 확인(fix_video_guard_sponsor_20260718.sql).
  SELECT 20,
    'videos 가드 sponsor_review_status 자가승인 차단',
    CASE WHEN (SELECT bool_and(pg_get_functiondef(oid) LIKE '%NEW.sponsor_review_status%')
               FROM pg_proc WHERE proname = 'tg_protect_video_update')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 fix_video_guard_sponsor_20260718.sql 재적용(가드에 sponsor 검수컬럼 편입)'

  UNION ALL
  -- 21) update_platform_setting 이 assert_admin 게이트인가 (2026-07-18)
  --     수익 정책(구독가·분배율·CPM·결제 킬스위치 payments_enabled) 변경 함수가 인라인
  --     is_admin 체크만 쓰면 is_suspended 를 안 봐 "정지된 관리자"도 금전정책·결제개통 조작
  --     가능(정지 실효성 구멍). assert_admin(정지관리자 차단)으로 게이트돼야 함. 이름이
  --     admin_*/get_admin_* 이 아니라 #7 사각지대.
  SELECT 21,
    'update_platform_setting assert_admin 게이트(정지관리자 금전정책 차단)',
    CASE WHEN (SELECT bool_and(prosrc ~ 'assert_admin') FROM pg_proc
               WHERE proname = 'update_platform_setting')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 update_platform_setting_assert_admin_20260718.sql 재적용(인라인 is_admin→assert_admin)'

  UNION ALL
  -- 22) get_active_platform_settings 가 비관리자에게 어뷰징 임계값을 가리는가 (2026-07-18)
  --     platform_settings 는 표시=사용 위해 공개 소비(MyPage 분배율·SettingsContext 콘텐츠정책)
  --     되나, phase8 원본은 테이블 USING(true)+RPC 무필터라 valid_view_min_ratio·ip_dedup_hours·
  --     new_video_grace_hours·ad_ip_max_keys_per_hour(안티프라우드 임계값)까지 공개 → 우회
  --     캘리브레이션. RPC(DEFINER, RLS 우회)가 비관리자에게 이 키들을 제외하는지 확인.
  SELECT 22,
    'get_active_platform_settings 어뷰징 임계값 비관리자 비노출',
    CASE WHEN (SELECT bool_and(pg_get_functiondef(oid) LIKE '%valid_view_min_ratio%'
                               AND pg_get_functiondef(oid) LIKE '%is_admin%')
               FROM pg_proc WHERE proname = 'get_active_platform_settings')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 platform_settings_public_hardening_20260718.sql 재적용(임계값 4종 필터 + 테이블 RLS)'

  UNION ALL
  -- 23) 정산 엔진 2종이 assert_admin 게이트인가 (2026-07-18)
  --     calculate_monthly_revenue(월 정산=payout 원장 생성)·mark_revenue_paid(지급 확정+
  --     원천징수)는 최고 민감 금전 함수. 라이브 정본은 게이트됐으나(admin_audit_hardening_
  --     20260714 / phase32_tax_withholding), 무가드 옛 정의(subscription_pool_actual·
  --     settlement_zero_correction·phase8_revenue_distributions 등)가 남아 재실행 시 비관리자
  --     정산/지급확정 가능. 이름이 admin_*/get_admin_* 아니라 #7 사각지대.
  SELECT 23,
    '정산 엔진 assert_admin 게이트(calculate_monthly_revenue·mark_revenue_paid)',
    CASE WHEN (SELECT bool_and(prosrc ~ 'assert_admin') FROM pg_proc
               WHERE proname IN ('calculate_monthly_revenue', 'mark_revenue_paid'))
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 admin_audit_hardening_20260714.sql①(calculate) + phase32_tax_withholding.sql(mark_paid) 재적용'

) AS gate
ORDER BY sort;
