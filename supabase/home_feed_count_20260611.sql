-- ════════════════════════════════════════════════════════════════════════════
-- 🛑 SUPERSEDED — 재실행 금지 (2026-07-14 표기)
--   이 파일의 0-인자 get_home_feed_count() 는 옛 `episode_number=1`(1화-only) 규칙이라
--   재실행 시 1화 숨김 시리즈를 0으로 세는 배지 과소표시 회귀. 정본은
--   home_feed_chip_filter_20260611.sql 의 get_home_feed_count(p_filter text)
--   (NOT EXISTS 대표작 규칙, 2026-07-13 동기화) — 그 파일이 이 0-인자 버전을 DROP 한다.
--   프론트는 항상 p_filter 를 넘겨 1-인자를 호출하므로 이 파일은 이력 보존용.
-- ════════════════════════════════════════════════════════════════════════════
-- 홈피드 전체 영상 수 (2026-06-11, 2026-06-25 시리즈 필터 추가)
--   DISCOVERY FILMS 배지를 "로드된 수"가 아니라 "전체 수"로 표시하기 위함.
--   get_home_feed 의 포함 조건과 동일해야 함: show_on_home AND public(or null) AND not hidden
--   AND 시리즈 1화만(2화+ 후속화는 피드에서 제외되므로 카운트에서도 제외 — 배지 과대표시 버그 수정)
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_home_feed_count()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT count(*)::int FROM public.videos v
  WHERE v.show_on_home = true
    AND (v.visibility = 'public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden, false) = false
    AND (v.series_id IS NULL OR COALESCE(v.episode_number, 1) = 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_count() TO anon, authenticated;

-- 검증: SELECT public.get_home_feed_count();
