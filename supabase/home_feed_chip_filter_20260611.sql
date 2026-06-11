-- ════════════════════════════════════════════════════════════════════════════
-- 홈피드 칩 필터 (2026-06-11)
--   전체 / 인기(popular) / 최신(new) / 무료(free) / 소장가능(paid) / 시네마급-장편(cinema)
--   get_home_feed 에 p_filter 추가 (전체는 기존 개인화 유지, 나머지는 단순 필터/정렬)
--   get_home_feed_count 도 p_filter 별 카운트
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_home_feed(integer, integer);
DROP FUNCTION IF EXISTS public.get_home_feed(integer, integer, text);

CREATE OR REPLACE FUNCTION public.get_home_feed(
  p_limit  integer DEFAULT 12,
  p_offset integer DEFAULT 0,
  p_filter text    DEFAULT 'all'
)
RETURNS SETOF public.videos
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_history boolean := false;
BEGIN
  -- ── 칩 필터: 최신 ──
  IF p_filter = 'new' THEN
    RETURN QUERY
    SELECT v.* FROM public.videos v
    WHERE v.show_on_home = true AND (v.visibility = 'public' OR v.visibility IS NULL) AND COALESCE(v.is_hidden, false) = false
    ORDER BY v.created_at DESC, v.id
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- ── 칩 필터: 인기 / 무료 / 소장가능 / 시네마급(장편) — 인기순 정렬 ──
  IF p_filter IN ('popular','free','paid','cinema') THEN
    RETURN QUERY
    SELECT v.* FROM public.videos v
    WHERE v.show_on_home = true AND (v.visibility = 'public' OR v.visibility IS NULL) AND COALESCE(v.is_hidden, false) = false
      AND (p_filter <> 'free'   OR COALESCE(v.price_standard, 0) = 0)
      AND (p_filter <> 'paid'   OR COALESCE(v.price_standard, 0) > 0)
      AND (p_filter <> 'cinema' OR COALESCE(v.show_on_ott, false) = true)
    ORDER BY (
      COALESCE(v.likes, 0) * 1.0
      + (SELECT COUNT(*) FROM public.video_views vv
         WHERE vv.video_id = v.id AND vv.is_valid = true
           AND vv.occurred_at >= now() - INTERVAL '7 days') * 2.0
    ) DESC, v.created_at DESC, v.id
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- ── 'all' (기본) — 개인화 ──
  IF v_user_id IS NOT NULL THEN
    SELECT (EXISTS (SELECT 1 FROM public.video_likes WHERE user_id = v_user_id)
         OR EXISTS (SELECT 1 FROM public.video_views WHERE viewer_user_id = v_user_id AND is_valid = true))
    INTO v_has_history;
  END IF;

  IF v_user_id IS NULL OR NOT v_has_history THEN
    RETURN QUERY
    SELECT v.* FROM public.videos v
    WHERE v.show_on_home = true AND (v.visibility = 'public' OR v.visibility IS NULL) AND COALESCE(v.is_hidden, false) = false
    ORDER BY (
      COALESCE(v.likes, 0) * 1.0
      + (SELECT COUNT(*) FROM public.video_views vv
         WHERE vv.video_id = v.id AND vv.is_valid = true
           AND vv.occurred_at >= now() - INTERVAL '7 days') * 2.0
    ) DESC, v.created_at DESC, v.id
    LIMIT p_limit OFFSET p_offset;
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
  SELECT v.*
  FROM public.videos v
  LEFT JOIN cat_pref cp ON cp.category = v.category
  LEFT JOIN genre_pref gp ON gp.genre = v.genre
  LEFT JOIN creator_pref crp ON crp.creator_id = v.creator_id
  LEFT JOIN viewed vw ON vw.video_id = v.id
  WHERE v.show_on_home = true
    AND (v.visibility = 'public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden, false) = false
  ORDER BY (
    COALESCE(cp.s, 0) * 1.0
    + COALESCE(gp.s, 0) * 1.0
    + COALESCE(crp.s, 0) * 1.0
    + COALESCE(v.likes, 0) * 0.05
    - (CASE WHEN vw.video_id IS NOT NULL THEN 4 ELSE 0 END)
  ) DESC, v.created_at DESC, v.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_home_feed(integer, integer, text) TO anon, authenticated;

-- ── 칩별 카운트 ──
DROP FUNCTION IF EXISTS public.get_home_feed_count();
DROP FUNCTION IF EXISTS public.get_home_feed_count(text);

CREATE OR REPLACE FUNCTION public.get_home_feed_count(p_filter text DEFAULT 'all')
RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM public.videos v
  WHERE v.show_on_home = true
    AND (v.visibility = 'public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden, false) = false
    AND (p_filter <> 'free'   OR COALESCE(v.price_standard, 0) = 0)
    AND (p_filter <> 'paid'   OR COALESCE(v.price_standard, 0) > 0)
    AND (p_filter <> 'cinema' OR COALESCE(v.show_on_ott, false) = true);
$$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_count(text) TO anon, authenticated;

-- 검증:
-- SELECT count(*) FROM public.get_home_feed(100,0,'free');
-- SELECT public.get_home_feed_count('paid');
