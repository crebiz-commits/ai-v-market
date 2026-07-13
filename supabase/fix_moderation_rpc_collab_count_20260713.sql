-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 PRD 전수 감사 후속 수정 2건 (2026-07-13)
--
-- ① [보안 HIGH] update_video_moderation — PUBLIC 기본 EXECUTE 회수
--    SECURITY DEFINER 함수는 CREATE 시 EXECUTE 가 PUBLIC(anon 포함)에 기본 부여됨.
--    phase_security_hardening_20260531 은 authenticated 만 회수해서, anon key 만으로
--    POST /rest/v1/rpc/update_video_moderation { p_video_id, p_score: 95 } 호출 시
--    타인 공개 영상을 rejected + is_hidden=true 로 만들 수 있었음(대량 검열/점수 위조).
--    후속 함수 apply_moderation_result 는 이미 올바르게 회수됨(upload_moderation_pipeline
--    _20260709.sql) — 전신인 이 함수만 같은 처리를 못 받은 것.
--
-- ② [기능] 협업 "문의 N건" 죽은 카운터 연결
--    applicants_count 를 올리는 유일한 코드는 apply_to_collab(collab_space.sql)인데
--    프론트가 호출하지 않는 미배선 RPC. 실제 문의 경로인 collab_inquire(스레드 생성)는
--    카운터를 안 올려 카드의 "문의 N건"이 영구 0이었음.
--    → collab_inquire 가 "새 스레드 생성 시" +1 (카운터 의미 = 서로 다른 문의자 수).
--    기존 잘못된 0 은 실제 스레드 수로 백필.
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① update_video_moderation PUBLIC/anon 회수 (service_role 전용으로 고정) ──
REVOKE ALL ON FUNCTION public.update_video_moderation(TEXT, INTEGER, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_video_moderation(TEXT, INTEGER, JSONB, TEXT) TO service_role;

-- ── ② collab_inquire — 새 스레드 생성 시 applicants_count +1 ──
--    (collab_inquiries.sql 정본 복제 + 카운터 1줄. 이 파일이 collab_inquire 새 정본.)
CREATE OR REPLACE FUNCTION public.collab_inquire(p_post_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_owner uuid; v_status text; v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT user_id, status INTO v_owner, v_status FROM public.collab_posts WHERE id = p_post_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'collab post not found'; END IF;
  IF v_owner = v_me THEN RAISE EXCEPTION 'cannot inquire your own post'; END IF;
  -- 마감(closed) 협업은 신규 문의 불가 — apply_to_collab 과 대칭(UI 차단을 DB에서도 강제)
  IF v_status = 'closed' THEN RAISE EXCEPTION 'this collab post is closed'; END IF;
  SELECT id INTO v_id FROM public.collab_threads WHERE post_id = p_post_id AND inquirer_id = v_me;
  IF v_id IS NULL THEN
    INSERT INTO public.collab_threads (post_id, inquirer_id) VALUES (p_post_id, v_me) RETURNING id INTO v_id;
    -- "문의 N건" 카운터 = 서로 다른 문의자(스레드) 수. 기존엔 아무도 안 올려 영구 0이었음.
    UPDATE public.collab_posts SET applicants_count = COALESCE(applicants_count, 0) + 1
    WHERE id = p_post_id;
  END IF;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.collab_inquire(uuid) TO authenticated;

-- ── ②-b 기존 글 백필 — applicants_count 를 실제 스레드 수로 동기화 ──
UPDATE public.collab_posts p
SET applicants_count = sub.cnt
FROM (
  SELECT post_id, COUNT(*)::int AS cnt
  FROM public.collab_threads
  GROUP BY post_id
) sub
WHERE sub.post_id = p.id
  AND COALESCE(p.applicants_count, 0) <> sub.cnt;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- ① anon/authenticated/PUBLIC 에 EXECUTE 가 없어야 함(0행이면 정상):
--   SELECT grantee, privilege_type
--   FROM information_schema.routine_privileges
--   WHERE routine_schema='public' AND routine_name='update_video_moderation'
--     AND grantee IN ('PUBLIC','anon','authenticated');
--   -- ② 카운터 = 스레드 수 대조(불일치 0행이면 정상):
--   SELECT p.id, p.applicants_count, COUNT(t.id) AS threads
--   FROM public.collab_posts p LEFT JOIN public.collab_threads t ON t.post_id = p.id
--   GROUP BY p.id, p.applicants_count
--   HAVING COALESCE(p.applicants_count,0) <> COUNT(t.id);
-- ════════════════════════════════════════════════════════════════════════════
