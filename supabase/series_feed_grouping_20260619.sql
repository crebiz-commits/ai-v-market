-- ════════════════════════════════════════════════════════════════════════════
-- 시리즈 피드 그룹화 (Phase 2) — 넷플릭스식 "시리즈는 카드 1개" (2026-06-19)
--
-- 규칙: 피드(홈/시네마/OTT/장르)에서 시리즈는 1화(대표)만 노출 → 카드 하나로 묶임.
--   조건:  series_id IS NULL  OR  COALESCE(episode_number,1) = 1
--   (단일 영상이거나 시리즈의 1화면 노출. 2화 이상은 피드에서 숨기고, 상세페이지 회차목록으로만 접근)
--
-- ⚠️ 모든 피드의 근간(v_available_videos / get_home_feed) 수정 — 기존 로직 100% 보존 + 필터 1줄만 추가.
-- 적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run.
-- 검증: 하단 주석.
--
-- 🛑🛑 경고(2026-07-04): 아래 get_home_feed(integer,integer,text) 는 SUPERSEDED — **이 파일 전체 재실행 금지**.
--   이 파일의 get_home_feed 는 RETURNS SETOF public.videos(=SELECT v.*) 라, 재적용 시
--   moderation_status/score/categories/error 가 anon 에 재노출된다(내부컬럼 유출).
--   보안 정본(SSOT) = get_home_feed_safe_columns_20260620.sql (RETURNS SETOF v_home_feed_public).
--   시리즈 1화 필터 변경이 필요하면 그 SSOT 파일에 반영해 적용할 것.
--   v_available_videos / get_home_feed_count 만 필요하면 해당 블록만 개별 실행.
--   재발 감지: 게이트 #6 (_verify_security_invariants_20260628.sql).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. v_available_videos — 시네마/OTT/장르 RPC의 근간 뷰.
--    기존 컬럼 순서 유지 + 끝에 series_id/episode_number/series_episode_count 추가 + 1화만 필터.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_available_videos AS
SELECT
  v.id,
  v.title,
  v.thumbnail,
  v.video_url,
  v.creator,
  v.creator_id,
  v.category,
  v.tags,
  v.ai_tool,
  v.duration,
  v.duration_seconds,
  v.views,
  v.likes,
  v.price_standard,
  v.show_on_home,
  v.show_on_cinema,
  v.show_on_ott,
  v.highlight_start,
  v.highlight_end,
  v.created_at,
  p.display_name AS creator_display_name,
  p.avatar_url AS creator_avatar,
  v.genre,
  v.series_id,
  v.episode_number,
  (SELECT COUNT(*) FROM public.videos v2 WHERE v2.series_id = v.series_id)::int AS series_episode_count
FROM public.videos v
LEFT JOIN public.profiles p ON p.id = v.creator_id
WHERE
  COALESCE(v.visibility, 'public') = 'public'
  AND COALESCE(v.is_hidden, false) = false
  AND (v.series_id IS NULL OR COALESCE(v.episode_number, 1) = 1);  -- 시리즈는 1화만 노출

-- ────────────────────────────────────────────────────────────────────────────
-- 2. get_home_feed — 4개 분기 모두 동일 필터 추가 (기존 로직 보존)
-- ────────────────────────────────────────────────────────────────────────────
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
      AND (v.series_id IS NULL OR COALESCE(v.episode_number, 1) = 1)
    ORDER BY v.created_at DESC, v.id
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- ── 칩 필터: 인기 / 무료 / 소장가능 / 시네마급(장편) — 인기순 정렬 ──
  IF p_filter IN ('popular','free','paid','cinema') THEN
    RETURN QUERY
    SELECT v.* FROM public.videos v
    WHERE v.show_on_home = true AND (v.visibility = 'public' OR v.visibility IS NULL) AND COALESCE(v.is_hidden, false) = false
      AND (v.series_id IS NULL OR COALESCE(v.episode_number, 1) = 1)
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
      AND (v.series_id IS NULL OR COALESCE(v.episode_number, 1) = 1)
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
    AND (v.series_id IS NULL OR COALESCE(v.episode_number, 1) = 1)
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

-- ────────────────────────────────────────────────────────────────────────────
-- 3. get_home_feed_count — 동일 필터 추가
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_home_feed_count(text);

CREATE OR REPLACE FUNCTION public.get_home_feed_count(p_filter text DEFAULT 'all')
RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM public.videos v
  WHERE v.show_on_home = true
    AND (v.visibility = 'public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden, false) = false
    AND (v.series_id IS NULL OR COALESCE(v.episode_number, 1) = 1)
    AND (p_filter <> 'free'   OR COALESCE(v.price_standard, 0) = 0)
    AND (p_filter <> 'paid'   OR COALESCE(v.price_standard, 0) > 0)
    AND (p_filter <> 'cinema' OR COALESCE(v.show_on_ott, false) = true);
$$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_count(text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT count(*) FROM public.get_home_feed(100,0,'all');   -- 시리즈 2화+는 빠져야 함
--   SELECT id, series_id, episode_number, series_episode_count FROM public.v_available_videos WHERE series_id IS NOT NULL;  -- 1화만, count 채워짐
-- ════════════════════════════════════════════════════════════════════════════
