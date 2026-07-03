-- ════════════════════════════════════════════════════════════════════════════
-- 구매·정산 무결성 가드 (2026-07-03) — 결제/정산 감사 #C
--
-- 두 가지 잠복 사고를 결제 생성/주문 삽입 단계에서 원천 차단한다.
--
-- A3. 중복 라이선스 구매 → 결제됐는데 주문 미생성(구매자 손해·크리에이터 미지급)
--     이미 완료 주문이 있는 영상을 재구매하면:
--       start_payment → 새 pending 결제 생성 → 토스 청구 →
--       confirm_payment 의 INSERT ... ON CONFLICT DO NOTHING 이
--       uq_orders_buyer_video_completed 와 충돌해 아무 주문도 안 생김 →
--       카드만 나가고 아무것도 못 받음(환불 매칭도 orders 기준이라 불가).
--     → license 분기에 "이미 구매한 영상" 사전 검사 추가(청구 이전 단계 차단).
--
-- A4. orders.seller_id NULL → 정산 sales CTE 에서 제외 → 크리에이터 판매 수익 미지급.
--     set_order_seller_id 트리거가 search_path 미고정이고, 판매자 확정 실패 시
--     조용히 NULL 로 남겨 완료 주문이 무결제처럼 정산에서 빠졌다.
--     → search_path 고정 + seller_id 확정 실패 시 RAISE(무결제 방지, 트랜잭션 롤백→환불 경로).
--
-- 적용: Supabase SQL Editor → Run (멱등). 기존 함수 정본 유지 + 가드만 추가.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- A3: start_payment — license 분기에 중복 구매 차단 추가
--     (start_payment_ad_owner_20260624.sql 정본 + A3 가드)
-- ────────────────────────────────────────────────────────────────────────────
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

-- ────────────────────────────────────────────────────────────────────────────
-- A4: set_order_seller_id — search_path 고정 + seller_id 확정 강제
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_order_seller_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.seller_id IS NULL THEN
    SELECT creator_id INTO NEW.seller_id
    FROM public.videos
    WHERE id = NEW.video_id;
  END IF;
  -- A4(2026-07-03): seller_id 는 정산의 필수 키. NULL 이면 sales CTE 에서 제외되어
  --   크리에이터가 판매 수익을 영영 못 받는다. 완료 주문은 반드시 판매자를 갖게 강제 —
  --   확정 실패 시 RAISE 로 confirm_payment 트랜잭션을 롤백시켜 무결제(주문無/미지급)를 방지.
  IF NEW.seller_id IS NULL THEN
    RAISE EXCEPTION '주문 판매자(seller_id)를 확정할 수 없습니다 (영상 %: creator_id 없음)', NEW.video_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 트리거 재바인딩(정의 갱신 반영 — 함수 교체만으로 충분하지만 명시적 보증)
DROP TRIGGER IF EXISTS orders_set_seller_id ON public.orders;
CREATE TRIGGER orders_set_seller_id
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_seller_id();

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- A3: 이미 구매한 영상 재구매 시도 → "이미 구매한 라이선스입니다" 예외여야 함
--   SELECT set_config('request.jwt.claim.sub',
--     (SELECT id::text FROM auth.users WHERE email='crebizlogistics@gmail.com'), true);
--   SELECT public.start_payment('license',
--     (SELECT price_standard FROM videos WHERE id='<이미_산_영상uuid>'), '<이미_산_영상uuid>');
--
--   -- A4: search_path 고정 확인 + seller_id NULL 완료주문 0 확인
--   SELECT proname, (SELECT array_agg(c) FROM unnest(coalesce(proconfig,'{}')) c) AS cfg
--   FROM pg_proc WHERE proname='set_order_seller_id';   -- cfg 에 search_path 포함되어야
--   SELECT count(*) FROM public.orders WHERE status='completed' AND seller_id IS NULL;  -- 0
-- ════════════════════════════════════════════════════════════════════════════
