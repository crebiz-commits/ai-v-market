-- ════════════════════════════════════════════════════════════════════════════
-- F3 (2026-07-11): 정산 클로백 원장 (지급완료 월 환불 → 수동 차감 추적)
--
--   문제: 이미 지급완료(paid)된 월에 라이선스 환불이 발생하면 admin_refund_payment 는
--         admin_logs 에 needs_clawback:true 를 "기록만" 했다. 어디에도 노출되지 않아
--         "다음 정산에서 수동 차감"이 실제로 일어나지 않고, 대상 크리에이터 id 조차
--         로그에 없어 조치가 불가능했다.
--
--   해결: settlement_clawbacks 원장 신설 + 조회/처리/수동추가 RPC + admin_refund_payment
--         의 paid 분기에서 클로백 자동 등록(대상 크리에이터·기간·회수금액). 정산 페이지에서
--         '클로백 대기'로 떠서 어드민이 [적용완료]/[면제] 처리.
--
--   ※ admin_refund_payment 는 refund_settlement_reversal_20260703.sql 정본을 그대로
--     복제 + license 분기에만 원장 INSERT 를 추가. 다른 분기(구독/광고예산)·경고·로그·
--     권한회수 로직은 100% 동일 유지. 구독 등 크리에이터 특정이 어려운 케이스는
--     admin_add_clawback(수동 추가)로 처리.
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 원장 테이블 ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.settlement_clawbacks (
  id           BIGSERIAL PRIMARY KEY,
  creator_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  period_start DATE NOT NULL,                        -- 원 판매/수납이 속한 정산 월
  amount       INTEGER NOT NULL DEFAULT 0,           -- 회수(차감) 대상 크리에이터 지급분(원)
  source_type  TEXT NOT NULL DEFAULT 'manual',       -- license | subscription | manual
  source_ref   TEXT,                                 -- 원천 결제 id 등
  reason       TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',      -- pending | applied | waived
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID,
  resolved_at  TIMESTAMPTZ,
  resolved_by  UUID,
  CONSTRAINT settlement_clawbacks_status_chk CHECK (status IN ('pending','applied','waived')),
  CONSTRAINT settlement_clawbacks_source_chk CHECK (source_type IN ('license','subscription','manual'))
);

CREATE INDEX IF NOT EXISTS settlement_clawbacks_status_idx  ON public.settlement_clawbacks(status);
CREATE INDEX IF NOT EXISTS settlement_clawbacks_creator_idx ON public.settlement_clawbacks(creator_id);
CREATE INDEX IF NOT EXISTS settlement_clawbacks_period_idx  ON public.settlement_clawbacks(period_start);

-- RLS: 직접 접근 전면 차단(정책 없음) → SECURITY DEFINER RPC 로만 접근. (revenue_distributions 패턴)
ALTER TABLE public.settlement_clawbacks ENABLE ROW LEVEL SECURITY;

-- ── 2) 조회 RPC (기본 pending) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_clawbacks(p_status TEXT DEFAULT 'pending')
RETURNS TABLE (
  id BIGINT, creator_id UUID, creator_name TEXT, period_start DATE,
  amount INTEGER, source_type TEXT, source_ref TEXT, reason TEXT,
  status TEXT, note TEXT, created_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT c.id, c.creator_id, p.display_name, c.period_start,
         c.amount, c.source_type, c.source_ref, c.reason,
         c.status, c.note, c.created_at, c.resolved_at
  FROM public.settlement_clawbacks c
  LEFT JOIN public.profiles p ON p.id = c.creator_id
  WHERE (p_status = 'all' OR c.status = p_status)
  ORDER BY (c.status = 'pending') DESC, c.created_at DESC;
END;
$$;

-- ── 3) 처리 RPC (applied=차감 반영완료 / waived=면제) ────────────────────────
CREATE OR REPLACE FUNCTION public.admin_resolve_clawback(
  p_id BIGINT, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.settlement_clawbacks;
BEGIN
  PERFORM public.assert_admin();
  IF p_status NOT IN ('applied','waived') THEN
    RAISE EXCEPTION '잘못된 상태입니다 (applied|waived 만 허용): %', p_status;
  END IF;

  UPDATE public.settlement_clawbacks
  SET status = p_status,
      note = COALESCE(p_note, note),
      resolved_at = now(),
      resolved_by = auth.uid()
  WHERE id = p_id AND status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION '처리 대기 중(pending)인 클로백이 아닙니다 (id: %)', p_id;
  END IF;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'clawback_resolve', 'settlement_clawback', p_id::TEXT,
    jsonb_build_object('status', p_status, 'creator_id', v_row.creator_id,
                       'amount', v_row.amount, 'period', v_row.period_start, 'note', p_note));
END;
$$;

-- ── 4) 수동 추가 RPC (구독 환불·기타 정정) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_add_clawback(
  p_creator_id UUID, p_period_start DATE, p_amount INTEGER, p_reason TEXT DEFAULT NULL)
RETURNS BIGINT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id BIGINT;
BEGIN
  PERFORM public.assert_admin();
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION '금액은 0보다 커야 합니다';
  END IF;
  IF p_creator_id IS NULL THEN
    RAISE EXCEPTION '대상 크리에이터를 지정해야 합니다';
  END IF;

  INSERT INTO public.settlement_clawbacks
    (creator_id, period_start, amount, source_type, reason, status, created_by)
  VALUES (p_creator_id, p_period_start, p_amount, 'manual', p_reason, 'pending', auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'clawback_add', 'settlement_clawback', v_id::TEXT,
    jsonb_build_object('creator_id', p_creator_id, 'amount', p_amount,
                       'period', p_period_start, 'reason', p_reason));
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_clawbacks(TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_clawback(BIGINT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_clawback(UUID, DATE, INTEGER, TEXT) TO authenticated;

-- ── 5) admin_refund_payment 재정의 (정본 복제 + license 분기 클로백 자동등록) ──
--   refund_settlement_reversal_20260703.sql 와 동일 + paid 분기에서 원장 INSERT.
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
  v_share          NUMERIC;      -- F3: 판매 분배율(스냅샷 우선)
  v_clawback_amt   INTEGER;      -- F3: 회수 대상 크리에이터 지급분
  v_clawback_id    BIGINT;       -- F3: 등록된 원장 id
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
        -- 이미 지급 완료 → 자동 클로백 불가. F3: 원장에 등록해 수동 차감을 추적.
        v_needs_clawback := true;
        v_warning := '이미 지급 완료(paid)된 월 정산에 포함된 판매입니다. 클로백(수동 차감)이 대기 목록에 등록되었습니다.';

        -- 회수 금액 = 이 판매 총액 × 판매 분배율(해당 월 스냅샷 우선, 없으면 현재 설정)
        v_share := COALESCE(
          (SELECT (rd.applied_rates->>'creator_share_sale')::NUMERIC
             FROM public.revenue_distributions rd
             WHERE rd.creator_id = v_seller_id AND rd.period_start = v_period),
          public.get_platform_setting('creator_share_sale'),
          0.80);
        v_clawback_amt := FLOOR(GREATEST(COALESCE(v_payment.amount, 0), 0) * v_share)::INTEGER;

        -- 중복 방지: 같은 결제로 이미 등록된 license 클로백이 없을 때만 INSERT
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
        -- pending/deferred(정산됐으나 미지급) → 해당 월 재계산으로 환불 반영.
        --   calculate_monthly_revenue 는 status='completed' 만 집계하므로 refunded 는 자동 제외.
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
      'seller_id',          v_seller_id,          -- F3: 클로백 대상 (기존엔 누락)
      'needs_clawback',     v_needs_clawback,     -- true = 지급완료 월 → 수동 차감 필요
      'clawback_id',        v_clawback_id,        -- F3: 등록된 원장 id
      'settlement_warning', v_warning IS NOT NULL
    ));

  RETURN v_warning;
END;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT * FROM public.admin_list_clawbacks('pending');           -- (관리자 세션)
--   -- paid 월 라이선스 환불 후 원장 자동 등록 확인
--   SELECT id, creator_id, period_start, amount, source_type, status
--   FROM public.settlement_clawbacks ORDER BY id DESC LIMIT 5;
-- ════════════════════════════════════════════════════════════════════════════
