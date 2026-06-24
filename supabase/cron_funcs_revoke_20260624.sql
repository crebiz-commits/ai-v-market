-- ════════════════════════════════════════════════════════════════════════════
-- cron 전용 함수 EXECUTE 회수 (2026-06-24) — 결제·구독 감사 defense-in-depth
--
--   문제(낮음): reset_expired_subscriptions / cleanup_stale_payments /
--   notify_expiring_subscriptions 는 cron 전용이지만 명시적 REVOKE 가 없어
--   PostgreSQL 기본 PUBLIC EXECUTE 로 authenticated 가 직접 호출 가능.
--   (인자 없고 "이미 만료/이미 stale" 대상만 처리·멱등이라 실 피해 경로는 없으나,
--    billing_claim_due 와 동일하게 cron 함수는 명시적으로 잠그는 게 일관적·안전.)
--
--   pg_cron 은 함수 소유자(postgres)로 실행하므로 이 REVOKE 가 cron 동작에 영향 없음.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.reset_expired_subscriptions()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_payments()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_expiring_subscriptions() FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증: 일반(authenticated) 세션에서 SELECT public.reset_expired_subscriptions();
--       → permission denied 여야 함. cron(postgres) 은 정상 실행.
-- ════════════════════════════════════════════════════════════════════════════
