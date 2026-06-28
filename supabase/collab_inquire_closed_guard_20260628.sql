-- ════════════════════════════════════════════════════════════════════════════
-- 협업 마감(closed) 신규 문의 DB 강제 (2026-06-28)
--
--   문제: '지원'(apply_to_collab)은 status='closed' 시 DB에서 거부하나,
--         '문의'(collab_inquire)는 status 미검사 → 마감 글에도 신규 문의 스레드 생성
--         가능(UI 비활성만 의존, API 직접호출 우회). 지원/문의 게이트 비대칭.
--   수정: collab_inquire 에 closed 검사 추가(apply_to_collab 과 대칭).
--         ※ 마감 전 시작된 기존 스레드의 메시지(collab_thread_send)는 계속 허용.
--
--   ⚠️ 이 파일만 Run 할 것. collab_inquiries.sql 전체를 재실행하면 collab_thread_send 가
--      구버전(원문 노출)으로 회귀함(프라이버시 정본은 collab_notify_privacy_20260614.sql).
--   적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.collab_inquire(p_post_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_owner uuid; v_status text; v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT user_id, status INTO v_owner, v_status FROM public.collab_posts WHERE id = p_post_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'collab post not found'; END IF;
  IF v_owner = v_me THEN RAISE EXCEPTION 'cannot inquire your own post'; END IF;
  IF v_status = 'closed' THEN RAISE EXCEPTION 'this collab post is closed'; END IF;
  SELECT id INTO v_id FROM public.collab_threads WHERE post_id = p_post_id AND inquirer_id = v_me;
  IF v_id IS NULL THEN
    INSERT INTO public.collab_threads (post_id, inquirer_id) VALUES (p_post_id, v_me) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.collab_inquire(uuid) TO authenticated;
