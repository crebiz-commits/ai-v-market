-- ════════════════════════════════════════════════════════════════════════════
-- 자동결제 2단계: 결제 처리 RPC (2026-06-12)
--   Edge Function(service_role)이 토스 빌링 청구 성공/실패 후 호출.
--   첫 결제·정기 결제 공통.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 청구 성공: payments 기록 + 구독 +30일 + billing_subscriptions upsert ──
CREATE OR REPLACE FUNCTION public.billing_apply_charge(
  p_user_id      UUID,
  p_billing_key  TEXT,
  p_customer_key TEXT,
  p_card_company TEXT,
  p_card_last4   TEXT,
  p_amount       INTEGER,
  p_order_id     TEXT,
  p_payment_key  TEXT,
  p_approved_at  TIMESTAMPTZ,
  p_raw          JSONB
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_new_expiry TIMESTAMPTZ;
BEGIN
  -- 0) 멱등성: 이미 완료된 주문이면 중복 부여(구독 이중 +30일) 방지 (2026-06-12 보강)
  IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id AND status = 'completed') THEN
    RETURN;
  END IF;

  -- 1) 결제 기록 (멱등 — 같은 order_id 중복 무시)
  INSERT INTO public.payments (order_id, payment_key, user_id, payment_type, amount, method, status, approved_at, raw_response)
  VALUES (p_order_id, p_payment_key, p_user_id, 'subscription', p_amount, '카드(자동결제)', 'completed', p_approved_at, p_raw)
  ON CONFLICT (order_id) DO NOTHING;

  -- 2) 구독 +30일 (기존 만료일 누적)
  UPDATE public.profiles
  SET subscription_tier       = 'premium',
      subscription_started_at = COALESCE(subscription_started_at, now()),
      subscription_expires_at = GREATEST(COALESCE(subscription_expires_at, now()), now()) + INTERVAL '30 days',
      updated_at = now()
  WHERE id = p_user_id
  RETURNING subscription_expires_at INTO v_new_expiry;

  -- 3) billing_subscriptions upsert (다음 청구 = 새 만료일)
  INSERT INTO public.billing_subscriptions
    (user_id, billing_key, customer_key, card_company, card_last4, amount, auto_renew, status, next_charge_at, last_charge_at, fail_count, updated_at)
  VALUES
    (p_user_id, p_billing_key, p_customer_key, p_card_company, p_card_last4, p_amount, true, 'active', v_new_expiry, now(), 0, now())
  ON CONFLICT (user_id) DO UPDATE SET
    billing_key    = EXCLUDED.billing_key,
    customer_key   = EXCLUDED.customer_key,
    card_company   = EXCLUDED.card_company,
    card_last4     = EXCLUDED.card_last4,
    amount         = EXCLUDED.amount,
    status         = 'active',
    next_charge_at = EXCLUDED.next_charge_at,
    last_charge_at = now(),
    fail_count     = 0,
    updated_at     = now();

  -- 4) 영수증 알림 (인앱)
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (p_user_id, 'system', '프리미엄 구독 결제 완료',
          '₩' || p_amount || ' 결제로 구독이 30일 연장되었어요.',
          '/?tab=subscription');
END; $$;

GRANT EXECUTE ON FUNCTION public.billing_apply_charge(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,JSONB) TO service_role;

-- ── 청구 실패: fail_count++ , 3회 이상이면 자동결제 중단 ──
CREATE OR REPLACE FUNCTION public.billing_mark_failed(p_user_id UUID, p_reason TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_fc INTEGER;
BEGIN
  UPDATE public.billing_subscriptions
  SET fail_count     = fail_count + 1,
      status         = CASE WHEN fail_count + 1 >= 3 THEN 'failed' ELSE status END,
      auto_renew     = CASE WHEN fail_count + 1 >= 3 THEN false ELSE auto_renew END,
      next_charge_at = now() + INTERVAL '1 day',   -- 하루 뒤 재시도
      updated_at     = now()
  WHERE user_id = p_user_id
  RETURNING fail_count INTO v_fc;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (p_user_id, 'system',
          CASE WHEN v_fc >= 3 THEN '자동결제가 중단되었어요' ELSE '구독 결제에 실패했어요' END,
          CASE WHEN v_fc >= 3 THEN '카드 결제가 여러 번 실패해 자동결제를 멈췄어요. 결제수단을 다시 등록해 주세요.'
               ELSE '카드 결제에 실패했어요 (' || COALESCE(p_reason,'') || '). 곧 다시 시도합니다.' END,
          '/?tab=subscription');
END; $$;

GRANT EXECUTE ON FUNCTION public.billing_mark_failed(UUID, TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
