-- ════════════════════════════════════════════════════════════════════════════
-- 팔로우한 크리에이터 새 영상 → 팔로워 인앱 벨 알림 (2026-06-12)
--   이메일이 아니라 벨 알림으로 (Resend 비용 없음). 클릭 시 해당 영상 오픈.
--   on/off 게이트: notification_preferences.email_new_video_from_followed (기본 true).
--   + 댓글 답글 이메일 기본 OFF (벨로 충분 — 메일 도배 방지).
-- 적용: Supabase SQL Editor → 새 쿼리 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 댓글 답글 이메일 기본 OFF (벨은 그대로 항상 옴)
ALTER TABLE public.notification_preferences ALTER COLUMN email_comment_reply SET DEFAULT false;
UPDATE public.notification_preferences SET email_comment_reply = false WHERE email_comment_reply = true;

-- 2) 새 영상 → 팔로워 벨 알림 트리거
CREATE OR REPLACE FUNCTION public.tg_notify_followers_new_video()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_name TEXT;
BEGIN
  -- 실제 크리에이터의 공개 영상만 (시드/비공개/숨김 제외)
  IF NEW.creator_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.visibility, 'public') <> 'public' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_hidden, false) THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(display_name, ''), '크리에이터') INTO v_name
  FROM public.profiles WHERE id = NEW.creator_id;

  -- 팔로워 전원에게 벨 알림 (알림 끈 사람 제외, 자기 자신 제외)
  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT cf.follower_id, 'system',
         COALESCE(v_name, '크리에이터') || '님의 새 영상 🎬',
         left(COALESCE(NEW.title, '새 영상'), 60),
         '/?video=' || NEW.id::text
  FROM public.creator_followers cf
  LEFT JOIN public.notification_preferences np ON np.user_id = cf.follower_id
  WHERE cf.creator_id = NEW.creator_id
    AND cf.follower_id <> NEW.creator_id
    AND COALESCE(np.email_new_video_from_followed, true) = true;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_followers_new_video ON public.videos;
CREATE TRIGGER trg_notify_followers_new_video
  AFTER INSERT ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_followers_new_video();
