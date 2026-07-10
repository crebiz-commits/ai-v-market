-- ════════════════════════════════════════════════════════════════════════════
-- 알림 2차 감사 검증 (notification_audit2_20260710.sql 적용 확인, 읽기전용)
--   3행 모두 ok=true 여야 정상. Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════
SELECT '1_새영상트리거_INSERT+UPDATE로확장' AS check_item,
       (SELECT bool_or(pg_get_triggerdef(oid) ILIKE '%INSERT OR UPDATE%')
        FROM pg_trigger WHERE tgrelid='public.videos'::regclass
          AND tgname='trg_notify_followers_new_video') AS ok
UNION ALL
SELECT '2_함수_공개전환판정(TG_OP)',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%TG_OP%')
        FROM pg_proc WHERE proname='tg_notify_followers_new_video')
UNION ALL
SELECT '3_update_RPC_inapp컬럼반영',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%inapp_new_video_from_followed%')
        FROM pg_proc WHERE proname='update_my_notification_preferences')
ORDER BY check_item;
