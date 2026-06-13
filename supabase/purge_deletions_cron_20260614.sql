-- ════════════════════════════════════════════════════════════════════════════
-- 계정 삭제 30일 경과 자동 파기 — pg_cron 등록 (2026-06-14)
--   배경: phase27_user_data_rights 의 purge_pending_deletions 는 auth.uid() 어드민
--         가드가 있어 cron 으로 호출 불가했고, cron 등록 자체도 누락돼 있었음.
--         → 30일 자동 파기가 전혀 동작하지 않던 컴플라이언스 갭을 메움.
--   동작: 매일 04:00 UTC(13:00 KST) Edge Function /server/purge-deletions 호출.
--         deletion_requested_at <= now()-30d 대상 → auth.admin.deleteUser → CASCADE 파기.
--   ⚠️ 선행: Edge Function(server) 재배포 필요 (purge-deletions 엔드포인트 추가됨).
--   ⚠️ <BILLING_CRON_SECRET> 는 billing-run 과 동일한 Edge Secret 값으로 치환해 실행.
--      (실제 값은 커밋 금지 — billing_cron_20260612.sql 와 동일 규칙)
-- 적용: Supabase SQL Editor → 새 쿼리 → <BILLING_CRON_SECRET> 치환 → Run
-- ════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 재적용 시: DO $$ BEGIN PERFORM cron.unschedule('purge-deletions-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('purge-deletions-daily', '0 4 * * *', $job$
  SELECT net.http_post(
    url := 'https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/purge-deletions',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-cron-secret','<BILLING_CRON_SECRET>',
      'apikey','sb_publishable_K3wmxz8uqsvUdeYXUhJv2g_g09eNNR8'
    ),
    body := '{}'::jsonb
  );
$job$);

-- 확인: SELECT jobname, schedule, active FROM cron.job WHERE jobname='purge-deletions-daily';
