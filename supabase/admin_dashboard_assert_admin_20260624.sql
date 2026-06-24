-- ════════════════════════════════════════════════════════════════════════════
-- 관리자 대시보드 통계 RPC 가드 추가 (2026-06-24)
--
--   문제: phase10_5_admin_dashboard.sql 의 통계 RPC 8종이 LANGUAGE sql SECURITY DEFINER
--   인데 assert_admin() 가드도 REVOKE 도 없어, 비관리자가 supabase-js 로 직접 호출 시
--   플랫폼 전체 집계(매출·가입자·시청·광고성과·Top영상/크리에이터·신고통계)가 노출됨.
--   (개인 PII/계좌는 아니나 영업지표 — 다른 admin RPC 와 동일하게 닫는다)
--
--   해결: SQL → plpgsql 전환 후 본문 첫 줄 PERFORM public.assert_admin() 선행.
--   (admin 은 authenticated JWT 로 호출하므로 REVOKE 대신 내부 가드 — 기존 admin RPC 패턴 동일)
--   시그니처(인자/반환타입) 동일 → CREATE OR REPLACE 안전. 적용: SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. 메인 요약
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_summary()
RETURNS TABLE (
  total_users BIGINT, premium_users BIGINT, new_users_today BIGINT, new_users_this_month BIGINT,
  total_videos BIGINT, hidden_videos BIGINT, videos_uploaded_today BIGINT,
  revenue_this_month BIGINT, subscription_revenue BIGINT, license_revenue BIGINT, ad_budget_revenue BIGINT,
  pending_reports BIGINT, suspended_users BIGINT,
  views_24h BIGINT, valid_views_24h BIGINT, total_watch_seconds_24h BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  WITH
  user_stats AS (
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE subscription_tier = 'premium') AS premium,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS new_today,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', CURRENT_DATE)) AS new_month
    FROM public.profiles
  ),
  video_stats AS (
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_hidden = true) AS hidden,
      COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS uploaded_today
    FROM public.videos
  ),
  rev AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE payment_type = 'subscription'), 0) AS subscription,
      COALESCE(SUM(amount) FILTER (WHERE payment_type = 'license'), 0) AS license,
      COALESCE(SUM(amount) FILTER (WHERE payment_type = 'ad_budget'), 0) AS ad_budget,
      COALESCE(SUM(amount), 0) AS total
    FROM public.payments
    WHERE status = 'completed' AND created_at >= date_trunc('month', CURRENT_DATE)
  ),
  reports_stats AS (SELECT COUNT(*) AS pending FROM public.reports WHERE status = 'pending'),
  suspended AS (SELECT COUNT(*) AS total FROM public.profiles WHERE is_suspended = true),
  views AS (
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_valid) AS valid,
      COALESCE(SUM(watch_seconds) FILTER (WHERE is_valid), 0) AS watch_sec
    FROM public.video_views WHERE occurred_at >= now() - INTERVAL '24 hours'
  )
  SELECT u.total, u.premium, u.new_today, u.new_month,
    v.total, v.hidden, v.uploaded_today,
    rev.total::BIGINT, rev.subscription::BIGINT, rev.license::BIGINT, rev.ad_budget::BIGINT,
    r.pending, s.total,
    vw.total, vw.valid, vw.watch_sec::BIGINT
  FROM user_stats u, video_stats v, rev, reports_stats r, suspended s, views vw;
END;
$fn$;

-- 2. 일별 매출
CREATE OR REPLACE FUNCTION public.get_daily_revenue(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, subscription BIGINT, license BIGINT, ad_budget BIGINT, total BIGINT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series((CURRENT_DATE - (p_days - 1) * INTERVAL '1 day')::DATE, CURRENT_DATE, INTERVAL '1 day')::DATE AS day
  )
  SELECT ds.day,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'subscription'), 0)::BIGINT,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'license'), 0)::BIGINT,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'ad_budget'), 0)::BIGINT,
    COALESCE(SUM(p.amount), 0)::BIGINT
  FROM date_series ds
  LEFT JOIN public.payments p ON p.created_at::DATE = ds.day AND p.status = 'completed'
  GROUP BY ds.day ORDER BY ds.day;
END;
$fn$;

-- 3. 일별 가입자
CREATE OR REPLACE FUNCTION public.get_daily_user_growth(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, new_users BIGINT, cumulative BIGINT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series((CURRENT_DATE - (p_days - 1) * INTERVAL '1 day')::DATE, CURRENT_DATE, INTERVAL '1 day')::DATE AS day
  ),
  daily AS (
    SELECT ds.day, COUNT(p.id)::BIGINT AS new_users
    FROM date_series ds LEFT JOIN public.profiles p ON p.created_at::DATE = ds.day
    GROUP BY ds.day
  )
  SELECT day, new_users, SUM(new_users) OVER (ORDER BY day)::BIGINT FROM daily ORDER BY day;
END;
$fn$;

-- 4. 일별 시청
CREATE OR REPLACE FUNCTION public.get_daily_views(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, total_views BIGINT, valid_views BIGINT, watch_hours NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series((CURRENT_DATE - (p_days - 1) * INTERVAL '1 day')::DATE, CURRENT_DATE, INTERVAL '1 day')::DATE AS day
  )
  SELECT ds.day, COUNT(vv.id)::BIGINT,
    COUNT(vv.id) FILTER (WHERE vv.is_valid)::BIGINT,
    ROUND(COALESCE(SUM(vv.watch_seconds) FILTER (WHERE vv.is_valid), 0)::NUMERIC / 3600, 1)
  FROM date_series ds LEFT JOIN public.video_views vv ON vv.occurred_at::DATE = ds.day
  GROUP BY ds.day ORDER BY ds.day;
END;
$fn$;

-- 5. Top 영상
CREATE OR REPLACE FUNCTION public.get_top_videos(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (video_id TEXT, title TEXT, thumbnail TEXT, creator_name TEXT, valid_views BIGINT, watch_hours NUMERIC, is_hidden BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT v.id::TEXT, v.title, v.thumbnail, p.display_name,
    COUNT(vv.id) FILTER (WHERE vv.is_valid)::BIGINT,
    ROUND(COALESCE(SUM(vv.watch_seconds) FILTER (WHERE vv.is_valid), 0)::NUMERIC / 3600, 1),
    COALESCE(v.is_hidden, false)
  FROM public.videos v
  LEFT JOIN public.video_views vv ON vv.video_id = v.id AND vv.occurred_at >= now() - INTERVAL '30 days'
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  GROUP BY v.id, v.title, v.thumbnail, p.display_name, v.is_hidden
  HAVING COUNT(vv.id) FILTER (WHERE vv.is_valid) > 0
  ORDER BY 5 DESC LIMIT p_limit;
END;
$fn$;

-- 6. Top 크리에이터
CREATE OR REPLACE FUNCTION public.get_top_creators(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (creator_id UUID, display_name TEXT, avatar_url TEXT, video_count BIGINT, total_valid_views BIGINT, total_watch_hours NUMERIC, is_suspended BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT p.id, p.display_name, p.avatar_url,
    COUNT(DISTINCT v.id)::BIGINT,
    COUNT(vv.id) FILTER (WHERE vv.is_valid)::BIGINT,
    ROUND(COALESCE(SUM(vv.watch_seconds) FILTER (WHERE vv.is_valid), 0)::NUMERIC / 3600, 1),
    COALESCE(p.is_suspended, false)
  FROM public.profiles p
  INNER JOIN public.videos v ON v.creator_id = p.id
  LEFT JOIN public.video_views vv ON vv.video_id = v.id AND vv.occurred_at >= now() - INTERVAL '30 days'
  GROUP BY p.id, p.display_name, p.avatar_url, p.is_suspended
  HAVING COUNT(vv.id) FILTER (WHERE vv.is_valid) > 0
  ORDER BY 5 DESC LIMIT p_limit;
END;
$fn$;

-- 7. 광고 성과
CREATE OR REPLACE FUNCTION public.get_ad_performance_summary()
RETURNS TABLE (total_ads BIGINT, active_ads BIGINT, depleted_ads BIGINT, total_impressions BIGINT, total_clicks BIGINT, total_spent BIGINT, total_budget BIGINT, avg_ctr NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE is_active)::BIGINT,
    COUNT(*) FILTER (WHERE budget_krw IS NOT NULL AND spent_krw >= budget_krw)::BIGINT,
    COALESCE(SUM(impressions), 0)::BIGINT,
    COALESCE(SUM(clicks), 0)::BIGINT,
    COALESCE(SUM(spent_krw), 0)::BIGINT,
    COALESCE(SUM(budget_krw) FILTER (WHERE budget_krw IS NOT NULL), 0)::BIGINT,
    CASE WHEN SUM(impressions) > 0
      THEN ROUND((SUM(clicks)::NUMERIC / SUM(impressions)::NUMERIC) * 100, 2) ELSE 0 END
  FROM public.ads;
END;
$fn$;

-- 8. 신고 통계
CREATE OR REPLACE FUNCTION public.get_report_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE (status TEXT, count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT r.status, COUNT(*)::BIGINT
  FROM public.reports r
  WHERE r.created_at >= CURRENT_DATE - (p_days - 1) * INTERVAL '1 day'
  GROUP BY r.status ORDER BY 2 DESC;
END;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증: 비관리자 세션에서 SELECT * FROM public.get_admin_dashboard_summary();
--       → "관리자 권한이 필요합니다" 류 예외(assert_admin)여야 함. 관리자는 정상 반환.
-- ════════════════════════════════════════════════════════════════════════════
