-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 히어로 지정 RPC 심층방어 — REVOKE FROM PUBLIC, anon (2026-07-23)
--
--   결함(LOW·심층방어): admin_set_video_hero / admin_list_hero_video_ids 는 본문에
--     assert_admin() 게이트가 있어 **권한상승은 없으나**, 명시적 REVOKE 가 없어 함수의
--     기본 PUBLIC EXECUTE 에 의존한다. 형제 관리자 하드닝 파일(컬렉션·광고심사·스폰서십·
--     밀스톤 등)은 전부 `REVOKE ALL ... FROM PUBLIC, anon` 을 두는데 이 2종만 누락 —
--     방어 계층 비일관. (게이트 #7 은 admin_* 이름을 스캔하되 본문 assert_admin 이 있으면
--     통과시켜 anon EXECUTE 노출 자체는 감시 대상이 아님 → 여기서 명시 회수.)
--
--   조치: 본문·GRANT(authenticated) 는 그대로 두고 PUBLIC/anon 만 회수(멱등).
--
-- 적용: Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.admin_set_video_hero(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_list_hero_video_ids()          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_video_hero(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_hero_video_ids()         TO authenticated;

-- ── 검증 ──
SELECT 'hero RPC anon EXECUTE 회수' AS check_name,
  CASE WHEN NOT has_function_privilege('anon', 'public.admin_set_video_hero(TEXT, INTEGER)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.admin_list_hero_video_ids()', 'EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
