-- ════════════════════════════════════════════════════════════════════════════
-- C6 (2026-06-14): 구독 환불 시 자동결제(빌링) 해지 — 환불 후 재청구 방지
--   기존 admin_refund_payment 는 구독 환불 시 profiles 만 free 로 내리고
--   billing_subscriptions 는 active/auto_renew 로 남겨, 다음 billing-run cron 이
--   카드를 재청구할 수 있었음. 환불 분기에 빌링 해지를 추가.
--   (함수 전체 재정의 — 기존 로직 동일 + subscription 분기 3줄 추가)
-- 적용: Supabase SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_refund_payment(p_payment_id bigint, p_admin_note text DEFAULT NULL::text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_payment   public.payments;
  v_seller_id UUID;
  v_warning   TEXT := NULL;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 결제입니다 (id: %)', p_payment_id;
  END IF;

  IF v_payment.status NOT IN ('completed', 'refund_requested') THEN
    RAISE EXCEPTION '환불 가능한 상태가 아닙니다 (현재: %)', v_payment.status;
  END IF;

  UPDATE public.payments
  SET status         = 'refunded',
      failure_reason = COALESCE(p_admin_note, '관리자 환불'),
      updated_at     = now()
  WHERE id = p_payment_id;

  -- 권한 회수
  IF v_payment.payment_type = 'subscription' THEN
    UPDATE public.profiles
    SET subscription_tier = 'free', subscription_expires_at = NULL, updated_at = now()
    WHERE id = v_payment.user_id;

    -- C6 (2026-06-14): 자동결제도 해지 — 환불 후 cron 재청구 방지
    UPDATE public.billing_subscriptions
    SET auto_renew = false, status = 'canceled', updated_at = now()
    WHERE user_id = v_payment.user_id;

  ELSIF v_payment.payment_type = 'license' THEN
    -- R10: 레거시 주문은 payment_id 가 NULL — 같은 구매자+영상이면 함께 환불 처리
    UPDATE public.orders
    SET status = 'refunded', updated_at = now()
    WHERE buyer_id = v_payment.user_id
      AND video_id = v_payment.target_id
      AND status = 'completed'
      AND (payment_id = v_payment.payment_key OR payment_id IS NULL);

    SELECT o.seller_id INTO v_seller_id
    FROM public.orders o
    WHERE o.buyer_id = v_payment.user_id
      AND o.video_id = v_payment.target_id
      AND o.status = 'refunded'
    ORDER BY o.updated_at DESC
    LIMIT 1;

    -- R6: 해당 판매자의 결제 월 정산이 이미 확정(pending/paid)돼 있으면 경고
    IF v_seller_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.revenue_distributions rd
      WHERE rd.creator_id = v_seller_id
        AND rd.period_start = date_trunc('month', COALESCE(v_payment.approved_at, v_payment.created_at))::DATE
        AND rd.payout_status IN ('pending', 'paid')
    ) THEN
      v_warning := '이 판매 건은 이미 월 정산에 포함되어 있습니다. 해당 월 정산을 재실행(재계산)하거나, 이미 지급된 경우 수동 보정이 필요합니다.';
    END IF;

  ELSIF v_payment.payment_type = 'ad_budget' THEN
    UPDATE public.ads
    SET budget_krw = GREATEST(COALESCE(budget_krw, 0) - v_payment.amount, 0),
        updated_at = now()
    WHERE id = v_payment.target_id::UUID;
  END IF;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'refund_payment', 'payment', p_payment_id::TEXT,
    jsonb_build_object(
      'order_id',           v_payment.order_id,
      'amount',             v_payment.amount,
      'payment_type',       v_payment.payment_type,
      'admin_note',         p_admin_note,
      'user_refund_reason', v_payment.refund_reason,
      'was_user_requested', v_payment.status = 'refund_requested',
      'settlement_warning', v_warning IS NOT NULL
    ));

  RETURN v_warning;
END;
$fn$;
