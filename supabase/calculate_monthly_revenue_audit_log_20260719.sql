-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 월 정산 계산 감사 로그 (2026-07-19) — calculate_monthly_revenue → admin_logs
--
--   [결함 F4] 활동 로그 감사에서 확인: 이 함수는 revenue_distributions(크리에이터 지급
--     원장)를 생성·ON CONFLICT 덮어쓰기 하는 최고 민감 금전 연산인데 admin_logs 에
--     아무 기록도 남기지 않았다. 지급(mark_revenue_paid=revenue_payout)은 기록되는데
--     "금액을 정하는 계산 단계"가 무기록이라 감사 체인에 구멍이 있었다.
--   [수정] 본문은 라이브와 동일한 정본(calculate_monthly_revenue_assert_admin_20260718)에
--     감사 로깅만 추가. action='calculate_revenue', 기간·크리에이터수·정책스냅샷 기록.
--
--   ★ 라이브 동일성 확증 후 작성 (저장소 본문으로 맹목 덮어쓰기 아님):
--     _diag_calculate_monthly_revenue_20260719.sql 실행 결과 —
--       has_assert_admin=true, overloads=1, security_definer=true, search_path=true
--       줄바꿈 제거 MD5 3542dccc15ae0b39c55f8fed43520740 = 저장소와 완전 일치
--       코드포인트 9236 = 라이브와 일치 (길이 209자 차이는 CRLF, 1자 차이는 본문 이모지 🔒
--       를 JS 는 UTF-16 2자, Postgres 는 1자로 세기 때문 — 내용은 바이트 동일)
--     → 되돌림 위험 0. 이 파일이 새 정본. 0718 판 재실행 금지(로깅이 사라짐).
--
--   본문은 원본에서 스크립트로 생성(수기 전사 오류 원천 차단). 적용: SQL Editor → Run. 멱등.
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
  v_log_rows            INTEGER;   -- 감사 로그용: 이 기간 정산 대상 크리에이터 수
BEGIN
  PERFORM public.assert_admin();   -- 로그인+관리자+정지관리자 차단(0714 assert_admin ⑧)

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
  -- ── 감사(2026-07-19): 정산 계산 실행을 admin_logs 에 기록 ──
  --   크리에이터 지급 원장을 생성·덮어쓰면서도 아무 기록을 안 남겨
  --   "누가·언제·어느 기간을 (재)계산했는지" 추적 불가였던 결함 보완(활동로그 감사 F4).
  SELECT count(*) INTO v_log_rows
  FROM public.revenue_distributions rd
  WHERE rd.period_start = v_period_start;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'calculate_revenue', 'revenue_period',
          to_char(v_period_start, 'YYYY-MM'),
          jsonb_build_object(
            'year', p_year,
            'month', p_month,
            'period_start', v_period_start,
            'period_end', v_period_end,
            'creators', v_log_rows,
            'subscribers', v_total_subscribers,
            'subscription_total', v_subscription_total,
            'creator_pool', v_creator_pool,
            'applied_rates', v_applied_rates
          ));
END;
$$;

-- ── 검증 (선택) ──
SELECT 'calculate_monthly_revenue admin_logs 기록' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'admin_logs' AND prosrc ~ 'calculate_revenue'
             FROM pg_proc WHERE proname='calculate_monthly_revenue')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'calculate_monthly_revenue assert_admin 유지',
  CASE WHEN (SELECT prosrc ~ 'assert_admin' FROM pg_proc WHERE proname='calculate_monthly_revenue')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
