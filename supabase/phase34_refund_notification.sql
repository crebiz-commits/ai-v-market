-- ════════════════════════════════════════════════════════════════════════════
-- Phase 34 보강 — 환불 완료 알림 (refund_completed) 추가
--
-- 목적:
--   어드민이 환불 처리 후 사용자에게 메일 발송.
--   현재 admin_refund_payment 후 사용자가 처리 사실 모름 → 클레임 증가.
--
-- 변경 사항:
--   1. notification_preferences 에 email_refund_completed / push_refund_completed 컬럼 추가
--   2. update_my_notification_preferences RPC 재정의 — 새 컬럼 매핑 추가
--   3. should_send_notification 는 컬럼명 동적 조회라 자동 적용 (변경 불필요)
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- Step 1: notification_preferences 컬럼 추가
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_refund_completed BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS push_refund_completed  BOOLEAN NOT NULL DEFAULT FALSE;

-- Step 2: update_my_notification_preferences RPC 재정의 (refund 매핑 추가)
CREATE OR REPLACE FUNCTION public.update_my_notification_preferences(
  p_settings JSONB
)
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_row public.notification_preferences;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- 없으면 기본값 INSERT
  INSERT INTO public.notification_preferences (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- 제공된 키만 업데이트 (COALESCE로 기존 값 유지)
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
$$;

GRANT EXECUTE ON FUNCTION public.update_my_notification_preferences(JSONB) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--
--   -- 1. 새 컬럼 존재 확인
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'notification_preferences'
--     AND column_name LIKE '%refund%';
--
--   -- 2. 본인 설정에서 환불 알림 토글 (테스트)
--   SELECT public.update_my_notification_preferences('{"email_refund_completed": false}'::JSONB);
--
--   -- 3. should_send_notification 동작 확인 (자동 적용됨)
--   SELECT public.should_send_notification(auth.uid(), 'refund_completed', 'email');
-- ────────────────────────────────────────────────────────────────────────────
