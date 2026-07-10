-- ════════════════════════════════════════════════════════════════════════════
-- 알림 커버리지 감사 검증 (notification_audit_20260710.sql 적용 확인, 읽기전용)
--   4행 모두 ok=true 여야 정상. Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════
SELECT '1_판매알림_트리거(orders)' AS check_item,
       EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.orders'::regclass
              AND NOT tgisinternal AND tgname='orders_notify_seller') AS ok
UNION ALL
SELECT '2_신규댓글_트리거(comments)',
       EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.comments'::regclass
              AND NOT tgisinternal AND tgname='comments_notify_owner')
UNION ALL
SELECT '3_새영상벨_전용컬럼',
       EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_name='notification_preferences' AND column_name='inapp_new_video_from_followed')
UNION ALL
SELECT '4_새영상벨_트리거_게이트전환',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%inapp_new_video_from_followed%')
        FROM pg_proc WHERE proname='tg_notify_followers_new_video')
ORDER BY check_item;
