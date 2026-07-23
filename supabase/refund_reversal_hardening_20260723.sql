-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 환불 정합성 하드닝 (2026-07-23) — 구독 풀 역산(R#1) · 광고 소진 경고(R#2) · 행 잠금(R#3)
--
--   admin_refund_payment 정본(admin_audit_hardening_20260714.sql ⑦, KST·구독 -30일·라이선스
--   3분기 클로백)을 전체 복제 + 3가지 보강. 나머지 로직(권한·라이선스 역산·감사로그)은 동일.
--
--   [R#1] 구독 환불 시 정산 역산·경고 (라이선스와 대칭)
--     기존 구독 분기는 tier 강등 + 빌링 해지만 하고, 그 결제가 만든 '구독 풀' 정산은 손대지
--     않았다. 구독 풀 = SUM(완료 구독결제)이므로 환불된 결제는 재계산 시 자동 제외된다:
--       · 미지급(pending/deferred) 월 → calculate_monthly_revenue 재실행으로 풀 축소 반영.
--       · 이미 지급(paid) 월 → 풀이 전 크리에이터에 분산 지급돼 개별 자동회수 불가 → 경고
--         (관리자가 admin_add_clawback 로 수동 조정). 라이선스 paid 분기와 동일한 경고 UX.
--
--   [R#2] 광고 예산 환불 시 소진분 초과 경고
--     예산 일부가 이미 노출(spent_krw)돼 크리에이터에게 광고수익이 배분된 뒤 전액 환불하면
--     그만큼 플랫폼 손실. 미소진 잔액(budget-spent)을 초과하는 환불 시 경고. (예산 차감은 유지.)
--
--   [R#3] 환불 대상 결제 행 잠금(FOR UPDATE)
--     동시 환불 호출 시 상태 가드를 둘 다 통과해 분기 부작용(예산 이중차감·클로백 이중등록)이
--     2회 실행되던 잠재 결함 차단(Edge 는 토스 cancel 을 먼저 호출해 대부분 막히나 RPC 직접
--     동시호출 대비).
--
--   ★ admin_refund_payment 새 정본. admin_audit_hardening_20260714.sql ⑦ ·
--     settlement_clawbacks_20260711 · refund_settlement_reversal_20260703 재실행 금지
--     (R#1·R#2·R#3 소실). 단, 0714 의 다른 함수(정산·정책 등)는 이 파일과 무관하게 유효.
--
-- 적용: Supabase SQL Editor → Run (멱등). settlement_clawbacks_20260711.sql 선적용 필요.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_refund_payment(p_payment_id bigint, p_admin_note text DEFAULT NULL::text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_payment      public.payments;
  v_seller_id    UUID;
  v_warning      TEXT := NULL;
  v_period       DATE;
  v_dist_status  TEXT;
  v_needs_clawback BOOLEAN := false;
  v_share          NUMERIC;
  v_clawback_amt   INTEGER;
  v_clawback_id    BIGINT;
  v_ad_remaining   INTEGER;   -- R#2: 광고 미소진 잔액
BEGIN
  PERFORM public.assert_admin();

  -- R#3: 환불 대상 결제 행 잠금 — 동시 환불의 이중 부작용 차단.
  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id FOR UPDATE;
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
    -- 환불 결제 1건 = 1개월(30일)분만 회수 — 만료일 전체 소거 금지(2026-07-14).
    --   다른 결제/수동 지급이 커버하는 기간은 유지, 차감 후 과거면 free 강등.
    UPDATE public.profiles
    SET subscription_expires_at = subscription_expires_at - INTERVAL '30 days',
        subscription_tier = CASE
          WHEN subscription_expires_at - INTERVAL '30 days' > now() THEN subscription_tier
          ELSE 'free'
        END,
        updated_at = now()
    WHERE id = v_payment.user_id;
    -- P9(만료일 NULL=비구독 통일): 차감 결과가 과거면 NULL 정리
    UPDATE public.profiles
    SET subscription_expires_at = NULL
    WHERE id = v_payment.user_id
      AND subscription_expires_at IS NOT NULL
      AND subscription_expires_at <= now();

    -- C6 (2026-06-14): 자동결제도 해지 — 환불 후 cron 재청구 방지
    UPDATE public.billing_subscriptions
    SET auto_renew = false, status = 'canceled', updated_at = now()
    WHERE user_id = v_payment.user_id;

    -- R#1(2026-07-23): 구독 풀 정산 역산 — 라이선스와 대칭. 판매월(KST) 기준.
    --   구독 풀 = SUM(완료 구독결제)이라, 환불된 이 결제는 재계산 시 자동 제외된다.
    v_period := date_trunc('month',
                  COALESCE(v_payment.approved_at, v_payment.created_at) AT TIME ZONE 'Asia/Seoul')::DATE;
    IF EXISTS (SELECT 1 FROM public.revenue_distributions rd
               WHERE rd.period_start = v_period AND rd.payout_status = 'paid') THEN
      -- 이미 지급 완료된 월 → 풀이 전 크리에이터에 분산 지급돼 개별 자동회수 불가. 경고.
      v_needs_clawback := true;
      v_warning := '이미 지급 완료(paid)된 월의 구독 풀에 포함된 결제입니다. 구독 풀은 전 크리에이터에게 분산 지급돼 개별 자동 회수가 어렵습니다 — 필요 시 관리자가 수동 조정(admin_add_clawback)하세요.';
    ELSIF EXISTS (SELECT 1 FROM public.revenue_distributions rd
                  WHERE rd.period_start = v_period AND rd.payout_status IN ('pending','deferred')) THEN
      -- 미지급 → 해당 월 재계산으로 풀 축소 반영(refunded 는 SUM(completed)에서 자동 제외).
      PERFORM 1 FROM public.calculate_monthly_revenue(
        EXTRACT(YEAR  FROM v_period)::INTEGER,
        EXTRACT(MONTH FROM v_period)::INTEGER);
      v_warning := NULL;
    END IF;

  ELSIF v_payment.payment_type = 'license' THEN
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

    -- A5(2026-07-03): 판매월 정산행 상태에 따라 실제 역산 처리.
    --   판매월 산정도 KST 기준(2026-07-14) — 정산 월 경계(①)와 일치 유지.
    v_period := date_trunc('month',
                  COALESCE(v_payment.approved_at, v_payment.created_at) AT TIME ZONE 'Asia/Seoul')::DATE;
    IF v_seller_id IS NOT NULL THEN
      SELECT rd.payout_status INTO v_dist_status
      FROM public.revenue_distributions rd
      WHERE rd.creator_id = v_seller_id AND rd.period_start = v_period;

      IF v_dist_status IS NULL THEN
        v_warning := NULL;

      ELSIF v_dist_status = 'paid' THEN
        v_needs_clawback := true;
        v_warning := '이미 지급 완료(paid)된 월 정산에 포함된 판매입니다. 클로백(수동 차감)이 대기 목록에 등록되었습니다.';

        v_share := COALESCE(
          (SELECT (rd.applied_rates->>'creator_share_sale')::NUMERIC
             FROM public.revenue_distributions rd
             WHERE rd.creator_id = v_seller_id AND rd.period_start = v_period),
          public.get_platform_setting('creator_share_sale'),
          0.80);
        v_clawback_amt := FLOOR(GREATEST(COALESCE(v_payment.amount, 0), 0) * v_share)::INTEGER;

        INSERT INTO public.settlement_clawbacks
          (creator_id, period_start, amount, source_type, source_ref, reason, status, created_by)
        SELECT v_seller_id, v_period, v_clawback_amt, 'license', p_payment_id::TEXT,
               '지급완료 월 라이선스 환불 — 크리에이터 지급분 회수', 'pending', auth.uid()
        WHERE NOT EXISTS (
          SELECT 1 FROM public.settlement_clawbacks sc
          WHERE sc.source_ref = p_payment_id::TEXT AND sc.source_type = 'license'
        )
        RETURNING id INTO v_clawback_id;

      ELSE
        -- pending/deferred → 해당 월 재계산으로 환불 반영(paid 행은 ①이 동결).
        PERFORM 1 FROM public.calculate_monthly_revenue(
          EXTRACT(YEAR  FROM v_period)::INTEGER,
          EXTRACT(MONTH FROM v_period)::INTEGER);
        v_warning := NULL;
      END IF;
    END IF;

  ELSIF v_payment.payment_type = 'ad_budget' THEN
    -- R#2(2026-07-23): 소진분(이미 노출) 초과 환불 경고 — 미소진 잔액 초과 환불은
    --   이미 크리에이터에게 배분됐을 광고수익만큼 플랫폼 손실.
    SELECT GREATEST(COALESCE(budget_krw, 0) - COALESCE(spent_krw, 0), 0)
    INTO v_ad_remaining
    FROM public.ads WHERE id = v_payment.target_id::UUID;
    IF COALESCE(v_payment.amount, 0) > COALESCE(v_ad_remaining, 0) THEN
      v_warning := '이 광고는 예산 일부가 이미 소진(노출)됐습니다. 미소진 잔액(' ||
                   COALESCE(v_ad_remaining, 0) || '원)을 초과하는 환불은 이미 크리에이터에게 ' ||
                   '배분됐을 광고수익만큼 플랫폼 손실이 될 수 있습니다 — 소진분 회수/부분환불을 검토하세요.';
    END IF;
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
      'seller_id',          v_seller_id,
      'needs_clawback',     v_needs_clawback,
      'clawback_id',        v_clawback_id,
      'ad_remaining',       v_ad_remaining,
      'settlement_warning', v_warning IS NOT NULL
    ));

  RETURN v_warning;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_refund_payment(bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_refund_payment(bigint, text) TO authenticated;

-- ── 검증 ──
SELECT 'R#1: 구독 환불 정산 역산' AS check_name,
  CASE WHEN (SELECT prosrc ~ '구독 풀' AND prosrc ~ 'calculate_monthly_revenue'
             FROM pg_proc WHERE proname='admin_refund_payment')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'R#2: 광고 소진 초과 환불 경고',
  CASE WHEN (SELECT prosrc ~ 'spent_krw' AND prosrc ~ 'ad_remaining'
             FROM pg_proc WHERE proname='admin_refund_payment')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'R#3: 환불 행 잠금(FOR UPDATE)',
  CASE WHEN (SELECT prosrc ~ 'FOR UPDATE' AND prosrc ~ 'assert_admin' AND prosrc ~ 'budget_krw'
             FROM pg_proc WHERE proname='admin_refund_payment')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
