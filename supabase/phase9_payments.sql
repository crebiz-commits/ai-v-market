-- ════════════════════════════════════════════════════════════════════════════
-- Phase 9 — 결제 게이트웨이 (토스페이먼츠 연동)
-- 적용 일자: 2026-05-13
-- 선행: profiles_table.sql, orders_table.sql, ads_table.sql
--
-- 목적:
--   토스페이먼츠와 우리 DB 사이의 모든 결제 트랜잭션 통합 기록.
--   결제 흐름:
--     1. 클라이언트가 결제 시작 → start_payment RPC로 pending 행 생성
--     2. 토스 결제창에서 카드 인증 완료 → returnUrl로 paymentKey 받음
--     3. Edge Function이 토스 API에 confirm 호출 → 승인 처리
--     4. Edge Function이 confirm_payment RPC로 status='completed' + 권한 부여
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: payments 테이블
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
  id              BIGSERIAL PRIMARY KEY,

  -- 결제 식별자
  order_id        TEXT NOT NULL UNIQUE,          -- 우리가 생성 (UUID 또는 timestamp 기반)
  payment_key     TEXT,                          -- 토스가 승인 후 발급한 키

  -- 결제 주체
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- 결제 종류 + 대상
  payment_type    TEXT NOT NULL,                 -- subscription / license / ad_budget
  target_id       TEXT,                          -- license=video_id, ad_budget=ad_id, subscription=NULL

  -- 금액
  amount          INTEGER NOT NULL CHECK (amount > 0),

  -- 결제 수단/상태
  method          TEXT,                          -- 카드 / 간편결제 / 계좌이체 / 가상계좌
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending / completed / failed / cancelled / refunded

  -- 결과 정보
  approved_at     TIMESTAMPTZ,                   -- 토스 승인 시각
  failure_code    TEXT,                          -- 실패 코드 (FAIL_INSUFFICIENT_BALANCE 등)
  failure_reason  TEXT,                          -- 실패 사유 (사용자 표시용)

  -- 감사용 원본 응답 (분쟁 대비)
  raw_response    JSONB,

  -- 시간
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT payments_type_check
    CHECK (payment_type IN ('subscription', 'license', 'ad_budget')),
  CONSTRAINT payments_status_check
    CHECK (status IN ('pending', 'completed', 'failed', 'cancelled', 'refunded'))
);

CREATE INDEX IF NOT EXISTS idx_payments_user_created
  ON public.payments(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_status
  ON public.payments(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_type_target
  ON public.payments(payment_type, target_id);

COMMENT ON TABLE public.payments IS
  '모든 토스페이먼츠 결제 트랜잭션 통합 기록 (구독/라이선스/광고예산)';
COMMENT ON COLUMN public.payments.order_id IS
  '우리가 생성한 주문 ID (토스에 전달). 중복 결제 방지용 UNIQUE';
COMMENT ON COLUMN public.payments.payment_key IS
  '토스가 결제 승인 후 발급하는 키 (환불 등에 필요)';
COMMENT ON COLUMN public.payments.raw_response IS
  '토스 API 응답 원본 (분쟁/감사용)';

-- updated_at 자동 갱신
DROP TRIGGER IF EXISTS payments_set_updated_at ON public.payments;
CREATE TRIGGER payments_set_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 결제 시작 RPC — 클라이언트가 결제 시작 시 호출
--
-- 동작:
--   1. 새 order_id 생성 (uuid 기반)
--   2. pending 상태로 payments 행 삽입
--   3. 클라이언트는 반환된 order_id를 토스 SDK에 전달
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_payment(
  p_payment_type TEXT,
  p_amount INTEGER,
  p_target_id TEXT DEFAULT NULL
)
RETURNS TEXT          -- 새로 생성된 order_id
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_order_id  TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  IF p_payment_type NOT IN ('subscription', 'license', 'ad_budget') THEN
    RAISE EXCEPTION '알 수 없는 결제 종류: %', p_payment_type;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION '결제 금액은 0보다 커야 합니다';
  END IF;

  -- order_id 생성: creaite-{type}-{uuid}
  v_order_id := 'creaite-' || p_payment_type || '-' || gen_random_uuid()::TEXT;

  INSERT INTO public.payments (
    order_id, user_id, payment_type, target_id, amount, status
  ) VALUES (
    v_order_id, v_user_id, p_payment_type, p_target_id, p_amount, 'pending'
  );

  RETURN v_order_id;
END;
$$;

COMMENT ON FUNCTION public.start_payment IS
  '결제 시작 — pending 상태로 payments 행 생성하고 order_id 반환. 클라이언트가 토스 SDK 호출 직전에 사용';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 결제 승인 처리 RPC — Edge Function이 토스 confirm 후 호출
--
-- 동작:
--   1. payments 행을 'completed'로 갱신 (raw_response, payment_key 저장)
--   2. payment_type에 따라 사용자 권한 부여:
--      - subscription: profiles.subscription_tier='premium' + 만료일 +30일
--      - license: orders 테이블에 행 삽입
--      - ad_budget: ads.budget_krw 증액
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_payment(
  p_order_id TEXT,
  p_payment_key TEXT,
  p_method TEXT,
  p_approved_at TIMESTAMPTZ,
  p_raw_response JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment       public.payments;
  v_subscriber_id UUID;
  v_target_id     TEXT;
  v_amount        INTEGER;
BEGIN
  -- 결제 행 조회
  SELECT * INTO v_payment FROM public.payments WHERE order_id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 결제: %', p_order_id;
  END IF;

  IF v_payment.status = 'completed' THEN
    -- 이미 처리됨 (멱등성 — 토스가 같은 콜백을 두 번 보낼 수 있음)
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION '잘못된 결제 상태에서 승인 시도: % (현재: %)', p_order_id, v_payment.status;
  END IF;

  -- payments 행 완료 처리
  UPDATE public.payments
  SET
    payment_key   = p_payment_key,
    method        = p_method,
    status        = 'completed',
    approved_at   = p_approved_at,
    raw_response  = p_raw_response,
    updated_at    = now()
  WHERE order_id = p_order_id;

  v_subscriber_id := v_payment.user_id;
  v_target_id     := v_payment.target_id;
  v_amount        := v_payment.amount;

  -- 결제 종류별 권한 부여
  IF v_payment.payment_type = 'subscription' THEN
    -- 구독 활성화 (30일)
    UPDATE public.profiles
    SET
      subscription_tier         = 'premium',
      subscription_started_at   = COALESCE(subscription_started_at, now()),
      subscription_expires_at   = GREATEST(
        COALESCE(subscription_expires_at, now()),
        now()
      ) + INTERVAL '30 days',
      updated_at = now()
    WHERE id = v_subscriber_id;

  ELSIF v_payment.payment_type = 'license' THEN
    -- 라이선스 주문 행 삽입 (영상 다운로드 권한)
    -- 2026-05-27: 'all-in-one' → 'standard' 로 통일 (orders_license_type_check 제약 일치 + Non-Exclusive 정책)
    INSERT INTO public.orders (
      buyer_id, video_id, license_type, amount, status, payment_method, payment_id
    ) VALUES (
      v_subscriber_id, v_target_id, 'standard', v_amount, 'completed', p_method, p_payment_key
    )
    ON CONFLICT DO NOTHING;  -- 같은 영상 중복 구매 방지는 별도 RPC에서 처리

  ELSIF v_payment.payment_type = 'ad_budget' THEN
    -- 광고 예산 충전
    UPDATE public.ads
    SET
      budget_krw = COALESCE(budget_krw, 0) + v_amount,
      updated_at = now()
    WHERE id = v_target_id::UUID;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.confirm_payment IS
  'Edge Function이 토스 confirm 성공 후 호출. payments 완료 처리 + 사용자 권한 부여';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 결제 실패 처리 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fail_payment(
  p_order_id TEXT,
  p_failure_code TEXT,
  p_failure_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.payments
  SET
    status         = 'failed',
    failure_code   = p_failure_code,
    failure_reason = p_failure_reason,
    updated_at     = now()
  WHERE order_id = p_order_id AND status = 'pending';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: 본인 결제 내역 조회 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_payments(
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id             BIGINT,
  order_id       TEXT,
  payment_type   TEXT,
  target_id      TEXT,
  amount         INTEGER,
  method         TEXT,
  status         TEXT,
  approved_at    TIMESTAMPTZ,
  failure_reason TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    id, order_id, payment_type, target_id, amount, method, status,
    approved_at, failure_reason, created_at
  FROM public.payments
  WHERE user_id = auth.uid()
  ORDER BY created_at DESC
  LIMIT p_limit;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: RLS
--   SELECT: 본인 결제만
--   INSERT/UPDATE: SECURITY DEFINER RPC만
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_own" ON public.payments;
CREATE POLICY "payments_select_own"
  ON public.payments FOR SELECT
  USING (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 가짜 구독 결제 시작
--   SELECT public.start_payment('subscription', 4900);
--   -- → 'creaite-subscription-xxx-xxx-xxx' 반환
--
--   -- 2. 결제 목록 확인 (pending 상태)
--   SELECT * FROM public.get_my_payments();
--
--   -- 3. 가짜 결제 승인 (Edge Function 시뮬레이션)
--   SELECT public.confirm_payment(
--     '위에서 받은 order_id',
--     'fake_payment_key_test',
--     '카드',
--     now(),
--     '{}'::jsonb
--   );
--
--   -- 4. profiles에 premium 부여됐는지 확인
--   SELECT subscription_tier, subscription_expires_at FROM public.profiles WHERE id = auth.uid();
-- ════════════════════════════════════════════════════════════════════════════
