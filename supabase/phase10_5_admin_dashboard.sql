-- ════════════════════════════════════════════════════════════════════════════
-- Phase 10.5 — 어드민 통계 대시보드 RPC 함수들
-- 적용 일자: 2026-05-13
-- 선행: profiles, videos, video_views, orders, payments, ads, reports
--
-- 목적:
--   어드민이 한 화면에서 플랫폼 전체 현황을 파악할 수 있도록 집계 RPC 제공.
--   YouTube Studio / TikTok Analytics 어드민 대시보드 표준 지표.
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: 메인 대시보드 — 한눈에 보기 (Summary 카드용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_summary()
RETURNS TABLE (
  -- 사용자 통계
  total_users            BIGINT,
  premium_users          BIGINT,
  new_users_today        BIGINT,
  new_users_this_month   BIGINT,

  -- 콘텐츠 통계
  total_videos           BIGINT,
  hidden_videos          BIGINT,
  videos_uploaded_today  BIGINT,

  -- 매출 (이번 달)
  revenue_this_month     BIGINT,  -- 구독+판매+광고 합계
  subscription_revenue   BIGINT,
  license_revenue        BIGINT,
  ad_budget_revenue      BIGINT,

  -- 운영 통계
  pending_reports        BIGINT,
  suspended_users        BIGINT,

  -- 시청 통계 (24h)
  views_24h              BIGINT,
  valid_views_24h        BIGINT,
  total_watch_seconds_24h BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH
  -- 사용자
  user_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE subscription_tier = 'premium') AS premium,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS new_today,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS new_month
    FROM public.profiles
  ),
  -- 영상
  video_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_hidden = true) AS hidden,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS uploaded_today
    FROM public.videos
  ),
  -- 매출 (이번 달 — completed 결제만)
  rev AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE payment_type = 'subscription'), 0) AS subscription,
      COALESCE(SUM(amount) FILTER (WHERE payment_type = 'license'), 0) AS license,
      COALESCE(SUM(amount) FILTER (WHERE payment_type = 'ad_budget'), 0) AS ad_budget,
      COALESCE(SUM(amount), 0) AS total
    FROM public.payments
    WHERE status = 'completed'
      AND created_at >= date_trunc('month', CURRENT_DATE)
  ),
  -- 신고
  reports_stats AS (
    SELECT COUNT(*) AS pending
    FROM public.reports
    WHERE status = 'pending'
  ),
  -- 정지 계정
  suspended AS (
    SELECT COUNT(*) AS total FROM public.profiles WHERE is_suspended = true
  ),
  -- 시청 (24h)
  views AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_valid) AS valid,
      COALESCE(SUM(watch_seconds) FILTER (WHERE is_valid), 0) AS watch_sec
    FROM public.video_views
    WHERE occurred_at >= now() - INTERVAL '24 hours'
  )
  SELECT
    u.total, u.premium, u.new_today, u.new_month,
    v.total, v.hidden, v.uploaded_today,
    rev.total::BIGINT, rev.subscription::BIGINT, rev.license::BIGINT, rev.ad_budget::BIGINT,
    r.pending, s.total,
    vw.total, vw.valid, vw.watch_sec::BIGINT
  FROM user_stats u, video_stats v, rev, reports_stats r, suspended s, views vw;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard_summary IS
  '어드민 대시보드 메인 카드용 한 줄 요약 통계 (사용자/영상/매출/신고/시청)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 일별 매출 추이 (그래프용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_daily_revenue(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  day              DATE,
  subscription     BIGINT,
  license          BIGINT,
  ad_budget        BIGINT,
  total            BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH date_series AS (
    SELECT generate_series(
      (CURRENT_DATE - (p_days - 1) * INTERVAL '1 day')::DATE,
      CURRENT_DATE,
      INTERVAL '1 day'
    )::DATE AS day
  )
  SELECT
    ds.day,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'subscription'), 0)::BIGINT AS subscription,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'license'), 0)::BIGINT AS license,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'ad_budget'), 0)::BIGINT AS ad_budget,
    COALESCE(SUM(p.amount), 0)::BIGINT AS total
  FROM date_series ds
  LEFT JOIN public.payments p
    ON p.created_at::DATE = ds.day
    AND p.status = 'completed'
  GROUP BY ds.day
  ORDER BY ds.day;
$$;

COMMENT ON FUNCTION public.get_daily_revenue IS
  '최근 N일 일별 매출 추이 (구독/라이선스/광고예산 분리). 누락된 날짜는 0으로 채움';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 일별 신규 가입자 추이
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_daily_user_growth(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  day            DATE,
  new_users      BIGINT,
  cumulative     BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH
  date_series AS (
    SELECT generate_series(
      (CURRENT_DATE - (p_days - 1) * INTERVAL '1 day')::DATE,
      CURRENT_DATE,
      INTERVAL '1 day'
    )::DATE AS day
  ),
  daily AS (
    SELECT
      ds.day,
      COUNT(p.id)::BIGINT AS new_users
    FROM date_series ds
    LEFT JOIN public.profiles p ON p.created_at::DATE = ds.day
    GROUP BY ds.day
  )
  SELECT
    day,
    new_users,
    SUM(new_users) OVER (ORDER BY day)::BIGINT AS cumulative
  FROM daily
  ORDER BY day;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 일별 시청 통계
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_daily_views(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  day             DATE,
  total_views     BIGINT,
  valid_views     BIGINT,
  watch_hours     NUMERIC      -- 시청 시간 (시간 단위)
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  WITH date_series AS (
    SELECT generate_series(
      (CURRENT_DATE - (p_days - 1) * INTERVAL '1 day')::DATE,
      CURRENT_DATE,
      INTERVAL '1 day'
    )::DATE AS day
  )
  SELECT
    ds.day,
    COUNT(vv.id)::BIGINT AS total_views,
    COUNT(vv.id) FILTER (WHERE vv.is_valid)::BIGINT AS valid_views,
    ROUND(COALESCE(SUM(vv.watch_seconds) FILTER (WHERE vv.is_valid), 0)::NUMERIC / 3600, 1) AS watch_hours
  FROM date_series ds
  LEFT JOIN public.video_views vv ON vv.occurred_at::DATE = ds.day
  GROUP BY ds.day
  ORDER BY ds.day;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: 인기 영상 Top 10 (최근 30일 유효 시청 기준)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_top_videos(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  video_id        TEXT,
  title           TEXT,
  thumbnail       TEXT,
  creator_name    TEXT,
  valid_views     BIGINT,
  watch_hours     NUMERIC,
  is_hidden       BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    v.id::TEXT,
    v.title,
    v.thumbnail,
    p.display_name,
    COUNT(vv.id) FILTER (WHERE vv.is_valid)::BIGINT AS valid_views,
    ROUND(COALESCE(SUM(vv.watch_seconds) FILTER (WHERE vv.is_valid), 0)::NUMERIC / 3600, 1) AS watch_hours,
    COALESCE(v.is_hidden, false) AS is_hidden
  FROM public.videos v
  LEFT JOIN public.video_views vv
    ON vv.video_id = v.id
    AND vv.occurred_at >= now() - INTERVAL '30 days'
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  GROUP BY v.id, v.title, v.thumbnail, p.display_name, v.is_hidden
  HAVING COUNT(vv.id) FILTER (WHERE vv.is_valid) > 0
  ORDER BY valid_views DESC
  LIMIT p_limit;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: 인기 크리에이터 Top 10 (최근 30일 시청 시간 기준)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_top_creators(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
  creator_id      UUID,
  display_name    TEXT,
  avatar_url      TEXT,
  video_count     BIGINT,
  total_valid_views BIGINT,
  total_watch_hours NUMERIC,
  is_suspended    BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    p.id,
    p.display_name,
    p.avatar_url,
    COUNT(DISTINCT v.id)::BIGINT AS video_count,
    COUNT(vv.id) FILTER (WHERE vv.is_valid)::BIGINT AS total_valid_views,
    ROUND(COALESCE(SUM(vv.watch_seconds) FILTER (WHERE vv.is_valid), 0)::NUMERIC / 3600, 1) AS total_watch_hours,
    COALESCE(p.is_suspended, false) AS is_suspended
  FROM public.profiles p
  INNER JOIN public.videos v ON v.creator_id = p.id
  LEFT JOIN public.video_views vv
    ON vv.video_id = v.id
    AND vv.occurred_at >= now() - INTERVAL '30 days'
  GROUP BY p.id, p.display_name, p.avatar_url, p.is_suspended
  HAVING COUNT(vv.id) FILTER (WHERE vv.is_valid) > 0
  ORDER BY total_valid_views DESC
  LIMIT p_limit;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 7: 광고 성과 요약 (이번 달)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ad_performance_summary()
RETURNS TABLE (
  total_ads          BIGINT,
  active_ads         BIGINT,
  depleted_ads       BIGINT,
  total_impressions  BIGINT,
  total_clicks       BIGINT,
  total_spent        BIGINT,
  total_budget       BIGINT,
  avg_ctr            NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COUNT(*)::BIGINT AS total_ads,
    COUNT(*) FILTER (WHERE is_active)::BIGINT AS active_ads,
    COUNT(*) FILTER (WHERE budget_krw IS NOT NULL AND spent_krw >= budget_krw)::BIGINT AS depleted_ads,
    COALESCE(SUM(impressions), 0)::BIGINT AS total_impressions,
    COALESCE(SUM(clicks), 0)::BIGINT AS total_clicks,
    COALESCE(SUM(spent_krw), 0)::BIGINT AS total_spent,
    COALESCE(SUM(budget_krw) FILTER (WHERE budget_krw IS NOT NULL), 0)::BIGINT AS total_budget,
    CASE
      WHEN SUM(impressions) > 0
      THEN ROUND((SUM(clicks)::NUMERIC / SUM(impressions)::NUMERIC) * 100, 2)
      ELSE 0
    END AS avg_ctr
  FROM public.ads;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 8: 신고 처리 통계
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_report_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  status TEXT,
  count BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT status, COUNT(*)::BIGINT AS count
  FROM public.reports
  WHERE created_at >= CURRENT_DATE - (p_days - 1) * INTERVAL '1 day'
  GROUP BY status
  ORDER BY count DESC;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   SELECT * FROM public.get_admin_dashboard_summary();
--   SELECT * FROM public.get_daily_revenue(7);
--   SELECT * FROM public.get_daily_user_growth(7);
--   SELECT * FROM public.get_daily_views(7);
--   SELECT * FROM public.get_top_videos(5);
--   SELECT * FROM public.get_top_creators(5);
--   SELECT * FROM public.get_ad_performance_summary();
--   SELECT * FROM public.get_report_stats(30);
-- ════════════════════════════════════════════════════════════════════════════
