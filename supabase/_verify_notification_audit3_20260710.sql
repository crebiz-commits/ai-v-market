-- ════════════════════════════════════════════════════════════════════════════
-- 알림 3차 감사 검증 (notification_audit3_20260710.sql 적용 확인, 읽기전용)
--   6행 모두 ok=true 여야 정상. Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════
SELECT '1_inapp컬럼_9개생성' AS check_item,
       (SELECT count(*) = 9 FROM information_schema.columns
        WHERE table_name='notification_preferences' AND column_name LIKE 'inapp_%') AS ok
UNION ALL
SELECT '2_should_send_inapp채널지원',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%''inapp''%')
        FROM pg_proc WHERE proname='should_send_notification')
UNION ALL
SELECT '3_updateRPC_inapp_sale반영',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%inapp_sale%')
        FROM pg_proc WHERE proname='update_my_notification_preferences')
UNION ALL
SELECT '4_updateRPC_refund_broadcast유지',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%email_refund_completed%'
                    AND pg_get_functiondef(oid) ILIKE '%email_broadcast%')
        FROM pg_proc WHERE proname='update_my_notification_preferences')
UNION ALL
SELECT '5_판매트리거_inapp게이트',
       (SELECT bool_or(pg_get_functiondef(oid) ILIKE '%inapp_sale%')
        FROM pg_proc WHERE proname='tg_notify_seller_on_sale')
UNION ALL
SELECT '6_push기본true전환',
       (SELECT COALESCE(bool_or(column_default ILIKE '%true%'), false)
        FROM information_schema.columns
        WHERE table_name='notification_preferences' AND column_name='push_comment_reply')
ORDER BY check_item;
