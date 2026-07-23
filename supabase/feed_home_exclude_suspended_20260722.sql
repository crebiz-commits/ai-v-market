-- ════════════════════════════════════════════════════════════════════════════
-- 🚫 홈피드에서 정지 크리에이터 제외 (2026-07-22, v2) — 업로드 감사
--
--   feed_exclude_suspended 가 v_available_videos(시네마·추천)를 막았으나, 홈피드는
--   v_home_feed_public 을 쓰므로 별도로 막아야 한다.
--
--   ▣ v1 은 뷰에 creator_suspended 컬럼을 추가하려다 실패했다:
--       ERROR 42P16 cannot change name of view column "views" to "creator_suspended"
--     라이브 v_home_feed_public 은 소스 파일(get_home_feed_safe_columns_20260620)에
--     없는 'views' 컬럼이 맨 끝에 추가돼 있어(뷰 드리프트) CREATE OR REPLACE 가
--     컬럼 순서 불일치로 거부한다. → **뷰를 아예 건드리지 않는다.**
--     뷰가 이미 vp.creator_id 를 노출하므로, 함수에서 profiles 를 직접 확인하면 된다.
--
--   [조치] get_home_feed_order 의 4개 SELECT(new/popular/all 개인화) WHERE 에
--     NOT EXISTS(profiles WHERE id=creator_id AND is_suspended) 추가. 뷰 무수정.
--
--   ★ get_home_feed_order 의 새 정본. home_feed_frozen_order_20260704.sql 재실행 금지.
--     동결 정렬·시리즈 대표작 로직 100% 보존, WHERE 절 4곳에 서브쿼리 1개씩만 추가.
--   적용: Supabase SQL Editor → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_home_feed_order(p_filter text DEFAULT 'all')
RETURNS SETOF text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_history boolean := false;
BEGIN
  -- 최신
  IF p_filter = 'new' THEN
    RETURN QUERY
    SELECT vp.id FROM public.v_home_feed_public vp
    WHERE vp.show_on_home = true AND (vp.visibility = 'public' OR vp.visibility IS NULL) AND COALESCE(vp.is_hidden, false) = false
      AND NOT EXISTS (SELECT 1 FROM public.profiles psusp
                     WHERE psusp.id = vp.creator_id AND psusp.is_suspended = true)  -- 정지 크리에이터 제외(2026-07-22)
      AND (
        vp.series_id IS NULL
        OR NOT EXISTS (   -- 시리즈 대표작 = 노출가능 에피소드 중 가장 앞 화(1화 숨김 시 다음 화)
          SELECT 1 FROM public.videos v3
          WHERE v3.series_id = vp.series_id
            AND COALESCE(v3.is_hidden, false) = false
            AND COALESCE(v3.visibility, 'public') = 'public'
            AND COALESCE(v3.episode_number, 1) < COALESCE(vp.episode_number, 1)
        )
      )
    ORDER BY vp.created_at DESC, vp.id;
    RETURN;
  END IF;

  -- 인기 / 무료 / 소장가능 / 시네마급
  IF p_filter IN ('popular','free','paid','cinema') THEN
    RETURN QUERY
    SELECT vp.id FROM public.v_home_feed_public vp
    WHERE vp.show_on_home = true AND (vp.visibility = 'public' OR vp.visibility IS NULL) AND COALESCE(vp.is_hidden, false) = false
      AND NOT EXISTS (SELECT 1 FROM public.profiles psusp
                     WHERE psusp.id = vp.creator_id AND psusp.is_suspended = true)  -- 정지 크리에이터 제외(2026-07-22)
      AND (
        vp.series_id IS NULL
        OR NOT EXISTS (   -- 시리즈 대표작 = 노출가능 에피소드 중 가장 앞 화(1화 숨김 시 다음 화)
          SELECT 1 FROM public.videos v3
          WHERE v3.series_id = vp.series_id
            AND COALESCE(v3.is_hidden, false) = false
            AND COALESCE(v3.visibility, 'public') = 'public'
            AND COALESCE(v3.episode_number, 1) < COALESCE(vp.episode_number, 1)
        )
      )
      AND (p_filter <> 'free'   OR COALESCE(vp.price_standard, 0) = 0)
      AND (p_filter <> 'paid'   OR COALESCE(vp.price_standard, 0) > 0)
      AND (p_filter <> 'cinema' OR COALESCE(vp.show_on_ott, false) = true)
    ORDER BY (
      COALESCE(vp.likes, 0) * 1.0
      + (SELECT COUNT(*) FROM public.video_views vv
         WHERE vv.video_id = vp.id AND vv.is_valid = true
           AND vv.occurred_at >= now() - INTERVAL '7 days') * 2.0
    ) DESC, vp.created_at DESC, vp.id;
    RETURN;
  END IF;

  -- 'all' — 개인화
  IF v_user_id IS NOT NULL THEN
    SELECT (EXISTS (SELECT 1 FROM public.video_likes WHERE user_id = v_user_id)
         OR EXISTS (SELECT 1 FROM public.video_views WHERE viewer_user_id = v_user_id AND is_valid = true))
    INTO v_has_history;
  END IF;

  IF v_user_id IS NULL OR NOT v_has_history THEN
    RETURN QUERY
    SELECT vp.id FROM public.v_home_feed_public vp
    WHERE vp.show_on_home = true AND (vp.visibility = 'public' OR vp.visibility IS NULL) AND COALESCE(vp.is_hidden, false) = false
      AND NOT EXISTS (SELECT 1 FROM public.profiles psusp
                     WHERE psusp.id = vp.creator_id AND psusp.is_suspended = true)  -- 정지 크리에이터 제외(2026-07-22)
      AND (
        vp.series_id IS NULL
        OR NOT EXISTS (   -- 시리즈 대표작 = 노출가능 에피소드 중 가장 앞 화(1화 숨김 시 다음 화)
          SELECT 1 FROM public.videos v3
          WHERE v3.series_id = vp.series_id
            AND COALESCE(v3.is_hidden, false) = false
            AND COALESCE(v3.visibility, 'public') = 'public'
            AND COALESCE(v3.episode_number, 1) < COALESCE(vp.episode_number, 1)
        )
      )
    ORDER BY (
      COALESCE(vp.likes, 0) * 1.0
      + (SELECT COUNT(*) FROM public.video_views vv
         WHERE vv.video_id = vp.id AND vv.is_valid = true
           AND vv.occurred_at >= now() - INTERVAL '7 days') * 2.0
    ) DESC, vp.created_at DESC, vp.id;
    RETURN;
  END IF;

  RETURN QUERY
  WITH cat_pref AS (
    SELECT category, SUM(w)::numeric AS s FROM (
      SELECT v.category, 3 AS w FROM public.video_likes l JOIN public.videos v ON v.id = l.video_id
        WHERE l.user_id = v_user_id AND v.category IS NOT NULL
      UNION ALL
      SELECT v.category, 1 AS w FROM public.video_views vv JOIN public.videos v ON v.id = vv.video_id
        WHERE vv.viewer_user_id = v_user_id AND vv.is_valid = true AND v.category IS NOT NULL
    ) t GROUP BY category
  ),
  genre_pref AS (
    SELECT genre, SUM(w)::numeric AS s FROM (
      SELECT v.genre, 3 AS w FROM public.video_likes l JOIN public.videos v ON v.id = l.video_id
        WHERE l.user_id = v_user_id AND v.genre IS NOT NULL
      UNION ALL
      SELECT v.genre, 1 AS w FROM public.video_views vv JOIN public.videos v ON v.id = vv.video_id
        WHERE vv.viewer_user_id = v_user_id AND vv.is_valid = true AND v.genre IS NOT NULL
    ) t GROUP BY genre
  ),
  creator_pref AS (
    SELECT creator_id, SUM(w)::numeric AS s FROM (
      SELECT v.creator_id, 3 AS w FROM public.video_likes l JOIN public.videos v ON v.id = l.video_id
        WHERE l.user_id = v_user_id AND v.creator_id IS NOT NULL
      UNION ALL
      SELECT cf.creator_id, 5 AS w FROM public.creator_followers cf
        WHERE cf.follower_id = v_user_id AND cf.creator_id IS NOT NULL
    ) t GROUP BY creator_id
  ),
  viewed AS (
    SELECT DISTINCT video_id FROM public.video_views
    WHERE viewer_user_id = v_user_id AND is_valid = true
  )
  SELECT vp.id
  FROM public.v_home_feed_public vp
  LEFT JOIN cat_pref cp ON cp.category = vp.category
  LEFT JOIN genre_pref gp ON gp.genre = vp.genre
  LEFT JOIN creator_pref crp ON crp.creator_id = vp.creator_id
  LEFT JOIN viewed vw ON vw.video_id = vp.id
  WHERE vp.show_on_home = true
    AND (vp.visibility = 'public' OR vp.visibility IS NULL)
    AND COALESCE(vp.is_hidden, false) = false
      AND NOT EXISTS (SELECT 1 FROM public.profiles psusp
                     WHERE psusp.id = vp.creator_id AND psusp.is_suspended = true)  -- 정지 크리에이터 제외(2026-07-22)
    AND (
      vp.series_id IS NULL
      OR NOT EXISTS (   -- 시리즈 대표작 = 노출가능 에피소드 중 가장 앞 화(1화 숨김 시 다음 화)
        SELECT 1 FROM public.videos v3
        WHERE v3.series_id = vp.series_id
          AND COALESCE(v3.is_hidden, false) = false
          AND COALESCE(v3.visibility, 'public') = 'public'
          AND COALESCE(v3.episode_number, 1) < COALESCE(vp.episode_number, 1)
      )
    )
  ORDER BY (
    COALESCE(cp.s, 0) * 1.0
    + COALESCE(gp.s, 0) * 1.0
    + COALESCE(crp.s, 0) * 1.0
    + COALESCE(vp.likes, 0) * 0.05
    - (CASE WHEN vw.video_id IS NOT NULL THEN 4 ELSE 0 END)
  ) DESC, vp.created_at DESC, vp.id;
END;
$function$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '홈피드 정지 크리에이터 제외' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_home_feed_order')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '동결 정렬 로직 보존',
  CASE WHEN (SELECT prosrc ~ '7 days' FROM pg_proc WHERE proname='get_home_feed_order')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '4개 WHERE 모두 필터(psusp 4회)',
  CASE WHEN (SELECT (length(prosrc) - length(replace(prosrc,'psusp.is_suspended',''))) / length('psusp.is_suspended') = 4
             FROM pg_proc WHERE proname='get_home_feed_order')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
