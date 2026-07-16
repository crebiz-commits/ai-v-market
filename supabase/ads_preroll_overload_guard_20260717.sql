-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ pick_random_video_preroll 무인자(SETOF ads) 오버로드 제거 + 드리프트 게이트 (2026-07-17)
--
--   [갭] 정본은 admin_audit_hardening_20260714.sql ⑥ 의 pick_random_video_preroll(text)
--     — 9개 안전컬럼 TABLE + status='approved' + 예산필터. 그러나 옛 파일
--     (ads_video_preroll.sql / phase8_5_ad_budget_accounting.sql)에 무인자
--     pick_random_video_preroll() = SETOF public.ads(budget_krw/spent_krw/owner_id/
--     review_note **전 내부컬럼**, status 필터 없음, 기본 PUBLIC EXECUTE) 판이 있음.
--     content_policy_v2_vast_fix 가 이미 DROP 했으나, 옛 파일 재실행 시 별개 오버로드로
--     되살아나 안전본 ⑥ 를 우회 → anon 이 내부컬럼 노출 + 미승인/예산소진 광고 서빙.
--     이를 잡는 게이트가 없어 무증상 회귀.
--   [수정] 무인자 판 명시 DROP(멱등) + 게이트 #17(오버로드 1개 & 내부컬럼 미반환) 신설.
--
--   적용: Supabase SQL Editor → Run (멱등). 게이트는 _verify_security_invariants #17.
-- ════════════════════════════════════════════════════════════════════════════

-- 안전본은 (text) 오버로드 — 무인자 SETOF ads 판만 제거(안전본은 건드리지 않음)
DROP FUNCTION IF EXISTS public.pick_random_video_preroll();

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 오버로드 1개여야:
--   SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='pick_random_video_preroll';   -- 1
--   -- 반환타입에 내부컬럼(budget_krw) 없어야:
--   SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='pick_random_video_preroll';
-- ════════════════════════════════════════════════════════════════════════════
