-- ════════════════════════════════════════════════════════════════════════════
-- A5 (2026-07-03): 환불이 정산(revenue_distributions)에 실제 반영되도록 처리
--
--   문제: admin_refund_payment 는 license 환불 시 orders.status='refunded' 로만
--         바꾸고, 이미 그 달이 정산됐으면 "경고 문자열"만 반환했다. 실제 역산이
--         없어 환불된 판매가 크리에이터에게 지급된 채 남을 수 있었다(플랫폼 180% 손실).
--
--   해결(판매월 정산행 상태에 따라):
--     · 정산행 없음(현재月 등 미정산) → 조치 불필요. 월말 정산 시 refunded 주문이
--       sales CTE(status='completed')에서 자동 제외되므로 애초에 지급 안 됨.
--     · pending/deferred(정산됐으나 미지급) → 해당 월 calculate_monthly_revenue 재실행.
--       refunded 주문이 빠진 금액으로 재계산되어 지급 전에 정정됨.
--     · paid(이미 지급 완료) → 자동 클로백 불가(현금 이미 출금). 경고 반환 + admin_logs
--       에 클로백 필요 기록. 다음 정산에서 수동 차감.
--
--   ※ 구독 환불의 풀 재산정은 M1(구독풀 실결제액 기반)에서 함께 다룸(여기선 license).
--
-- 적용: Supabase SQL Editor → Run (멱등). refund_cancel_billing_20260614.sql 정본 +
--       license 분기의 정산 반영 로직 교체.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_refund_payment(p_payment_id bigint, p_admin_note text DEFAULT NULL::text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_payment     public.payments;
  v_seller_id   UUID;
  v_warning     TEXT := NULL;
  v_period      DATE;
  v_dist_status TEXT;
  v_needs_clawback BOOLEAN := false;
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

    -- A5(2026-07-03): 판매월 정산행 상태에 따라 실제 역산 처리
    v_period := date_trunc('month', COALESCE(v_payment.approved_at, v_payment.created_at))::DATE;
    IF v_seller_id IS NOT NULL THEN
      SELECT rd.payout_status INTO v_dist_status
      FROM public.revenue_distributions rd
      WHERE rd.creator_id = v_seller_id AND rd.period_start = v_period;

      IF v_dist_status IS NULL THEN
        -- 아직 정산 안 된 월(현재月 포함) → 월말 정산이 refunded 를 자동 제외. 조치 불필요.
        v_warning := NULL;

      ELSIF v_dist_status = 'paid' THEN
        -- 이미 지급 완료 → 자동 클로백 불가. 경고 + 로그로 수동 차감 유도.
        v_needs_clawback := true;
        v_warning := '이미 지급 완료(paid)된 월 정산에 포함된 판매입니다. 다음 정산에서 수동 차감(클로백)이 필요합니다.';

      ELSE
        -- pending/deferred(정산됐으나 미지급) → 해당 월 재계산으로 환불 반영.
        --   calculate_monthly_revenue 는 status='completed' 만 집계하므로 refunded 는 자동 제외.
        --   (정산행이 이미 존재 = 완료된 과거 월 = period_end<now 이라 미래월 RAISE 없음)
        PERFORM 1 FROM public.calculate_monthly_revenue(
          EXTRACT(YEAR  FROM v_period)::INTEGER,
          EXTRACT(MONTH FROM v_period)::INTEGER);
        v_warning := NULL;
      END IF;
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
      'settlement_period',  v_period,
      'settlement_status',  v_dist_status,
      'needs_clawback',     v_needs_clawback,   -- true = 지급완료 월 → 수동 차감 필요
      'settlement_warning', v_warning IS NOT NULL
    ));

  RETURN v_warning;
END;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- pending 월 판매 환불 → 재계산으로 sale_revenue 감소 확인
--   -- paid 월 판매 환불 → 경고 반환 + admin_logs.details->>'needs_clawback'='true'
--   SELECT details->>'needs_clawback', details->>'settlement_status'
--   FROM public.admin_logs WHERE action='refund_payment' ORDER BY id DESC LIMIT 1;
-- ════════════════════════════════════════════════════════════════════════════
