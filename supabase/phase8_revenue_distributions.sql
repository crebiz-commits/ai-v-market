-- ════════════════════════════════════════════════════════════════════════════
-- Phase 8 — Step 3: 월별 수익 정산 (revenue_distributions + 정산 RPC)
-- 적용 일자: 2026-05-12
-- 선행: phase8_platform_settings.sql, phase8_video_views.sql
--
-- 목적:
--   - 월말 정산: 판매 + 광고 + 구독료 풀(pro-rata) → 크리에이터별 분배액 산출
--   - 정산 시점의 비율을 applied_rates JSONB에 스냅샷 (분쟁 방지)
--   - 정산 자격: ₩payout_minimum_krw 미달 시 'deferred' (다음 달 이월)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: revenue_distributions 테이블
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.revenue_distributions (
  id                    BIGSERIAL PRIMARY KEY,
  creator_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start          DATE NOT NULL,                       -- 정산월 1일
  period_end            DATE NOT NULL,                       -- 정산월 말일
  sale_revenue          INTEGER NOT NULL DEFAULT 0,
  ad_revenue            INTEGER NOT NULL DEFAULT 0,
  subscription_revenue  INTEGER NOT NULL DEFAULT 0,
  total_revenue         INTEGER NOT NULL DEFAULT 0,
  applied_rates         JSONB NOT NULL,                      -- 적용 비율 스냅샷
  payout_status         TEXT NOT NULL DEFAULT 'pending',     -- pending / paid / deferred
  paid_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT revenue_distributions_status_check
    CHECK (payout_status IN ('pending', 'paid', 'deferred')),
  CONSTRAINT revenue_distributions_amounts_check
    CHECK (sale_revenue >= 0 AND ad_revenue >= 0 AND subscription_revenue >= 0 AND total_revenue >= 0),
  UNIQUE (creator_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_rev_dist_creator_period
  ON public.revenue_distributions(creator_id, period_start DESC);

CREATE INDEX IF NOT EXISTS idx_rev_dist_period_status
  ON public.revenue_distributions(period_start DESC, payout_status);

COMMENT ON TABLE public.revenue_distributions IS
  '월별 크리에이터 수익 정산 결과. applied_rates에 정산 시점 비율 스냅샷';
COMMENT ON COLUMN public.revenue_distributions.applied_rates IS
  '정산 시점에 적용된 platform_settings 스냅샷 (분쟁 방지)';
COMMENT ON COLUMN public.revenue_distributions.payout_status IS
  'pending: 지급 대기 / paid: 지급 완료 / deferred: 최소액 미달 다음 달 이월';

-- updated_at 자동 갱신
DROP TRIGGER IF EXISTS rev_dist_set_updated_at ON public.revenue_distributions;
CREATE TRIGGER rev_dist_set_updated_at
  BEFORE UPDATE ON public.revenue_distributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 월별 정산 실행 RPC (어드민 전용)
--
-- 입력: 정산 대상 연/월 (예: 2026, 6)
-- 동작:
--   1. 현재 platform_settings 스냅샷
--   2. 활동 있는 크리에이터별로
--      - 판매 수익 = sum(orders.amount) × creator_share_sale
--      - 광고 수익 = sum((노출수 / 1000) × CPM × tier_share)
--                  (영상 분류 최고 tier 적용: OTT > 시네마 > 홈)
--                  (ad_eligibility_at 이후 노출만 카운트 — 신규 영상 48h 제외)
--      - 구독료 분배 = (내 OTT 유효 시청시간 / 전체 OTT 유효 시청시간) × 크리에이터 풀
--                    크리에이터 풀 = 구독자수 × 구독료 × creator_share_subscription_pool
--   3. 정산 자격 판정: total ≥ payout_minimum_krw → 'pending', 아니면 'deferred'
--   4. revenue_distributions에 UPSERT (재실행 시 갱신, 단 paid는 보존)
--
-- 재실행 안전:
--   같은 월을 여러 번 실행해도 멱등. 단 payout_status='paid' 행은 덮어쓰지 않음.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_monthly_revenue(
  p_year INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  creator_id          UUID,
  sale_revenue        INTEGER,
  ad_revenue          INTEGER,
  subscription_revenue INTEGER,
  total_revenue       INTEGER,
  payout_status       TEXT
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
  -- [정책 R5, 2026-06-14 확정] 구독풀은 OTT(show_on_ott=true) 시청시간에만 비례 분배.
  --   → 시네마 전용(OTT 미노출) 크리에이터의 구독풀 분배는 0원 (의도된 설계).
  --   근거: 구독풀 = 구독형 OTT 스트리밍 수익 배분. 시네마 콘텐츠는 라이선스 판매·광고로
  --        별도 수익화하므로 OTT 구독풀 대상이 아님. 분모·분자 모두 show_on_ott=true 로 일치.
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
      END AS sub_rev
    FROM activity a
    LEFT JOIN sales s        ON s.cid  = a.cid
    LEFT JOIN ad_impressions ai ON ai.cid = a.cid
    LEFT JOIN ott_watch ow   ON ow.cid = a.cid
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
        WHEN c.sale_rev + c.ad_rev + c.sub_rev >= v_payout_min THEN 'pending'
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
END;
$$;

COMMENT ON FUNCTION public.calculate_monthly_revenue IS
  '월별 정산 실행 (어드민 전용). 판매+광고+구독료 풀 분배 → revenue_distributions UPSERT';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 정산 지급 처리 RPC (어드민) — 'pending' → 'paid' 전환
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_revenue_paid(
  p_distribution_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id  UUID := auth.uid();
  v_is_admin  BOOLEAN;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;

  UPDATE public.revenue_distributions
  SET payout_status = 'paid', paid_at = now()
  WHERE id = p_distribution_id AND payout_status = 'pending';
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 크리에이터 정산 내역 조회 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_revenue_history(
  p_creator_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  id                   BIGINT,
  period_start         DATE,
  period_end           DATE,
  sale_revenue         INTEGER,
  ad_revenue           INTEGER,
  subscription_revenue INTEGER,
  total_revenue        INTEGER,
  payout_status        TEXT,
  paid_at              TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    id, period_start, period_end,
    sale_revenue, ad_revenue, subscription_revenue, total_revenue,
    payout_status, paid_at
  FROM public.revenue_distributions
  WHERE creator_id = auth.uid()   -- H3(2026-05-31): IDOR 차단 — p_creator_id 무시, 항상 본인
  ORDER BY period_start DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: 어드민 — 월별 정산 요약 조회 RPC
-- ────────────────────────────────────────────────────────────────────────────
-- 반환 컬럼 추가(payout 계좌)로 DROP 후 재생성
DROP FUNCTION IF EXISTS public.get_revenue_distributions_by_period(INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.get_revenue_distributions_by_period(
  p_year INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  id                   BIGINT,
  creator_id           UUID,
  creator_name         TEXT,
  sale_revenue         INTEGER,
  ad_revenue           INTEGER,
  subscription_revenue INTEGER,
  total_revenue        INTEGER,
  payout_status        TEXT,
  paid_at              TIMESTAMPTZ,
  tax_withholding      INTEGER,
  net_amount           INTEGER,
  tax_type_snapshot    TEXT,
  payout_bank          TEXT,
  payout_account       TEXT,
  payout_holder        TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    rd.id, rd.creator_id, p.display_name,
    rd.sale_revenue, rd.ad_revenue, rd.subscription_revenue, rd.total_revenue,
    rd.payout_status, rd.paid_at,
    rd.tax_withholding, rd.net_amount, rd.tax_type_snapshot,
    p.payout_info->>'bank_name'      AS payout_bank,
    p.payout_info->>'account_number' AS payout_account,
    p.payout_info->>'account_holder' AS payout_holder
  FROM public.revenue_distributions rd
  LEFT JOIN public.profiles p ON p.id = rd.creator_id
  WHERE rd.period_start = make_date(p_year, p_month, 1)
  ORDER BY rd.total_revenue DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: RLS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.revenue_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rev_dist_select_own" ON public.revenue_distributions;
CREATE POLICY "rev_dist_select_own"
  ON public.revenue_distributions FOR SELECT
  USING (
    auth.uid() = creator_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- INSERT/UPDATE는 SECURITY DEFINER RPC만 사용

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 (어드민 계정에서):
--   -- 2026년 6월 정산 실행 (해당 월이 끝난 시점에)
--   SELECT * FROM public.calculate_monthly_revenue(2026, 6);
--
--   -- 정산 결과 보기
--   SELECT * FROM public.get_revenue_distributions_by_period(2026, 6);
--
--   -- 본인 정산 내역
--   SELECT * FROM public.get_my_revenue_history();
--
--   -- 지급 처리
--   SELECT public.mark_revenue_paid(1);  -- 1 = 정산 행 id
--
--   -- applied_rates 확인 (분쟁 대비)
--   SELECT period_start, applied_rates FROM public.revenue_distributions LIMIT 5;
-- ════════════════════════════════════════════════════════════════════════════
