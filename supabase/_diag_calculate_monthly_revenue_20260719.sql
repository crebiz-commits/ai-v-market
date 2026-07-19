-- ════════════════════════════════════════════════════════════════════════════
-- 🔎 진단 (read-only) — calculate_monthly_revenue 라이브 상태 확인 (2026-07-19)
--
--   목적: 활동 로그 감사 F4 — 이 함수(월 정산 = 크리에이터 지급 원장 생성·덮어쓰기)가
--         admin_logs 에 아무 기록도 남기지 않아 "누가·언제·어느 기간을 재계산했는지"
--         추적이 불가능하다. 로깅을 추가하려면 CREATE OR REPLACE 로 본문 전체를 다시
--         써야 하는데, 이 프로젝트는 **저장소 ≠ 라이브** 전례가 바로 이 함수에서 있었다
--         (_diag_settlement_gate_20260718.sql 이 라이브에서 has_assert_admin=false 검출).
--         저장소 본문으로 맹목 덮어쓰면 라이브에 적용돼 있던 수정이 되돌아갈 수 있으므로,
--         **먼저 라이브 실제 상태를 확인**한다.
--
--   사용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run.
--         (결과 표를 스크린샷으로 주시면 됩니다. read-only — 아무것도 변경하지 않음)
--
--   기대값(저장소 = calculate_monthly_revenue_assert_admin_20260718.sql 기준):
--     overloads = 1, security_definer = true,
--     has_assert_admin = true      ← false 면 0718 파일이 라이브에 미적용(구판이 살아있음)
--     logs_to_admin_logs = false   ← 지금 고치려는 감사 누락(예상대로 false)
--     has_search_path = true
--
--   ▶ 요약 결과가 기대값과 다르면(특히 has_assert_admin=false), 저장소 본문을 쓰면 안 되므로
--     아래 [STEP 2] 주석을 풀어 라이브 전체 정의를 덤프한 뒤 그 결과를 전달해 주세요.
--     그 본문을 기준으로 로깅만 얹겠습니다.
-- ════════════════════════════════════════════════════════════════════════════

-- ── [STEP 2] 라이브 전체 정의 덤프 (STEP 1B 지문이 불일치할 때만 Run) ──
-- SELECT pg_get_functiondef(p.oid) AS live_definition
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public' AND p.proname = 'calculate_monthly_revenue';

-- ── [STEP 1] 요약 (완료됨 — 2026-07-19 결과: assert_admin=true, admin_logs=false, body=9656) ──
SELECT
  p.oid::regprocedure::TEXT                                   AS signature,
  (SELECT count(*) FROM pg_proc p2 JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
     WHERE n2.nspname = 'public' AND p2.proname = 'calculate_monthly_revenue')::INT AS overloads,
  p.prosecdef                                                 AS security_definer,
  (p.prosrc ~ 'assert_admin')                                 AS has_assert_admin,
  (p.prosrc ~ 'admin_logs')                                   AS logs_to_admin_logs,
  EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
            WHERE c LIKE 'search_path=%')                     AS has_search_path,
  length(p.prosrc)                                            AS body_chars,
  -- 저장소 본문의 특징 문자열이 라이브에도 있는지(=0718 판이 살아있는지 교차확인)
  (p.prosrc ~ 'payout_status')                                AS mentions_payout_status,
  (p.prosrc ~ 'ON CONFLICT')                                  AS has_on_conflict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'calculate_monthly_revenue';

-- ════════════════════════════════════════════════════════════════════════════
-- [STEP 1B] ★ 본문 동일성 확증 — 줄바꿈 제거 지문 대조  ← 이게 마지막 = 이 결과가 표시됨
--
--   STEP 1 에서 body_chars=9656 인데 저장소 본문은 9447자. 209자 차이의 정체:
--     저장소 9447자 + LF 210개 = 9657 (CRLF 로 붙여넣어 제출한 경우) ≈ 라이브 9656 (1자 차)
--   → 로직 차이가 아니라 **줄바꿈(CRLF)** 때문일 가능성이 압도적. 줄바꿈을 완전히 제거하고
--     길이·MD5 를 비교하면 순수 내용만 대조된다.
--
--   저장소 기준값(2026-07-19 계산):
--     stripped_len = 9237
--     stripped_md5 = 3542dccc15ae0b39c55f8fed43520740
--
--   ▶ 둘 다 일치 → 라이브 = 저장소(줄바꿈만 다름). 저장소 본문에 admin_logs 로깅만 얹어도 안전.
--   ▶ 하나라도 불일치 → 실제 드리프트. 맨 위 [STEP 2] 주석을 풀어 라이브 전체 정의를 덤프하고
--     그 결과를 전달해 주세요(라이브 본문 기준으로 로깅을 얹겠습니다).
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  length(replace(replace(p.prosrc, chr(13), ''), chr(10), '')) AS stripped_len,
  md5(replace(replace(p.prosrc, chr(13), ''), chr(10), ''))    AS stripped_md5
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'calculate_monthly_revenue';
