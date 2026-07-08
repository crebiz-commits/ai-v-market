-- ════════════════════════════════════════════════════════════════════════════
-- (일회용 조회) 드리프트 백필용 함수 정의 덤프 — 2026-07-08
--   admin_grant_premium / admin_crown_creator 가 라이브 DB엔 있는데 저장소 SQL엔
--   없음(2026-07-01 커밋이 프론트만 포함) → 실제 정의를 덤프해 저장소에 백필.
--   ※ 읽기 전용(SELECT만). 실행 후 결과 2행을 채팅에 붙여넣어 주세요.
-- ════════════════════════════════════════════════════════════════════════════
SELECT pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_grant_premium', 'admin_crown_creator');
