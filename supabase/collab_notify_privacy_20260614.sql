-- ════════════════════════════════════════════════════════════════════════════
-- 협업 문의 알림 — 메시지 원문 비노출 (2026-06-14)
--   기존: 알림 body 에 메시지 원문 60자(left(v_body,60))를 그대로 노출.
--   문제: 수신자는 대화 당사자라 제3자 유출은 아니지만, 푸시·잠금화면·알림함에
--         사적 대화 원문이 남음 (감사 R11 "정책 판단" 항목).
--   변경: 알림 body 에서 메시지 원문 제거 → 공개 정보인 협업 글 제목만 노출.
--         메시지 내용은 스레드를 열어야만 보이도록.
--   ※ collab_threads.last_message(left 200) 은 스레드 당사자에게만 보이므로 유지.
-- 적용: Supabase SQL Editor → 새 쿼리 → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.collab_thread_send(p_thread_id uuid, p_body text)
RETURNS TABLE (id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_inq uuid; v_owner uuid; v_post uuid; v_title text;
        v_other uuid; v_name text; v_body text; v_id uuid; v_at timestamptz;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN RAISE EXCEPTION 'empty message'; END IF;
  IF char_length(v_body) > 4000 THEN v_body := left(v_body, 4000); END IF;

  SELECT th.inquirer_id, th.post_id INTO v_inq, v_post FROM public.collab_threads th WHERE th.id = p_thread_id;
  IF v_inq IS NULL THEN RAISE EXCEPTION 'thread not found'; END IF;
  SELECT p.user_id, p.title INTO v_owner, v_title FROM public.collab_posts p WHERE p.id = v_post;
  IF v_me <> v_inq AND v_me <> v_owner THEN RAISE EXCEPTION 'not a participant'; END IF;
  v_other := CASE WHEN v_me = v_inq THEN v_owner ELSE v_inq END;

  INSERT INTO public.collab_messages (thread_id, sender_id, body)
  VALUES (p_thread_id, v_me, v_body) RETURNING collab_messages.id, collab_messages.created_at INTO v_id, v_at;

  UPDATE public.collab_threads
  SET last_message = left(v_body, 200), last_message_at = v_at WHERE collab_threads.id = p_thread_id;

  SELECT COALESCE(display_name, '크리에이터') INTO v_name FROM public.profiles WHERE profiles.id = v_me;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_other, 'collab',
          COALESCE(v_name, '크리에이터') || '님의 협업 문의',
          '「' || COALESCE(v_title, '협업') || '」 새 메시지가 도착했어요',
          '/?tab=community&sub=collab&post=' || v_post::text);

  RETURN QUERY SELECT v_id, v_at;
END; $$;

GRANT EXECUTE ON FUNCTION public.collab_thread_send(uuid, text) TO authenticated;
