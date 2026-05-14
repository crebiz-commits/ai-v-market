-- ════════════════════════════════════════════════════════════════════════════
-- Phase 10.7 — 어드민 공지 발송 + 활동 로그
-- 적용 일자: 2026-05-14
--
-- 목적:
--   A. 공지 발송 — 어드민이 전체 사용자 또는 세그먼트에 인앱 공지
--      (notifications 테이블 활용, type='system')
--   B. 활동 로그 — 어드민이 변경한 내역 추적 (보안 + 책임)
-- ════════════════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════════════════
-- A. 공지 발송
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title TEXT,
  p_body TEXT,
  p_link TEXT DEFAULT NULL,
  p_segment TEXT DEFAULT 'all'   -- 'all' / 'premium' / 'free' / 'creators' (영상 1개+)
)
RETURNS INTEGER  -- 발송된 사용자 수
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM public.assert_admin();

  IF p_title IS NULL OR LENGTH(TRIM(p_title)) = 0 THEN
    RAISE EXCEPTION '공지 제목은 비울 수 없습니다';
  END IF;

  IF p_segment NOT IN ('all', 'premium', 'free', 'creators') THEN
    RAISE EXCEPTION '잘못된 세그먼트: % (all/premium/free/creators 중 하나)', p_segment;
  END IF;

  -- 세그먼트별로 notifications 일괄 INSERT
  WITH targets AS (
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE
      CASE p_segment
        WHEN 'all'      THEN true
        WHEN 'premium'  THEN p.subscription_tier = 'premium'
        WHEN 'free'     THEN p.subscription_tier = 'free'
        WHEN 'creators' THEN EXISTS (SELECT 1 FROM public.videos v WHERE v.creator_id = p.id)
      END
      AND COALESCE(p.is_suspended, false) = false
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, type, title, body, link, read)
    SELECT user_id, 'system', p_title, p_body, p_link, false FROM targets
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;

  -- 활동 로그 기록
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'broadcast_notification',
    'segment',
    p_segment,
    jsonb_build_object(
      'title', p_title,
      'body', p_body,
      'link', p_link,
      'segment', p_segment,
      'recipient_count', v_count
    )
  );

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.admin_broadcast_notification IS
  '어드민이 전체/세그먼트에 인앱 공지 발송. notifications 테이블에 일괄 INSERT';

-- ════════════════════════════════════════════════════════════════════════════
-- B. 활동 로그
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.admin_logs (
  id           BIGSERIAL PRIMARY KEY,
  admin_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,            -- broadcast_notification, suspend_user, hide_video, refund_payment, etc.
  target_type  TEXT,                     -- user / video / payment / segment / setting / etc.
  target_id    TEXT,
  details      JSONB,                    -- 변경 전후 값, 추가 정보
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created
  ON public.admin_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin
  ON public.admin_logs(admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_logs_action
  ON public.admin_logs(action, created_at DESC);

COMMENT ON TABLE public.admin_logs IS
  '어드민 활동 로그 — 누가 언제 무엇을 변경했는지 추적 (보안/책임)';

-- 활동 로그 조회 RPC (어드민 전용)
CREATE OR REPLACE FUNCTION public.admin_get_activity_logs(
  p_admin_id UUID DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id           BIGINT,
  admin_id     UUID,
  admin_name   TEXT,
  admin_email  TEXT,
  action       TEXT,
  target_type  TEXT,
  target_id    TEXT,
  details      JSONB,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    l.id,
    l.admin_id,
    p.display_name,
    u.email::TEXT,
    l.action,
    l.target_type,
    l.target_id,
    l.details,
    l.created_at
  FROM public.admin_logs l
  LEFT JOIN public.profiles p ON p.id = l.admin_id
  LEFT JOIN auth.users u ON u.id = l.admin_id
  WHERE
    (p_admin_id IS NULL OR l.admin_id = p_admin_id)
    AND (p_action IS NULL OR l.action = p_action)
  ORDER BY l.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- RLS
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_logs_admin_only" ON public.admin_logs;
CREATE POLICY "admin_logs_admin_only"
  ON public.admin_logs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- ════════════════════════════════════════════════════════════════════════════
-- C. 기존 어드민 RPC들에 로그 기록 추가 (선택 — 추후 작업)
-- ════════════════════════════════════════════════════════════════════════════

-- 사용자 정지 → 로그 추가
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION '본인은 정지할 수 없습니다';
  END IF;
  UPDATE public.profiles
  SET is_suspended = true,
      suspended_reason = COALESCE(p_reason, '관리자 정지'),
      suspended_at = now(),
      updated_at = now()
  WHERE id = p_user_id;
  -- 로그
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'suspend_user', 'user', p_user_id::TEXT,
    jsonb_build_object('reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.profiles
  SET is_suspended = false, suspended_reason = NULL, suspended_at = NULL, updated_at = now()
  WHERE id = p_user_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'unsuspend_user', 'user', p_user_id::TEXT, '{}'::jsonb);
END;
$$;

-- 영상 숨김/복원 → 로그
CREATE OR REPLACE FUNCTION public.admin_hide_video(
  p_video_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.videos
  SET is_hidden = true,
      hidden_reason = COALESCE(p_reason, '관리자 강제 숨김'),
      hidden_at = now()
  WHERE id = p_video_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'hide_video', 'video', p_video_id,
    jsonb_build_object('reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unhide_video(p_video_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.videos
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
  WHERE id = p_video_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'unhide_video', 'video', p_video_id, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_video(p_video_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title TEXT;
BEGIN
  PERFORM public.assert_admin();
  SELECT title INTO v_title FROM public.videos WHERE id = p_video_id;
  DELETE FROM public.videos WHERE id = p_video_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'delete_video', 'video', p_video_id,
    jsonb_build_object('title', v_title));
END;
$$;

-- 환불 → 로그
CREATE OR REPLACE FUNCTION public.admin_refund_payment(
  p_payment_id BIGINT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment public.payments;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 결제: %', p_payment_id;
  END IF;

  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION '환불 가능한 상태가 아닙니다 (현재: %)', v_payment.status;
  END IF;

  UPDATE public.payments
  SET status = 'refunded',
      failure_reason = COALESCE(p_admin_note, '관리자 환불'),
      updated_at = now()
  WHERE id = p_payment_id;

  -- 권한 회수
  IF v_payment.payment_type = 'subscription' THEN
    UPDATE public.profiles
    SET subscription_tier = 'free', subscription_expires_at = NULL, updated_at = now()
    WHERE id = v_payment.user_id;
  ELSIF v_payment.payment_type = 'license' THEN
    UPDATE public.orders
    SET status = 'refunded', updated_at = now()
    WHERE buyer_id = v_payment.user_id
      AND video_id = v_payment.target_id
      AND payment_id = v_payment.payment_key;
  ELSIF v_payment.payment_type = 'ad_budget' THEN
    UPDATE public.ads
    SET budget_krw = GREATEST(COALESCE(budget_krw, 0) - v_payment.amount, 0),
        updated_at = now()
    WHERE id = v_payment.target_id::UUID;
  END IF;

  -- 로그
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'refund_payment', 'payment', p_payment_id::TEXT,
    jsonb_build_object(
      'order_id', v_payment.order_id,
      'amount', v_payment.amount,
      'payment_type', v_payment.payment_type,
      'reason', p_admin_note
    ));
END;
$$;

-- 어드민 권한 변경 → 로그
CREATE OR REPLACE FUNCTION public.admin_set_admin_role(
  p_user_id UUID,
  p_is_admin BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  IF p_user_id = auth.uid() AND p_is_admin = false THEN
    RAISE EXCEPTION '본인의 어드민 권한은 회수할 수 없습니다 (다른 어드민이 처리 필요)';
  END IF;
  UPDATE public.profiles
  SET is_admin = p_is_admin, updated_at = now()
  WHERE id = p_user_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'set_admin_role', 'user', p_user_id::TEXT,
    jsonb_build_object('is_admin', p_is_admin));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 공지 전체 발송 테스트
--   SELECT public.admin_broadcast_notification(
--     '서비스 점검 안내',
--     '5/20 02:00~04:00 점검 예정입니다.',
--     NULL,
--     'all'
--   );
--
--   -- 활동 로그 조회
--   SELECT * FROM public.admin_get_activity_logs(NULL, NULL, 20, 0);
-- ════════════════════════════════════════════════════════════════════════════
