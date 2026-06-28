-- ════════════════════════════════════════════════════════════════════════════
-- 협업 비공개 문의 스레드 (게시판형) — 작성자 ↔ 문의자 둘만 열람
-- 적용 일자: 2026-06-10
--
-- 모델:
--   - 협업 글(collab_posts)은 공개 목록.
--   - 거기 다는 "문의"는 (글 작성자 ↔ 문의한 사람) 1:1 비공개 스레드. 둘만 열람.
--   - 양방향 주고받기. 새 메시지는 상대에게 알림(notifications, type 'collab').
--   - 전역 DM(봉투) 없음 — 스레드는 협업 글 안에서만 진입.
--
-- 적용: Supabase SQL Editor 새 쿼리에 붙여넣고 Run (idempotent)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 스레드 (글 + 문의자 = 1개) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collab_threads (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id         uuid NOT NULL REFERENCES public.collab_posts(id) ON DELETE CASCADE,
  inquirer_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message    text,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, inquirer_id)
);
CREATE INDEX IF NOT EXISTS collab_threads_post_idx ON public.collab_threads(post_id);
CREATE INDEX IF NOT EXISTS collab_threads_inq_idx  ON public.collab_threads(inquirer_id);

ALTER TABLE public.collab_threads ENABLE ROW LEVEL SECURITY;
-- 문의자 본인 또는 글 작성자만 열람
DROP POLICY IF EXISTS collab_threads_select ON public.collab_threads;
CREATE POLICY collab_threads_select ON public.collab_threads
  FOR SELECT USING (
    inquirer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.collab_posts p WHERE p.id = post_id AND p.user_id = auth.uid())
  );

-- ── 2. 메시지 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collab_messages (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id   uuid NOT NULL REFERENCES public.collab_threads(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  read        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS collab_msg_thread_idx ON public.collab_messages(thread_id, created_at);

ALTER TABLE public.collab_messages ENABLE ROW LEVEL SECURITY;
-- 스레드 참여자(문의자/작성자)만 열람
DROP POLICY IF EXISTS collab_messages_select ON public.collab_messages;
CREATE POLICY collab_messages_select ON public.collab_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.collab_threads th
      JOIN public.collab_posts p ON p.id = th.post_id
      WHERE th.id = collab_messages.thread_id
        AND (th.inquirer_id = auth.uid() OR p.user_id = auth.uid())
    )
  );

-- ── 3. RPC ───────────────────────────────────────────────────────────────────
-- 문의 시작 (문의자 = 나, get-or-create) → thread_id
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
  END IF;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.collab_inquire(uuid) TO authenticated;

-- 메시지 전송 (+ 상대에게 알림)
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
          -- 메시지 원문 비노출 (2026-06-14, R11): 알림엔 공개 정보인 글 제목만.
          '「' || COALESCE(v_title, '협업') || '」 새 메시지가 도착했어요',
          '/?tab=community&sub=collab&post=' || v_post::text);

  RETURN QUERY SELECT v_id, v_at;
END; $$;
GRANT EXECUTE ON FUNCTION public.collab_thread_send(uuid, text) TO authenticated;

-- 글의 문의 스레드 목록 (작성자=전체 / 문의자=본인것). 상대 이름·미읽음 포함
CREATE OR REPLACE FUNCTION public.collab_threads_for(p_post_id uuid)
RETURNS TABLE (thread_id uuid, other_id uuid, other_name text, other_avatar text,
               last_message text, last_message_at timestamptz, unread integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT th.id,
         CASE WHEN p.user_id = v_me THEN th.inquirer_id ELSE p.user_id END,
         COALESCE(pr.display_name, '크리에이터'),
         pr.avatar_url,
         th.last_message, th.last_message_at,
         (SELECT count(*)::int FROM public.collab_messages m
            WHERE m.thread_id = th.id AND m.sender_id <> v_me AND m.read = false)
  FROM public.collab_threads th
  JOIN public.collab_posts p ON p.id = th.post_id
  LEFT JOIN public.profiles pr
    ON pr.id = (CASE WHEN p.user_id = v_me THEN th.inquirer_id ELSE p.user_id END)
  WHERE th.post_id = p_post_id AND (th.inquirer_id = v_me OR p.user_id = v_me)
  ORDER BY th.last_message_at DESC NULLS LAST, th.created_at DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.collab_threads_for(uuid) TO authenticated;

-- 읽음 처리
CREATE OR REPLACE FUNCTION public.collab_thread_mark_read(p_thread_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.collab_threads th JOIN public.collab_posts p ON p.id = th.post_id
    WHERE th.id = p_thread_id AND (th.inquirer_id = v_me OR p.user_id = v_me)
  ) THEN RETURN; END IF;
  UPDATE public.collab_messages SET read = true
  WHERE thread_id = p_thread_id AND sender_id <> v_me AND read = false;
END; $$;
GRANT EXECUTE ON FUNCTION public.collab_thread_mark_read(uuid) TO authenticated;

-- ── 4. realtime ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.collab_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
