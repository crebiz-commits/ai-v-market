-- ════════════════════════════════════════════════════════════════════════════
-- 홈피드 페이지네이션 완전 안정화 (H3, 2026-07-04) — "순서 고정 + 배치 조회"
--
--   문제: get_home_feed 의 ORDER BY 가 now()·실시간 7일 조회수에 의존 → 페이지 사이
--         순위가 흔들려 경계에서 영상이 누락(중복은 dedup 이 가리지만 누락은 무음).
--   해결: (B) 세션 시작 시 랭킹된 id 배열을 1회 확정(get_home_feed_order) → 클라가
--         그 순서를 고정 보관하고 12개씩 잘라 get_home_feed_by_ids 로 상세를 순서대로
--         받아 렌더. 순서가 얼어 있어 누락·중복 수학적으로 0. 새로고침 때만 순서 갱신.
--
--   랭킹 로직은 get_home_feed_safe_columns_20260620.sql 와 100% 동일(4개 분기).
--   반환은 v_home_feed_public(모더레이션 컬럼 제외) 유지 → 내부컬럼 비노출.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. get_home_feed_order — 현재 칩/개인화 랭킹으로 정렬된 "video_id 전체 목록"(LIMIT 없음).
--    세션당 1회 호출 → 클라가 이 순서를 고정. (id 만 반환이라 가벼움)
-- ────────────────────────────────────────────────────────────────────────────
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
      AND (vp.series_id IS NULL OR COALESCE(vp.episode_number, 1) = 1)
    ORDER BY vp.created_at DESC, vp.id;
    RETURN;
  END IF;

  -- 인기 / 무료 / 소장가능 / 시네마급
  IF p_filter IN ('popular','free','paid','cinema') THEN
    RETURN QUERY
    SELECT vp.id FROM public.v_home_feed_public vp
    WHERE vp.show_on_home = true AND (vp.visibility = 'public' OR vp.visibility IS NULL) AND COALESCE(vp.is_hidden, false) = false
      AND (vp.series_id IS NULL OR COALESCE(vp.episode_number, 1) = 1)
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
      AND (vp.series_id IS NULL OR COALESCE(vp.episode_number, 1) = 1)
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
    AND (vp.series_id IS NULL OR COALESCE(vp.episode_number, 1) = 1)
  ORDER BY (
    COALESCE(cp.s, 0) * 1.0
    + COALESCE(gp.s, 0) * 1.0
    + COALESCE(crp.s, 0) * 1.0
    + COALESCE(vp.likes, 0) * 0.05
    - (CASE WHEN vw.video_id IS NOT NULL THEN 4 ELSE 0 END)
  ) DESC, vp.created_at DESC, vp.id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_order(text) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. get_home_feed_by_ids — 주어진 id 배열을 "입력 순서 그대로" 안전뷰로 반환.
--    현재 공개/비숨김 조건은 재확인(그 사이 숨겨진 영상은 제외 → 페이지가 살짝 짧을 수 있음).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_home_feed_by_ids(p_ids text[])
RETURNS SETOF public.v_home_feed_public
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT vp.* FROM public.v_home_feed_public vp
  WHERE vp.id = ANY(p_ids)
    AND vp.show_on_home = true
    AND (vp.visibility = 'public' OR vp.visibility IS NULL)
    AND COALESCE(vp.is_hidden, false) = false
  ORDER BY array_position(p_ids, vp.id);
$function$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_by_ids(text[]) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT count(*) FROM public.get_home_feed_order('all');   -- 전체 랭킹 id 수
--   SELECT count(*) FROM public.get_home_feed_order('new');
--   -- 순서보존 + 안전뷰(모더레이션 컬럼 없음):
--   SELECT id FROM public.get_home_feed_by_ids(
--     ARRAY(SELECT public.get_home_feed_order('all') LIMIT 5));
-- ════════════════════════════════════════════════════════════════════════════
