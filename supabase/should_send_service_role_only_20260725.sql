-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ should_send_notification service_role 전용 재확정 (2026-07-25, 알림감사 F3)
--
--   배경: reaudit_hardening_20260625.sql(R-log)이 should_send_notification 을
--         authenticated 에서 REVOKE 했는데, 이후 notification_audit3_20260710.sql:82 이
--         `GRANT ... TO authenticated, service_role` 로 **재부여** → REVOKE 무효화.
--         최신 파일이 SSOT 라 현재 로그인 사용자가 실행 가능.
--   위험: 로그인 사용자가 임의 p_user_id 로 호출해 ① 타 사용자의 알림 수신설정 boolean 프로빙
--         (교차 사용자 정보 유출) ② 임의 user_id 의 notification_preferences 기본행 강제 생성.
--         저민감도이나 reaudit 가 의도적으로 닫은 표면이 다시 열림.
--   조치: authenticated/anon/PUBLIC 회수, service_role 만 유지. Edge 발송 경로는 service_role
--         클라이언트라 무영향. 프론트는 이 RPC 를 직접 호출하지 않음(전수 확인).
--   ★ notification_audit3_20260710.sql 재실행 시 authenticated 재부여로 회귀 → 게이트 #61 감시.
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.should_send_notification(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.should_send_notification(UUID, TEXT, TEXT) TO service_role;

-- ── 검증 ──
SELECT 'should_send_notification authenticated 비노출' AS check_name,
  CASE WHEN NOT has_function_privilege('authenticated', 'public.should_send_notification(uuid,text,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.should_send_notification(uuid,text,text)', 'EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
