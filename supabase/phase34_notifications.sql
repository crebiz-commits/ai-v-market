-- ════════════════════════════════════════════════════════════════════════════
-- Phase 34 — 이메일/푸시 알림 시스템
--
-- 구성:
--   - notification_preferences (사용자별 알림 ON/OFF 설정)
--   - notification_log (발송 기록 — 감사·디버깅)
--   - 4개 RPC: get_my_/update_my_/should_send_/log_notification
--   - 1개 트리거: 가입 시 기본 알림 설정 자동 INSERT
--
-- 발신 인프라:
--   - Resend (mail.creaite.net) — Edge Function /send-email에서 호출
--   - Reply-To: support@creaite.net (Zoho 수신)
--   - 푸시는 컬럼만 미리. FCM 연동은 향후 보강.
-- ════════════════════════════════════════════════════════════════════════════

-- Step 1: notification_preferences 테이블
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id                          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 이메일 (8개 알림 종류)
  email_welcome                    BOOLEAN NOT NULL DEFAULT TRUE,
  email_subscription_receipt       BOOLEAN NOT NULL DEFAULT TRUE,
  email_new_video_from_followed    BOOLEAN NOT NULL DEFAULT TRUE,
  email_comment_reply              BOOLEAN NOT NULL DEFAULT TRUE,
  email_new_follower               BOOLEAN NOT NULL DEFAULT FALSE,
  email_revenue_settled            BOOLEAN NOT NULL DEFAULT TRUE,
  email_report_result              BOOLEAN NOT NULL DEFAULT TRUE,
  email_ad_budget_low              BOOLEAN NOT NULL DEFAULT TRUE,

  -- 푸시 (초기엔 모두 OFF — FCM 연동 + 사용자 권한 후 활성화)
  push_welcome                     BOOLEAN NOT NULL DEFAULT FALSE,
  push_subscription_receipt        BOOLEAN NOT NULL DEFAULT FALSE,
  push_new_video_from_followed     BOOLEAN NOT NULL DEFAULT FALSE,
  push_comment_reply               BOOLEAN NOT NULL DEFAULT FALSE,
  push_new_follower                BOOLEAN NOT NULL DEFAULT FALSE,
  push_revenue_settled             BOOLEAN NOT NULL DEFAULT FALSE,
  push_report_result               BOOLEAN NOT NULL DEFAULT FALSE,
  push_ad_budget_low               BOOLEAN NOT NULL DEFAULT FALSE,

  updated_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own preferences" ON public.notification_preferences;
CREATE POLICY "View own preferences"
  ON public.notification_preferences FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Update own preferences" ON public.notification_preferences;
CREATE POLICY "Update own preferences"
  ON public.notification_preferences FOR UPDATE
  USING (user_id = auth.uid());

-- INSERT는 SECURITY DEFINER 트리거/RPC로만 (RLS 우회)

-- Step 2: notification_log 테이블 (발송 기록)
CREATE TABLE IF NOT EXISTS public.notification_log (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type                 TEXT NOT NULL,
  channel              TEXT NOT NULL CHECK (channel IN ('email', 'push')),
  status               TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
  recipient            TEXT NOT NULL,
  subject              TEXT,
  resend_message_id    TEXT,
  error_message        TEXT,
  sent_at              TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_log_user ON public.notification_log(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_type ON public.notification_log(type);
CREATE INDEX IF NOT EXISTS idx_notif_log_status ON public.notification_log(status);
CREATE INDEX IF NOT EXISTS idx_notif_log_created ON public.notification_log(created_at DESC);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own notification log" ON public.notification_log;
CREATE POLICY "View own notification log"
  ON public.notification_log FOR SELECT
  USING (user_id = auth.uid());

-- INSERT는 SECURITY DEFINER RPC로만 (Edge Function이 호출)

-- Step 3: RPC — get_my_notification_preferences (UI 조회용)
CREATE OR REPLACE FUNCTION public.get_my_notification_preferences()
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

  -- 없으면 기본값으로 자동 생성 (트리거 누락 사용자 보정)
  INSERT INTO public.notification_preferences (user_id)
  VALUES (v_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.notification_preferences WHERE user_id = v_user_id;
  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_notification_preferences() TO authenticated;

-- Step 4: RPC — update_my_notification_preferences (UI 토글 저장)
-- JSONB로 변경된 키만 전달하면 됨. 예: {"email_new_follower": true}
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
    push_welcome                  = COALESCE((p_settings->>'push_welcome')::BOOLEAN, push_welcome),
    push_subscription_receipt     = COALESCE((p_settings->>'push_subscription_receipt')::BOOLEAN, push_subscription_receipt),
    push_new_video_from_followed  = COALESCE((p_settings->>'push_new_video_from_followed')::BOOLEAN, push_new_video_from_followed),
    push_comment_reply            = COALESCE((p_settings->>'push_comment_reply')::BOOLEAN, push_comment_reply),
    push_new_follower             = COALESCE((p_settings->>'push_new_follower')::BOOLEAN, push_new_follower),
    push_revenue_settled          = COALESCE((p_settings->>'push_revenue_settled')::BOOLEAN, push_revenue_settled),
    push_report_result            = COALESCE((p_settings->>'push_report_result')::BOOLEAN, push_report_result),
    push_ad_budget_low            = COALESCE((p_settings->>'push_ad_budget_low')::BOOLEAN, push_ad_budget_low),
    updated_at                    = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_notification_preferences(JSONB) TO authenticated;

-- Step 5: RPC — should_send_notification (Edge Function이 발송 전 호출)
-- 예: SELECT should_send_notification('<uuid>', 'comment_reply', 'email');
CREATE OR REPLACE FUNCTION public.should_send_notification(
  p_user_id UUID,
  p_type TEXT,
  p_channel TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_column_name TEXT;
  v_result BOOLEAN;
BEGIN
  -- 채널 검증 (식별자 SQL injection 차단)
  IF p_channel NOT IN ('email', 'push') THEN
    RETURN FALSE;
  END IF;

  v_column_name := p_channel || '_' || p_type;  -- 예: 'email_comment_reply'

  -- 없으면 기본값 INSERT (이미 가입 트리거에서 생성되지만 안전망)
  INSERT INTO public.notification_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- %I는 PostgreSQL이 자동으로 식별자 escape (SQL injection 안전)
  BEGIN
    EXECUTE format(
      'SELECT %I FROM public.notification_preferences WHERE user_id = $1',
      v_column_name
    ) INTO v_result USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- 알 수 없는 알림 종류 (오타 등)는 안전하게 false
    v_result := FALSE;
  END;

  RETURN COALESCE(v_result, FALSE);
END;
$$;

GRANT EXECUTE ON FUNCTION public.should_send_notification(UUID, TEXT, TEXT) TO authenticated, service_role;

-- Step 6: RPC — log_notification (Edge Function이 발송 결과 기록)
CREATE OR REPLACE FUNCTION public.log_notification(
  p_user_id UUID,
  p_type TEXT,
  p_channel TEXT,
  p_recipient TEXT,
  p_subject TEXT,
  p_status TEXT,
  p_resend_message_id TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.notification_log (
    user_id, type, channel, recipient, subject, status,
    resend_message_id, error_message, sent_at
  ) VALUES (
    p_user_id, p_type, p_channel, p_recipient, p_subject, p_status,
    p_resend_message_id, p_error_message,
    CASE WHEN p_status = 'sent' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- Step 7: 가입 시 기본 알림 설정 자동 INSERT 트리거
CREATE OR REPLACE FUNCTION public.init_notification_preferences_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.notification_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- 알림 설정 생성 실패해도 가입 자체는 진행 (안전망)
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_init_notification_preferences ON auth.users;
CREATE TRIGGER trg_init_notification_preferences
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.init_notification_preferences_on_signup();

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 별도 확인)
--
--   -- 1. 테이블 생성 확인
--   SELECT COUNT(*) FROM public.notification_preferences;
--
--   -- 2. 본인 설정 조회/생성
--   SELECT * FROM public.get_my_notification_preferences();
--
--   -- 3. 특정 알림 발송 여부 확인 (본인 ID 사용)
--   SELECT public.should_send_notification(auth.uid(), 'comment_reply', 'email');
--
--   -- 4. 알림 설정 변경 (새 팔로워 알림 켜기)
--   SELECT public.update_my_notification_preferences(
--     '{"email_new_follower": true}'::JSONB
--   );
--
--   -- 5. 발송 로그 확인 (테스트 후)
--   SELECT * FROM public.notification_log ORDER BY created_at DESC LIMIT 10;
-- ────────────────────────────────────────────────────────────────────────────
