-- ════════════════════════════════════════════════════════════════════════════
-- notifications 테이블 Realtime 활성화 (2026-05-31)
-- 적용: SQL Editor → 새 쿼리 → 붙여넣기 → Run. idempotent.
--
-- 목적: 앱을 켜둔 상태(포그라운드)에서 새 알림/공지가 INSERT 되면
--       클라이언트가 즉시 수신 → 벨 배지 갱신 + 화면 내 토스트 (다른 앱처럼).
--       잠금화면 푸시는 서비스워커(web-push)가 별도 담당.
--
-- 보안: notifications 는 RLS(notifications_select: auth.uid()=user_id) 가 켜져 있어
--       Realtime 도 본인 알림만 전달. 클라이언트도 user_id=eq.<본인> 필터 사용.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

-- 확인용:
--   SELECT * FROM pg_publication_tables
--   WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
