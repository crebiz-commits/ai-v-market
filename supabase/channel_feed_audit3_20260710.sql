-- ════════════════════════════════════════════════════════════════════════════
-- 채널 피드 2차 감사 — 보류 4건 처리 (2026-07-10)
--
--   #1 [HIGH] "다음 정산 예정" 단위 혼합 과대: 이번달 gross orders + 확정 net 분배액을 더함.
--      revenue_distributions.total_revenue 는 이미 크리에이터 순수령(share 적용)이므로, 정산예정 =
--      pending 분배액 합만이 정답. 이번달 gross 추정분 제거. (정산일 경계도 KST 로.)
--   #2 [MED] 일별 차트 타임존: generate_series/필터가 CURRENT_DATE(UTC)인데 그룹키는 KST →
--      KST 저녁(15~24시) "오늘분"이 그래프에서 누락. 셋 다 KST 로 통일.
--   #3 [MED] 조회수 출처 불일치: track_video_view 가 videos.views 를 안 올려 공개 표시가 시드/정체.
--      video_views AFTER INSERT 트리거로 유효조회 시 videos.views +1(숫자값만 — 시드 콤마값 보존).
--      → 실사용자 영상('0' 시작)은 실측 반영, 시드는 base+real 로 성장.
--   #4 [MED] display_name 사칭명("운영팀/공식/Admin") + 길이무제한: BEFORE 트리거로 예약명 차단 +
--      display_name 30자·bio 500자 서버 클램프(직접 upsert 우회 방지).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── #1 get_creator_dashboard_summary — pending = 확정 pending 분배액만 + KST 정산일 ──
CREATE OR REPLACE FUNCTION public.get_creator_dashboard_summary()
RETURNS TABLE (
  total_revenue        BIGINT,
  total_views          BIGINT,
  total_likes          BIGINT,
  rpm                  NUMERIC,
  pending_payout       BIGINT,
  next_settlement_date DATE
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
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
  v_next_month  DATE := (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') + INTERVAL '1 month')::DATE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_rev
  FROM public.orders WHERE seller_id = v_uid AND status = 'completed';

  SELECT COUNT(*) INTO v_total_views
  FROM public.video_views WHERE creator_id = v_uid AND is_valid = true;

  SELECT COUNT(*) INTO v_total_likes
  FROM public.video_likes vl
  INNER JOIN public.videos v ON v.id = vl.video_id
  WHERE v.creator_id = v_uid;

  SELECT COALESCE(SUM(amount), 0) INTO v_recent_rev
  FROM public.orders WHERE seller_id = v_uid AND status = 'completed'
    AND created_at >= now() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_recent_views
  FROM public.video_views WHERE creator_id = v_uid AND is_valid = true
    AND occurred_at >= now() - INTERVAL '30 days';

  IF v_recent_views > 0 THEN
    v_rpm := ROUND((v_recent_rev::NUMERIC / v_recent_views) * 1000, 2);
  END IF;

  -- 다음 정산 예정 = 확정된 pending 분배액(이미 순수령·판매+광고+구독 합)만. 이번달 미확정 gross 는 제외.
  SELECT COALESCE(SUM(rd.total_revenue), 0) INTO v_pending
  FROM public.revenue_distributions rd
  WHERE rd.creator_id = v_uid AND rd.payout_status = 'pending';

  RETURN QUERY SELECT v_total_rev, v_total_views, v_total_likes, v_rpm, v_pending, v_next_month;
END;
$$;
REVOKE ALL ON FUNCTION public.get_creator_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_dashboard_summary() TO authenticated;

-- ── #2a get_creator_daily_revenue — KST 통일 ──
CREATE OR REPLACE FUNCTION public.get_creator_daily_revenue(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, revenue BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  WITH days AS (
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Seoul')::DATE - (GREATEST(p_days,1)-1) * INTERVAL '1 day')::DATE,
      (now() AT TIME ZONE 'Asia/Seoul')::DATE,
      '1 day'::INTERVAL
    )::DATE AS day
  ),
  daily AS (
    SELECT (created_at AT TIME ZONE 'Asia/Seoul')::DATE AS day,
           COALESCE(SUM(amount), 0)::BIGINT AS revenue
    FROM public.orders
    WHERE seller_id = auth.uid() AND status = 'completed'
      AND (created_at AT TIME ZONE 'Asia/Seoul')::DATE
          >= ((now() AT TIME ZONE 'Asia/Seoul')::DATE - (GREATEST(p_days,1)-1) * INTERVAL '1 day')::DATE
    GROUP BY 1
  )
  SELECT d.day, COALESCE(daily.revenue, 0) AS revenue
  FROM days d LEFT JOIN daily ON daily.day = d.day
  ORDER BY d.day;
$$;
REVOKE ALL ON FUNCTION public.get_creator_daily_revenue(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_daily_revenue(INTEGER) TO authenticated;

-- ── #2b get_creator_daily_engagement — KST 통일 ──
CREATE OR REPLACE FUNCTION public.get_creator_daily_engagement(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, views BIGINT, likes BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  WITH days AS (
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Seoul')::DATE - (GREATEST(p_days,1)-1) * INTERVAL '1 day')::DATE,
      (now() AT TIME ZONE 'Asia/Seoul')::DATE,
      '1 day'::INTERVAL
    )::DATE AS day
  ),
  daily_views AS (
    SELECT (occurred_at AT TIME ZONE 'Asia/Seoul')::DATE AS day, COUNT(*)::BIGINT AS views
    FROM public.video_views
    WHERE creator_id = auth.uid() AND is_valid = true
      AND (occurred_at AT TIME ZONE 'Asia/Seoul')::DATE
          >= ((now() AT TIME ZONE 'Asia/Seoul')::DATE - (GREATEST(p_days,1)-1) * INTERVAL '1 day')::DATE
    GROUP BY 1
  ),
  daily_likes AS (
    SELECT (vl.created_at AT TIME ZONE 'Asia/Seoul')::DATE AS day, COUNT(*)::BIGINT AS likes
    FROM public.video_likes vl
    INNER JOIN public.videos v ON v.id = vl.video_id
    WHERE v.creator_id = auth.uid()
      AND (vl.created_at AT TIME ZONE 'Asia/Seoul')::DATE
          >= ((now() AT TIME ZONE 'Asia/Seoul')::DATE - (GREATEST(p_days,1)-1) * INTERVAL '1 day')::DATE
    GROUP BY 1
  )
  SELECT d.day, COALESCE(dv.views, 0) AS views, COALESCE(dl.likes, 0) AS likes
  FROM days d
  LEFT JOIN daily_views dv ON dv.day = d.day
  LEFT JOIN daily_likes dl ON dl.day = d.day
  ORDER BY d.day;
$$;
REVOKE ALL ON FUNCTION public.get_creator_daily_engagement(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_daily_engagement(INTEGER) TO authenticated;

-- ── #2c get_creator_daily_followers — KST 통일 ──
CREATE OR REPLACE FUNCTION public.get_creator_daily_followers(p_days INTEGER DEFAULT 30)
RETURNS TABLE (day DATE, gained BIGINT, total BIGINT)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  WITH days AS (
    SELECT generate_series(
      ((now() AT TIME ZONE 'Asia/Seoul')::DATE - (GREATEST(p_days,1)-1) * INTERVAL '1 day')::DATE,
      (now() AT TIME ZONE 'Asia/Seoul')::DATE,
      '1 day'::INTERVAL
    )::DATE AS day
  ),
  daily AS (
    SELECT (created_at AT TIME ZONE 'Asia/Seoul')::DATE AS day, COUNT(*)::BIGINT AS gained
    FROM public.creator_followers
    WHERE creator_id = auth.uid()
      AND (created_at AT TIME ZONE 'Asia/Seoul')::DATE
          >= ((now() AT TIME ZONE 'Asia/Seoul')::DATE - (GREATEST(p_days,1)-1) * INTERVAL '1 day')::DATE
    GROUP BY 1
  ),
  base_total AS (
    SELECT COUNT(*)::BIGINT AS cnt
    FROM public.creator_followers
    WHERE creator_id = auth.uid()
      AND (created_at AT TIME ZONE 'Asia/Seoul')::DATE
          < ((now() AT TIME ZONE 'Asia/Seoul')::DATE - (GREATEST(p_days,1)-1) * INTERVAL '1 day')::DATE
  )
  SELECT
    d.day,
    COALESCE(daily.gained, 0) AS gained,
    (SELECT cnt FROM base_total) + SUM(COALESCE(daily.gained, 0)) OVER (ORDER BY d.day) AS total
  FROM days d LEFT JOIN daily ON daily.day = d.day
  ORDER BY d.day;
$$;
REVOKE ALL ON FUNCTION public.get_creator_daily_followers(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_daily_followers(INTEGER) TO authenticated;

-- ── #3 videos.views 실측 반영 — video_views 유효조회 INSERT 시 +1(숫자값만, 시드 콤마 보존) ──
CREATE OR REPLACE FUNCTION public.tg_bump_video_views()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.is_valid THEN
    UPDATE public.videos
    SET views = (views::BIGINT + 1)::TEXT
    WHERE id = NEW.video_id AND views ~ '^\d+$';   -- 숫자값만 증가(콤마 시드값은 그대로 보존)
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS video_views_bump ON public.video_views;
CREATE TRIGGER video_views_bump
  AFTER INSERT ON public.video_views
  FOR EACH ROW EXECUTE FUNCTION public.tg_bump_video_views();

-- ── #4 display_name 사칭명 차단 + 길이 클램프 ──
CREATE OR REPLACE FUNCTION public.tg_guard_profile_text()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_norm TEXT;
BEGIN
  IF NEW.display_name IS NOT NULL THEN
    NEW.display_name := LEFT(btrim(NEW.display_name), 30);   -- 길이 서버 강제(레이아웃 파괴 방지)
    v_norm := lower(regexp_replace(NEW.display_name, '\s', '', 'g'));
    -- 사칭명 차단은 사용자 편집(UPDATE)에만 — 회원가입(handle_new_user INSERT)의 OAuth 이름이
    --   우연히 예약어여도 가입이 깨지지 않게. (MyPage 프로필 편집은 기존행 upsert=UPDATE 경로.)
    IF TG_OP = 'UPDATE' AND (v_norm = ANY(ARRAY[
         'admin','administrator','관리자','운영자','운영팀','staff','스태프','moderator','모더레이터',
         'official','공식','고객센터','support','creaite','크레아이트','크리에이트'])
       OR v_norm LIKE '%creaite운영%' OR v_norm LIKE '%creaite공식%' OR v_norm LIKE '%creaiteofficial%'
       OR v_norm LIKE '%크레아이트운영%' OR v_norm LIKE '%크리에이트운영%' OR v_norm LIKE '%공식계정%') THEN
      RAISE EXCEPTION '사용할 수 없는 이름입니다 (운영·공식 사칭 방지). 다른 이름을 입력해 주세요.';
    END IF;
  END IF;
  IF NEW.bio IS NOT NULL THEN
    NEW.bio := LEFT(NEW.bio, 500);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_guard_text ON public.profiles;
CREATE TRIGGER profiles_guard_text
  BEFORE INSERT OR UPDATE OF display_name, bio ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_guard_profile_text();

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   #1: SELECT pending_payout FROM public.get_creator_dashboard_summary();  -- pending 분배액과 일치
--   #3: 유효조회 발생 후 SELECT views FROM videos WHERE id='<vid>';  -- +1 증가(숫자값)
--   #4: UPDATE public.profiles SET display_name='운영팀' WHERE id=auth.uid();  -- ERROR
