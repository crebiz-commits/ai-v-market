-- ════════════════════════════════════════════════════════════════════════════
-- 🔎 진단 (read-only) — classify_video_placement 라이브 상태 확인 (2026-07-20)
--
--   목적: 수익 정책 감사 — 관리자 화면의 "신규 영상 광고 제외 기간(48시간)"이 실제로는
--     이 트리거에 `interval '48 hours'` 로 하드코딩돼 있어, 값을 바꿔도 아무 효과가 없다.
--     (get_platform_setting('new_video_grace_hours') 호출이 저장소 전체에 0곳)
--     설정을 읽도록 고치려면 CREATE OR REPLACE 로 본문을 다시 써야 하는데, 이 함수는
--     3개 파일에 중복 정의돼 있다:
--       · phase1_video_placement.sql        (최초)
--       · content_policy_v2.sql             (중간)
--       · cinema_rpc_hardening_20260708.sql (최신 = 저장소 기준 정본)
--     저장소 최신판을 라이브라고 가정하고 덮어쓰면, 라이브에만 있던 수정이 되돌아갈 수
--     있다(이 프로젝트는 calculate_monthly_revenue 에서 실제로 저장소≠라이브 전례가 있었음).
--
--   사용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. (결과 표 스크린샷)
--         read-only — 아무것도 변경하지 않음.
--
--   기대값 (저장소 cinema_rpc_hardening_20260708.sql 기준, 2026-07-20 계산):
--     stripped_len  = 1450
--     stripped_md5  = 3f2dac7e1dc25c987f540e2dbba51731
--     has_48h       = true   ← 지금 고치려는 하드코딩
--     reads_cinema_min = true  (같은 함수가 이미 get_platform_setting 을 쓰는 증거)
--     reads_grace   = false  ← 이게 결함(설정을 안 읽음)
--
--   ▶ len·md5 가 모두 일치 → 라이브 = 저장소. 그 본문에 grace 설정 읽기만 얹어 안전하게 교체.
--   ▶ 하나라도 불일치 → 실제 드리프트. 아래 [전체 정의 덤프] 주석을 풀어 결과를 전달해 주세요.
--     라이브 본문 기준으로 고치겠습니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── [불일치 시에만] 라이브 전체 정의 덤프 ──
-- SELECT pg_get_functiondef(p.oid) AS live_definition
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'classify_video_placement';

-- ── 요약 (이 결과를 보여주세요) ──
SELECT
  p.oid::regprocedure::TEXT AS signature,
  (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
     WHERE n2.nspname='public' AND p2.proname='classify_video_placement')::INT AS overloads,
  length(replace(replace(p.prosrc, chr(13), ''), chr(10), ''))  AS stripped_len,
  md5(replace(replace(p.prosrc, chr(13), ''), chr(10), ''))     AS stripped_md5,
  (p.prosrc ~ '48 hours')                     AS has_48h,
  (p.prosrc ~ 'cinema_min_duration_seconds')  AS reads_cinema_min,
  (p.prosrc ~ 'new_video_grace_hours')        AS reads_grace,
  -- 트리거가 videos 에 실제 연결돼 있는가(연결 안 돼 있으면 함수만 고쳐도 무의미)
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
     JOIN pg_namespace n3 ON n3.oid=c.relnamespace
   WHERE n3.nspname='public' AND c.relname='videos'
     AND t.tgfoid = p.oid AND NOT t.tgisinternal)::INT AS trigger_count
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'classify_video_placement';
