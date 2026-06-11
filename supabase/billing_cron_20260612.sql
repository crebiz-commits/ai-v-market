-- ════════════════════════════════════════════════════════════════════════════
-- 자동결제 4단계: 정기청구 스케줄러 (2026-06-12) — 적용 완료
--   매일 02:00 UTC(11:00 KST) /server/billing-run 호출 → 만료 1일 전 구독 자동 청구.
--   ⚠️ x-cron-secret 은 BILLING_CRON_SECRET (Edge Secret) 값 — 실제 값은 커밋 금지.
--      실제 적용 시엔 supabase/.billing_cron_secret 의 값으로 치환해 실행.
-- ════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 재적용 시: DO $$ BEGIN PERFORM cron.unschedule('billing-run-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('billing-run-daily', '0 2 * * *', $job$
  SELECT net.http_post(
    url := 'https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/billing-run',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret','<BILLING_CRON_SECRET>',
      'apikey','sb_publishable_K3wmxz8uqsvUdeYXUhJv2g_g09eNNR8'
    ),
    body := '{}'::jsonb
  );
$job$);

-- 확인: SELECT jobname, schedule, active FROM cron.job WHERE jobname='billing-run-daily';
