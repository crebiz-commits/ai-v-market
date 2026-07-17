-- ════════════════════════════════════════════════════════════════════════════
-- 관리자 대시보드 통계 — 날짜 경계 KST 정합 (2026-07-18)
--
--   [결함] 대시보드 집계 RPC 가 "오늘/이번 달/일별"을 CURRENT_DATE·created_at::DATE
--     (= 서버 UTC) 로 계산. 이 앱은 KST 기준이고 정산 SSOT(calculate_monthly_revenue)는
--     이미 AT TIME ZONE 'Asia/Seoul' 로 '이번 달'을 계산함 → 대시보드 "이번 달 매출"이
--     정산의 '이번 달'과 월초 9시간 동안 어긋나고, 일별 매출/가입/시청 차트가 UTC 일
--     경계로 버킷돼 KST 대비 최대 하루 밀림. "오늘 업로드/신규가입"도 KST 새벽(00~09시)
--     건이 전날 UTC 버킷으로 빠짐.
--   [수정] date_trunc/CURRENT_DATE/created_at::DATE 를 KST 로 변환. 정산 SSOT 와 동일 패턴
--     ((date_trunc(..., now() AT TIME ZONE 'Asia/Seoul')) AT TIME ZONE 'Asia/Seoul').
--     rolling 창(24h·30일)은 tz-무관이라 무변경. assert_admin/구조/시그니처 동일.
--
--   ★ 이 파일이 아래 4함수의 새 정본. admin_dashboard_assert_admin_20260624.sql 의 해당
--     4함수 재실행 금지(UTC 로 되돌아감). 나머지 4함수(top_videos/creators/ad_perf/
--     report_stats)는 그 파일 그대로 유지(변경 없음).
--   보안: SECURITY DEFINER + assert_admin(내부 가드) + inline search_path(게이트 #19).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 1. 메인 요약 (오늘/이번 달 → KST)
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
DECLARE
  v_kst_today timestamptz := (date_trunc('day',   now() AT TIME ZONE 'Asia/Seoul')) AT TIME ZONE 'Asia/Seoul';
  v_kst_month timestamptz := (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul')) AT TIME ZONE 'Asia/Seoul';
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  WITH
  user_stats AS (
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE subscription_tier = 'premium') AS premium,
      COUNT(*) FILTER (WHERE created_at >= v_kst_today) AS new_today,
      COUNT(*) FILTER (WHERE created_at >= v_kst_month) AS new_month
    FROM public.profiles
  ),
  video_stats AS (
    SELECT COUNT(*) AS total,
      COUNT(*) FILTER (WHERE is_hidden = true) AS hidden,
      COUNT(*) FILTER (WHERE created_at >= v_kst_today) AS uploaded_today
    FROM public.videos
  ),
  rev AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE payment_type = 'subscription'), 0) AS subscription,
      COALESCE(SUM(amount) FILTER (WHERE payment_type = 'license'), 0) AS license,
      COALESCE(SUM(amount) FILTER (WHERE payment_type = 'ad_budget'), 0) AS ad_budget,
      COALESCE(SUM(amount), 0) AS total
    FROM public.payments
    WHERE status = 'completed' AND created_at >= v_kst_month
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

-- 2. 일별 매출 (일 경계 → KST)
CREATE OR REPLACE FUNCTION public.get_daily_revenue(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, subscription BIGINT, license BIGINT, ad_budget BIGINT, total BIGINT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series((v_today - (p_days - 1))::DATE, v_today, INTERVAL '1 day')::DATE AS day
  )
  SELECT ds.day,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'subscription'), 0)::BIGINT,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'license'), 0)::BIGINT,
    COALESCE(SUM(p.amount) FILTER (WHERE p.payment_type = 'ad_budget'), 0)::BIGINT,
    COALESCE(SUM(p.amount), 0)::BIGINT
  FROM date_series ds
  LEFT JOIN public.payments p
    ON (p.created_at AT TIME ZONE 'Asia/Seoul')::DATE = ds.day AND p.status = 'completed'
  GROUP BY ds.day ORDER BY ds.day;
END;
$fn$;

-- 3. 일별 가입자 (일 경계 → KST)
CREATE OR REPLACE FUNCTION public.get_daily_user_growth(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, new_users BIGINT, cumulative BIGINT)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series((v_today - (p_days - 1))::DATE, v_today, INTERVAL '1 day')::DATE AS day
  ),
  daily AS (
    SELECT ds.day, COUNT(p.id)::BIGINT AS new_users
    FROM date_series ds
    LEFT JOIN public.profiles p ON (p.created_at AT TIME ZONE 'Asia/Seoul')::DATE = ds.day
    GROUP BY ds.day
  )
  SELECT day, new_users, SUM(new_users) OVER (ORDER BY day)::BIGINT FROM daily ORDER BY day;
END;
$fn$;

-- 4. 일별 시청 (일 경계 → KST)
CREATE OR REPLACE FUNCTION public.get_daily_views(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, total_views BIGINT, valid_views BIGINT, watch_hours NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
DECLARE v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series((v_today - (p_days - 1))::DATE, v_today, INTERVAL '1 day')::DATE AS day
  )
  SELECT ds.day, COUNT(vv.id)::BIGINT,
    COUNT(vv.id) FILTER (WHERE vv.is_valid)::BIGINT,
    ROUND(COALESCE(SUM(vv.watch_seconds) FILTER (WHERE vv.is_valid), 0)::NUMERIC / 3600, 1)
  FROM date_series ds
  LEFT JOIN public.video_views vv ON (vv.occurred_at AT TIME ZONE 'Asia/Seoul')::DATE = ds.day
  GROUP BY ds.day ORDER BY ds.day;
END;
$fn$;

-- 권한: 내부 assert_admin 가드(REVOKE 대신) — 기존 grant 유지(멱등 재부여)
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_summary()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_revenue(INTEGER)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_user_growth(INTEGER)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_views(INTEGER)               TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   SELECT day, total FROM public.get_daily_revenue(30);  -- day 가 KST 기준
--   SELECT revenue_this_month FROM public.get_admin_dashboard_summary();  -- 정산 '이번 달'과 일치
-- ════════════════════════════════════════════════════════════════════════════
