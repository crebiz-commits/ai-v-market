-- ════════════════════════════════════════════════════════════════════════════
-- 광고 예산 충전 소유권 검증 (2026-06-24) — 광고주 감사 #B
--
--   문제: start_payment(ad_budget) 가 p_target_id(광고 id)의 소유자를 검증하지 않음.
--   payment_hardening_20260612.sql:48 의 "ads 에 소유자 컬럼 없음(House Ads)" 가정은
--   advertiser_self_service phase1 에서 owner_id 가 추가되며 더 이상 사실이 아님.
--   → 결제자는 자기 카드로 결제하지만 target_id 에 타인 광고 id 를 넣어 그 광고의
--     budget_krw 를 증액(타인 광고 예산 오염/강제 노출) 가능했음.
--
--   해결: start_payment 의 ad_budget 분기에 "본인 소유 광고만" 검증 추가.
--   (결제 생성 단계에서 차단 → confirm_payment 가 처리하는 모든 ad_budget 결제는
--    이미 소유권이 보장됨)
--   적용: Supabase SQL Editor → Run (멱등). 기존 함수 정본 + ad_budget 검증만 추가.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.start_payment(
  p_payment_type TEXT,
  p_amount INTEGER,
  p_target_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_order_id TEXT;
  v_price    INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF p_payment_type NOT IN ('subscription', 'license', 'ad_budget') THEN
    RAISE EXCEPTION '알 수 없는 결제 종류: %', p_payment_type;
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION '결제 금액은 0보다 커야 합니다'; END IF;

  -- 서버측 금액 검증 (클라이언트가 보낸 금액을 신뢰하지 않음) — 위변조 차단
  IF p_payment_type = 'subscription' THEN
    SELECT value::integer INTO v_price FROM public.platform_settings WHERE key = 'subscription_price_krw';
    IF v_price IS NULL OR p_amount <> v_price THEN
      RAISE EXCEPTION '구독 금액이 정책과 일치하지 않습니다 (요청 %, 정책 %)', p_amount, v_price;
    END IF;
  ELSIF p_payment_type = 'license' THEN
    IF p_target_id IS NULL THEN RAISE EXCEPTION '대상 영상이 지정되지 않았습니다'; END IF;
    -- 영상의 실제 가격(standard/commercial/exclusive) 중 하나와 정확히 일치해야 함
    IF NOT EXISTS (
      SELECT 1 FROM public.videos v
      WHERE v.id = p_target_id::uuid
        AND p_amount IN (v.price_standard, v.price_commercial, v.price_exclusive)
    ) THEN
      RAISE EXCEPTION '라이선스 금액이 영상 가격과 일치하지 않습니다';
    END IF;
  ELSIF p_payment_type = 'ad_budget' THEN
    -- #B(2026-06-24): 본인 소유 광고에만 예산 충전 가능 (타인 광고 예산 오염 차단)
    IF p_target_id IS NULL THEN RAISE EXCEPTION '대상 광고가 지정되지 않았습니다'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.ads a WHERE a.id = p_target_id::uuid AND a.owner_id = v_user_id
    ) THEN
      RAISE EXCEPTION '본인 소유의 광고에만 예산을 충전할 수 있습니다';
    END IF;
  END IF;

  v_order_id := 'creaite-' || p_payment_type || '-' || gen_random_uuid()::TEXT;
  INSERT INTO public.payments (order_id, user_id, payment_type, target_id, amount, status)
  VALUES (v_order_id, v_user_id, p_payment_type, p_target_id, p_amount, 'pending');
  RETURN v_order_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증: 타인 광고 id 로 SELECT public.start_payment('ad_budget', 1000, '<타인광고uuid>');
--       → "본인 소유의 광고에만..." 예외. 본인 광고는 정상 order_id 반환.
-- ════════════════════════════════════════════════════════════════════════════
