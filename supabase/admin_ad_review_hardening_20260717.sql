-- ════════════════════════════════════════════════════════════════════════════
-- 광고 심사 감사 — admin_review_ad / admin_list_pending_ads REVOKE 하드닝 (2026-07-17)
--
--   [갭] 두 관리자 RPC 가 GRANT ... TO authenticated 만 있고 REVOKE FROM PUBLIC/anon 이
--     없어 기본 PUBLIC EXECUTE 에 의존. 둘 다 본문 assert_admin 이 최종 게이트라 실유출은
--     없으나(게이트 #7 PASS), 같은 광고 도메인에서 #16(track_video_ad_event)이 정확히
--     "형제는 REVOKE 됐는데 이것만 기본 PUBLIC 잔존"에서 터졌음 → 일관 하드닝으로 표면 축소.
--   함수 본문은 무변경(심사 로직·알림·admin_logs 그대로). 권한만 정리.
--
--   보안: 두 함수 모두 SECURITY DEFINER + assert_admin + inline search_path(정본 유지).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.admin_review_ad(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_ad(uuid, boolean, text) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_list_pending_ads() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_ads() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT has_function_privilege('anon','public.admin_review_ad(uuid,boolean,text)','EXECUTE') AS r_anon,
--          has_function_privilege('anon','public.admin_list_pending_ads()','EXECUTE')        AS l_anon;
--     → 둘 다 false 여야 정상(authenticated 는 true, 런타임 assert_admin 이 실게이트)
-- ════════════════════════════════════════════════════════════════════════════
