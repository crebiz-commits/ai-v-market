-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 videos 직접 UPDATE 잠금 — self-approve·티어위조·편집 재검수 우회 차단 (2026-07-11)
--
--   검출: _verify_videos_update_rls_20260711.sql ③ = 🔴 REVIEW
--         (authenticated/anon 이 videos 테이블을 직접 UPDATE 가능).
--
--   문제: 편집 재검수 게이트(update_my_video_metadata)와 티어 산출(classify 트리거),
--         hide-until-passed 백스톱(H-1)은 각각 RPC-내부 / INSERT-only 라, PostgREST
--         직접 UPDATE 경로를 못 막는다. 크리에이터가 본인 영상에 대해
--           UPDATE public.videos SET is_hidden=false, moderation_status='passed',
--                                     show_on_ott=true WHERE id=<본인영상>;
--         를 직접 실행하면 (a) 검수 없이 self-approve(공개), (b) 짧은 영상에 OTT 티어
--         위조(광고배분 60% 강탈), (c) 제목·설명·썸네일 직접 교체로 재검수 우회가 가능.
--
--   조치: videos 직접 UPDATE 를 anon/authenticated/PUBLIC 에서 전면 회수.
--         앱은 videos 를 클라에서 직접 UPDATE 하지 않음(전수 grep 확인) — 모든 편집이
--         SECURITY DEFINER RPC 경유(update_my_video_metadata=편집·재검수, admin_hide_video
--         등=관리자, apply_moderation_result/웹훅=service_role). DEFINER 는 소유자(postgres)
--         권한으로 실행되므로 table grant 회수에 영향받지 않음 → 정상경로 100% 유지.
--         (profiles 쓰기잠금 fix_profiles_write_lockdown_20260628.sql 과 동일 패턴.)
--
-- 적용: Supabase Dashboard → SQL Editor → Run (멱등 재실행 안전).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 직접 UPDATE 권한 회수 (테이블 단위 + 민감 컬럼 단위 이중)
REVOKE UPDATE ON public.videos FROM anon, authenticated, PUBLIC;
REVOKE UPDATE (
  is_hidden, moderation_status, moderation_score,
  show_on_ott, show_on_cinema, creator_id, duration_seconds,
  price_standard, price_commercial, price_exclusive,
  title, description, thumbnail, tags
) ON public.videos FROM anon, authenticated, PUBLIC;

-- 2) 서버 경로 보존(멱등): 검수 웹훅/벌크 등 service_role 직접 UPDATE 대비.
GRANT UPDATE ON public.videos TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 (적용 후 _verify_videos_update_rls_20260711.sql 재실행 → ③ 가 ✅ SAFE 여야 함):
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_schema='public' AND table_name='videos' AND privilege_type='UPDATE'
--     AND grantee IN ('anon','authenticated','PUBLIC');            -- → 0행
--   SELECT grantee, column_name FROM information_schema.role_column_grants
--   WHERE table_schema='public' AND table_name='videos' AND privilege_type='UPDATE'
--     AND grantee IN ('anon','authenticated');                     -- → 0행
--   -- 앱 확인: 크리에이터가 VideoEditModal 로 제목/가격 저장 정상(=RPC 경유) 동작.
-- ════════════════════════════════════════════════════════════════════════════
