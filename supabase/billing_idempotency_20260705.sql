-- ════════════════════════════════════════════════════════════════════════════
-- 자동결제 멱등 강화 (2026-07-05) — 결제·구독 감사 P3/P10
--
--   P3(이중청구): cron 이 매 시도 Date.now() 로 새 orderId 를 만들어, "토스 청구 성공 +
--     apply 실패/Edge크래시" 시 다음 cron 이 charging_at(15분) stale 후 재claim →
--     새 orderId 로 토스 재청구(멱등 가드는 order_id 기준이라 못 막음) → 같은 주기 2회 과금.
--     → orderId 를 주기 결정적(next_charge_at 기준)으로 만들면 재시도가 같은 order_id →
--       토스 Idempotency-Key + payments.order_id 로 재청구 차단. 이를 위해 claim_due 가
--       next_charge_at 을 반환하도록 확장.
--   부수: apply/mark 시 charging_at = NULL 로 명시 초기화(락 즉시 해제).
--   P10(백오프): 실패 재시도를 now()+1day → +3days (due 윈도우 24h 와 겹쳐 매일 재시도되던 것 완화).
--
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) claim_due — next_charge_at 반환 추가(반환타입 변경이라 DROP 후 재생성)
DROP FUNCTION IF EXISTS public.billing_claim_due(integer, timestamptz);
CREATE OR REPLACE FUNCTION public.billing_claim_due(p_limit integer DEFAULT 200, p_due_before timestamptz DEFAULT now())
RETURNS TABLE(user_id uuid, billing_key text, customer_key text, amount integer, next_charge_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  RETURN QUERY
  UPDATE public.billing_subscriptions b
  SET charging_at = now()
  WHERE b.user_id IN (
    SELECT s.user_id FROM public.billing_subscriptions s
    WHERE s.auto_renew = true AND s.status = 'active'
      AND s.next_charge_at <= p_due_before
      AND (s.charging_at IS NULL OR s.charging_at < now() - interval '15 minutes')
    ORDER BY s.next_charge_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING b.user_id, b.billing_key, b.customer_key, b.amount, b.next_charge_at;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.billing_claim_due(integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_due(integer, timestamptz) TO service_role;

-- 2) apply_charge — ON CONFLICT UPDATE 에 charging_at = NULL 추가(락 해제)
CREATE OR REPLACE FUNCTION public.billing_apply_charge(
  p_user_id UUID, p_billing_key TEXT, p_customer_key TEXT, p_card_company TEXT, p_card_last4 TEXT,
  p_amount INTEGER, p_order_id TEXT, p_payment_key TEXT, p_approved_at TIMESTAMPTZ, p_raw JSONB
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_new_expiry TIMESTAMPTZ;
BEGIN
  IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id AND status = 'completed') THEN
    RETURN;
  END IF;

  INSERT INTO public.payments (order_id, payment_key, user_id, payment_type, amount, method, status, approved_at, raw_response)
  VALUES (p_order_id, p_payment_key, p_user_id, 'subscription', p_amount, '카드(자동결제)', 'completed', p_approved_at, p_raw)
  ON CONFLICT (order_id) DO NOTHING;

  UPDATE public.profiles
  SET subscription_tier = 'premium',
      subscription_started_at = COALESCE(subscription_started_at, now()),
      subscription_expires_at = GREATEST(COALESCE(subscription_expires_at, now()), now()) + INTERVAL '30 days',
      updated_at = now()
  WHERE id = p_user_id
  RETURNING subscription_expires_at INTO v_new_expiry;

  INSERT INTO public.billing_subscriptions
    (user_id, billing_key, customer_key, card_company, card_last4, amount, auto_renew, status, next_charge_at, last_charge_at, fail_count, charging_at, updated_at)
  VALUES
    (p_user_id, p_billing_key, p_customer_key, p_card_company, p_card_last4, p_amount, true, 'active', v_new_expiry, now(), 0, NULL, now())
  ON CONFLICT (user_id) DO UPDATE SET
    billing_key = EXCLUDED.billing_key, customer_key = EXCLUDED.customer_key,
    card_company = EXCLUDED.card_company, card_last4 = EXCLUDED.card_last4, amount = EXCLUDED.amount,
    status = 'active', next_charge_at = EXCLUDED.next_charge_at, last_charge_at = now(),
    fail_count = 0, charging_at = NULL, updated_at = now();

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (p_user_id, 'system', '프리미엄 구독 결제 완료',
          '₩' || p_amount || ' 결제로 구독이 30일 연장되었어요.', '/?tab=subscription');
END; $$;
GRANT EXECUTE ON FUNCTION public.billing_apply_charge(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.billing_apply_charge(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,JSONB) FROM PUBLIC, anon, authenticated;

-- 3) mark_failed — charging_at = NULL + 재시도 백오프 3일
CREATE OR REPLACE FUNCTION public.billing_mark_failed(p_user_id UUID, p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_fc INTEGER;
BEGIN
  UPDATE public.billing_subscriptions
  SET fail_count = fail_count + 1,
      status     = CASE WHEN fail_count + 1 >= 3 THEN 'failed' ELSE status END,
      auto_renew = CASE WHEN fail_count + 1 >= 3 THEN false ELSE auto_renew END,
      next_charge_at = now() + INTERVAL '3 days',   -- P10: 24h due 윈도우와 겹쳐 매일 재시도되던 것 완화
      charging_at = NULL,                            -- 락 해제
      updated_at = now()
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
REVOKE EXECUTE ON FUNCTION public.billing_mark_failed(UUID, TEXT) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
