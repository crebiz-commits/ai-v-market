-- ════════════════════════════════════════════════════════════════════════════
-- 결제 구독가 검증 — 활성 설정행만 조회 (2026-07-23)
--
--   결함: start_payment 의 subscription 금액검증이
--         `SELECT value::integer INTO v_price FROM platform_settings WHERE key='subscription_price_krw';`
--         로 **effective_to IS NULL(활성행) 필터 없이** 조회했다. platform_settings 는
--         이력보존형(SCD2) — 같은 key 가 시간에 따라 여러 행(과거행은 effective_to 세팅,
--         부분 UNIQUE 로 활성행만 1개). 가격을 ₩4,900↔₩2,900 로 바꾼 순간 key 당 다중행이
--         존재하고, plpgsql `SELECT INTO` 는 다중행이어도 에러 없이 **임의의 첫 행**을 잡는다.
--         → 표시(get_platform_setting=활성가)와 검증(임의 과거행)이 어긋나 정상 금액을 보내도
--           구독 결제가 비결정적으로 거부될 수 있었다(무결제형 결함).
--
--   해결: 정본 조회함수 `get_platform_setting`(effective_to IS NULL + LIMIT 1)을 재사용.
--         이미 같은 함수 안에서 payments_enabled 게이트가 get_platform_setting 을 쓰고 있어
--         패턴 일치. 나머지(게이트·라이선스 금액검증·재구매차단·ad_budget·구독 로직) 100% 동일.
--
--   ※ payment_amount_standard_only_20260711.sql 정본 전체 복제 + 구독가 조회 1줄만 변경.
--     ★ 새 정본. payment_amount_standard_only_20260711 / payments_gate_20260708 /
--       purchase_integrity_20260703 재실행 금지(effective_to 미필터로 회귀).
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
    -- 2026-07-23: 활성 설정행만 조회(get_platform_setting = effective_to IS NULL + LIMIT 1).
    --   과거 이력행 오조회로 표시가≠검증가 되던 결함 차단.
    v_price := public.get_platform_setting('subscription_price_krw')::integer;
    IF v_price IS NULL OR p_amount <> v_price THEN
      RAISE EXCEPTION '구독 금액이 정책과 일치하지 않습니다 (요청 %, 정책 %)', p_amount, v_price;
    END IF;
  ELSIF p_payment_type = 'license' THEN
    IF p_target_id IS NULL THEN RAISE EXCEPTION '대상 영상이 지정되지 않았습니다'; END IF;
    -- 2026-07-11: 판매 라이선스는 'standard' 단일 → 금액은 price_standard 와 정확히 일치해야 함.
    --   (기존 IN(standard,commercial,exclusive) 은 tier 값이 다를 때 저가 위조결제 허용)
    IF NOT EXISTS (
      SELECT 1 FROM public.videos v
      -- ⚠️ videos.id 는 TEXT — ::uuid 캐스트 금지(text = uuid 는 42883 연산자 없음 →
      --    라이선스 결제 시작이 전면 실패하는 잠재 회귀였음, 2026-07-13 수정).
      WHERE v.id = p_target_id
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
--   -- 활성 구독가와 정확히 일치해야 통과, 과거 이력가로는 거부(payments_enabled=1 가정)
--   SELECT prosrc ~ 'get_platform_setting\(''subscription_price_krw''\)'
--     AS uses_active_setting FROM pg_proc WHERE proname='start_payment';   -- true 여야
-- ════════════════════════════════════════════════════════════════════════════
