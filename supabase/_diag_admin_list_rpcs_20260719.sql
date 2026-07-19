-- ════════════════════════════════════════════════════════════════════════════
-- 🔎 진단 (read-only) — 관리자 목록 RPC 6종 라이브 상태 확인 (2026-07-19)
--
--   목적: 이 6종에 p_limit/p_offset 을 추가하려면 본문 전체를 다시 써야 하는데,
--         6종 중 5종이 **저장소 여러 파일에 중복 정의**돼 있다(아래 후보표).
--         이 프로젝트는 "저장소 ≠ 라이브" 드리프트 전례가 반복됐으므로
--         (calculate_monthly_revenue·update_platform_setting·정산엔진 등),
--         저장소 본문으로 맹목 덮어쓰면 라이브에 적용돼 있던 수정이 되돌아간다.
--         → **먼저 라이브 본문 지문을 찍어 어느 후보가 살아있는지 확정**한다.
--
--   사용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run.
--         결과 표를 스크린샷으로 주시면 됩니다. (read-only — 아무것도 변경하지 않음)
--
--   ▣ 저장소 후보 지문 (본문에서 줄바꿈 제거 후 md5/길이 — 이 스크립트 결과와 대조)
--
--     get_revenue_distributions_by_period
--       672  30827788f3858d2e8c0289929d37256f  fix_revenue_period_guard_20260625.sql   ← 기대(보안게이트 #12 = assert_admin 판)
--       559  ff2ba1090a9e6ef4f8addcd36abe2a3d  phase8_revenue_distributions.sql        ← 무가드 구판(은행계좌 유출)
--       559  ff2ba1090a9e6ef4f8addcd36abe2a3d  phase_settlement_payout_account.sql     ← 위와 동일 본문
--       679  8097efb038a9c9ff0fb2ef948def438b  security_patch_critical_20260614.sql
--     admin_list_clawbacks
--       421  2e06daa6f48dbf4f7d81d6d919900900  settlement_clawbacks_20260711.sql        (유일)
--     admin_list_pending_ads
--       390  4146372225dde616f578fecde6413e89  advertiser_self_service_phase4_admin_review_20260614.sql (유일)
--     admin_list_sponsored_videos
--       846  926d80cd57deea812ce7e19b69a3dd9c  admin_sponsorship_review_20260711.sql    (유일)
--     admin_list_upload_milestones
--       704  2d60772201c6d096456487f96b7bf4a3  admin_mega_uploader_vet_20260717.sql    ← 기대(최신)
--       613  398056e0cafb003c3d3a3ce137fbfd92  mega_uploader_event_20260611.sql        ← 구판
--     get_platform_setting_history
--       270  c73e885e1147645e75cca460c9a76b02  phase8_platform_settings.sql            ← 구판
--       348  020390d8453a2c3aa8aa6c48da0e53d0  reaudit_hardening_20260625.sql          ← 기대(하드닝판)
--
--   ▣ 함께 확인하는 것 — 이 3개 파일은 **본문 없이 GRANT/REVOKE 만** 하는 하드닝 파일이라,
--     시그니처 변경(DROP 후 재생성) 시 권한이 초기화된다. 재적용 필요 여부를 grants 열로 확인:
--       admin_ad_review_hardening_20260717.sql        → admin_list_pending_ads
--       fix_video_guard_sponsor_20260718.sql          → admin_list_sponsored_videos
--       admin_mega_uploader_status_log_20260716.sql   → admin_list_upload_milestones
--
--   ▶ md5 가 후보 중 하나와 일치 → 그 파일 본문 위에 페이지네이션만 얹으면 안전.
--   ▶ 어느 것과도 불일치 → 라이브 드리프트. 아래 [STEP 2] 주석을 풀어 전체 정의를 덤프하고
--     그 결과를 전달해 주세요(라이브 본문 기준으로 작성하겠습니다).
-- ════════════════════════════════════════════════════════════════════════════

-- ── [STEP 2] 라이브 전체 정의 덤프 (STEP 1 지문이 어느 후보와도 불일치할 때만 Run) ──
-- SELECT p.oid::regprocedure::TEXT AS signature, pg_get_functiondef(p.oid) AS live_definition
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname IN ('get_revenue_distributions_by_period','admin_list_clawbacks',
--                     'admin_list_pending_ads','admin_list_sponsored_videos',
--                     'admin_list_upload_milestones','get_platform_setting_history')
-- ORDER BY p.proname;

-- ── [STEP 1] 지문 + 게이트/권한 요약 ──
SELECT
  p.proname                                                   AS fn,
  p.oid::regprocedure::TEXT                                   AS signature,
  (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
     WHERE n2.nspname = 'public' AND p2.proname = p.proname)::INT AS overloads,
  length(replace(replace(p.prosrc, chr(13), ''), chr(10), '')) AS stripped_len,
  md5(replace(replace(p.prosrc, chr(13), ''), chr(10), ''))    AS stripped_md5,
  (p.prosrc ~ 'assert_admin')                                 AS has_assert_admin,
  p.prosecdef                                                 AS sec_definer,
  EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
            WHERE c LIKE 'search_path=%')                     AS has_search_path,
  -- DROP 후 재생성 시 되살려야 할 권한 상태
  has_function_privilege('anon',          p.oid, 'EXECUTE')   AS anon_exec,
  has_function_privilege('authenticated', p.oid, 'EXECUTE')   AS auth_exec
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_revenue_distributions_by_period','admin_list_clawbacks',
                    'admin_list_pending_ads','admin_list_sponsored_videos',
                    'admin_list_upload_milestones','get_platform_setting_history')
ORDER BY p.proname;
