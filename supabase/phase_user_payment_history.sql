-- ════════════════════════════════════════════════════════════════════════════
-- 사용자 결제 내역 + 환불 요청 (2026-05-24)
--
-- 목적:
--   Terms 제7조 ③항 ("마이페이지 → 결제 내역 → 환불 요청") 약속 이행.
--   현재 사용자가 본인 결제 내역 조회·환불 요청 UI 없음.
--
-- 변경 사항:
--   1. payments.status CHECK 제약에 'refund_requested' 허용
--   2. payments 에 refund_reason / refund_requested_at 컬럼 추가
--   3. get_my_payments RPC — 본인 결제 내역 조회 (페이지네이션)
--   4. request_refund RPC — 7일 이내 + 본인 결제만 환불 요청 가능
--   5. admin_refund_payment 재정의 — 'completed' + 'refund_requested' 모두 처리 가능
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- Step 1: payments.status 에 'refund_requested' 허용
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check
  CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded', 'refund_requested'));

-- Step 2: 환불 요청 정보 컬럼 추가
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refund_reason TEXT,
  ADD COLUMN IF NOT EXISTS refund_requested_at TIMESTAMPTZ;

COMMENT ON COLUMN public.payments.refund_reason IS '사용자가 환불 요청 시 입력한 사유';
COMMENT ON COLUMN public.payments.refund_requested_at IS '환불 요청 일시 (사용자 또는 어드민 직접 처리 시 NULL)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: get_my_payments RPC — 본인 결제 내역 조회
-- ────────────────────────────────────────────────────────────────────────────
-- 기존 시그니처가 다른 동명 함수가 있으면 모두 제거 (충돌 회피)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'get_my_payments' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_payments(
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                   BIGINT,
  order_id             TEXT,
  payment_type         TEXT,
  target_id            TEXT,
  amount               INTEGER,
  method               TEXT,
  status               TEXT,
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ,
  failure_reason       TEXT,
  refund_reason        TEXT,
  refund_requested_at  TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  RETURN QUERY
    SELECT
      p.id,
      p.order_id,
      p.payment_type,
      p.target_id,
      p.amount::INTEGER,
      p.method,
      p.status,
      p.approved_at,
      p.created_at,
      p.failure_reason,
      p.refund_reason,
      p.refund_requested_at
    FROM public.payments p
    WHERE p.user_id = auth.uid()
    ORDER BY p.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_payments(INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_my_payments IS
  '본인 결제 내역 조회 (마이페이지 결제 내역 섹션). 페이지네이션 지원';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: request_refund RPC — 사용자 환불 요청
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'request_refund' AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.request_refund(
  p_payment_id BIGINT,
  p_reason     TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment            public.payments;
  v_days_since_payment INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 결제입니다 (id: %)', p_payment_id;
  END IF;

  -- 본인 결제만
  IF v_payment.user_id <> auth.uid() THEN
    RAISE EXCEPTION '본인의 결제만 환불 요청할 수 있습니다';
  END IF;

  -- 'completed' 상태만 환불 요청 가능
  IF v_payment.status <> 'completed' THEN
    IF v_payment.status = 'refund_requested' THEN
      RAISE EXCEPTION '이미 환불 요청 중입니다';
    ELSIF v_payment.status = 'refunded' THEN
      RAISE EXCEPTION '이미 환불 처리되었습니다';
    ELSE
      RAISE EXCEPTION '환불 요청 가능한 상태가 아닙니다 (현재: %)', v_payment.status;
    END IF;
  END IF;

  -- 7일 이내만 (전자상거래법 청약철회 기간)
  v_days_since_payment := EXTRACT(EPOCH FROM (now() - COALESCE(v_payment.approved_at, v_payment.created_at))) / 86400;
  IF v_days_since_payment > 7 THEN
    RAISE EXCEPTION '청약철회 가능 기간(7일)을 초과했습니다';
  END IF;

  -- 사유 길이 검증 (의미 있는 사유 강제)
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 2 THEN
    RAISE EXCEPTION '환불 사유를 입력해주세요 (최소 2자)';
  END IF;

  -- status 변경
  UPDATE public.payments
  SET status              = 'refund_requested',
      refund_reason       = TRIM(p_reason),
      refund_requested_at = now(),
      updated_at          = now()
  WHERE id = p_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_refund(BIGINT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.request_refund IS
  '사용자가 본인 결제에 대한 환불 요청. 7일 이내 + completed 상태만. 어드민이 큐에서 admin_refund_payment 로 처리';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: admin_refund_payment 재정의 — refund_requested 상태도 처리 가능
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_refund_payment(
  p_payment_id BIGINT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 결제: %', p_payment_id;
  END IF;

  -- completed 또는 refund_requested 모두 처리 가능
  IF v_payment.status NOT IN ('completed', 'refund_requested') THEN
    RAISE EXCEPTION '환불 가능한 상태가 아닙니다 (현재: %)', v_payment.status;
  END IF;

  UPDATE public.payments
  SET status         = 'refunded',
      failure_reason = COALESCE(p_admin_note, '관리자 환불'),
      updated_at     = now()
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

  -- admin_logs 기록 (감사)
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'refund_payment', 'payment', p_payment_id::TEXT,
    jsonb_build_object(
      'order_id',           v_payment.order_id,
      'amount',             v_payment.amount,
      'payment_type',       v_payment.payment_type,
      'admin_note',         p_admin_note,
      'user_refund_reason', v_payment.refund_reason,
      'was_user_requested', v_payment.status = 'refund_requested'
    ));
END;
$$;

COMMENT ON FUNCTION public.admin_refund_payment IS
  '관리자 환불 처리: payments.status=refunded + 권한 회수 (구독/라이선스/광고예산). completed 또는 refund_requested 모두 처리 가능';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--
--   -- 1. 새 컬럼 확인
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'payments'
--     AND column_name IN ('refund_reason', 'refund_requested_at');
--
--   -- 2. status 제약 확인
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'payments_status_check';
--
--   -- 3. 본인 결제 내역 조회 테스트
--   SELECT * FROM public.get_my_payments(10, 0);
-- ────────────────────────────────────────────────────────────────────────────
