-- ════════════════════════════════════════════════════════════════════════════
-- 알림 4차 감사 — 구독 자동갱신 벨 opt-out 게이트 (2026-07-10)
--
--   [MED] billing_apply_charge(자동 정기결제 성공)가 '프리미엄 구독 결제 완료' 벨을
--         inapp 게이트 없이 직접 INSERT → 사용자가 설정에서 '결제·구독 영수증' 벨을
--         꺼도 매월 자동갱신 벨이 계속 도착(토글↔동작 불일치).
--   [수정] 성공 벨 INSERT 를 inapp_subscription_receipt opt-out 게이트로. 결제 실패 벨
--         (billing_mark_failed)은 던닝(재시도 안내) 성격이라 게이트 제외(그대로 유지).
--   ※ 정의는 billing_idempotency_20260705.sql(최신 SSOT)의 billing_apply_charge 를
--     100% 보존 + 게이트만 추가. (billing_charge_rpcs_20260612.sql 은 구버전 — 재실행 금지.)
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

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

  -- 벨 opt-out: '결제·구독 영수증' 벨을 껐으면 자동갱신 벨도 스킵(수동결제 경로와 일관)
  IF NOT EXISTS (SELECT 1 FROM public.notification_preferences
                 WHERE user_id = p_user_id AND inapp_subscription_receipt = false) THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (p_user_id, 'system', '프리미엄 구독 결제 완료',
            '₩' || p_amount || ' 결제로 구독이 30일 연장되었어요.', '/?tab=subscription');
  END IF;
END; $$;
GRANT EXECUTE ON FUNCTION public.billing_apply_charge(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,JSONB) TO service_role;
REVOKE EXECUTE ON FUNCTION public.billing_apply_charge(UUID,TEXT,TEXT,TEXT,TEXT,INTEGER,TEXT,TEXT,TIMESTAMPTZ,JSONB) FROM PUBLIC, anon, authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT pg_get_functiondef(oid) ILIKE '%inapp_subscription_receipt%' AS ok
--     FROM pg_proc WHERE proname='billing_apply_charge';   -- true
