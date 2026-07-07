-- ════════════════════════════════════════════════════════════════════════════
-- B-2 (2026-07-08): 결제 게이트 — 토스 live 키 전환 전 결제 진입 서버측 차단
--
--   문제: 무료 티어 선출시 상태(토스 가맹 심사 대기 = test_ck_/test_sk_ 키)에서도
--         구독 페이지·페이월·라이선스 구매·광고 충전이 전부 열려 있음.
--         테스트 키 결제는 실청구 없이 성공하므로:
--           ① 아무 사용자나 카드 등록 → 진짜 profiles 프리미엄 +30일 (무상 프리미엄)
--           ② 가짜 수납액이 payments 에 completed 로 쌓여 M1 구독 풀(실수납 기준)에
--              산입 → 크리에이터 정산에서 실돈 지급 가능 (정산 원장 오염)
--
--   해결: platform_settings 에 payments_enabled 스위치 추가(현재 0 = 차단).
--         · start_payment(라이선스/광고충전/구독 위젯 결제 생성) 서버 게이트
--         · Edge billing-auth-confirm(구독 카드등록+첫 결제)에도 동일 게이트(코드측)
--         설정 행이 없으면 기본 허용(1) — live 전환 후 행 삭제/1 변경 어느 쪽도 안전.
--
--   ★ 토스 live 키 전환 시 함께 할 일 (docs/launch-checklist.md §1):
--     UPDATE public.platform_settings SET value = 1
--     WHERE key = 'payments_enabled' AND effective_to IS NULL;
--
-- 적용: Supabase SQL Editor → Run (멱등).
--       Edge 게이트는 별도 배포: npx supabase functions deploy server --no-verify-jwt
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. 설정 시드: payments_enabled = 0 (활성 행이 없을 때만 삽입 — 멱등)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value, note)
SELECT 'payments_enabled', 0,
       '토스 live 키 전환 전 결제 차단 (B-2 2026-07-08). live 전환 시 1로 변경'
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_settings
  WHERE key = 'payments_enabled' AND effective_to IS NULL
);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. start_payment 재정의 — purchase_integrity_20260703.sql 정본 + 게이트만 추가
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

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 1) 게이트 작동 (payments_enabled=0 상태):
--   SELECT set_config('request.jwt.claim.sub',
--     (SELECT id::text FROM auth.users WHERE email='crebizlogistics@gmail.com'), true);
--   SELECT public.start_payment('subscription', 4900);
--   -- 기대: "결제 기능 준비 중입니다..." 예외
--
--   -- 2) live 전환 시:
--   -- UPDATE public.platform_settings SET value = 1
--   -- WHERE key = 'payments_enabled' AND effective_to IS NULL;
--   -- → start_payment 정상 order_id 반환
-- ════════════════════════════════════════════════════════════════════════════
