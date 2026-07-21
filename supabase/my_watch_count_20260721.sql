-- ════════════════════════════════════════════════════════════════════════════
-- 👁 내 시청 편수 count RPC (2026-07-21) — 마이페이지 헤더 스탯 상한 제거
--
--   [문제] 유저 코너 헤더의 "시청" 숫자를 get_my_watch_history(p_limit:500) 결과의
--     .length 로 세고 있었다. ① 501편부터 영원히 "500" 으로 고정되고
--     ② 숫자 하나를 얻으려고 제목·썸네일·크리에이터명까지 500행을 통째로 받았다.
--
--   [해결] DISTINCT video_id 개수만 세는 전용 RPC. 목록 RPC 와 같은 기준
--     (viewer_user_id = auth.uid(), 같은 영상은 1회) 이라 숫자가 일치한다.
--
--   ▣ is_valid 필터를 걸지 않는다 — get_my_watch_history 도 걸지 않으므로(전 기록 반환)
--     같은 기준을 유지해야 "시청 N" 과 시청 기록 탭의 항목 수가 어긋나지 않는다.
--
--   ▣ 보안: 내 데이터 전용. 인자 없음 + auth.uid() 내부 사용(IDOR 불가).
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_watch_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(COUNT(DISTINCT vv.video_id), 0)::INTEGER
  FROM public.video_views vv
  WHERE vv.viewer_user_id = auth.uid();
$fn$;

REVOKE ALL ON FUNCTION public.get_my_watch_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_watch_count() TO authenticated;

COMMENT ON FUNCTION public.get_my_watch_count IS
  '본인이 시청한 영상 편수(중복 제거). 마이페이지 헤더 스탯용 — 목록을 받아 세지 않기 위함';

COMMIT;

-- ── 검증 (선택) ──
SELECT 'get_my_watch_count 생성' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_my_watch_count')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '인자 없음(IDOR 불가)',
  CASE WHEN (SELECT bool_and(pronargs = 0) FROM pg_proc WHERE proname='get_my_watch_count')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'anon 차단',
  CASE WHEN NOT has_function_privilege('anon','public.get_my_watch_count()','EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '목록 RPC 와 동일 기준(viewer_user_id)',
  CASE WHEN (SELECT bool_and(prosrc ~ 'viewer_user_id') FROM pg_proc WHERE proname='get_my_watch_count')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
