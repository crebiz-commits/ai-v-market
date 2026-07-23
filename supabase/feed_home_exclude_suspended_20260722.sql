-- ════════════════════════════════════════════════════════════════════════════
-- 🚫 홈피드에서 정지 크리에이터 제외 (2026-07-22) — 업로드 감사 (feed_exclude 짝)
--
--   feed_exclude_suspended_20260722.sql 이 v_available_videos(시네마·추천 등)를 막았지만,
--   홈피드(get_home_feed_order)는 v_home_feed_public(필터 없는 단순 투영)을 쓰므로
--   그 뷰를 안 탄다. 이 파일이 홈 경로를 마저 막는다.
--
--   [조치] ① v_home_feed_public 에 profiles 조인 + creator_suspended 플래그 컬럼 추가
--          ② get_home_feed_order 의 3개 SELECT WHERE 에 creator_suspended=false 추가
--   두 원문(get_home_feed_safe_columns_20260620 / home_feed_frozen_order_20260704)에서
--   기계 추출해 최소 편집만 했다(안전 컬럼 세트·동결 정렬 로직 100% 보존).
--
--   ★ 두 객체의 새 정본. 원본 두 파일 재실행 금지(필터·컬럼 소실).
--   ▣ 게이트 #6 은 get_home_feed 반환이 v_home_feed_public 인지 확인 — 컬럼 추가는
--     반환 타입에 영향 없으므로 #6 계속 PASS.
--   적용: Supabase SQL Editor → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_home_feed_public AS
SELECT
  v.id, v.thumbnail, v.title, v.creator, v.creator_id, v.likes, v.price_standard,
  v.duration, v.duration_seconds, v.resolution, v.ai_tool, v.category, v.genre,
  v.video_url, v.age_rating, v.description, v.tags, v.ai_model_version, v.prompt,
  v.seed, v.director, v.writer, v.composer, v.cast_credits, v.production_year,
  v.language, v.subtitle_language, v.visibility, v.highlight_start, v.highlight_end,
  v.series_id,
  -- 함수 내부 WHERE/정렬에 필요한 플래그(민감하지 않음)
  v.show_on_home, v.show_on_ott, v.is_hidden, v.episode_number, v.created_at,
  -- 정지 크리에이터 제외용 플래그(2026-07-22)
  COALESCE(p.is_suspended, false) AS creator_suspended
FROM public.videos v
LEFT JOIN public.profiles p ON p.id = v.creator_id;

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
      AND COALESCE(vp.creator_suspended, false) = false  -- 정지 크리에이터 제외(2026-07-22)
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
      AND COALESCE(vp.creator_suspended, false) = false  -- 정지 크리에이터 제외(2026-07-22)
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
      AND COALESCE(vp.creator_suspended, false) = false  -- 정지 크리에이터 제외(2026-07-22)
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
      AND COALESCE(vp.creator_suspended, false) = false  -- 정지 크리에이터 제외(2026-07-22)
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
SELECT '홈피드 뷰에 정지 플래그' AS check_name,
  CASE WHEN pg_get_viewdef('public.v_home_feed_public'::regclass) ~ 'creator_suspended'
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '홈피드 함수가 정지 크리에이터 제외',
  CASE WHEN (SELECT prosrc ~ 'creator_suspended' FROM pg_proc WHERE proname='get_home_feed_order')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '동결 정렬 로직 보존',
  CASE WHEN (SELECT prosrc ~ 'INTERVAL ..7 days' FROM pg_proc WHERE proname='get_home_feed_order')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
