-- ════════════════════════════════════════════════════════════════════════════
-- 홈피드 칩별 카운트 (2026-06-11, 2026-06-28 정리)
--   전체 / 인기(popular) / 최신(new) / 무료(free) / 소장가능(paid) / 시네마급-장편(cinema)
--   배지 "N VIDEOS" 표시용 칩별 카운트.
--
-- ⚠️ get_home_feed 함수 정의는 이 파일에서 제거됨(2026-06-28).
--    이 파일의 구버전 get_home_feed 는 RETURNS SETOF public.videos + SELECT v.* 라
--    moderation_* 내부 컬럼이 anon 에 노출됐음(홈피드 감사 #6에서 차단한 문제).
--    보안 정본은 get_home_feed_safe_columns_20260620.sql
--    (RETURNS SETOF v_home_feed_public — 동일 칩필터 로직 + 모더레이션 컬럼 제외 + 시리즈 1화 필터).
--    → 이 파일을 재실행해도 보안본을 덮어쓰지 않도록 count 함수만 남김.
--    get_home_feed 변경이 필요하면 get_home_feed_safe_columns_20260620.sql 을 수정/적용할 것.
-- 적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등)
-- ════════════════════════════════════════════════════════════════════════════

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
    AND (p_filter <> 'cinema' OR COALESCE(v.show_on_ott, false) = true)
    -- 시리즈 2화+ 후속화는 피드에서 제외되므로 카운트에서도 제외(배지 과대표시 버그 수정 2026-06-28)
    AND (v.series_id IS NULL OR COALESCE(v.episode_number, 1) = 1);
$$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_count(text) TO anon, authenticated;

-- 검증:
-- SELECT public.get_home_feed_count('all');
-- SELECT public.get_home_feed_count('paid');
