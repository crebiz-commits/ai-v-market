-- ════════════════════════════════════════════════════════════════════════════
-- Phase 29 — license_type 'all-in-one' → 'standard' 통일
-- 적용 일자: 2026-05-27
--
-- 문제:
--   confirm_payment RPC 가 라이선스 결제 시 license_type='all-in-one' 으로 INSERT 시도.
--   그러나 운영 DB 의 orders_license_type_check CHECK 제약에 'all-in-one' 미포함 →
--   실제 사용자가 라이선스 결제 시 CHECK 위반으로 결제 실패 가능.
--
-- 해결 (옵션 B 채택, Non-Exclusive 정책과 일치):
--   1. 기존 'all-in-one' 행을 'standard' 로 마이그레이션 (테스트 행 정리)
--   2. confirm_payment RPC 재정의 — license_type='standard' 로 변경
--   3. orders_license_type_check 제약 확인 (이미 'standard' 포함)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: 기존 'all-in-one' 행을 'standard' 로 마이그레이션
-- ────────────────────────────────────────────────────────────────────────────
-- CHECK 제약에 'all-in-one' 이 없으면 이 UPDATE 자체가 0건이지만 안전하게 실행
UPDATE public.orders
SET license_type = 'standard'
WHERE license_type = 'all-in-one';

-- 결과 확인
SELECT license_type, COUNT(*) AS rows
FROM public.orders
GROUP BY license_type
ORDER BY license_type;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: confirm_payment RPC 재정의 (license_type 'standard' 로 변경)
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
  SELECT * INTO v_payment FROM public.payments WHERE order_id = p_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 결제: %', p_order_id;
  END IF;

  IF v_payment.status = 'completed' THEN
    RETURN;
  END IF;

  IF v_payment.status <> 'pending' THEN
    RAISE EXCEPTION '잘못된 결제 상태에서 승인 시도: % (현재: %)', p_order_id, v_payment.status;
  END IF;

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

  IF v_payment.payment_type = 'subscription' THEN
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
    -- 2026-05-27: 'all-in-one' → 'standard' 통일 (CHECK 제약·Non-Exclusive 정책 일치)
    INSERT INTO public.orders (
      buyer_id, video_id, license_type, amount, status, payment_method, payment_id
    ) VALUES (
      v_subscriber_id, v_target_id, 'standard', v_amount, 'completed', p_method, p_payment_key
    )
    ON CONFLICT DO NOTHING;

  ELSIF v_payment.payment_type = 'ad_budget' THEN
    UPDATE public.ads
    SET
      budget_krw = COALESCE(budget_krw, 0) + v_amount,
      updated_at = now()
    WHERE id = v_target_id::UUID;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.confirm_payment IS
  'Edge Function이 토스 confirm 성공 후 호출. payments 완료 처리 + 사용자 권한 부여. 라이선스 license_type=standard (2026-05-27 통일)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 현재 CHECK 제약 확인 (참고용)
-- ────────────────────────────────────────────────────────────────────────────
SELECT pg_get_constraintdef(oid) AS 제약정의
FROM pg_constraint
WHERE conname = 'orders_license_type_check';

-- 기대: CHECK ((license_type = ANY (ARRAY['standard'::text, 'commercial'::text, 'extended'::text, ...])))
-- 'standard' 포함되어 있으면 정상 (이미 그래야 함)

-- ════════════════════════════════════════════════════════════════════════════
-- 검증
--
--   -- 라이선스 결제 시뮬레이션 (테스트 user_id 로)
--   -- 1. start_payment('license', 1000, '<video_id>') → order_id 반환
--   -- 2. confirm_payment(order_id, 'test_key', '카드', now(), '{}'::jsonb)
--   -- 3. orders 행 license_type='standard' 로 INSERT 확인
--   SELECT id, video_id, license_type, status FROM public.orders
--   WHERE payment_method IS NOT NULL ORDER BY created_at DESC LIMIT 5;
-- ════════════════════════════════════════════════════════════════════════════
