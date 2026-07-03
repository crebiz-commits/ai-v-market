-- ════════════════════════════════════════════════════════════════════════════
-- M1 (2026-07-03): 구독 풀을 "실제 수납된 구독 결제액" 기준으로 산정
--
--   문제: calculate_monthly_revenue 의 구독 풀 = (현재 premium 수 × 현재 구독가) 추정.
--         - 월중 환불자를 과다/과소 반영, 과거 가격변동·부분월 무시
--         - 실제 수납액과 괴리 → 풀 오차가 그대로 크리에이터 분배에 반영
--         - 경계 off-by-one(M2): 구독자 수 필터가 `<= v_period_end_ts`(다음달 0시 포함)
--
--   해결: 풀 = SUM(payments.amount) WHERE payment_type='subscription' AND status='completed'
--         AND approved_at ∈ [월초, 다음달0시). 최초결제+자동결제(billing) 모두 포함,
--         환불(status='refunded')은 자동 제외 → 자기교정. 경계도 `<` 로 통일.
--
--   ※ calculate_monthly_revenue 전체 재정의(fixes_audit_20260611.sql 정본 + 풀 블록 교체).
--     그 외 로직(R6 이월/R7 승격/UPSERT paid 보존/광고·판매 CTE)은 동일 유지.
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════
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
  v_period_start_ts TIMESTAMPTZ := v_period_start::TIMESTAMPTZ;
  v_period_end_ts   TIMESTAMPTZ := (v_period_end + INTERVAL '1 day')::TIMESTAMPTZ;  -- exclusive

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
  --   payments(subscription/completed) 합계 = 최초+자동결제 포함, 환불 자동 제외.
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
    -- 판매 활동
    SELECT seller_id::UUID AS cid FROM public.orders
    WHERE status = 'completed' AND seller_id IS NOT NULL
      AND created_at >= v_period_start_ts AND created_at < v_period_end_ts
    UNION
    -- OTT 시청 활동
    SELECT v.creator_id FROM public.video_views vv
    JOIN public.videos v ON v.id = vv.video_id
    WHERE vv.is_valid = true AND v.creator_id IS NOT NULL
      AND vv.occurred_at >= v_period_start_ts AND vv.occurred_at < v_period_end_ts
    UNION
    -- 광고 노출 활동
    SELECT v.creator_id FROM public.ad_video_events e
    JOIN public.videos v ON v.id = e.source_video_id
    WHERE e.event_type = 'impression' AND v.creator_id IS NOT NULL
      AND e.occurred_at >= v_period_start_ts AND e.occurred_at < v_period_end_ts
      AND e.occurred_at >= COALESCE(v.ad_eligibility_at, '1900-01-01'::TIMESTAMPTZ)
  ),
  sales AS (
    SELECT seller_id::UUID AS cid, COALESCE(SUM(amount), 0) AS gross
    FROM public.orders
    WHERE status = 'completed' AND seller_id IS NOT NULL
      AND created_at >= v_period_start_ts AND created_at < v_period_end_ts
    GROUP BY seller_id
  ),
  ad_impressions AS (
    -- 영상의 최고 tier에 따라 노출수 분류 (OTT > 시네마 > 홈)
    SELECT
      v.creator_id AS cid,
      COUNT(*) FILTER (WHERE v.show_on_ott)                                      AS ott_imp,
      COUNT(*) FILTER (WHERE v.show_on_cinema AND NOT v.show_on_ott)             AS cinema_imp,
      COUNT(*) FILTER (WHERE NOT v.show_on_cinema AND NOT v.show_on_ott)         AS home_imp
    FROM public.ad_video_events e
    JOIN public.videos v ON v.id = e.source_video_id
    WHERE e.event_type = 'impression' AND v.creator_id IS NOT NULL
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
  -- R7: 과거 미지급(deferred) 누계 — 허들 판정에 합산
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
        -- R7: 이월 누계 포함해 허들 판정
        WHEN c.sale_rev + c.ad_rev + c.sub_rev + c.carry >= v_payout_min THEN 'pending'
        ELSE 'deferred'
      END
    FROM calc c
    WHERE c.sale_rev + c.ad_rev + c.sub_rev > 0
    ON CONFLICT (creator_id, period_start) DO UPDATE SET
      sale_revenue         = EXCLUDED.sale_revenue,
      ad_revenue           = EXCLUDED.ad_revenue,
      subscription_revenue = EXCLUDED.subscription_revenue,
      total_revenue        = EXCLUDED.total_revenue,
      applied_rates        = EXCLUDED.applied_rates,
      payout_status        = CASE
        WHEN rd.payout_status = 'paid' THEN 'paid'  -- 이미 지급된 건 보존
        ELSE EXCLUDED.payout_status
      END,
      updated_at = now()
    RETURNING rd.creator_id, rd.sale_revenue, rd.ad_revenue,
              rd.subscription_revenue, rd.total_revenue, rd.payout_status
  )
  SELECT u.creator_id, u.sale_revenue, u.ad_revenue,
         u.subscription_revenue, u.total_revenue, u.payout_status
  FROM upsert u;

  -- R7: 이번 달이 pending 으로 확정된 크리에이터의 과거 deferred 행도 pending 승격
  --     (어드민 정산 화면에서 과거 미지급분까지 한 번에 지급 처리 가능)
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
  '월별 정산 실행 (어드민 전용). 판매+광고+구독료 풀 분배 → revenue_distributions UPSERT. 구독 풀은 실제 수납 결제액(payments) 기준(M1 2026-07-03). 최소정산 미달분 deferred 이월, 누계 도달 시 일괄 pending 승격';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT * FROM public.calculate_monthly_revenue(2026, 6);  -- (관리자 세션)
--   -- applied_rates 확인: 풀 근거가 실수납액인지
--   SELECT applied_rates->>'subscription_pool_basis',
--          applied_rates->>'subscription_total_collected'
--   FROM public.revenue_distributions ORDER BY updated_at DESC LIMIT 1;
-- ════════════════════════════════════════════════════════════════════════════
