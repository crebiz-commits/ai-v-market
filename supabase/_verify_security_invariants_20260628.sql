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

  UNION ALL
  -- 24) admin_refund_payment 가 assert_admin + ad_budget 예산차감을 갖는가 (2026-07-18)
  --     환불 엔진이 6개 파일에 중복 정의(refund_cancel_billing·fixes_audit·refund_settlement_
  --     reversal·phase_user_payment_history·settlement_clawbacks·admin_audit_hardening) →
  --     옛 판 재실행 드리프트 시 ad_budget 환불이 광고예산(budget_krw)을 차감 안 해 광고주가
  --     돈 돌려받고 예산 유지(순손실), 또는 assert_admin 누락. prosrc 에 두 특징 존재 확인.
  --     이름이 admin_*/get_admin_* 아니라 #7 사각지대.
  SELECT 24,
    'admin_refund_payment assert_admin + ad_budget 예산차감(환불 시 광고예산 회수)',
    CASE WHEN (SELECT bool_and(prosrc ~ 'assert_admin' AND prosrc ~ 'budget_krw')
               FROM pg_proc WHERE proname = 'admin_refund_payment')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 admin_audit_hardening_20260714.sql⑦(admin_refund_payment) 재적용(단, #21·#23 회귀 주의 → 필요시 타겟 추출)'

  UNION ALL
  -- 25) 프리미엄 지급·크라운 2종이 assert_admin 게이트인가 (2026-07-18)
  --     admin_grant_premium(무상 프리미엄 수동지급)·admin_crown_creator(이달의크리에이터 뱃지+
  --     OTT 히어로 지정)가 인라인 is_admin 체크만 쓰면 is_suspended 를 안 봐 "정지된 관리자"도
  --     자기 계정에 프리미엄 무제한 지급(정산오염)·홈 히어로 조작 가능. assert_admin 로 게이트돼야.
  --     이름은 admin_* 라 #7 이 스캔하나, 본문에 'is_admin' 문자열이 있으면 #7 은 통과시켜(거짓
  --     PASS) → 인라인 is_admin 인지 assert_admin 인지 구분 못함. 이 체크가 그 사각지대를 메움.
  SELECT 25,
    '프리미엄 지급·크라운 assert_admin 게이트(정지관리자 무상프리미엄·히어로조작 차단)',
    CASE WHEN (SELECT bool_and(prosrc ~ 'assert_admin') FROM pg_proc
               WHERE proname IN ('admin_grant_premium', 'admin_crown_creator'))
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 premium_grant_crown_assert_admin_20260718.sql 재적용(인라인 is_admin→assert_admin)'

  UNION ALL
  -- 26) get_creator_profile 가 creator_of_month_until 를 반환하는가 (2026-07-18)
  --     이달의 크리에이터 뱃지(admin_crown_creator 가 세팅)는 CreatorChannel 이 profiles 직접
  --     SELECT 금지(안전 GRANT 화이트리스트 7종에 creator_of_month_until 없음) → get_creator_
  --     profile(DEFINER, 컬럼 GRANT 우회) 반환에 전적 의존. 옛 판(phase6_5_channel_enhancements)
  --     엔 이 컬럼이 없어 재실행 드리프트 시 뱃지가 조용히 죽음(2026-07-09 실제 발생·수정된 HIGH
  --     버그). 크라운 지급의 표시측 연결 — 반환 시그니처에 컬럼 존재 확인. #7/#25 로는 못 잡는 사각지대.
  SELECT 26,
    'get_creator_profile creator_of_month_until 반환(이달의 크리에이터 뱃지 표시 연결)',
    CASE WHEN (SELECT bool_or(pg_get_function_result(oid) LIKE '%creator_of_month_until%')
               FROM pg_proc WHERE proname = 'get_creator_profile')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 channel_feed_audit_20260709.sql ①(get_creator_profile) 재적용(phase6_5 재실행 금지=뱃지 사망)'

  UNION ALL
  -- 27) admin_reply_support_inquiry 가 admin_logs 를 남기는가 (2026-07-21)
  --     고객 문의 답변은 결제·환불 안내를 포함한 대외 커뮤니케이션이라 "누가 무엇을 답했는지"
  --     책임추적이 필요. 그런데 옛 정의(support_inquiries_20260611.sql)엔 admin_logs INSERT 가
  --     없어 그 파일 재실행 시 답변 감사기록만 조용히 소멸한다(상태변경 admin_set_support_status
  --     는 계속 남으므로 "일부만 남은 로그"가 되어 더 헷갈림). 정본=admin_audit_hardening_20260714.
  --     이름이 admin_* 라 #7 이 스캔하지만 #7 은 "권한 게이트 유무"만 보고 로깅은 안 봄 → 사각지대.
  SELECT 27,
    'admin_reply_support_inquiry 감사로그 기록(문의 답변 책임추적)',
    CASE WHEN (SELECT bool_and(prosrc ~ 'admin_logs') FROM pg_proc
               WHERE proname = 'admin_reply_support_inquiry')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 admin_audit_hardening_20260714.sql 의 admin_reply_support_inquiry 재적용(support_inquiries_20260611.sql 재실행 금지)'

  UNION ALL
  -- 28) 크리에이터 광고통계가 정산과 같은 기준(유료광고만)인가 (2026-07-21)
  --     정산 엔진(calculate_monthly_revenue, F1 2026-07-11 'ad_impression_basis=paid_only')은
  --     ads 를 조인해 ad.budget_krw IS NOT NULL(유료광고) + ad_eligibility_at 이후만 집계한다.
  --     그런데 마이페이지 판매 탭이 쓰는 get_creator_ad_stats(_by_video) 옛 판(high_fixes_20260614)
  --     은 ads 조인 자체가 없어 **자체광고(house)까지 전량 집계** → 크리에이터에게 실제 정산보다
  --     큰 예상수익을 표시(표시>지급). 옛 파일 재실행 시 재발하므로 두 필터 존재를 감시.
  --     #13 은 같은 함수의 IDOR 가드(is_admin)만 보고 집계 기준은 안 봄 → 사각지대.
  SELECT 28,
    '크리에이터 광고통계 정산기준 일치(유료광고만·적격시점 이후)',
    CASE WHEN (SELECT bool_and(prosrc ~ 'budget_krw' AND prosrc ~ 'ad_eligibility_at')
               FROM pg_proc WHERE proname IN ('get_creator_ad_stats','get_creator_ad_stats_by_video'))
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 creator_ad_stats_settlement_parity_20260721.sql 재적용(high_fixes_20260614·creator_ad_stats 재실행 금지)'

  UNION ALL
  -- 29) 크리에이터 "다음 정산 예정"이 gross 혼합 과대가 아닌가 (2026-07-22)
  --     원본(phase21_creator_dashboard.sql)은 pending = 이번달 gross orders 합 + pending 분배액
  --     으로 **단위를 섞어 과대** 표시했다. revenue_distributions.total_revenue 는 이미 크리에이터
  --     순수령(share 적용 후)인데, 플랫폼 몫 차감 전 gross 를 또 더한 것.
  --     channel_feed_audit3_20260710 이 "확정 pending 분배액만"으로 수정(HIGH), audit5 도 보존.
  --     원본 재실행 시 크리에이터가 받을 금액이 실제보다 크게 표시 → 정산일 CS·신뢰 손상
  --     (#28 광고통계 부풀림과 같은 '표시>지급' 클래스). 원본에만 있는 누적 패턴 부재로 판별.
  SELECT 29,
    '크리에이터 다음정산 예정액 gross 혼합 과대 아님(순수령 분배액만)',
    CASE WHEN (SELECT bool_and(prosrc !~ 'v_pending := v_pending') FROM pg_proc
               WHERE proname = 'get_creator_dashboard_summary')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 channel_feed_audit5_20260710.sql 의 get_creator_dashboard_summary 재적용(phase21_creator_dashboard.sql 재실행 금지)'

  UNION ALL
  -- 30) creator_restore_comment 가 화이트리스트 가드인가 (2026-07-22)
  --     크리에이터는 자기 영상 댓글을 숨기고 되살릴 수 있는데, "누가 숨겼는지"를 안 보면
  --     **관리자·신고로 숨긴 댓글까지 되살려 플랫폼 모더레이션을 무력화**한다(가이드라인 위반
  --     댓글 부활). 프론트에 복원버튼 가드가 있으나 PostgREST 직접호출로 우회 가능 → 서버 가드 필수.
  --     3판 존재: phase23_comment_management(가드 없음) / channel_feed_audit2(블록리스트라
  --     '관리자 강제 숨김' 통과 = 불완전) / channel_feed_audit4(화이트리스트 = 정본, HIGH 수정).
  --     화이트리스트 판만 크리에이터 사유 3종을 모두 참조하므로 그 존재로 판별.
  SELECT 30,
    '크리에이터 복원 화이트리스트(관리자·신고 숨김은 복원 불가)',
    CASE WHEN (SELECT bool_and(prosrc ~ '크리에이터 차단'
                           AND prosrc ~ '크리에이터 금칙어 매칭'
                           AND prosrc ~ '크리에이터 숨김')
               FROM pg_proc WHERE proname = 'creator_restore_comment')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 channel_feed_audit4_20260710.sql 의 creator_restore_comment 재적용(phase23_comment_management·audit2 재실행 금지 = 관리자 숨김 복원 뚫림)'

  UNION ALL
  -- 31) 시청 기록 삭제가 물리 DELETE 가 아닌 익명화인가 (2026-07-22)
  --     video_views 는 기록 전용 테이블이 아니라 **구독 수익풀 pro-rata 의 분모·분자**
  --     (calculate_monthly_revenue: SUM(watch_seconds) WHERE is_valid) 이자 크리에이터
  --     실제 조회수·분석·트렌딩의 SSOT 다. 원본(phase17_watch_history)은 DELETE 라
  --     **시청자 1명이 '전체 삭제'를 누르면 크리에이터의 조회수가 소급 감소하고 아직
  --     확정(paid)되지 않은 달의 정산 배분액까지 깎였다** — 제3자의 돈이 걸린 결함.
  --     DDL 이 이미 viewer_user_id ... ON DELETE SET NULL 로 "행 보존·연결만 절단"을
  --     선언했고 계정 삭제(phase27)도 DELETE 하지 않는다 → 익명화가 스키마의 계약.
  SELECT 31,
    '시청기록 삭제=익명화(크리에이터 조회수·구독정산 기반 보존)',
    CASE WHEN (SELECT prosrc !~* 'DELETE\s+FROM\s+public\.video_views'
                  AND prosrc ~* 'UPDATE\s+public\.video_views'
               FROM pg_proc WHERE proname = 'delete_my_watch_history')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 watch_history_anonymize_20260722.sql 재적용(phase17_watch_history.sql 재실행 금지 = 정산·조회수 소급 파괴)'

  UNION ALL
  -- 32) 내 시청편수가 목록 RPC 와 같은 필터인가 (2026-07-22)
  --     헤더 스탯 '시청 N'(get_my_watch_count)과 기록 탭 목록(get_my_watch_history)이
  --     같은 데이터를 세는데, 원본(my_watch_count_20260721)은 삭제·숨김 영상을 제외하지
  --     않아 본 뒤 숨겨진 영상이 생기면 헤더 숫자만 더 컸다(같은 화면 내 숫자 불일치).
  SELECT 32,
    '내 시청편수 = 기록목록과 동일 필터(삭제·숨김 제외)',
    CASE WHEN (SELECT prosrc ~ 'is_hidden' FROM pg_proc WHERE proname = 'get_my_watch_count')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 watch_history_anonymize_20260722.sql 재적용(my_watch_count_20260721.sql 재실행 금지 = 헤더 숫자 불일치)'

  UNION ALL
  -- 33) track_video_view 가 시청초를 영상 길이로 상한하는가 (2026-07-22) 🔴 최고 위험
  --     원본(phase8_video_views)은 watch_ratio 만 LEAST(...,1.0) 로 막고
  --     watch_seconds 는 **클라이언트 인자를 그대로 INSERT** 했다. 정산은
  --     SUM(vv.watch_seconds) pro-rata 이고, 이 함수엔 GRANT 구문이 없어 PUBLIC 기본
  --     EXECUTE(anon 호출 가능)이며 anon 은 auth.uid()=NULL 이라 셀프시청 차단도 건너뛴다.
  --     ⇒ 공개 anon 키로 track_video_view(내영상, 999999999) 한 번이면 그 달 구독
  --        수익풀의 거의 전부를 가져간다. 비율은 1.0000·is_valid=true 로 저장돼
  --        관리자 화면에서도 정상 시청으로 보인다(탐지 불가).
  --     옛 파일 재실행 시 즉시 재개통되므로 상한식의 존재를 감시한다.
  SELECT 33,
    'track_video_view 시청초 상한(구독 수익풀 위조 차단)',
    CASE WHEN (SELECT prosrc ~ 'LEAST\(v_seconds, v_duration\)'
               FROM pg_proc WHERE proname = 'track_video_view')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 watch_tracking_accuracy_resume_20260722.sql 재적용(phase8_video_views.sql 재실행 금지 = 정산 탈취 재개통)'

  UNION ALL
  -- 34) track_video_view 오버로드가 1개인가 (2026-07-22)
  --     상한 도입 시 인자가 3→4개(p_position_seconds 추가)로 늘었다. 옛 3-arg 판이
  --     남아 있으면 클라이언트가 그쪽으로 해소돼 #33 이 PASS 인데도 무상한 경로가 살아 있다
  --     (#11 record_ad_impression·#17 preroll 과 같은 오버로드 잔존 클래스).
  SELECT 34,
    'track_video_view 오버로드 1개(무상한 3-arg 판 부재)',
    CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = 'track_video_view') = 1
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 watch_tracking_accuracy_resume_20260722.sql 재적용(DROP FUNCTION track_video_view(TEXT,INTEGER,TEXT) 포함)'

  UNION ALL
  -- 35) get_my_playlists 가 커버 영상 등급을 반환하는가 (2026-07-22)
  --     보관함 그리드의 커버 썸네일은 영상 id 를 안 받아 클라이언트가 등급을 조회할 수
  --     없었다 → 19금 커버가 무블러(shouldBlur 는 등급 undefined 면 false = fail-open).
  --     playlist_hardening_20260722.sql 의 ②를 재실행하면 컬럼이 사라져 **조용히**
  --     무블러로 복귀한다(화면상 오류가 없어 발견이 늦음) → 컬럼 존재를 감시.
  SELECT 35,
    '보관함 커버 등급 반환(19금 커버 블러 fail-open 차단)',
    CASE WHEN (SELECT bool_or(pg_get_function_result(oid) LIKE '%preview_age_rating%')
               FROM pg_proc WHERE proname = 'get_my_playlists')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 playlist_cover_age_rating_20260722.sql 재적용(playlist_hardening_20260722.sql ②(get_my_playlists) 재실행 금지)'

  UNION ALL
  -- 36) 마이페이지 주문 집계가 status 필터를 갖는가 (2026-07-22 구매 탭 감사)
  --     정산(calculate_monthly_revenue)은 status='completed' 만 집계하는데, 마이페이지가
  --     필터 없이 orders 를 합치면 실패·취소·환불 주문까지 "총매출"·"총 구매 금액"에
  --     잡혀 **화면 표시액 > 실제 정산액**이 된다(#28·#29 와 같은 '표시>지급' 클래스).
  --     ★ 이 항목이 특히 위험한 이유: 같은 4함수가 **같은 날짜의 두 파일**에 정의돼 있다.
  --       mypage_pagination_20260719(21:14) → mypage_order_status_filter_20260719(21:35).
  --       파일명 날짜가 같아 정렬로는 선후를 알 수 없다(커밋 시각으로만 구분됨).
  --       게다가 앞 파일도 **다른 6함수의 정본이라 재실행할 정당한 이유가 있는데**,
  --       그때 이 4함수까지 함께 덮어써서 status 필터만 조용히 사라진다.
  --       (메모리 pagination-ssot 는 뒤 파일이 4종 정본이라고 정확히 기록해 두었으나,
  --        문서가 맞아도 실행 순서 사고는 막지 못하므로 여기서 상태로 확인한다.)
  --     구매자 목록은 completed+refunded(거래기록 보존), 합계·보유수는 completed 만.
  SELECT 36,
    '마이페이지 주문 집계 status 필터(표시액=정산액)',
    CASE WHEN (SELECT bool_and(prosrc ~ 'completed') FROM pg_proc
               WHERE proname IN ('get_my_purchases','get_my_purchase_summary'))
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 mypage_order_status_filter_20260719.sql 재적용(mypage_pagination_20260719.sql 재실행 금지 = 필터 소실)'

  UNION ALL
  -- 37) 정지 크리에이터 영상이 노출 경로에서 제외되는가 (2026-07-22 업로드 감사)
  --     admin_suspend_user 는 profiles.is_suspended 만 세팅하고 영상은 안 건드린다.
  --     그런데 피드 뷰·홈피드 함수·시리즈 에피소드 목록에 is_suspended 필터가 없어
  --     **계정을 정지시켜도 그 크리에이터 영상이 홈·OTT·추천·시리즈에 계속 노출**됐다
  --     (검색·채널 RPC 엔 필터가 있어 노출 정책 불일치이기도 했음).
  --     세 노출 경로가 각각 다른 뷰/함수를 타므로 한 곳만 고치면 나머지로 샌다:
  --       · v_available_videos          → 시네마·추천·유사영상
  --       · v_home_feed_public/get_home_feed_order → 홈
  --       · get_series_episodes         → 시리즈 상세
  --     셋 다 필터를 갖는지 확인. (구매자 재생은 play-token 별도 판정이라 무관.)
  SELECT 37,
    '정지 크리에이터 영상 노출 차단(피드·홈·시리즈)',
    --   홈피드는 뷰 드리프트(라이브 v_home_feed_public 에 소스에 없는 'views' 컬럼
    --   추가됨)로 CREATE OR REPLACE VIEW 가 막혀, 뷰 대신 get_home_feed_order 가
    --   vp.creator_id 로 profiles 를 직접 확인한다(뷰 무수정).
    CASE WHEN pg_get_viewdef('public.v_available_videos'::regclass) ~ 'is_suspended'
          AND (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_home_feed_order')
          AND (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_series_episodes')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 feed_exclude_suspended·feed_home_exclude_suspended·series_episodes_exclude_suspended_20260722.sql 재적용'

  UNION ALL
  -- 38) 정지 계정이 영상 편집(update_my_video_metadata)을 할 수 없는가 (2026-07-22)
  --     정지는 쓰기 금지여야 하는데 이 RPC 에 is_suspended 검사가 없어 정지 크리에이터가
  --     라이브 영상의 제목·설명·가격·연령등급을 계속 수정 가능했다. SECURITY DEFINER 라
  --     RLS 로 못 막아 본문 가드 필수. Edge 3곳(save-metadata·thumbnail·status)은 코드라
  --     게이트 대상 아님(배포로 반영).
  SELECT 38,
    '정지 계정 영상편집 차단(update_my_video_metadata)',
    CASE WHEN (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='update_my_video_metadata')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 video_edit_suspended_guard_20260722.sql 재적용(video_edit_remoderation_20260711.sql 재실행 금지)'

  UNION ALL
  -- 39) 홈피드 배지 count 가 order 와 정지필터를 공유하는가 (2026-07-22 홈/시네마/OTT 감사)
  --     #37 로 get_home_feed_order 는 정지 크리에이터를 제외했으나, 짝인 배지 count
  --     함수 get_home_feed_count(p_filter)에 그 필터가 없으면 정지 발생 시 배지('N VIDEOS')가
  --     실제 스크롤 개수보다 크게 표시된다(칩·시리즈 로직은 이미 동기화, is_suspended 만 어긋남).
  --     프론트가 부르는 건 1-인자판(home_feed_chip_filter → home_feed_count_suspended_sync 정본).
  --     0-인자 레거시판은 프론트 미사용이라 검사 대상 아님.
  SELECT 39,
    '홈피드 배지 count 정지필터(order 동기화)',
    CASE WHEN (SELECT bool_or(prosrc ~ 'is_suspended') FROM pg_proc
               WHERE proname='get_home_feed_count' AND pronargs=1)
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 home_feed_count_suspended_sync_20260722.sql 재적용(home_feed_chip_filter_20260611.sql 의 count 재실행 금지)'

  UNION ALL
  -- 40) collab_posts 집계 컬럼이 사용자 직접쓰기로부터 잠겨 있는가 (2026-07-22 커뮤니티 감사)
  --     community_posts 는 컬럼 GRANT 로 likes_count 등을 잠갔는데, 형제 테이블
  --     collab_posts(협업 공간)엔 그 잠금이 없어 **작성자가 자기 글의 applicants_count 를
  --     임의 UPDATE**할 수 있었다("지원자 9999명" 위조 = likes_count 조작과 같은 클래스).
  --     applicants_count 는 apply_to_collab(DEFINER)이 +1 자동 갱신하는 집계 컬럼.
  --     REVOKE UPDATE 후 안전 컬럼만 재부여 → authenticated 가 applicants_count·user_id·
  --     id·created_at 에 UPDATE 권한이 없어야 한다.
  SELECT 40,
    'collab_posts 집계 컬럼 쓰기잠금(applicants_count 조작 차단)',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.role_column_grants
      WHERE table_schema='public' AND table_name='collab_posts'
        AND grantee='authenticated' AND privilege_type='UPDATE'
        AND column_name IN ('applicants_count','user_id','id','created_at')
    ) THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 collab_posts_column_lockdown_20260722.sql 재적용'

  UNION ALL
  -- 41) 채널·팔로잉·인기 크리에이터가 숨김/정지를 거르는가 (2026-07-22 잔여영역 감사)
  --     creator_followers.sql 헤더는 "is_hidden·is_suspended 누락이 결함"이라 적었으나
  --     본문엔 반영 안 됨 → ①get_creator_videos: visibility 만 필터해 모더레이션 숨김
  --     (검수미통과·신고누적) 영상이 채널에 노출 ②get_my_following_videos: 숨김+정지
  --     크리에이터 영상이 팔로잉 피드 노출 ③get_popular_creators: 정지 크리에이터가
  --     인기순위·탐색에 노출(홍보 지속). 정책(suspension-enforcement): 채널(특정인 명시
  --     조회)은 is_hidden 만(본인 접근 유지), 피드·탐색(홍보 서피스)은 정지도 제외.
  SELECT 41,
    '채널·팔로잉·인기 숨김/정지 필터',
    CASE WHEN (SELECT prosrc ~ 'is_hidden' FROM pg_proc WHERE proname='get_creator_videos')
          AND (SELECT prosrc ~ 'is_hidden' AND prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_my_following_videos')
          AND (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_popular_creators')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 channel_hidden_suspended_filter_20260722.sql 재적용(creator_followers.sql 의 3함수 재실행 금지)'

  UNION ALL
  -- 42) B2B 제휴 게시판(b2b_posts)이 collab_posts 와 동일 보안 모델인가 (2026-07-23 신규기능)
  --     로그인 자유게시 공개 게시판이라 community_posts/collab_posts 와 같은 방어가 필요:
  --     ①RLS(숨김글은 작성자·관리자만) ②집계·소유 컬럼 쓰기잠금(is_hidden·user_id 직접
  --     조작 차단, #40 클래스) ③정지 계정 쓰기차단 트리거 ④신고 create_report 에
  --     b2b_post 분기(기계추출로 comment/video 분기 보존). 하나라도 빠지면 스팸·위조·
  --     모더레이션 우회. link_url 은 http/https CHECK 로 스킴 XSS 차단.
  SELECT 42,
    'B2B 게시판 보안(RLS·컬럼잠금·정지차단·신고 b2b_post)',
    CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.b2b_posts'))
          AND NOT EXISTS (
            SELECT 1 FROM information_schema.role_column_grants
            WHERE table_schema='public' AND table_name='b2b_posts'
              AND grantee='authenticated' AND privilege_type='UPDATE'
              AND column_name IN ('is_hidden','user_id','id','created_at'))
          AND EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                      WHERE c.relname='b2b_posts' AND t.tgname='block_suspended' AND NOT t.tgisinternal)
          AND (SELECT prosrc ~ 'b2b_post' FROM pg_proc WHERE proname='create_report')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 b2b_partnership_board_20260723.sql 재적용(community_reports_hardening·reports_rpc_lockdown 재실행 금지=b2b 분기 소실)'

  UNION ALL
  -- 43) start_payment 구독가 검증이 '활성 설정행'만 조회하는가 (2026-07-23 결제 감사)
  --     platform_settings 는 이력보존형(SCD2) — 같은 key 가 시간에 따라 여러 행(과거행은
  --     effective_to 세팅, 활성행만 부분 UNIQUE 로 1개). start_payment 의 subscription 금액
  --     검증이 `SELECT value INTO v_price ... WHERE key='subscription_price_krw'` 로 effective_to
  --     필터 없이 조회하면, 가격을 ₩4,900↔₩2,900 바꾼 순간 key 당 다중행이 생겨 plpgsql
  --     SELECT INTO 가 임의 과거행을 잡을 수 있다 → 표시가(get_platform_setting=활성)와
  --     검증가가 어긋나 정상 금액도 비결정적 거부(무결제형 결함). 정본 조회함수를 쓰는지 확인.
  SELECT 43,
    'start_payment 구독가 활성설정 조회(effective_to)',
    CASE WHEN (SELECT prosrc ~ 'get_platform_setting\(''subscription_price_krw''\)'
               FROM pg_proc WHERE proname='start_payment')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 start_payment_effective_setting_20260723.sql 재적용(payment_amount_standard_only·payments_gate·purchase_integrity 재실행 금지=effective_to 미필터 회귀)'

  UNION ALL
  -- 44) 월 정산 재실행이 멱등인가 — carry 허들에 미지급 pending 백로그 포함 (2026-07-23 정산 감사)
  --     calculate_monthly_revenue 의 이월-허들(carry)이 과거 'deferred' 행만 세면, R7 이
  --     과거 deferred→pending 으로 올린 뒤 같은 달을 재실행할 때 carry=0 이 되어 당월이
  --     최소액 미달이면 pending→'deferred' 로 역강등(크리에이터 과소지급, 표시=지급·멱등 위반).
  --     AdminRevenueSettlement 가 재실행을 "안전"이라 안내해 재현성 높음. carry 를 과거
  --     '미지급 백로그(deferred+pending)' 로 확장해 멱등화했는지 마커(unpaid_carry)로 확인.
  SELECT 44,
    '월 정산 재실행 멱등(carry=미지급 백로그, 역강등 차단)',
    CASE WHEN (SELECT prosrc ~ 'unpaid_carry'
                    AND prosrc ~ 'payout_status IN \(''deferred'', ''pending''\)'
               FROM pg_proc WHERE proname='calculate_monthly_revenue')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 settlement_carry_idempotent_20260723.sql 재적용(calculate_monthly_revenue_audit_log_20260719·0718·admin_audit_hardening_20260714① 재실행 금지=carry 회귀)'

  UNION ALL
  -- 45) 히어로 지정 RPC 가 anon EXECUTE 를 회수했는가 (2026-07-23 관리자 잔여 감사)
  --     admin_set_video_hero / admin_list_hero_video_ids 는 본문 assert_admin 이 있어 권한상승은
  --     없으나, 형제 하드닝 파일과 달리 명시 REVOKE FROM PUBLIC,anon 이 없어 기본 PUBLIC
  --     EXECUTE 에 의존(심층방어 비일관). anon 미노출로 회수됐는지 확인.
  SELECT 45,
    '히어로 지정 RPC anon EXECUTE 회수(심층방어)',
    CASE WHEN NOT has_function_privilege('anon', 'public.admin_set_video_hero(TEXT, INTEGER)', 'EXECUTE')
          AND NOT has_function_privilege('anon', 'public.admin_list_hero_video_ids()', 'EXECUTE')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 admin_hero_revoke_20260723.sql 재적용'

  UNION ALL
  -- 46) 정산 지급이 정지자 보류(U1) + 클로백 자동차감(F2) 인가 (2026-07-23 정산 지급 감사)
  --     mark_revenue_paid 가 is_suspended 를 안 봐 정지 크리에이터에게도 지급됐고(정책:
  --     정지=지급 제외+보류), settlement_clawbacks 를 안 읽어 pending 클로백(환불 회수분)이
  --     있어도 전액 지급 → 환불된 돈 재송금 위험. 정지자 지급 차단 + pending 클로백 net 자동차감
  --     + 지급행 FOR UPDATE 락을 갖는지 확인.
  SELECT 46,
    '정산 지급 정지자보류(U1)+클로백 자동차감(F2)',
    CASE WHEN (SELECT prosrc ~ 'is_suspended' AND prosrc ~ 'clawback_applied' AND prosrc ~ 'FOR UPDATE'
               FROM pg_proc WHERE proname='mark_revenue_paid')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 settlement_payout_hardening_20260723.sql 재적용(phase32_tax_withholding 의 mark_revenue_paid 재실행 금지)'

  UNION ALL
  -- 47) 연말 세금리포트가 회수분(clawed_back)을 표기 + KST 귀속인가 (2026-07-23 F3)
  --     지급완료 후 환불(클로백)이 연말정산 자료에 안 잡혀 소득 과대신고 소지. 회수분을 별도
  --     컬럼으로 노출(세무 판단 영역이라 gross 를 임의 조작 안 함) + paid_at 연도귀속 KST 유지.
  SELECT 47,
    '연말 세금리포트 clawed_back 표기 + KST 귀속',
    CASE WHEN (SELECT pg_get_function_result(oid) LIKE '%total_clawed_back%'
               FROM pg_proc WHERE proname='admin_get_tax_annual_report')
          AND (SELECT prosrc ~ 'Asia/Seoul' FROM pg_proc WHERE proname='admin_get_tax_annual_report')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 settlement_payout_hardening_20260723.sql 재적용(phase32·admin_audit_hardening_20260714③ 재실행 금지)'

  UNION ALL
  -- 48) 환불이 구독 풀 역산(R#1) + 광고 소진경고(R#2) + 행잠금(R#3) 인가 (2026-07-23 환불 감사)
  --     구독 환불이 정산 역산·경고 없이 tier강등만(라이선스와 비대칭), 광고 환불이 소진분
  --     초과 시 무경고, 환불 RPC 동시호출 이중부작용. 세 보강 마커 확인. (#24 의 assert_admin·
  --     budget_krw 도 유지되는지 함께 점검.)
  SELECT 48,
    '환불 구독풀역산(R#1)+광고소진경고(R#2)+행잠금(R#3)',
    CASE WHEN (SELECT prosrc ~ 'FOR UPDATE' AND prosrc ~ 'ad_remaining' AND prosrc ~ 'assert_admin'
                    AND prosrc ~ 'budget_krw' AND prosrc ~ 'calculate_monthly_revenue'
               FROM pg_proc WHERE proname='admin_refund_payment')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 refund_reversal_hardening_20260723.sql 재적용(admin_audit_hardening_20260714⑦·settlement_clawbacks_20260711·refund_settlement_reversal 재실행 금지)'

  UNION ALL
  -- 49) 광고 노출집계가 식별키 없으면 미집계(fail-safe)인가 (2026-07-23 U2)
  --     record_ad_impression 이 v_key(uid|viewer_key) NULL 이면 dedup 을 건너뛰되 집계·과금은
  --     수행(fail-open)했다. 식별 불가 노출은 미집계(RETURN)로 전환 + service_role 전용 유지.
  SELECT 49,
    '광고 노출 식별키 없으면 미집계(fail-safe) + anon 비노출',
    CASE WHEN (SELECT prosrc ~ 'IF v_key IS NULL THEN RETURN' FROM pg_proc WHERE proname='record_ad_impression')
          AND NOT has_function_privilege('anon', 'public.record_ad_impression(uuid, text, text, integer, boolean, boolean, text)', 'EXECUTE')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 ad_impression_dedup_failsafe_20260723.sql 재적용(ad_dedup_house_20260703 재실행 금지)'

  UNION ALL
  -- 50) ad_impressions / ad_clicks 직접쓰기 차단 (2026-07-23 전체감사 RLS/Edge)
  --     phase28 의 INSERT RLS 가 WITH CHECK(true) + 기본 GRANT 미회수 → anon 이 임의 행
  --     무한삽입(블로트) / authenticated 자기 지표 위조 가능. 삽입은 record_ad_* DEFINER 만.
  --     ★phase28_ad_diversification.sql 재실행 시 WITH CHECK(true) 정책이 부활 → 드리프트 감시.
  SELECT 50,
    'ad_impressions/clicks 직접쓰기 차단(anon 삽입·지표위조)',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name IN ('ad_impressions','ad_clicks')
        AND grantee IN ('anon','authenticated','PUBLIC')
        AND privilege_type IN ('INSERT','UPDATE','DELETE'))
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename IN ('ad_impressions','ad_clicks') AND cmd='INSERT')
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 ad_impressions_lockdown_20260723.sql 재적용(phase28_ad_diversification.sql 재실행 시 WITH CHECK(true) 부활)'

  UNION ALL
  -- 51) 인기 크리에이터 최근 썸네일이 숨김을 거르는가 (2026-07-23 전체감사 데이터무결성)
  --     get_popular_creators 의 recent_thumbnails(ranked_videos)가 is_hidden 미필터라
  --     모더레이션 숨김 영상 썸네일이 인기 카드에 노출 + video_count 와 필터 불일치.
  --     prosrc 에 is_hidden 이 2회 이상(creator_stats + ranked_videos) 존재하는지로 판별.
  SELECT 51,
    '인기 크리에이터 썸네일 숨김 필터(모더레이션 누수 차단)',
    CASE WHEN (SELECT count(*) FROM regexp_matches(
                 (SELECT prosrc FROM pg_proc WHERE proname='get_popular_creators'),
                 'is_hidden', 'g')) >= 2
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 get_popular_creators_thumb_hidden_20260723.sql 재적용(channel_hidden_suspended_filter_20260722 의 get_popular_creators 재실행 금지)'

  UNION ALL
  -- 52) 댓글·커뮤니티글 INSERT 위조 가드 트리거 (2026-07-23 전체감사 커뮤니티)
  --     C2/M1 컬럼잠금이 UPDATE만 닫아, 최초 INSERT 로 is_pinned·creator_hearted(크리에이터
  --     하트 사칭)·likes_count·comments_count 위조 가능했음. BEFORE INSERT 트리거로 안전값 강제.
  SELECT 52,
    '댓글·커뮤니티글 INSERT 위조가드 트리거(핀·하트·집계 조작 차단)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                      WHERE c.relname='comments' AND t.tgname='comments_insert_guard' AND NOT t.tgisinternal)
          AND EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                      WHERE c.relname='community_posts' AND t.tgname='community_posts_insert_guard' AND NOT t.tgisinternal)
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 comment_post_insert_guard_20260723.sql 재적용'

  UNION ALL
  -- 53) 신고 큐가 b2b_post 를 수동 모더레이션하는가 (2026-07-23 전체감사 커뮤니티)
  --     b2b_partnership_board 는 create_report(자동숨김)에만 b2b_post 를 넣어, moderate_report
  --     (관리자 remove)·get_pending_reports(preview)에 b2b 분기가 없어 관리자가 b2b 악성글을
  --     큐로 못 내렸음(자동숨김↔수동모더 비대칭). 두 함수에 b2b_post 분기 존재 확인.
  SELECT 53,
    '신고 큐 b2b_post 수동 모더레이션(remove·preview)',
    CASE WHEN (SELECT prosrc ~ 'b2b_post' FROM pg_proc WHERE proname='get_pending_reports')
          AND (SELECT count(*) FROM regexp_matches(
                 (SELECT prosrc FROM pg_proc WHERE proname='moderate_report'), 'b2b_post', 'g')) >= 3
      THEN '✅ PASS' ELSE '🔴 FAIL' END,
    'FAIL시 reports_queue_b2b_20260723.sql 재적용(reports_queue_enhance_20260718 의 두 함수 재실행 금지=b2b 분기 소실)'

) AS gate
ORDER BY sort;
