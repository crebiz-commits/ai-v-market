-- ════════════════════════════════════════════════════════════════════════════
-- 홈피드 전체 영상 수 (2026-06-11)
--   DISCOVERY FILMS 배지를 "로드된 수"가 아니라 "전체 수"로 표시하기 위함.
--   get_home_feed 의 포함 조건과 동일: show_on_home AND public(or null) AND not hidden
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
    AND COALESCE(v.is_hidden, false) = false;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_count() TO anon, authenticated;

-- 검증: SELECT public.get_home_feed_count();
