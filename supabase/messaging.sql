-- ════════════════════════════════════════════════════════════════════════════
-- 인앱 1:1 메시지 (DM) — 크리에이터 간 직접 대화
-- 적용 일자: 2026-06-08
--
-- 구성:
--   1. dm_conversations  — 두 사용자 간 대화방 (user_a < user_b 정규화, UNIQUE)
--   2. dm_messages       — 대화 메시지
--   3. notifications.type 에 'dm' 추가
--   4. RPC (SECURITY DEFINER): dm_start / dm_list / dm_send / dm_mark_read
--      (목록/이름·아바타는 profiles 를 읽어야 하는데 authenticated 는 profiles SELECT
--       권한이 없으므로 definer 함수로 처리. 메시지 본문 조회는 RLS 직접 SELECT)
--   5. dm_messages 를 realtime publication 에 추가 (실시간 수신)
--
-- 적용: Supabase SQL Editor 새 쿼리에 붙여넣고 Run (idempotent)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 대화방 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dm_conversations (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_a          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_b          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_message    text,
  last_message_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_a, user_b),
  CHECK (user_a < user_b)
);
CREATE INDEX IF NOT EXISTS dm_conv_a_idx ON public.dm_conversations(user_a);
CREATE INDEX IF NOT EXISTS dm_conv_b_idx ON public.dm_conversations(user_b);

ALTER TABLE public.dm_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dm_conv_select ON public.dm_conversations;
CREATE POLICY dm_conv_select ON public.dm_conversations
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);

-- ── 2. 메시지 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dm_messages (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES public.dm_conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  read            boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dm_msg_conv_idx ON public.dm_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS dm_msg_unread_idx ON public.dm_messages(conversation_id, read) WHERE read = false;

ALTER TABLE public.dm_messages ENABLE ROW LEVEL SECURITY;
-- 참여자만 메시지 열람 (dm_conversations 참조 — authenticated 는 해당 테이블 SELECT 가능)
DROP POLICY IF EXISTS dm_msg_select ON public.dm_messages;
CREATE POLICY dm_msg_select ON public.dm_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.dm_conversations c
            WHERE c.id = conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid()))
  );

-- ── 3. notifications.type 에 'dm' 추가 ───────────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'purchase', 'sale', 'system', 'challenge', 'collab', 'dm'));

-- ── 4. RPC ───────────────────────────────────────────────────────────────────
-- 대화 시작 (get-or-create)
CREATE OR REPLACE FUNCTION public.dm_start(p_other uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_a uuid; v_b uuid; v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_other IS NULL OR p_other = v_me THEN RAISE EXCEPTION 'invalid recipient'; END IF;
  IF v_me < p_other THEN v_a := v_me; v_b := p_other; ELSE v_a := p_other; v_b := v_me; END IF;
  SELECT id INTO v_id FROM public.dm_conversations WHERE user_a = v_a AND user_b = v_b;
  IF v_id IS NULL THEN
    INSERT INTO public.dm_conversations (user_a, user_b) VALUES (v_a, v_b) RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.dm_start(uuid) TO authenticated;

-- 대화 목록 (상대 이름/아바타 + 안 읽은 수)
CREATE OR REPLACE FUNCTION public.dm_list()
RETURNS TABLE (conversation_id uuid, other_id uuid, other_name text, other_avatar text,
               last_message text, last_message_at timestamptz, unread integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT c.id,
         CASE WHEN c.user_a = v_me THEN c.user_b ELSE c.user_a END,
         COALESCE(p.display_name, '크리에이터'),
         p.avatar_url,
         c.last_message, c.last_message_at,
         (SELECT count(*)::int FROM public.dm_messages m
            WHERE m.conversation_id = c.id AND m.sender_id <> v_me AND m.read = false)
  FROM public.dm_conversations c
  LEFT JOIN public.profiles p
    ON p.id = (CASE WHEN c.user_a = v_me THEN c.user_b ELSE c.user_a END)
  WHERE c.user_a = v_me OR c.user_b = v_me
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC;
END; $$;
GRANT EXECUTE ON FUNCTION public.dm_list() TO authenticated;

-- 메시지 전송 (+ 수신자 알림)
CREATE OR REPLACE FUNCTION public.dm_send(p_conversation uuid, p_body text)
RETURNS TABLE (id uuid, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_a uuid; v_b uuid; v_other uuid; v_name text; v_body text; v_id uuid; v_at timestamptz;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  v_body := btrim(COALESCE(p_body, ''));
  IF v_body = '' THEN RAISE EXCEPTION 'empty message'; END IF;
  IF char_length(v_body) > 4000 THEN v_body := left(v_body, 4000); END IF;

  SELECT c.user_a, c.user_b INTO v_a, v_b FROM public.dm_conversations c WHERE c.id = p_conversation;
  IF v_a IS NULL THEN RAISE EXCEPTION 'conversation not found'; END IF;
  IF v_me <> v_a AND v_me <> v_b THEN RAISE EXCEPTION 'not a participant'; END IF;
  v_other := CASE WHEN v_a = v_me THEN v_b ELSE v_a END;

  INSERT INTO public.dm_messages (conversation_id, sender_id, body)
  VALUES (p_conversation, v_me, v_body) RETURNING dm_messages.id, dm_messages.created_at INTO v_id, v_at;

  UPDATE public.dm_conversations
  SET last_message = left(v_body, 200), last_message_at = v_at WHERE dm_conversations.id = p_conversation;

  SELECT COALESCE(display_name, '크리에이터') INTO v_name FROM public.profiles WHERE profiles.id = v_me;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_other, 'dm', COALESCE(v_name, '크리에이터') || '님의 새 메시지', left(v_body, 80), '/?dm=' || p_conversation::text);

  RETURN QUERY SELECT v_id, v_at;
END; $$;
GRANT EXECUTE ON FUNCTION public.dm_send(uuid, text) TO authenticated;

-- 읽음 처리 (상대가 보낸 메시지)
CREATE OR REPLACE FUNCTION public.dm_mark_read(p_conversation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.dm_conversations c
                 WHERE c.id = p_conversation AND (c.user_a = v_me OR c.user_b = v_me)) THEN RETURN; END IF;
  UPDATE public.dm_messages SET read = true
  WHERE conversation_id = p_conversation AND sender_id <> v_me AND read = false;
END; $$;
GRANT EXECUTE ON FUNCTION public.dm_mark_read(uuid) TO authenticated;

-- ── 5. realtime publication 에 dm_messages 추가 ──────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.dm_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
