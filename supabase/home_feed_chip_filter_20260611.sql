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
    -- 시리즈 대표작 = 노출가능 에피소드 중 가장 앞 화(1화 숨김 시 다음 화) — 피드(order)와 동일 규칙.
    --   구식 `episode_number=1` 은 1화 숨김 시리즈를 0으로 세어 배지 과소표시(2026-07-13 동기화,
    --   fix_series_feed_representative_20260712.sql 의 대표작 규칙과 일치 유지할 것).
    AND (
      v.series_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM public.videos v3
        WHERE v3.series_id = v.series_id
          AND COALESCE(v3.is_hidden, false) = false
          AND COALESCE(v3.visibility, 'public') = 'public'
          AND COALESCE(v3.episode_number, 1) < COALESCE(v.episode_number, 1)
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_home_feed_count(text) TO anon, authenticated;

-- 검증:
-- SELECT public.get_home_feed_count('all');
-- SELECT public.get_home_feed_count('paid');
