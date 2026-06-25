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
