-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ notification_log 보관기한 + PII 스크럽 (2026-07-23 전체감사, 알림)
--
--   [LOW] notification_log(이메일/푸시 발송기록)는:
--     ① 정리 잡이 없어 무한 성장(notifications 는 cleanup 있으나 log 는 누락).
--     ② user_id 가 ON DELETE SET NULL 이고 recipient 컬럼에 이메일(PII)을 저장 →
--        30일 계정파기(purge) 후에도 recipient 이메일이 영구 잔존(삭제 사용자 PII).
--   조치: 보관기한(180일) 삭제 + 계정삭제(user_id NULL)된 행의 recipient 익명화 크론.
--         recipient 는 NOT NULL 이라 NULL 대신 '[redacted]' 로 치환.
--
-- 적용: Supabase SQL Editor → Run (멱등, pg_cron 활성 가정).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cleanup_notification_log()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER := 0;
  v_scrubbed INTEGER := 0;
BEGIN
  -- ① 보관기한 경과분 삭제(180일)
  DELETE FROM public.notification_log
  WHERE created_at < now() - INTERVAL '180 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- ② 계정삭제(user_id NULL)된 행의 이메일 PII 스크럽
  UPDATE public.notification_log
  SET recipient = '[redacted]'
  WHERE user_id IS NULL AND recipient <> '[redacted]';
  GET DIAGNOSTICS v_scrubbed = ROW_COUNT;

  RETURN v_deleted + v_scrubbed;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_notification_log() FROM PUBLIC, anon, authenticated;

-- 크론 등록 — 03:30 UTC(기존 notif cleanup 03:25 직후, 잡 시간 분산)
DO $$ BEGIN PERFORM cron.unschedule('cleanup-notification-log'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('cleanup-notification-log', '30 3 * * *', 'SELECT public.cleanup_notification_log();');

-- ── 검증 ──
SELECT 'cleanup_notification_log 함수 + 크론' AS check_name,
  CASE WHEN to_regprocedure('public.cleanup_notification_log()') IS NOT NULL
        AND EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-notification-log')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
