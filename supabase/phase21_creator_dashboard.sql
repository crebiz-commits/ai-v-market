-- ════════════════════════════════════════════════════════════════════════════
-- Phase 21 — 크리에이터 수익 대시보드 (일별 그래프 + 좋아요 통계)
-- 적용 일자: 2026-05-16
-- 선행: orders, video_views, video_likes, revenue_distributions, videos, profiles
--
-- 목적:
--   1. 크리에이터가 자기 채널 KPI를 한눈에 (총 수익/조회수/좋아요/RPM)
--   2. 일별 수익/조회수/좋아요 추세 차트 (7/14/30일)
--   3. 다음 정산 안내 (대기 금액 + 정산 예정일)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: 대시보드 요약 RPC (KPI 4개 + 정산 안내)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_dashboard_summary()
RETURNS TABLE (
  total_revenue        BIGINT,    -- 누적 sale 수익 (refunded 제외)
  total_views          BIGINT,    -- 누적 유효 시청수
  total_likes          BIGINT,    -- 누적 받은 좋아요
  rpm                  NUMERIC,   -- 최근 30일 RPM = (수익 / 시청수) × 1000
  pending_payout       BIGINT,    -- 이번달 누적 매출 + revenue_distributions pending 합계
  next_settlement_date DATE       -- 다음달 1일
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_total_rev   BIGINT := 0;
  v_total_views BIGINT := 0;
  v_total_likes BIGINT := 0;
  v_rpm         NUMERIC := 0;
  v_pending     BIGINT := 0;
  v_recent_rev  BIGINT := 0;
  v_recent_views BIGINT := 0;
  v_month_start DATE := date_trunc('month', now())::DATE;
  v_next_month  DATE := (date_trunc('month', now()) + INTERVAL '1 month')::DATE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- 누적 수익 (orders 기준, refunded 제외)
  SELECT COALESCE(SUM(amount), 0) INTO v_total_rev
  FROM public.orders
  WHERE seller_id = v_uid AND status = 'completed';

  -- 누적 유효 시청수
  SELECT COUNT(*) INTO v_total_views
  FROM public.video_views
  WHERE creator_id = v_uid AND is_valid = true;

  -- 누적 받은 좋아요
  SELECT COUNT(*) INTO v_total_likes
  FROM public.video_likes vl
  INNER JOIN public.videos v ON v.id = vl.video_id
  WHERE v.creator_id = v_uid;

  -- 최근 30일 RPM
  SELECT COALESCE(SUM(amount), 0) INTO v_recent_rev
  FROM public.orders
  WHERE seller_id = v_uid AND status = 'completed'
    AND created_at >= now() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_recent_views
  FROM public.video_views
  WHERE creator_id = v_uid AND is_valid = true
    AND occurred_at >= now() - INTERVAL '30 days';

  IF v_recent_views > 0 THEN
    v_rpm := ROUND((v_recent_rev::NUMERIC / v_recent_views) * 1000, 2);
  END IF;

  -- 대기 정산액: 이번달 매출 + 과거 pending revenue_distributions
  SELECT COALESCE(SUM(amount), 0) INTO v_pending
  FROM public.orders
  WHERE seller_id = v_uid AND status = 'completed'
    AND created_at >= v_month_start;

  -- rd 별칭으로 컬럼 명확화: total_revenue 가 RETURNS TABLE 출력컬럼명과 겹쳐
  -- "column reference total_revenue is ambiguous" 에러로 함수 전체가 실패하던 버그 수정.
  v_pending := v_pending + COALESCE(
    (SELECT SUM(rd.total_revenue)
     FROM public.revenue_distributions rd
     WHERE rd.creator_id = v_uid AND rd.payout_status = 'pending'), 0
  );

  RETURN QUERY SELECT v_total_rev, v_total_views, v_total_likes, v_rpm, v_pending, v_next_month;
END;
$$;

COMMENT ON FUNCTION public.get_creator_dashboard_summary IS
  '크리에이터 본인 KPI 4종 + 대기 정산액 + 다음 정산 예정일';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 일별 수익 그래프 RPC (생성된 모든 날짜 포함, 0인 날도)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_daily_revenue(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  day      DATE,
  revenue  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - (GREATEST(p_days, 1) - 1) * INTERVAL '1 day')::DATE,
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE AS day
  ),
  daily AS (
    SELECT (created_at AT TIME ZONE 'Asia/Seoul')::DATE AS day,
           COALESCE(SUM(amount), 0)::BIGINT AS revenue
    FROM public.orders
    WHERE seller_id = auth.uid()
      AND status = 'completed'
      AND created_at >= CURRENT_DATE - (GREATEST(p_days, 1) - 1) * INTERVAL '1 day'
    GROUP BY 1
  )
  SELECT d.day, COALESCE(daily.revenue, 0) AS revenue
  FROM days d
  LEFT JOIN daily ON daily.day = d.day
  ORDER BY d.day;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 일별 조회수 + 좋아요 콤보 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_daily_engagement(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  day    DATE,
  views  BIGINT,
  likes  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  WITH days AS (
    SELECT generate_series(
      (CURRENT_DATE - (GREATEST(p_days, 1) - 1) * INTERVAL '1 day')::DATE,
      CURRENT_DATE,
      '1 day'::INTERVAL
    )::DATE AS day
  ),
  daily_views AS (
    SELECT (occurred_at AT TIME ZONE 'Asia/Seoul')::DATE AS day,
           COUNT(*)::BIGINT AS views
    FROM public.video_views
    WHERE creator_id = auth.uid()
      AND is_valid = true
      AND occurred_at >= CURRENT_DATE - (GREATEST(p_days, 1) - 1) * INTERVAL '1 day'
    GROUP BY 1
  ),
  daily_likes AS (
    SELECT (vl.created_at AT TIME ZONE 'Asia/Seoul')::DATE AS day,
           COUNT(*)::BIGINT AS likes
    FROM public.video_likes vl
    INNER JOIN public.videos v ON v.id = vl.video_id
    WHERE v.creator_id = auth.uid()
      AND vl.created_at >= CURRENT_DATE - (GREATEST(p_days, 1) - 1) * INTERVAL '1 day'
    GROUP BY 1
  )
  SELECT
    d.day,
    COALESCE(dv.views, 0) AS views,
    COALESCE(dl.likes, 0) AS likes
  FROM days d
  LEFT JOIN daily_views dv ON dv.day = d.day
  LEFT JOIN daily_likes dl ON dl.day = d.day
  ORDER BY d.day;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. KPI 요약
--   SELECT * FROM public.get_creator_dashboard_summary();
--
--   -- 2. 최근 30일 일별 수익
--   SELECT * FROM public.get_creator_daily_revenue(30);
--
--   -- 3. 최근 7일 조회수+좋아요
--   SELECT * FROM public.get_creator_daily_engagement(7);
-- ════════════════════════════════════════════════════════════════════════════
