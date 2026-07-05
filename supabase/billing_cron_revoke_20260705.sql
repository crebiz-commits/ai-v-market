-- ════════════════════════════════════════════════════════════════════════════
-- 크론 함수 직접호출 차단 (2026-07-05) — 결제·구독 감사 P0(cron)
--
--   문제: cron 전용 함수 3개가 anon/authenticated 에 EXECUTE 노출(드리프트).
--         특히 notify_expiring_subscriptions 는 누구나 호출해 만료알림 이메일 스팸/비용
--         유발 가능. reset_expired_subscriptions(대량 강등)·cleanup_stale_payments 도
--         cron 전용이라 일반 사용자 호출 불가여야 함.
--   원인: cron_funcs_revoke_20260624.sql 이 막았어야 하나 라이브에서 재노출됨(재배포 리셋).
--
--   pg_cron 은 owner(postgres)로, Edge 는 service_role 로 호출하므로 이 REVOKE 로
--   크론은 안 끊긴다. 검증결과: billing_apply_charge/claim_due/mark_failed 는 이미 안전.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

REVOKE EXECUTE ON FUNCTION public.reset_expired_subscriptions()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_payments()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_expiring_subscriptions() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reset_expired_subscriptions()   TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_payments()        TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_expiring_subscriptions() TO service_role;

-- 방어적: 청구/부여 함수도 명시 REVOKE(이미 안전이나 이중 방어)
REVOKE EXECUTE ON FUNCTION public.billing_apply_charge(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,JSONB) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.billing_mark_failed(UUID,TEXT) FROM PUBLIC, anon, authenticated;

-- 재점검 (모두 auth/anon false 여야):
SELECT proname,
  has_function_privilege('authenticated', oid,'EXECUTE') AS auth호출,
  has_function_privilege('anon', oid,'EXECUTE')          AS anon호출
FROM pg_proc
WHERE proname IN ('reset_expired_subscriptions','cleanup_stale_payments','notify_expiring_subscriptions',
                  'billing_apply_charge','billing_mark_failed')
ORDER BY proname;
