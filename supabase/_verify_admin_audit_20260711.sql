-- ════════════════════════════════════════════════════════════════════════════
-- 관리자 페이지 감사 — 라이브 DB 불변식 검증 (읽기전용, 2026-07-11)
--
--   6개 그룹 병렬 감사에서 나온 "마이그레이션 드리프트" 잠재 리스크를 라이브 DB에서 확정.
--   같은 함수의 옛/새 정의가 저장소에 공존 → 어느 파일이 마지막에 적용됐냐에 따라 달라짐.
--   아래 6행이 모두 ok=true 여야 정상. false면 괄호 안 파일을 SQL Editor에서 Run(재적용).
--   적용: Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 대시보드 통계 RPC 가드 (보안): 무가드 SECURITY DEFINER면 아무 로그인 유저나 매출·가입자 조회 가능
--    실패 시 → admin_dashboard_assert_admin_20260624.sql 재적용
SELECT '1_대시보드통계_admin가드' AS check_item,
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%assert_admin%')
        FROM pg_proc WHERE proname = 'get_admin_dashboard_summary') AS ok
UNION ALL
-- 2) admin_search_videos 수정본: 브로큰본은 v.price(미존재 컬럼) 참조 → 콘텐츠 목록 전체 에러
--    실패(price_standard 없음) 시 → phase10_6_fix_views_cast.sql 재적용
SELECT '2_admin_search_videos_price_standard',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%price_standard%')
        FROM pg_proc WHERE proname = 'admin_search_videos')
UNION ALL
-- 3) 관리자 액션 감사로깅: admin_suspend_user 가 admin_logs 에 기록하는 로깅본이어야 함
--    실패 시 → phase10_7_broadcast_and_logs.sql 재적용
SELECT '3_admin_suspend_user_로깅',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%admin_logs%')
        FROM pg_proc WHERE proname = 'admin_suspend_user')
UNION ALL
-- 4) 영상 숨김/삭제 감사로깅
SELECT '4_admin_hide_video_로깅',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%admin_logs%')
        FROM pg_proc WHERE proname = 'admin_hide_video')
UNION ALL
-- 5) 정산 분배 조회 admin 가드(보안): 무가드본이면 아무 로그인 유저나 전 크리에이터 은행계좌 덤프 가능
--    실패 시 → fix_revenue_period_guard_20260625.sql 재적용
SELECT '5_정산분배조회_admin가드',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%assert_admin%')
        FROM pg_proc WHERE proname = 'get_revenue_distributions_by_period')
UNION ALL
-- 6) 설정 화이트리스트 확장: payments_enabled 등 편집 허용
--    실패 시 → admin_platform_setting_whitelist_expand_20260711.sql 적용
SELECT '6_설정화이트리스트_payments_enabled',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%payments_enabled%')
        FROM pg_proc WHERE proname = 'update_platform_setting')
ORDER BY check_item;
