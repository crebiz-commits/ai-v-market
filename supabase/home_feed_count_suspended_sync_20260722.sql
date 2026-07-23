-- ════════════════════════════════════════════════════════════════════════════
-- 🔢 홈피드 배지 count 를 order 와 동기화 — 정지 크리에이터 제외 (2026-07-22)
--
--   [결함] feed_home_exclude_suspended_20260722 로 get_home_feed_order 는 정지
--     크리에이터를 제외했으나, 짝인 get_home_feed_count(p_filter) 에는 그 필터가
--     없다. → 정지 계정이 생기면 **배지 숫자('N VIDEOS')가 실제 스크롤되는 개수보다
--     크게** 표시된다(칩·시리즈 로직은 이미 동기화돼 있고 is_suspended 만 어긋남).
--     현재 정지 0명이라 21=21 로 일치하지만, 정지 발생 시 즉시 벌어진다.
--
--   [조치] count 에도 order 와 동일한 정지 제외 서브쿼리 추가. order 가 vp.creator_id
--     로 profiles 를 확인하듯, count 도 v.creator_id 로 확인.
--
--   ★ get_home_feed_count(p_filter text) 의 새 정본.
--     home_feed_chip_filter_20260611.sql 의 이 함수 재실행 금지(필터 소실).
--     본문은 그 파일 원문 + 서브쿼리 1개. (0-인자 레거시판 get_home_feed_count() 는
--     프론트가 안 쓰므로 손대지 않음 — 그 판은 home_feed_count_20260611 이 정본.)
--   적용: Supabase SQL Editor → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_home_feed_count(p_filter text DEFAULT 'all')
RETURNS integer LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT count(*)::int FROM public.videos v
  WHERE v.show_on_home = true
    AND (v.visibility = 'public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden, false) = false
    -- ★ 정지 크리에이터 제외(2026-07-22) — order 와 동기화. 없으면 배지 과대표시.
    AND NOT EXISTS (SELECT 1 FROM public.profiles psusp
                    WHERE psusp.id = v.creator_id AND psusp.is_suspended = true)
    AND (p_filter <> 'free'   OR COALESCE(v.price_standard, 0) = 0)
    AND (p_filter <> 'paid'   OR COALESCE(v.price_standard, 0) > 0)
    AND (p_filter <> 'cinema' OR COALESCE(v.show_on_ott, false) = true)
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

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '홈피드 count 정지 제외(order 동기화)' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'is_suspended' FROM pg_proc
             WHERE proname='get_home_feed_count' AND pronargs=1)
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '칩·시리즈 로직 보존',
  CASE WHEN (SELECT prosrc ~ 'price_standard' AND prosrc ~ 'episode_number' FROM pg_proc
             WHERE proname='get_home_feed_count' AND pronargs=1)
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
