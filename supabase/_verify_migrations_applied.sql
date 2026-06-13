-- ════════════════════════════════════════════════════════════════════════════
-- 마이그레이션 적용 점검 (읽기 전용 진단) — 2026-06-14
--   목적: supabase/*.sql 수동 적용 방식이라 적용 추적 기록이 없음.
--         최근 마이그레이션이 만든 핵심 객체(테이블·함수)가 실제 DB에 있는지 확인.
--   사용: Supabase SQL Editor → 새 쿼리 → 전체 Run → 결과의 exists=false 행이 "미적용 의심".
--   ※ 아무것도 변경하지 않음 (SELECT만). 안전하게 여러 번 실행 가능.
-- ════════════════════════════════════════════════════════════════════════════

WITH expected(kind, name, src) AS (
  VALUES
    -- phase_polish_20260531
    ('function','toggle_creator_heart','phase_polish_20260531'),
    ('function','toggle_pin_comment','phase_polish_20260531'),
    -- phase_security_hardening_20260531
    ('function','admin_unhide_post','phase_security_hardening_20260531'),
    ('function','get_my_payout_info','phase_security_hardening_20260531'),
    ('function','get_my_profile','phase_security_hardening_20260531'),
    ('function','get_my_revenue_history','phase_security_hardening_20260531'),
    ('function','resolve_moderation_flag','phase_security_hardening_20260531'),
    -- phase_web_push_20260531
    ('table','push_subscriptions','phase_web_push_20260531'),
    ('function','save_push_subscription','phase_web_push_20260531'),
    ('function','delete_push_subscription','phase_web_push_20260531'),
    -- community_upgrade_20260610
    ('table','challenges','community_upgrade_20260610'),
    ('table','post_bookmarks','community_upgrade_20260610'),
    ('function','tg_sync_post_comments_count','community_upgrade_20260610'),
    ('function','tg_sync_post_likes_count','community_upgrade_20260610'),
    -- *_20260611 (감사·런칭 준비 wave)
    ('table','bug_reports','banners_bugreports_20260611'),
    ('table','event_banners','banners_bugreports_20260611'),
    ('table','support_inquiries','support_inquiries_20260611'),
    ('function','admin_reply_support_inquiry','support_inquiries_20260611'),
    ('function','admin_refund_payment','fixes_audit_20260611'),
    ('function','calculate_monthly_revenue','fixes_audit_20260611'),
    ('function','delete_community_post','fixes_audit_20260611'),
    ('function','get_home_feed','home_feed_chip_filter_20260611'),
    ('function','get_home_feed_count','home_feed_count_20260611'),
    ('table','upload_milestones','mega_uploader_event_20260611'),
    ('function','tg_check_upload_milestone','mega_uploader_event_20260611'),
    ('function','admin_list_upload_milestones','mega_uploader_event_20260611'),
    ('function','get_weekly_top_creators','weekly_top_creators_20260611'),
    -- *_20260612 (결제·빌링·알림 wave)
    ('table','billing_subscriptions','billing_subscriptions_20260612'),
    ('function','get_my_billing','billing_subscriptions_20260612'),
    ('function','set_my_auto_renew','billing_subscriptions_20260612'),
    ('function','billing_apply_charge','billing_charge_rpcs_20260612'),
    ('function','billing_mark_failed','billing_charge_rpcs_20260612'),
    ('function','start_payment','payment_hardening_20260612'),
    ('function','cleanup_stale_payments','payment_hardening_20260612'),
    ('function','reset_expired_subscriptions','payment_hardening_20260612'),
    ('function','tg_notify_followers_new_video','new_video_follower_notify_20260612'),
    -- *_20260613 / *_20260614
    ('function','notify_expiring_subscriptions','subscription_expiry_notify_20260613'),
    ('function','collab_thread_send','collab_notify_privacy_20260614'),
    -- 코드에서 "마이그레이션 미적용 가능"으로 graceful 처리된 RPC (MyPage 등)
    ('function','get_creator_ad_stats','creator_ad_stats / phase20_creator_analytics'),
    ('function','get_creator_ad_stats_by_video','creator_ad_stats'),
    ('function','get_active_platform_settings','phase8_platform_settings'),
    ('function','get_my_watch_history','phase17_watch_history'),
    ('function','get_my_playlists','phase18_playlists')
)
SELECT
  e.kind,
  e.name,
  e.src AS source_file,
  CASE
    WHEN e.kind = 'table' THEN (to_regclass('public.' || e.name) IS NOT NULL)
    ELSE EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = e.name
    )
  END AS exists
FROM expected e
ORDER BY exists ASC, e.kind, e.name;  -- 미적용(false) 이 맨 위로
