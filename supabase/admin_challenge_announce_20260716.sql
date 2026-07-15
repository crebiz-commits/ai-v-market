-- ════════════════════════════════════════════════════════════════════════════
-- 챌린지(공모전) 감사 2차 — 공모전 공지 발송 RPC (2026-07-16)
--
--   [연결 갭] notifications 는 type='challenge' 를 CHECK 로 허용하고(collab_space.sql),
--     NotificationPanel 은 전용 색상(orange)·아이콘·미인증 샘플 티저까지 갖췄으나,
--     실제 'challenge' 알림을 생성하는 경로가 **아무 데도 없음**. 관리자가 공모전을
--     열어도 사용자는 알림을 못 받고 커뮤니티 탭을 직접 들어가야만 인지 → 인프라만
--     있고 생산자가 없는 "끊긴 연결"(연결되어야 하는데 안 된 것).
--   [수정] admin_announce_challenge(uuid, segment) — 관리자 버튼 트리거로 해당 공모전을
--     대상 세그먼트(all/premium/free/creators, 정지계정 제외)에 type='challenge' 인앱
--     알림 발송. 클릭 시 챌린지 딥링크로 이동. admin_broadcast_notification 의 세그먼트/
--     로깅 패턴 재사용(단 type='system'→'challenge', link=챌린지 상세). 마감 공모전은 차단.
--
--   설계: 자동 발송(등록 시 자동 블라스트) 대신 **명시적 버튼**(오타·미리보기 후 발송).
--   보안: SECURITY DEFINER + inline search_path(게이트 #9 무WARN), assert_admin 게이트,
--         PUBLIC/anon REVOKE, authenticated GRANT. (admin_broadcast_notification 과 동일)
--
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_announce_challenge(
  p_id      uuid,
  p_segment text DEFAULT 'all'   -- 'all' / 'premium' / 'free' / 'creators'
)
RETURNS integer   -- 발송된 사용자 수
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_ch    public.challenges%ROWTYPE;
  v_link  text;
  v_body  text;
  v_count integer;
  v_today date := (now() AT TIME ZONE 'Asia/Seoul')::date;   -- 앱(KST)과 동일 기준
BEGIN
  PERFORM public.assert_admin();

  IF p_segment NOT IN ('all', 'premium', 'free', 'creators') THEN
    RAISE EXCEPTION '잘못된 세그먼트: % (all/premium/free/creators 중 하나)', p_segment;
  END IF;

  SELECT * INTO v_ch FROM public.challenges WHERE id = p_id;
  IF v_ch.id IS NULL THEN
    RAISE EXCEPTION '해당 챌린지를 찾을 수 없습니다';
  END IF;

  -- 마감된 공모전 오발송 방지(마감일 지난 것은 공지 불가)
  IF v_ch.deadline < v_today THEN
    RAISE EXCEPTION '이미 마감된 공모전은 공지할 수 없습니다';
  END IF;

  v_link := '/?tab=community&sub=challenges&challenge=' || v_ch.id::text;
  -- 본문: 설명 앞 140자(설명은 NOT NULL). 개행은 공백으로 정리.
  v_body := left(regexp_replace(v_ch.description, '\s+', ' ', 'g'), 140);

  WITH targets AS (
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE
      CASE p_segment
        WHEN 'all'      THEN true
        WHEN 'premium'  THEN p.subscription_tier = 'premium'
        WHEN 'free'     THEN p.subscription_tier = 'free'
        WHEN 'creators' THEN EXISTS (SELECT 1 FROM public.videos v WHERE v.creator_id = p.id)
      END
      AND COALESCE(p.is_suspended, false) = false
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, type, title, body, link, read)
    SELECT user_id, 'challenge',
           '🏆 새 공모전: ' || v_ch.title,
           v_body, v_link, false
    FROM targets
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'announce_challenge', 'challenge', p_id::text,
          jsonb_build_object('tag', v_ch.tag, 'title', v_ch.title,
                             'segment', p_segment, 'recipient_count', v_count));

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_announce_challenge(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_announce_challenge(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   SELECT public.admin_announce_challenge('<진행중 challenge id>', 'all');  -- 발송 수 반환
--   SELECT type, title, link FROM public.notifications
--     WHERE type='challenge' ORDER BY created_at DESC LIMIT 3;               -- 발송 확인
--   SELECT action, details FROM public.admin_logs
--     WHERE action='announce_challenge' ORDER BY created_at DESC LIMIT 1;    -- 로그 확인
-- ════════════════════════════════════════════════════════════════════════════
