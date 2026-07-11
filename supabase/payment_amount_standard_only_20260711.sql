-- ════════════════════════════════════════════════════════════════════════════
-- 결제 금액검증 하드닝 (2026-07-11): 라이선스 결제 금액을 price_standard 로만 제한
--
--   문제: start_payment 가 라이선스 금액을 `p_amount IN (price_standard, price_commercial,
--         price_exclusive)` 로 검증 → 세 tier 중 아무거나와 일치하면 통과. 그러나 실제로는
--         'standard' 라이선스만 판매(UI 표시가·결제·confirm_payment 부여 전부 price_standard/
--         'standard' 하드코딩). 미편집/시드 영상에서 price_commercial 또는 price_exclusive 가
--         price_standard 보다 "낮게" 설정돼 있으면, 클라가 그 낮은 금액으로 위조 전송 →
--         표시가보다 싸게 결제하고도 동일 라이선스 획득(금전 손실).
--
--   해결: 라이선스 금액을 `p_amount = v.price_standard` 로만 허용. 프런트 결제는 항상
--         product.price(=price_standard)만 전송(전수 grep 확인) → 정상경로 무영향.
--         편집 RPC가 세 컬럼을 price_standard 로 동기화하므로 편집 영상은 원래 안전,
--         이 변경으로 미편집/시드 영상까지 닫힘.
--
--   ※ payments_gate_20260708.sql 정본 전체 복제 + license 금액검증 1줄만 변경.
--     게이트(payments_enabled)·재구매차단·구독·ad_budget 로직 100% 동일. ★ 새 정본.
--     payments_gate_20260708 / purchase_integrity_20260703 재실행 금지(IN 검증으로 회귀).
--
-- 적용: Supabase SQL Editor → Run (멱등).
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

  -- B-2(2026-07-08): 결제 게이트 — live 키 전환 전(payments_enabled=0) 모든 결제 생성 차단.
  --   설정 행이 없으면 기본 허용(1) — 게이트 해제 후 행을 지워도 결제가 안 죽게.
  IF COALESCE(public.get_platform_setting('payments_enabled'), 1) < 1 THEN
    RAISE EXCEPTION '결제 기능 준비 중입니다. 정식 오픈 후 이용해 주세요.';
  END IF;

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
    -- 2026-07-11: 판매 라이선스는 'standard' 단일 → 금액은 price_standard 와 정확히 일치해야 함.
    --   (기존 IN(standard,commercial,exclusive) 은 tier 값이 다를 때 저가 위조결제 허용)
    IF NOT EXISTS (
      SELECT 1 FROM public.videos v
      WHERE v.id = p_target_id::uuid
        AND p_amount = v.price_standard
    ) THEN
      RAISE EXCEPTION '라이선스 금액이 영상 가격과 일치하지 않습니다';
    END IF;
    -- A3(2026-07-03): 이미 구매(완료 주문)한 영상 재구매 차단.
    --   confirm_payment 의 orders UPSERT 가 uq_orders_buyer_video_completed 로 무시되어
    --   "결제는 됐는데 주문 미생성" 사고가 나기 전에, 결제 생성 단계에서 원천 차단.
    IF EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.buyer_id = v_user_id
        AND o.video_id = p_target_id
        AND o.status = 'completed'
    ) THEN
      RAISE EXCEPTION '이미 구매한 라이선스입니다';
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
-- 검증:
--   -- price_commercial < price_standard 인 영상에 commercial 금액으로 결제 시도 → 거부돼야 함
--   -- (payments_enabled=1 상태에서) SELECT public.start_payment('license', <commercial가>, '<vid>');
--   --   → '라이선스 금액이 영상 가격과 일치하지 않습니다'
-- ════════════════════════════════════════════════════════════════════════════
