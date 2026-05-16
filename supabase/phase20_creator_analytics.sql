-- ════════════════════════════════════════════════════════════════════════════
-- Phase 20 — 크리에이터 분석 대시보드 풍부화
-- 적용 일자: 2026-05-17
-- 선행: video_views, video_likes, videos, creator_followers
--
-- 목적 (Phase 21의 기본 대시보드 + 추가 깊이):
--   1. 시청자 통계: 평균 시청률, 완주율(90%+), 유니크 시청자
--   2. Top 영상 (조회수/좋아요/시청률 기준)
--   3. 팔로워 일별 증가 추세
--   4. 영상 길이 구간별 평균 시청률
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: 시청자 통계 (KPI 보강)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_audience_stats(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  avg_watch_ratio   NUMERIC,    -- 평균 시청률 (0~1, % 변환은 클라이언트)
  completion_rate   NUMERIC,    -- 완주율 (90%+ 시청 비율, 0~1)
  unique_viewers    BIGINT,     -- 고유 시청자 수
  total_views       BIGINT,     -- 총 유효 시청수
  avg_watch_seconds INTEGER     -- 평균 시청 시간(초)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_since TIMESTAMPTZ := now() - (GREATEST(p_days, 1) || ' days')::INTERVAL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(ROUND(AVG(watch_ratio)::NUMERIC, 4), 0)                                  AS avg_watch_ratio,
    COALESCE(ROUND(
      (COUNT(*) FILTER (WHERE watch_ratio >= 0.9))::NUMERIC
      / NULLIF(COUNT(*), 0), 4), 0)                                                   AS completion_rate,
    COUNT(DISTINCT viewer_user_id) FILTER (WHERE viewer_user_id IS NOT NULL)::BIGINT  AS unique_viewers,
    COUNT(*)::BIGINT                                                                  AS total_views,
    COALESCE(AVG(watch_seconds)::INTEGER, 0)                                          AS avg_watch_seconds
  FROM public.video_views
  WHERE creator_id = v_uid
    AND is_valid = true
    AND occurred_at >= v_since;
END;
$$;

COMMENT ON FUNCTION public.get_creator_audience_stats IS
  '크리에이터 시청자 통계 (최근 N일): 평균 시청률, 완주율, 유니크 시청자';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: Top 영상 (지표별 상위 N개)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_top_videos(
  p_metric TEXT DEFAULT 'views',   -- views / likes / watch_ratio
  p_days   INTEGER DEFAULT 30,
  p_limit  INTEGER DEFAULT 5
)
RETURNS TABLE (
  id              TEXT,
  title           TEXT,
  thumbnail       TEXT,
  duration        TEXT,
  views_count     BIGINT,
  likes_count     INTEGER,
  avg_watch_ratio NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_since TIMESTAMPTZ := now() - (GREATEST(p_days, 1) || ' days')::INTERVAL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.title,
    v.thumbnail,
    v.duration,
    COALESCE((SELECT COUNT(*) FROM public.video_views vv
              WHERE vv.video_id = v.id AND vv.is_valid = true
                AND vv.occurred_at >= v_since), 0)::BIGINT AS views_count,
    COALESCE(v.likes, 0)::INTEGER AS likes_count,
    COALESCE((SELECT ROUND(AVG(vv.watch_ratio)::NUMERIC, 4) FROM public.video_views vv
              WHERE vv.video_id = v.id AND vv.is_valid = true
                AND vv.occurred_at >= v_since), 0) AS avg_watch_ratio
  FROM public.videos v
  WHERE v.creator_id = v_uid
    AND COALESCE(v.is_hidden, false) = false
  ORDER BY
    CASE WHEN p_metric = 'views' THEN
      COALESCE((SELECT COUNT(*) FROM public.video_views vv
                WHERE vv.video_id = v.id AND vv.is_valid = true
                  AND vv.occurred_at >= v_since), 0)
    END DESC NULLS LAST,
    CASE WHEN p_metric = 'likes' THEN COALESCE(v.likes, 0) END DESC NULLS LAST,
    CASE WHEN p_metric = 'watch_ratio' THEN
      COALESCE((SELECT AVG(vv.watch_ratio) FROM public.video_views vv
                WHERE vv.video_id = v.id AND vv.is_valid = true
                  AND vv.occurred_at >= v_since), 0)
    END DESC NULLS LAST,
    v.created_at DESC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

COMMENT ON FUNCTION public.get_creator_top_videos IS
  '크리에이터 Top 영상 (지표별: views/likes/watch_ratio, 최근 N일)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 일별 팔로워 증가
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_daily_followers(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  day      DATE,
  gained   BIGINT,     -- 그날 새로 팔로우한 수
  total    BIGINT      -- 그날 종료 시점 누적 팔로워 수
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
           COUNT(*)::BIGINT AS gained
    FROM public.creator_followers
    WHERE creator_id = auth.uid()
      AND created_at >= CURRENT_DATE - (GREATEST(p_days, 1) - 1) * INTERVAL '1 day'
    GROUP BY 1
  ),
  base_total AS (
    SELECT COUNT(*)::BIGINT AS cnt
    FROM public.creator_followers
    WHERE creator_id = auth.uid()
      AND created_at < CURRENT_DATE - (GREATEST(p_days, 1) - 1) * INTERVAL '1 day'
  )
  SELECT
    d.day,
    COALESCE(daily.gained, 0) AS gained,
    (SELECT cnt FROM base_total)
      + SUM(COALESCE(daily.gained, 0)) OVER (ORDER BY d.day) AS total
  FROM days d
  LEFT JOIN daily ON daily.day = d.day
  ORDER BY d.day;
$$;

COMMENT ON FUNCTION public.get_creator_daily_followers IS
  '일별 팔로워 증가: 그날 신규 + 누적 (최근 N일)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 영상 길이 구간별 평균 시청률 (retention by duration bucket)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_retention_by_duration(p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  bucket          TEXT,    -- '1분 미만' / '1-5분' / '5-10분' / '10분+'
  bucket_order    INTEGER,
  avg_watch_ratio NUMERIC,
  view_count      BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_since TIMESTAMPTZ := now() - (GREATEST(p_days, 1) || ' days')::INTERVAL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  RETURN QUERY
  WITH bucketed AS (
    SELECT
      CASE
        WHEN COALESCE(vv.video_duration, 0) < 60 THEN '1분 미만'
        WHEN COALESCE(vv.video_duration, 0) < 300 THEN '1~5분'
        WHEN COALESCE(vv.video_duration, 0) < 600 THEN '5~10분'
        ELSE '10분+'
      END AS bucket,
      CASE
        WHEN COALESCE(vv.video_duration, 0) < 60 THEN 1
        WHEN COALESCE(vv.video_duration, 0) < 300 THEN 2
        WHEN COALESCE(vv.video_duration, 0) < 600 THEN 3
        ELSE 4
      END AS bucket_order,
      vv.watch_ratio
    FROM public.video_views vv
    WHERE vv.creator_id = v_uid
      AND vv.is_valid = true
      AND vv.occurred_at >= v_since
      AND vv.video_duration IS NOT NULL
  )
  SELECT
    b.bucket,
    b.bucket_order,
    ROUND(AVG(b.watch_ratio)::NUMERIC, 4) AS avg_watch_ratio,
    COUNT(*)::BIGINT AS view_count
  FROM bucketed b
  GROUP BY b.bucket, b.bucket_order
  ORDER BY b.bucket_order;
END;
$$;

COMMENT ON FUNCTION public.get_creator_retention_by_duration IS
  '영상 길이 구간(1분 미만/1-5/5-10/10+)별 평균 시청률';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 시청자 통계
--   SELECT * FROM public.get_creator_audience_stats(30);
--
--   -- 2. Top 영상 (조회수 기준)
--   SELECT * FROM public.get_creator_top_videos('views', 30, 5);
--
--   -- 3. 일별 팔로워
--   SELECT * FROM public.get_creator_daily_followers(30);
--
--   -- 4. 길이별 retention
--   SELECT * FROM public.get_creator_retention_by_duration(30);
-- ════════════════════════════════════════════════════════════════════════════
