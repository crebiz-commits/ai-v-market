-- ════════════════════════════════════════════════════════════════════════════
-- 라이브 드리프트 긴급 하드닝 (2026-07-03) — 프로덕션 점검서 발견된 실제 구멍 2건
--
-- 점검 결과(pg_proc 조회):
--   ④ confirm_payment 를 anon/authenticated 가 직접 EXECUTE 가능 (= true)  🔴
--   ⑤ record_ad_impression 오버로드 2개 (6-arg 무과금·무dedup 잔존)        🔴
--
-- 원인: 저장소엔 하드닝(REVOKE)이 있으나 라이브 재배포 과정에서 권한이
--       기본값(PUBLIC EXECUTE)으로 리셋됨 — 저장소↔라이브 드리프트.
--
-- 적용: Supabase SQL Editor → Run (멱등). 맨 아래 재점검 쿼리로 확인.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 🔴 ④ confirm_payment 직접호출 차단
--   악용: start_payment 로 pending 주문 생성(order_id 반환) → 토스 결제 없이
--         confirm_payment(order_id, ...) 직접 호출 → 무결제 완료주문 생성.
--   confirm_payment 는 SECURITY DEFINER 이고 caller 신원을 검증하지 않으며 토스
--   재검증도 못 함(DB 에 API 키 없음). Edge(toss-confirm)가 토스 검증 후 service_role
--   로만 호출해야 하므로 anon/authenticated/PUBLIC 에서 회수한다.
-- ────────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.confirm_payment(text, text, text, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.confirm_payment(text, text, text, timestamptz, jsonb)
  TO service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 🔴 ⑤ record_ad_impression 6-arg(무dedup·무과금) 오버로드 삭제
--   7-arg(uuid,text,text,int,bool,bool,text)=정본(dedup+과금) 만 남긴다.
--   6-arg 는 phase28_ad_diversification 에서 anon/authenticated 에 GRANT 까지 돼 있어
--   호출 시 광고주 과금 없이 크리에이터 수익만 부풀림(+ anon 스팸 가능).
--   6-arg 호출은 삭제 후 7-arg(기본값 p_viewer_key=NULL)로 안전 해소.
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS
  public.record_ad_impression(uuid, text, text, integer, boolean, boolean);

-- 정본 7-arg 도 직접호출은 Edge(service_role) 전용으로 유지(방어적 재확인)
REVOKE EXECUTE ON FUNCTION
  public.record_ad_impression(uuid, text, text, integer, boolean, boolean, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  public.record_ad_impression(uuid, text, text, integer, boolean, boolean, text)
  TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 재점검 (모두 안전값이어야 함):
--   ④ auth/anon 호출 = false, false
--   ⑤ 오버로드수 = 1
-- ════════════════════════════════════════════════════════════════════════════
SELECT
  (SELECT bool_or(has_function_privilege('authenticated', oid, 'EXECUTE'))
     FROM pg_proc WHERE proname='confirm_payment')       AS "④auth호출_false여야",
  (SELECT bool_or(has_function_privilege('anon', oid, 'EXECUTE'))
     FROM pg_proc WHERE proname='confirm_payment')       AS "④anon호출_false여야",
  (SELECT count(*) FROM pg_proc WHERE proname='record_ad_impression') AS "⑤오버로드수_1이어야";
