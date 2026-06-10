-- ════════════════════════════════════════════════════════════════════════════
-- 2026-06-11 전체 감사 후속 수정 (docs/full-audit-2026-06-11.md)
--   R6  환불이 확정된 정산과 겹치면 어드민에게 경고 반환 (재정산 필요 안내)
--   R10 레거시 주문(payment_id NULL) 환불 시 orders 상태 미반영 수정
--   R7  최소정산(₩10,000) 미달 'deferred' 이월 누계 합산 — 누계 도달 시 일괄 pending 승격
--   R8  커뮤니티 글 삭제 시 댓글 함께 삭제 (고아 댓글 방지, 5/31 H11)
--
-- 선행: phase_user_payment_history.sql, phase8_revenue_distributions.sql,
--       phase10_6_admin_management.sql(assert_admin), community_upgrade_20260610.sql
-- 적용 방법: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 전체 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- R6 + R10: admin_refund_payment 재정의
--   - 반환 타입 VOID → TEXT (정산 경고 메시지, 없으면 NULL) 라서 DROP 후 재생성
--   - 라이선스 주문 매칭에 payment_id IS NULL 허용 (2026-05-27 이전 레거시 주문)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.admin_refund_payment(BIGINT, TEXT);

CREATE FUNCTION public.admin_refund_payment(
  p_payment_id BIGINT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.admin_refund_payment IS
  '관리자 환불 처리: payments.status=refunded + 권한 회수. 확정 정산과 겹치면 경고 TEXT 반환 (없으면 NULL)';

-- ────────────────────────────────────────────────────────────────────────────
-- R7: calculate_monthly_revenue — deferred 이월 누계 합산
--   허들 판정: (이번 달 수익 + 과거 deferred 누계) >= 최소정산액
--   이번 달이 pending 으로 확정되면 과거 deferred 행도 pending 으로 승격해
--   어드민이 한 번에 지급 처리할 수 있게 함.
--   (기존 공식·분배율·OTT 기준은 변경 없음 — 2026-06-11 정책 확인: 구독풀 분배는 OTT 전용 유지)
-- ────────────────────────────────────────────────────────────────────────────
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

  -- 적용 비율 스냅샷
  v_applied_rates := jsonb_build_object(
    'creator_share_sale',              v_share_sale,
    'creator_share_ad_home',           v_share_ad_home,
    'creator_share_ad_cinema',         v_share_ad_cinema,
    'creator_share_ad_ott',            v_share_ad_ott,
    'creator_share_subscription_pool', v_share_sub_pool,
    'subscription_price_krw',          v_sub_price,
    'ad_cpm_krw',                      v_cpm,
    'payout_minimum_krw',              v_payout_min,
    'calculated_at',                   now()
  );

  -- 활성 구독자 수 (정산월에 한 번이라도 premium이었던 사용자)
  SELECT COUNT(*) INTO v_total_subscribers
  FROM public.profiles
  WHERE subscription_tier = 'premium'
    AND COALESCE(subscription_started_at, created_at) <= v_period_end_ts
    AND (subscription_expires_at IS NULL OR subscription_expires_at >= v_period_start_ts);

  v_subscription_total := v_total_subscribers * v_sub_price;
  v_creator_pool := v_subscription_total * v_share_sub_pool;

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
  '월별 정산 실행 (어드민 전용). 판매+광고+구독료 풀 분배 → revenue_distributions UPSERT. 최소정산 미달분은 deferred 이월, 누계 도달 시 일괄 pending 승격';

-- ────────────────────────────────────────────────────────────────────────────
-- R8: 커뮤니티 글 삭제 RPC — 댓글까지 함께 삭제 (고아 댓글 방지)
--     comments.post_id 는 text 라 FK CASCADE 불가 → SECURITY DEFINER 로 일괄 삭제
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_community_post(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.community_posts
    WHERE id = p_post_id AND (user_id = auth.uid() OR public.is_admin())
  ) THEN
    RAISE EXCEPTION '본인 글만 삭제할 수 있습니다';
  END IF;

  -- 댓글(대댓글 포함) → 글 순서로 삭제 (post_likes/post_bookmarks 는 FK CASCADE)
  DELETE FROM public.comments WHERE post_id = p_post_id::TEXT;
  DELETE FROM public.community_posts WHERE id = p_post_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_community_post(UUID) TO authenticated;

COMMENT ON FUNCTION public.delete_community_post IS
  '커뮤니티 글 삭제 (본인 또는 어드민). 댓글까지 함께 삭제해 고아 댓글 방지 (5/31 H11)';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   SELECT pg_get_function_result('public.admin_refund_payment(bigint,text)'::regprocedure);  -- text
--   SELECT proname FROM pg_proc WHERE proname = 'delete_community_post';                       -- 1행
-- ════════════════════════════════════════════════════════════════════════════
