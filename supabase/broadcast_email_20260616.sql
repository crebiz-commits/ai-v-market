-- ════════════════════════════════════════════════════════════════════════════
-- 어드민 브로드캐스트 이메일 (2026-06-16)
--   기존: 브로드캐스트가 인앱 알림 + 잠금화면 푸시만. 이메일 발송 없음.
--   추가: 세그먼트 대상의 이메일 목록을 반환하는 RPC + 수신거부(opt-out) 설정 컬럼.
--   수신거부: notification_preferences.email_broadcast (기본 true, 마이페이지 알림설정에서 끔).
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 브로드캐스트 이메일 수신 설정 (기본 수신)
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_broadcast boolean NOT NULL DEFAULT true;

-- 2) 세그먼트 → 수신 대상(이메일) 목록. 어드민 전용. (브로드캐스트 이메일 엣지에서 호출)
--    조건: 세그먼트 일치 + 미정지 + email_broadcast 수신 + 유효 이메일.
-- ⚠️ 이메일(PII) 반환 → service_role 전용. 어드민 검증은 호출 엣지(/broadcast-email)에서 수행.
CREATE OR REPLACE FUNCTION public.admin_broadcast_email_targets(p_segment text DEFAULT 'all')
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF p_segment NOT IN ('all','premium','free','creators') THEN
    RAISE EXCEPTION '잘못된 세그먼트: % (all/premium/free/creators)', p_segment;
  END IF;

  RETURN QUERY
  SELECT p.id, au.email::text
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.notification_preferences np ON np.user_id = p.id
  WHERE
    CASE p_segment
      WHEN 'all'      THEN true
      WHEN 'premium'  THEN p.subscription_tier = 'premium'
      WHEN 'free'     THEN p.subscription_tier = 'free'
      WHEN 'creators' THEN EXISTS (SELECT 1 FROM public.videos v WHERE v.creator_id = p.id)
    END
    AND COALESCE(p.is_suspended, false) = false
    AND COALESCE(np.email_broadcast, true) = true   -- 수신거부자 제외(설정 없으면 기본 수신)
    AND au.email IS NOT NULL AND au.email <> '';
END;
$fn$;

-- PII 보호: 일반/익명 사용자 호출 차단 (service_role 만 허용)
REVOKE EXECUTE ON FUNCTION public.admin_broadcast_email_targets(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_email_targets(text) TO service_role;

-- 3) update_my_notification_preferences 에 email_broadcast 반영 (수신거부 토글 저장)
CREATE OR REPLACE FUNCTION public.update_my_notification_preferences(p_settings jsonb)
RETURNS notification_preferences LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_user_id UUID; v_row public.notification_preferences;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.notification_preferences (user_id) VALUES (v_user_id) ON CONFLICT (user_id) DO NOTHING;
  UPDATE public.notification_preferences SET
    email_welcome                 = COALESCE((p_settings->>'email_welcome')::BOOLEAN, email_welcome),
    email_subscription_receipt    = COALESCE((p_settings->>'email_subscription_receipt')::BOOLEAN, email_subscription_receipt),
    email_new_video_from_followed = COALESCE((p_settings->>'email_new_video_from_followed')::BOOLEAN, email_new_video_from_followed),
    email_comment_reply           = COALESCE((p_settings->>'email_comment_reply')::BOOLEAN, email_comment_reply),
    email_new_follower            = COALESCE((p_settings->>'email_new_follower')::BOOLEAN, email_new_follower),
    email_revenue_settled         = COALESCE((p_settings->>'email_revenue_settled')::BOOLEAN, email_revenue_settled),
    email_report_result           = COALESCE((p_settings->>'email_report_result')::BOOLEAN, email_report_result),
    email_ad_budget_low           = COALESCE((p_settings->>'email_ad_budget_low')::BOOLEAN, email_ad_budget_low),
    email_refund_completed        = COALESCE((p_settings->>'email_refund_completed')::BOOLEAN, email_refund_completed),
    email_broadcast               = COALESCE((p_settings->>'email_broadcast')::BOOLEAN, email_broadcast),
    push_welcome                  = COALESCE((p_settings->>'push_welcome')::BOOLEAN, push_welcome),
    push_subscription_receipt     = COALESCE((p_settings->>'push_subscription_receipt')::BOOLEAN, push_subscription_receipt),
    push_new_video_from_followed  = COALESCE((p_settings->>'push_new_video_from_followed')::BOOLEAN, push_new_video_from_followed),
    push_comment_reply            = COALESCE((p_settings->>'push_comment_reply')::BOOLEAN, push_comment_reply),
    push_new_follower             = COALESCE((p_settings->>'push_new_follower')::BOOLEAN, push_new_follower),
    push_revenue_settled          = COALESCE((p_settings->>'push_revenue_settled')::BOOLEAN, push_revenue_settled),
    push_report_result            = COALESCE((p_settings->>'push_report_result')::BOOLEAN, push_report_result),
    push_ad_budget_low            = COALESCE((p_settings->>'push_ad_budget_low')::BOOLEAN, push_ad_budget_low),
    push_refund_completed         = COALESCE((p_settings->>'push_refund_completed')::BOOLEAN, push_refund_completed),
    updated_at                    = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$function$;
