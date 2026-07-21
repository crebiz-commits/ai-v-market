-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 시청 기록 삭제 = 익명화로 전환 (2026-07-22) — 조회수·분석·구독정산 소급 파괴 차단
--
--   [결함] 마이페이지 '기록' 탭의 삭제(개별/전체)가 video_views 행을 **물리 DELETE** 했다.
--     그런데 video_views 는 시청 기록 전용 테이블이 아니라 플랫폼 집계의 SSOT 다:
--
--       · 구독 수익풀 pro-rata  — calculate_monthly_revenue
--                                  v_total_ott_watch := SUM(vv.watch_seconds) WHERE is_valid   ← 분모
--                                  ott_watch CTE      := SUM(vv.watch_seconds) GROUP BY creator ← 분자
--       · 크리에이터 실제 조회수 — creator_video_view_counts_20260703
--                                 ("실제 조회수는 video_views(is_valid=true) 이벤트 수")
--       · 크리에이터 분석/대시보드 — phase20(unique_viewers·avg_watch_ratio)·phase21
--       · 추천·트렌딩·관리자 통계(24h 시청시간)
--
--     ⇒ 시청자 1명이 '전체 삭제'를 누르면 **이미 발생한 크리에이터의 조회수·분석이
--        소급해서 줄어들고, 아직 확정(paid)되지 않은 달의 구독 정산 배분액까지 감소**한다.
--        시청자의 프라이버시 조작이 제3자(크리에이터)의 돈을 깎는 구조 — 재계산만 돌려도 재현.
--
--   [근거] 이 테이블의 DDL 이 이미 정책을 선언해 두었다(phase8_video_views.sql):
--
--       viewer_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL
--                                                      ^^^^^^^^^^^^^^^^^^
--     "계정이 삭제돼도 행은 보존하고 개인 식별 연결만 끊는다" = 집계 기반 보존이 스키마의 계약.
--     실제로 계정 삭제(phase27_user_data_rights)도 video_views 를 DELETE 하지 않는다.
--     기록 삭제만 이 계약을 어기고 물리 삭제하고 있었다.
--
--   [조치] DELETE → **익명화 UPDATE**(viewer_user_id = NULL).
--     · 사용자 관점: 목록 RPC·카운트 RPC·데이터 다운로드가 모두 viewer_user_id = auth.uid()
--       기준이므로 행이 즉시 사라진다(되돌릴 수 없음 — 확인문구 그대로 유효).
--     · 집계 관점: watch_seconds·is_valid·occurred_at·creator_id 가 남아 조회수·정산 불변.
--     · 계정 삭제(ON DELETE SET NULL)와 정확히 같은 최종 상태 → 경로 간 일관성 확보.
--
--     ▣ ip_address 는 **의도적으로 보존**한다. ① 계정 삭제 경로(SET NULL)도 IP 는 남긴다
--       ② track_video_view 의 24시간 IP 중복 차단이 이 값을 참조 — 지우면 "시청→기록삭제→
--       재시청" 반복으로 유효 조회수를 무한 부풀릴 수 있다(정산 어뷰징). 개인 식별 연결
--       (viewer_user_id)은 끊기므로 사용자에게 귀속되지 않는다.
--
--   [동봉] get_my_watch_count 필터 정합성 — 헤더 '시청 N' ≠ 기록 탭 항목 수 버그
--     목록 RPC 는 삭제·숨김 영상을 제외하는데 카운트 RPC 는 제외하지 않아,
--     본 뒤 숨겨진/삭제된 영상이 있으면 헤더 숫자만 더 크게 나왔다. 같은 JOIN·필터로 통일.
--
--   ★ 세 함수의 새 정본. phase17_watch_history.sql / my_watch_count_20260721.sql
--     **재실행 금지**(물리 DELETE·필터 누락으로 회귀). 보안 게이트 #31·#32 가 감시.
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ① 시청 기록 '삭제' = 익명화 (집계 기반 보존)
CREATE OR REPLACE FUNCTION public.delete_my_watch_history(
  p_video_id TEXT DEFAULT NULL    -- NULL이면 전체, 특정 영상은 해당 영상만
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user_id UUID := auth.uid();
  v_count   INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- 물리 삭제가 아니라 개인 식별 연결만 끊는다(ON DELETE SET NULL 과 동일한 최종 상태).
  -- 크리에이터의 조회수·시청시간·정산 기반은 그대로 남는다.
  UPDATE public.video_views
     SET viewer_user_id = NULL
   WHERE viewer_user_id = v_user_id
     AND (p_video_id IS NULL OR video_id = p_video_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;

COMMENT ON FUNCTION public.delete_my_watch_history IS
  '본인 시청 기록 삭제(특정 영상 또는 전체). 물리 삭제가 아닌 익명화(viewer_user_id=NULL) — '
  '크리에이터 조회수·분석·구독정산 기반(video_views)을 소급 훼손하지 않기 위함. 2026-07-22';

-- ② 내 시청 편수 — 목록 RPC 와 동일 필터(삭제·숨김 영상 제외)
CREATE OR REPLACE FUNCTION public.get_my_watch_count()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(COUNT(DISTINCT vv.video_id), 0)::INTEGER
  FROM public.video_views vv
  JOIN public.videos v ON v.id = vv.video_id      -- 삭제된 영상 제외(= 목록 RPC 의 v.id IS NOT NULL)
  WHERE vv.viewer_user_id = auth.uid()
    AND COALESCE(v.is_hidden, false) = false;     -- 숨김 영상 제외(목록 RPC 와 동일)
$fn$;

COMMENT ON FUNCTION public.get_my_watch_count IS
  '본인이 시청한 영상 편수(중복 제거, 삭제·숨김 영상 제외 — get_my_watch_history 와 동일 기준). '
  '마이페이지 헤더 스탯용';

-- ③ 권한 — phase17 정의에 GRANT/REVOKE 구문이 없어 PUBLIC 기본 EXECUTE 상태였다.
--    본인 데이터 전용 RPC 이므로 anon 회수(로그인 사용자만).
REVOKE ALL ON FUNCTION public.get_my_watch_history(INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_my_watch_history(TEXT)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_watch_count()                   FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_watch_history(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_watch_history(TEXT)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_watch_count()                   TO authenticated;

COMMIT;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '기록삭제=익명화(물리 DELETE 제거)' AS check_name,
  CASE WHEN (SELECT prosrc !~* 'DELETE\s+FROM\s+public\.video_views'
                AND prosrc ~* 'UPDATE\s+public\.video_views'
             FROM pg_proc WHERE proname = 'delete_my_watch_history')
    THEN '✅ PASS' ELSE '🔴 FAIL — 정산·조회수 소급 파괴' END AS status
UNION ALL
SELECT '시청편수 = 목록과 동일 필터(숨김 제외)',
  CASE WHEN (SELECT prosrc ~ 'is_hidden' FROM pg_proc WHERE proname = 'get_my_watch_count')
    THEN '✅ PASS' ELSE '🔴 FAIL — 헤더 숫자와 목록 항목수 불일치' END
UNION ALL
SELECT 'anon 실행권한 회수',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname IN ('get_my_watch_history','delete_my_watch_history','get_my_watch_count')
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
