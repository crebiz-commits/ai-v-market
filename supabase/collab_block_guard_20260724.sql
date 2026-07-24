-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 협업 DM 차단 가드 (2026-07-24) — 차단 사용자 간 문의·메시지 차단 (업계 표준 정합)
--
--   기존: user_blocks 차단은 "피드 숨김(클라 필터)" 전용이라, 차단한 상대가 collab_inquire
--         (문의 스레드 생성)·collab_thread_send(메시지)로 **차단한 사람에게 DM+알림을 계속
--         보낼 수 있었다**(피드는 숨겨도 직접링크·기존 스레드로 우회).
--   표준: Instagram/YouTube/X/Discord 모두 "차단하면 상대가 새 DM/메시지를 못 보냄"(양방향)
--         + 알림 억제. 기존 히스토리는 차단한 쪽에 남되 신규 전송만 차단(히스토리 필터는 안 함).
--   조치: 양방향 차단 판정 헬퍼 is_block_between + collab_inquire/collab_thread_send 진입 가드.
--         차단 사실을 명시 노출하지 않도록 중립 에러(괴롭힘 방지 — IG/Discord 방식). 알림은
--         가드가 INSERT·notification 앞에서 막아 자연히 미발생.
--
--   ※ collab_inquire 정본=fix_moderation_rpc_collab_count_20260713.sql(applicants_count +1 보존),
--     collab_thread_send 정본=collab_notify_privacy_20260614.sql(알림 원문 비노출 보존).
--     ★ 두 함수 새 정본. 위 두 파일의 해당 함수 재실행 금지(차단 가드 소실).
--     (0713 의 ① update_video_moderation REVOKE·②-b 백필은 이 파일과 무관하게 유효.)
--
-- 적용: Supabase SQL Editor → Run (멱등). phase24_user_blocks.sql 선적용 필요.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 양방향 차단 판정 (a가 b를, 또는 b가 a를 차단) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.is_block_between(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = p_a AND blocked_user_id = p_b)
       OR (blocker_id = p_b AND blocked_user_id = p_a)
  );
$$;
REVOKE ALL ON FUNCTION public.is_block_between(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_block_between(uuid, uuid) TO authenticated;

-- ── collab_inquire (0713 정본 복제 + 차단 가드) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.collab_inquire(p_post_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_me uuid := auth.uid(); v_owner uuid; v_status text; v_id uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT user_id, status INTO v_owner, v_status FROM public.collab_posts WHERE id = p_post_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'collab post not found'; END IF;
  IF v_owner = v_me THEN RAISE EXCEPTION 'cannot inquire your own post'; END IF;
  -- 2026-07-24: 차단 관계면 문의 불가(양방향). 차단 사실은 노출하지 않음(중립 에러).
  IF public.is_block_between(v_me, v_owner) THEN
    RAISE EXCEPTION 'unable to contact this creator';
  END IF;
  -- 마감(closed) 협업은 신규 문의 불가 — apply_to_collab 과 대칭(UI 차단을 DB에서도 강제)
  IF v_status = 'closed' THEN RAISE EXCEPTION 'this collab post is closed'; END IF;
  SELECT id INTO v_id FROM public.collab_threads WHERE post_id = p_post_id AND inquirer_id = v_me;
  IF v_id IS NULL THEN
    INSERT INTO public.collab_threads (post_id, inquirer_id) VALUES (p_post_id, v_me) RETURNING id INTO v_id;
    -- "문의 N건" 카운터 = 서로 다른 문의자(스레드) 수.
    UPDATE public.collab_posts SET applicants_count = COALESCE(applicants_count, 0) + 1
    WHERE id = p_post_id;
  END IF;
  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.collab_inquire(uuid) TO authenticated;

-- ── collab_thread_send (0614 정본 복제 + 차단 가드) ──────────────────────────
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

  -- 2026-07-24: 차단 관계면 기존 스레드라도 신규 메시지 전송 불가(양방향, 알림도 자연 미발생).
  --   히스토리는 그대로 두되 신규 전송만 차단(Instagram/Discord 표준). 차단 노출 안 함.
  IF public.is_block_between(v_me, v_other) THEN
    RAISE EXCEPTION 'unable to send this message';
  END IF;

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

-- ── 검증 ──
SELECT '차단 판정 헬퍼 is_block_between' AS check_name,
  CASE WHEN to_regprocedure('public.is_block_between(uuid,uuid)') IS NOT NULL
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'collab_inquire 차단 가드',
  CASE WHEN (SELECT prosrc ~ 'is_block_between' FROM pg_proc WHERE proname='collab_inquire')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'collab_thread_send 차단 가드',
  CASE WHEN (SELECT prosrc ~ 'is_block_between' FROM pg_proc WHERE proname='collab_thread_send')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
