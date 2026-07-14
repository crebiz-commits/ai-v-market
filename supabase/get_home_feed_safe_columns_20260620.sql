-- ════════════════════════════════════════════════════════════════════════════
-- 🛑 SUPERSEDED — 재실행 금지 (2026-07-14 표기)
--   이 파일은 두 가지가 낡음:
--     ① v_home_feed_public 정의에 v.views 컬럼이 없음 → 정본은 search_feed_audit2_20260710.sql
--        (v.views 추가). 이 파일 재실행 시 CREATE OR REPLACE VIEW 컬럼 축소로 실패하거나
--        홈/디스커버리 카드 조회수가 사라짐.
--     ② 아래 get_home_feed(SETOF) 의 시리즈 필터가 옛 `episode_number=1`(1화-only) →
--        재실행 시 골드베인식 "1화 숨김 → 시리즈 증발" 회귀. 대표작 정본은
--        fix_series_feed_representative_20260712.sql(첫 노출가능 에피소드 NOT EXISTS).
--   ※ 현재 홈피드 호출부는 get_home_feed(SETOF)를 쓰지 않음(get_home_feed_order +
--     get_home_feed_by_ids = home_feed_frozen_order_20260704.sql). 이 파일은 이력 보존용.
-- ════════════════════════════════════════════════════════════════════════════
-- 홈피드 감사 #6 — get_home_feed 내부 컬럼 노출 차단 (2026-06-20)
--
--   문제: get_home_feed 가 RETURNS SETOF public.videos + SELECT v.* 라,
--         공개 영상의 모더레이션 내부값(moderation_status/score/categories/error)까지
--         anon 에게 그대로 전달됨(운영 내부정보).
--   수정: 모더레이션 내부필드만 제외한 "투영 뷰"(v_home_feed_public)를 만들고,
--         get_home_feed 가 RETURNS SETOF 그 뷰 로 반환 → 내부필드 비노출.
--         ※ WHERE/정렬/페이지네이션 로직은 series_feed_grouping_20260619.sql 기준 100% 보존.
--         ※ seed/prompt/ai_model_version 은 업로드 가이드가 'AI 증빙'으로 공개를 권장하는
--           제작 출처정보라 유지(의도적 공개). 가린 건 모더레이션 운영필드뿐.
--
--   안전성: RETURNS TABLE 로 컬럼 타입을 손으로 나열하지 않고 SETOF 뷰 + SELECT vp.* 라
--           타입 자동추론 → 컬럼/타입 불일치로 함수가 깨질 위험 제거.
--   적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등). 호출처는 DiscoveryFeed 뿐.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. 투영 뷰 — videos 의 "공개 안전 컬럼"만 (moderation_* 제외). 순수 투영(필터 없음).
--    함수가 SECURITY DEFINER 로 내부에서만 읽음 → anon 에 GRANT 하지 않음(새 공개면 안 만듦).
--    mapVideoRow(프론트)가 읽는 31개 필드 + 함수 WHERE/정렬용 내부 플래그를 모두 포함.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_home_feed_public AS
SELECT
  v.id, v.thumbnail, v.title, v.creator, v.creator_id, v.likes, v.price_standard,
  v.duration, v.duration_seconds, v.resolution, v.ai_tool, v.category, v.genre,
  v.video_url, v.age_rating, v.description, v.tags, v.ai_model_version, v.prompt,
  v.seed, v.director, v.writer, v.composer, v.cast_credits, v.production_year,
  v.language, v.subtitle_language, v.visibility, v.highlight_start, v.highlight_end,
  v.series_id,
  -- 함수 내부 WHERE/정렬에 필요한 플래그(민감하지 않음)
  v.show_on_home, v.show_on_ott, v.is_hidden, v.episode_number, v.created_at
FROM public.videos v;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. get_home_feed — RETURNS SETOF videos → SETOF v_home_feed_public 로 교체.
--    4개 분기 WHERE/정렬/LIMIT 동일, FROM public.videos v → public.v_home_feed_public vp
--    (개인화 분기의 CTE들은 videos 직접 사용 — 그대로 유지)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_home_feed(integer, integer, text);

CREATE OR REPLACE FUNCTION public.get_home_feed(
  p_limit  integer DEFAULT 12,
  p_offset integer DEFAULT 0,
  p_filter text    DEFAULT 'all'
)
RETURNS SETOF public.v_home_feed_public
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_history boolean := false;
BEGIN
  -- ── 칩 필터: 최신 ──
  IF p_filter = 'new' THEN
    RETURN QUERY
    SELECT vp.* FROM public.v_home_feed_public vp
    WHERE vp.show_on_home = true AND (vp.visibility = 'public' OR vp.visibility IS NULL) AND COALESCE(vp.is_hidden, false) = false
      AND (vp.series_id IS NULL OR COALESCE(vp.episode_number, 1) = 1)
    ORDER BY vp.created_at DESC, vp.id
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- ── 칩 필터: 인기 / 무료 / 소장가능 / 시네마급(장편) — 인기순 정렬 ──
  IF p_filter IN ('popular','free','paid','cinema') THEN
    RETURN QUERY
    SELECT vp.* FROM public.v_home_feed_public vp
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
    ) DESC, vp.created_at DESC, vp.id
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
    SELECT vp.* FROM public.v_home_feed_public vp
    WHERE vp.show_on_home = true AND (vp.visibility = 'public' OR vp.visibility IS NULL) AND COALESCE(vp.is_hidden, false) = false
      AND (vp.series_id IS NULL OR COALESCE(vp.episode_number, 1) = 1)
    ORDER BY (
      COALESCE(vp.likes, 0) * 1.0
      + (SELECT COUNT(*) FROM public.video_views vv
         WHERE vv.video_id = vp.id AND vv.is_valid = true
           AND vv.occurred_at >= now() - INTERVAL '7 days') * 2.0
    ) DESC, vp.created_at DESC, vp.id
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
  SELECT vp.*
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
  ) DESC, vp.created_at DESC, vp.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_home_feed(integer, integer, text) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 함수가 모더레이션 컬럼을 안 내보내는지 (아래 결과 컬럼에 moderation_* 없어야 함)
--   SELECT * FROM public.get_home_feed(3,0,'all');
--   -- 개수/동작 보존 확인
--   SELECT count(*) FROM public.get_home_feed(100,0,'all');
--   SELECT count(*) FROM public.get_home_feed(100,0,'new');
--   SELECT count(*) FROM public.get_home_feed(100,0,'free');
-- ════════════════════════════════════════════════════════════════════════════
