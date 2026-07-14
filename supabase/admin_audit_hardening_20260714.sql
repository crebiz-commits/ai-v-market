-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 관리자 3차 심층 감사 하드닝 (2026-07-14) — 이 파일이 아래 함수들의 새 정본
--
--   4도메인(운영/광고/수익화/안전품질) 병렬 감사에서 확정된 결함 일괄 수정.
--   [정본 이동] calculate_monthly_revenue(<-ad_revenue_house_exclude_20260711),
--     admin_refund_payment(<-settlement_clawbacks_20260711),
--     admin_get_tax_annual_report(<-phase32_tax_withholding),
--     update_platform_setting(<-admin_platform_setting_whitelist_expand_20260711),
--     track_video_ad_event(<-ad_fraud_hardening_edge_20260628),
--     pick_random_video_preroll(<-advertiser_self_service_phase1_20260614),
--     assert_admin(<-phase10_6), admin_unsuspend_user·admin_unhide_video(<-restore_20260711),
--     tg_notify_followers_new_video(<-notification_audit2_20260710),
--     admin_reply_support_inquiry(<-support_inquiries_20260611).
--   각 수정 사유는 절별 주석 참조. 옛 파일 재실행 시 이 하드닝이 전부 회귀하므로
--   재실행하지 말 것(이 파일을 마지막에 다시 Run 하면 복구).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- ① [🔴 수익화] calculate_monthly_revenue — paid 원장 동결 + KST 월 경계
--   (a) 재실행·자동 재계산이 지급완료(paid) 행의 금액·applied_rates 를 덮어써
--       지급 원장이 소급 훼손되고(연말정산 세전<세후 역전) 클로백과 이중 반영되던
--       결함 → ON CONFLICT ... WHERE payout_status <> 'paid' 로 paid 행 전체 동결.
--   (b) 월 경계가 UTC(1일 00:00~09:00 KST 매출이 전월 귀속) → KST 자정 기준으로.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_monthly_revenue(
  p_year  INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  creator_id           UUID,
  sale_revenue         INTEGER,
  ad_revenue           INTEGER,
  subscription_revenue INTEGER,
  total_revenue        INTEGER,
  payout_status        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_start    DATE := make_date(p_year, p_month, 1);
  v_period_end      DATE := (make_date(p_year, p_month, 1) + INTERVAL '1 month - 1 day')::DATE;
  -- KST 자정 경계 (naive timestamp 를 KST 벽시계로 해석 → timestamptz)
  v_period_start_ts TIMESTAMPTZ := (v_period_start::TIMESTAMP) AT TIME ZONE 'Asia/Seoul';
  v_period_end_ts   TIMESTAMPTZ := ((v_period_end + INTERVAL '1 day')::TIMESTAMP) AT TIME ZONE 'Asia/Seoul';  -- exclusive

  -- 정책 스냅샷 (정산 시점 값)
  v_share_sale       NUMERIC := COALESCE(public.get_platform_setting('creator_share_sale'), 0.80);
  v_share_ad_home    NUMERIC := COALESCE(public.get_platform_setting('creator_share_ad_home'), 0.50);
  v_share_ad_cinema  NUMERIC := COALESCE(public.get_platform_setting('creator_share_ad_cinema'), 0.55);
  v_share_ad_ott     NUMERIC := COALESCE(public.get_platform_setting('creator_share_ad_ott'), 0.60);
  v_share_sub_pool   NUMERIC := COALESCE(public.get_platform_setting('creator_share_subscription_pool'), 0.50);
  v_sub_price        NUMERIC := COALESCE(public.get_platform_setting('subscription_price_krw'), 4900);
  v_cpm              NUMERIC := COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000);
  v_payout_min       NUMERIC := COALESCE(public.get_platform_setting('payout_minimum_krw'), 10000);

  v_total_subscribers   INTEGER;
  v_subscription_total  NUMERIC;
  v_creator_pool        NUMERIC;
  v_total_ott_watch     NUMERIC;
  v_applied_rates       JSONB;

  v_admin_id  UUID := auth.uid();
  v_is_admin  BOOLEAN;
BEGIN
  -- 권한 체크
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;

  -- 입력 검증
  IF p_month < 1 OR p_month > 12 THEN
    RAISE EXCEPTION '월은 1~12 사이여야 합니다';
  END IF;
  IF v_period_end_ts > now() THEN
    RAISE EXCEPTION '미래 월은 정산할 수 없습니다 (대상: % ~ %)', v_period_start, v_period_end;
  END IF;

  -- ── M1(2026-07-03): 구독 풀 = 실제 수납된 구독 결제액 ──────────────────────
  SELECT COALESCE(SUM(p.amount), 0) INTO v_subscription_total
  FROM public.payments p
  WHERE p.payment_type = 'subscription'
    AND p.status = 'completed'
    AND COALESCE(p.approved_at, p.created_at) >= v_period_start_ts
    AND COALESCE(p.approved_at, p.created_at) <  v_period_end_ts;

  v_creator_pool := v_subscription_total * v_share_sub_pool;

  -- (참고) 활성 구독자 수 — 스냅샷/디버그용. 풀 계산엔 미사용. 경계 `<` 로 통일(M2).
  SELECT COUNT(*) INTO v_total_subscribers
  FROM public.profiles
  WHERE subscription_tier = 'premium'
    AND COALESCE(subscription_started_at, created_at) < v_period_end_ts
    AND (subscription_expires_at IS NULL OR subscription_expires_at >= v_period_start_ts);

  -- 적용 비율 스냅샷 (+ M1 풀 근거)
  v_applied_rates := jsonb_build_object(
    'creator_share_sale',              v_share_sale,
    'creator_share_ad_home',           v_share_ad_home,
    'creator_share_ad_cinema',         v_share_ad_cinema,
    'creator_share_ad_ott',            v_share_ad_ott,
    'creator_share_subscription_pool', v_share_sub_pool,
    'subscription_price_krw',          v_sub_price,
    'ad_cpm_krw',                      v_cpm,
    'payout_minimum_krw',              v_payout_min,
    'subscription_pool_basis',         'actual_payments',
    'subscription_total_collected',    v_subscription_total,
    'subscriber_count_ref',            v_total_subscribers,
    'ad_impression_basis',             'paid_only',   -- F1(2026-07-11): house 광고 제외
    'period_boundary',                 'Asia/Seoul',  -- KST 경계(2026-07-14)
    'calculated_at',                   now()
  );

  -- 전체 OTT 유효 시청시간 (구독료 pro-rata 분모)
  SELECT COALESCE(SUM(vv.watch_seconds), 0) INTO v_total_ott_watch
  FROM public.video_views vv
  JOIN public.videos v ON v.id = vv.video_id
  WHERE vv.is_valid = true
    AND v.show_on_ott = true
    AND vv.occurred_at >= v_period_start_ts
    AND vv.occurred_at <  v_period_end_ts;

  -- 정산 계산 + UPSERT
  RETURN QUERY
  WITH activity AS (
    SELECT o.seller_id::UUID AS cid FROM public.orders o
    WHERE o.status = 'completed' AND o.seller_id IS NOT NULL
      AND o.created_at >= v_period_start_ts AND o.created_at < v_period_end_ts
    UNION
    SELECT v.creator_id FROM public.video_views vv
    JOIN public.videos v ON v.id = vv.video_id
    WHERE vv.is_valid = true AND v.creator_id IS NOT NULL
      AND vv.occurred_at >= v_period_start_ts AND vv.occurred_at < v_period_end_ts
    UNION
    SELECT v.creator_id FROM public.ad_video_events e
    JOIN public.videos v ON v.id = e.source_video_id
    JOIN public.ads ad ON ad.id = e.ad_id
    WHERE e.event_type = 'impression' AND v.creator_id IS NOT NULL
      AND ad.budget_krw IS NOT NULL
      AND e.occurred_at >= v_period_start_ts AND e.occurred_at < v_period_end_ts
      AND e.occurred_at >= COALESCE(v.ad_eligibility_at, '1900-01-01'::TIMESTAMPTZ)
    UNION
    -- B-1(2026-07-08): 해당 월 기존 정산행 보유자 — 환불 등으로 활동이 0이 되어도
    --   기존 행을 0원으로 재산출(정정)할 수 있게 항상 재계산 대상에 포함.
    --   (paid 행은 아래 ON CONFLICT WHERE 가 동결하므로 여기 포함돼도 안전)
    SELECT rd.creator_id FROM public.revenue_distributions rd
    WHERE rd.period_start = v_period_start
  ),
  sales AS (
    SELECT o.seller_id::UUID AS cid, COALESCE(SUM(o.amount), 0) AS gross
    FROM public.orders o
    WHERE o.status = 'completed' AND o.seller_id IS NOT NULL
      AND o.created_at >= v_period_start_ts AND o.created_at < v_period_end_ts
    GROUP BY o.seller_id
  ),
  ad_impressions AS (
    SELECT
      v.creator_id AS cid,
      COUNT(*) FILTER (WHERE v.show_on_ott)                                      AS ott_imp,
      COUNT(*) FILTER (WHERE v.show_on_cinema AND NOT v.show_on_ott)             AS cinema_imp,
      COUNT(*) FILTER (WHERE NOT v.show_on_cinema AND NOT v.show_on_ott)         AS home_imp
    FROM public.ad_video_events e
    JOIN public.videos v ON v.id = e.source_video_id
    JOIN public.ads ad ON ad.id = e.ad_id
    WHERE e.event_type = 'impression' AND v.creator_id IS NOT NULL
      AND ad.budget_krw IS NOT NULL
      AND e.occurred_at >= v_period_start_ts AND e.occurred_at < v_period_end_ts
      AND e.occurred_at >= COALESCE(v.ad_eligibility_at, '1900-01-01'::TIMESTAMPTZ)
    GROUP BY v.creator_id
  ),
  ott_watch AS (
    SELECT v.creator_id AS cid, COALESCE(SUM(vv.watch_seconds), 0)::NUMERIC AS watch_secs
    FROM public.video_views vv
    JOIN public.videos v ON v.id = vv.video_id
    WHERE vv.is_valid = true AND v.show_on_ott = true AND v.creator_id IS NOT NULL
      AND vv.occurred_at >= v_period_start_ts AND vv.occurred_at < v_period_end_ts
    GROUP BY v.creator_id
  ),
  deferred_carry AS (
    SELECT rd.creator_id AS cid, COALESCE(SUM(rd.total_revenue), 0)::NUMERIC AS carry
    FROM public.revenue_distributions rd
    WHERE rd.payout_status = 'deferred' AND rd.period_start < v_period_start
    GROUP BY rd.creator_id
  ),
  calc AS (
    SELECT
      a.cid,
      FLOOR(COALESCE(s.gross, 0) * v_share_sale)::INTEGER AS sale_rev,
      FLOOR(
        COALESCE(ai.home_imp, 0)::numeric   / 1000 * v_cpm * v_share_ad_home +
        COALESCE(ai.cinema_imp, 0)::numeric / 1000 * v_cpm * v_share_ad_cinema +
        COALESCE(ai.ott_imp, 0)::numeric    / 1000 * v_cpm * v_share_ad_ott
      )::INTEGER AS ad_rev,
      CASE
        WHEN v_total_ott_watch > 0 THEN
          FLOOR(COALESCE(ow.watch_secs, 0) / v_total_ott_watch * v_creator_pool)::INTEGER
        ELSE 0
      END AS sub_rev,
      COALESCE(dc.carry, 0) AS carry
    FROM activity a
    LEFT JOIN sales s          ON s.cid  = a.cid
    LEFT JOIN ad_impressions ai ON ai.cid = a.cid
    LEFT JOIN ott_watch ow     ON ow.cid = a.cid
    LEFT JOIN deferred_carry dc ON dc.cid = a.cid
  ),
  upsert AS (
    INSERT INTO public.revenue_distributions AS rd (
      creator_id, period_start, period_end,
      sale_revenue, ad_revenue, subscription_revenue, total_revenue,
      applied_rates, payout_status
    )
    SELECT
      c.cid, v_period_start, v_period_end,
      c.sale_rev, c.ad_rev, c.sub_rev,
      c.sale_rev + c.ad_rev + c.sub_rev,
      v_applied_rates,
      CASE
        WHEN c.sale_rev + c.ad_rev + c.sub_rev + c.carry >= v_payout_min THEN 'pending'
        ELSE 'deferred'
      END
    FROM calc c
    WHERE c.sale_rev + c.ad_rev + c.sub_rev > 0
       OR EXISTS (
         SELECT 1 FROM public.revenue_distributions rd0
         WHERE rd0.creator_id = c.cid AND rd0.period_start = v_period_start
       )
    ON CONFLICT (creator_id, period_start) DO UPDATE SET
      sale_revenue         = EXCLUDED.sale_revenue,
      ad_revenue           = EXCLUDED.ad_revenue,
      subscription_revenue = EXCLUDED.subscription_revenue,
      total_revenue        = EXCLUDED.total_revenue,
      applied_rates        = EXCLUDED.applied_rates,
      payout_status        = EXCLUDED.payout_status,
      updated_at           = now()
    -- 🔒 지급완료(paid) 행은 금액·비율 스냅샷·상태 전부 동결 — 재실행/자동 재계산이
    --    실지급 원장을 소급 훼손하고 클로백과 이중 반영되던 결함 차단(2026-07-14).
    WHERE rd.payout_status IS DISTINCT FROM 'paid'
    RETURNING rd.creator_id, rd.sale_revenue, rd.ad_revenue,
              rd.subscription_revenue, rd.total_revenue, rd.payout_status
  )
  SELECT u.creator_id, u.sale_revenue, u.ad_revenue,
         u.subscription_revenue, u.total_revenue, u.payout_status
  FROM upsert u;

  -- R7: 이번 달이 pending 으로 확정된 크리에이터의 과거 deferred 행도 pending 승격
  UPDATE public.revenue_distributions rd
  SET payout_status = 'pending', updated_at = now()
  WHERE rd.payout_status = 'deferred'
    AND rd.period_start < v_period_start
    AND rd.creator_id IN (
      SELECT rd2.creator_id FROM public.revenue_distributions rd2
      WHERE rd2.period_start = v_period_start AND rd2.payout_status = 'pending'
    );
END;
$$;

COMMENT ON FUNCTION public.calculate_monthly_revenue IS
  '월별 정산 실행 (어드민 전용). KST 월 경계. paid 행은 동결(재실행 안전). 구독 풀=실수납(M1), 광고=유료만(F1), deferred 이월(R7), 0원 정정(B-1, 미지급분만).';

-- ─────────────────────────────────────────────────────────────────────────────
-- ② [🟠 수익화] admin_refund_payment — 구독 환불 = 1개월분만 회수 + 클로백 월 KST
--   기존: subscription 환불 시 만료일 NULL·즉시 free 강등 → 다른 결제가 커버하는
--   기간·수동 지급분까지 증발. → 만료일에서 30일만 차감, 차감 후에도 미래면 유지.
-- ─────────────────────────────────────────────────────────────────────────────
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
  v_share          NUMERIC;
  v_clawback_amt   INTEGER;
  v_clawback_id    BIGINT;
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
      'settlement_warning', v_warning IS NOT NULL
    ));

  RETURN v_warning;
END;
$fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ③ [🟡 수익화] admin_get_tax_annual_report — 지급 연도 귀속을 KST 로
--   (1/1 00:00~09:00 KST 지급분이 전년도 원천징수 자료로 귀속되던 것 정정)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_tax_annual_report(
  p_year INTEGER
)
RETURNS TABLE (
  creator_id UUID,
  creator_name TEXT,
  tax_type TEXT,
  business_number TEXT,
  business_name TEXT,
  total_gross INTEGER,
  total_withholding INTEGER,
  total_net INTEGER,
  distribution_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    rd.creator_id,
    p.display_name,
    COALESCE(p.tax_type, 'individual'),
    p.business_number,
    p.business_name,
    SUM(rd.total_revenue)::INTEGER,
    SUM(rd.tax_withholding)::INTEGER,
    SUM(rd.net_amount)::INTEGER,
    COUNT(*)::INTEGER
  FROM public.revenue_distributions rd
  LEFT JOIN public.profiles p ON p.id = rd.creator_id
  WHERE rd.payout_status = 'paid'
    AND EXTRACT(YEAR FROM rd.paid_at AT TIME ZONE 'Asia/Seoul') = p_year  -- KST 연도(2026-07-14)
  GROUP BY rd.creator_id, p.display_name, p.tax_type, p.business_number, p.business_name
  ORDER BY SUM(rd.total_revenue) DESC;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ④ [🟡 수익화] update_platform_setting — _krw 금액 키에 양수·정수 검증 추가
--   (0·소수 저장 시 표시가=청구가 불일치·토스 최소금액 오류 위험 차단)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_platform_setting(
  p_key TEXT,
  p_value NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_new_id BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;

  IF p_key NOT IN (
    'creator_share_sale',
    'creator_share_ad_home', 'creator_share_ad_cinema', 'creator_share_ad_ott',
    'creator_share_subscription_pool',
    'subscription_price_krw', 'ad_cpm_krw', 'payout_minimum_krw',
    'valid_view_min_ratio', 'ip_dedup_hours', 'new_video_grace_hours',
    'payments_enabled',
    'auto_hide_threshold',
    'min_upload_duration_seconds',
    'cinema_min_duration_seconds',
    'ott_min_duration_seconds',
    'cinema_preview_seconds',
    'min_duration_for_preroll_seconds',
    'min_duration_for_midroll_seconds'
  ) THEN
    RAISE EXCEPTION '알 수 없는 설정 키: %', p_key;
  END IF;

  -- 값 검증
  IF p_key LIKE 'creator_share_%' OR p_key = 'valid_view_min_ratio' THEN
    IF p_value < 0 OR p_value > 1 THEN
      RAISE EXCEPTION '비율은 0~1 사이여야 합니다 (입력: %)', p_value;
    END IF;
  ELSIF p_key = 'payments_enabled' THEN
    IF p_value NOT IN (0, 1) THEN
      RAISE EXCEPTION 'payments_enabled 는 0(비활성) 또는 1(활성)만 허용합니다 (입력: %)', p_value;
    END IF;
  ELSIF p_value < 0 THEN
    RAISE EXCEPTION '금액/시간/개수는 음수일 수 없습니다 (입력: %)', p_value;
  END IF;

  -- KRW 금액 키는 1원 이상의 정수만 (2026-07-14: 0·소수 → 표시가·청구가 불일치 차단.
  --   payout_minimum_krw 는 0 허용 — "최소액 없음" 운영이 유효한 정책이므로)
  IF p_key IN ('subscription_price_krw', 'ad_cpm_krw') AND p_value < 1 THEN
    RAISE EXCEPTION '% 는 1원 이상이어야 합니다 (입력: %)', p_key, p_value;
  END IF;
  IF p_key LIKE '%_krw' AND p_value <> floor(p_value) THEN
    RAISE EXCEPTION '% 는 정수(원 단위)여야 합니다 (입력: %)', p_key, p_value;
  END IF;

  -- 초·시간·개수·플래그 키는 정수만 (소수 방지)
  IF (p_key LIKE '%_seconds'
      OR p_key IN ('ip_dedup_hours', 'new_video_grace_hours', 'auto_hide_threshold', 'payments_enabled'))
     AND p_value <> floor(p_value) THEN
    RAISE EXCEPTION '% 는 정수여야 합니다 (입력: %)', p_key, p_value;
  END IF;

  UPDATE public.platform_settings
  SET effective_to = now()
  WHERE key = p_key AND effective_to IS NULL;

  INSERT INTO public.platform_settings (key, value, note, updated_by)
  VALUES (p_key, p_value, p_note, v_user_id)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⑤ [🔴 광고] track_video_ad_event — raw 적립을 dedup 통과 시로 이동 + 클릭 dedup
--     + 하우스 무과금
--   기존: raw ad_video_events 를 dedup 이전에 무조건 INSERT → 공개 VAST 픽셀
--   반복 GET 으로 정산 집계(raw COUNT)가 무한 부풀려짐(수납 ₩2, 지급 N배 = 순손실).
--   클릭은 dedup 전무(CTR 인플레이션), 하우스(budget NULL)에도 spent 가산.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_video_ad_event(
  p_ad_id uuid,
  p_event_type TEXT,
  p_source_video_id TEXT DEFAULT NULL,
  p_viewer_user_id uuid DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cpm          NUMERIC;
  v_cost_per_imp NUMERIC;
  v_key          TEXT := COALESCE(p_viewer_user_id::text, NULLIF(btrim(p_ip_address), ''));
  v_bucket       timestamptz := date_trunc('hour', now());
  v_dedup_key    TEXT;
BEGIN
  IF p_event_type = 'impression' THEN
    -- dedup: 반복 노출(서명URL 재요청) 차단. 키 없으면(IP/uid 둘 다 없음) 레거시 유지.
    IF v_key IS NOT NULL THEN
      v_dedup_key := 'vast:' || v_key || ':' || COALESCE(p_source_video_id, '');
      INSERT INTO public.ad_charge_dedup (ad_id, viewer_key, bucket)
      VALUES (p_ad_id, v_dedup_key, v_bucket) ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN RETURN; END IF;  -- 이미 집계된 조합 → raw·카운터·과금 전부 skip
    END IF;
    -- ⚠️ raw 적립은 dedup 통과 후에만 — 정산(calculate_monthly_revenue)이 raw 를
    --    COUNT 하므로, dedup 이전 적립은 크리에이터 광고수익 부풀리기 벡터였음(2026-07-14).
    INSERT INTO public.ad_video_events (ad_id, event_type, source_video_id, viewer_user_id, user_agent, ip_address)
    VALUES (p_ad_id, p_event_type, p_source_video_id, p_viewer_user_id, p_user_agent, p_ip_address);

    v_cpm := COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000);
    v_cost_per_imp := v_cpm / 1000.0;
    -- 하우스(budget NULL) 무과금 — 카운터만(피드 경로 ads_gate_dedup 과 동일 원칙)
    UPDATE public.ads
    SET impressions = impressions + 1,
        spent_krw = CASE WHEN budget_krw IS NULL THEN spent_krw
                         ELSE spent_krw + CEIL(v_cost_per_imp)::INTEGER END
    WHERE id = p_ad_id;

  ELSIF p_event_type = 'click' THEN
    -- 클릭도 dedup(1h) — 픽셀 반복 GET 의 CTR 인플레이션 차단(2026-07-14)
    IF v_key IS NOT NULL THEN
      v_dedup_key := 'vastclick:' || v_key || ':' || COALESCE(p_source_video_id, '');
      INSERT INTO public.ad_charge_dedup (ad_id, viewer_key, bucket)
      VALUES (p_ad_id, v_dedup_key, v_bucket) ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN RETURN; END IF;
    END IF;
    INSERT INTO public.ad_video_events (ad_id, event_type, source_video_id, viewer_user_id, user_agent, ip_address)
    VALUES (p_ad_id, p_event_type, p_source_video_id, p_viewer_user_id, p_user_agent, p_ip_address);
    UPDATE public.ads SET clicks = clicks + 1 WHERE id = p_ad_id;
  END IF;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⑥ [🟠 광고] pick_random_video_preroll — SETOF ads(전 컬럼) → 안전 컬럼만
--   기존: budget/spent/owner_id/review_note 등 내부 컬럼이 anon 에 노출
--   (ads_public 안전컬럼 설계를 이 RPC 하나가 우회). 반환타입 변경이라 DROP 선행.
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.pick_random_video_preroll(text);
CREATE FUNCTION public.pick_random_video_preroll(p_source_video_id text DEFAULT NULL::text)
RETURNS TABLE (
  id uuid, title text, advertiser text, image_url text, video_url text,
  thumbnail_url text, link_url text, cta_text text, max_duration integer
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT a.id, a.title, a.advertiser, a.image_url, a.video_url,
         a.thumbnail_url, a.link_url, a.cta_text, a.max_duration
  FROM public.ads a
  WHERE a.ad_type = 'video_preroll'
    AND a.status = 'approved'
    AND a.is_active = true
    AND a.video_url IS NOT NULL AND a.video_url <> ''
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at >= now())
    AND (a.budget_krw IS NULL OR a.spent_krw < a.budget_krw)
  ORDER BY random() * a.weight DESC LIMIT 1;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.pick_random_video_preroll(text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⑦ [🟠 수익화] admin_list_pending_payouts — 월 횡단 미지급 요약 (신규)
--   deferred→pending 승격(R7)된 과거월 행이 단일 월 화면에서 안 보여 영구 미지급
--   위험 → 전 기간 pending 요약을 정산 화면 상단 배너로 노출.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_pending_payouts()
RETURNS TABLE (period_start DATE, cnt INTEGER, total BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT rd.period_start, COUNT(*)::INTEGER, COALESCE(SUM(rd.total_revenue), 0)::BIGINT
  FROM public.revenue_distributions rd
  WHERE rd.payout_status = 'pending'
  GROUP BY rd.period_start
  ORDER BY rd.period_start;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_pending_payouts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_payouts() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⑧ [🟠 운영] assert_admin — 정지된 관리자 차단 + admin_unsuspend_user 셀프 해제 가드
--   기존: 정지(is_suspended)된 관리자가 콘솔 전권 유지 + 스스로 정지 해제 가능.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_admin     BOOLEAN;
  v_is_suspended BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  SELECT is_admin, COALESCE(is_suspended, false) INTO v_is_admin, v_is_suspended
  FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;
  -- 정지된 관리자는 관리자 권한 정지(2026-07-14) — 해제는 다른 관리자만 가능
  IF v_is_suspended THEN
    RAISE EXCEPTION '정지된 계정입니다. 다른 관리자에게 문의하세요';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  -- 본인 정지 셀프 해제 금지(2026-07-14) — assert_admin 의 정지 차단과 함께 이중 방어
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION '본인 정지는 다른 관리자가 해제해야 합니다';
  END IF;
  UPDATE public.profiles
  SET is_suspended = false, suspended_reason = NULL, suspended_at = NULL, updated_at = now()
  WHERE id = p_user_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'unsuspend_user', 'user', p_user_id::TEXT, '{}'::jsonb);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⑨ [🟡 안전] admin_unhide_video — 복원 시 moderation_status 정합
--   기존: rejected/pending 인 채 is_hidden 만 해제 → "거부인데 공개" 모순 +
--   pending 이면 웹훅/폴백 apply_moderation_result 가 도로 숨김(관리자 결정 뒤집힘).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_unhide_video(p_video_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.videos
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL,
      moderation_status = CASE WHEN moderation_status IN ('pending','flagged','rejected')
                               THEN 'passed' ELSE moderation_status END,
      moderation_checked_at = CASE WHEN moderation_status IN ('pending','flagged','rejected')
                                   THEN now() ELSE moderation_checked_at END
  WHERE id = p_video_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'unhide_video', 'video', p_video_id,
          jsonb_build_object('moderation_normalized', true));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⑩ [🟡 안전] 새 영상 벨 — 재공개(관리자 복원 등) 시 중복 재발송 방지
--   기존: 숨김→공개 전환마다 팔로워 전원 재발송(발송 이력 dedup 없음).
--   이미 이 영상으로 벨이 나간 적 있으면 UPDATE 전환에선 재발송하지 않음.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_link ON public.notifications(link);

CREATE OR REPLACE FUNCTION public.tg_notify_followers_new_video()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_name TEXT;
BEGIN
  IF NEW.creator_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.visibility, 'public') <> 'public' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_hidden, false) THEN RETURN NEW; END IF;

  -- 신규 "공개 전환" 시점에만 1회: 이미 공개였던 상태에서의 UPDATE 엔 재발송 금지.
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.is_hidden, false) = false
     AND COALESCE(OLD.visibility, 'public') = 'public' THEN
    RETURN NEW;
  END IF;

  -- 재공개 dedup(2026-07-14): 신고 자동숨김→관리자 복원 같은 재전환에서 팔로워 전원
  --   중복 벨 방지 — 이 영상으로 이미 새영상 벨이 나간 적 있으면 skip(INSERT 첫 공개는 통과).
  IF TG_OP = 'UPDATE' AND EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.link = '/?video=' || NEW.id::text
      AND n.title LIKE '%님의 새 영상%'
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(display_name, ''), '크리에이터') INTO v_name
  FROM public.profiles WHERE id = NEW.creator_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT cf.follower_id, 'system',
         COALESCE(v_name, '크리에이터') || '님의 새 영상 🎬',
         left(COALESCE(NEW.title, '새 영상'), 60),
         '/?video=' || NEW.id::text
  FROM public.creator_followers cf
  LEFT JOIN public.notification_preferences np ON np.user_id = cf.follower_id
  WHERE cf.creator_id = NEW.creator_id
    AND cf.follower_id <> NEW.creator_id
    AND COALESCE(np.inapp_new_video_from_followed, true) = true;

  RETURN NEW;
END; $fn$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ⑪ [🟡 안전] admin_reply_support_inquiry — admin_logs 기록 추가
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reply_support_inquiry(p_id uuid, p_reply text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid; v_subject text; v_reply text;
BEGIN
  PERFORM public.assert_admin();
  v_reply := btrim(COALESCE(p_reply, ''));
  IF v_reply = '' THEN RAISE EXCEPTION 'empty reply'; END IF;

  UPDATE public.support_inquiries
    SET admin_reply = v_reply, status = 'answered',
        replied_at = now(), replied_by = auth.uid(), updated_at = now()
    WHERE id = p_id
    RETURNING user_id, subject INTO v_user, v_subject;
  IF v_user IS NULL THEN RAISE EXCEPTION 'inquiry not found'; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_user, 'system', '문의에 답변이 등록되었어요',
          '「' || COALESCE(v_subject, '문의') || '」 답변을 확인해 보세요.',
          '/?support=' || p_id::text);

  -- 감사로그(2026-07-14) — 답변도 관리자 변경 액션
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'reply_support_inquiry', 'support_inquiry', p_id::TEXT,
          jsonb_build_object('subject', v_subject));
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_reply_support_inquiry(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- ① paid 동결: paid 행 하나 있는 월을 재계산해도 total_revenue 불변이어야
--   --    (관리자 세션) SELECT * FROM public.calculate_monthly_revenue(2026, 6);
--   -- ⑤ 정산 raw 부풀리기 차단: 같은 IP 로 track_video_ad_event 2회 → ad_video_events 1행
--   -- ⑥ SELECT * FROM public.pick_random_video_preroll();  -- 9개 안전 컬럼만
--   -- ⑦ SELECT * FROM public.admin_list_pending_payouts();
--   -- ⑧ 정지 관리자 계정으로 아무 admin RPC → '정지된 계정입니다'
--   -- ⑩ 숨김→복원 2회 반복해도 팔로워 벨 1회만
-- ════════════════════════════════════════════════════════════════════════════
