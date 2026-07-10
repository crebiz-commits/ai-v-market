-- ════════════════════════════════════════════════════════════════════════════
-- Medium 수정 (DB) — 전체감사 2026-06-14
--   1) handle_new_user: profiles 생성 실패가 회원가입 자체를 롤백하지 않도록 안전망
--   2) 팔로워 새영상 알림: opt-in(컬럼 기본 false)과 일치하도록 COALESCE false 로 정렬
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 가입 트리거 안전망 — INSERT 실패해도 가입(auth.users)은 성공
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
      NEW.id,
      COALESCE(
        NEW.raw_user_meta_data->>'name',
        NEW.raw_user_meta_data->>'full_name',
        split_part(NEW.email, '@', 1)
      ),
      NEW.raw_user_meta_data->>'avatar_url'
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- profiles 생성 실패해도 가입은 진행 (사후 보정). 가입 흐름 차단 방지.
    NULL;
  END;
  RETURN NEW;
END;
$fn$;

-- 2) 팔로워 새영상 알림 — opt-in 정렬: 설정 행/값 없으면 미발송(false)
-- ⚠️ SUPERSEDED (2026-07-10): 이 정의(email opt-in 게이트, 전 행 OFF)는 구버전.
--    최신 SSOT = notification_audit2_20260710.sql. 이 파일 재실행 금지 — 새 영상 벨이
--    email opt-in(기본 OFF) 게이트로 회귀해 대부분 팔로워가 벨을 못 받게 됨.
CREATE OR REPLACE FUNCTION public.tg_notify_followers_new_video()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_name TEXT;
BEGIN
  IF NEW.creator_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.visibility, 'public') <> 'public' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_hidden, false) THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(display_name, ''), '크리에이터') INTO v_name
  FROM public.profiles WHERE id = NEW.creator_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  SELECT cf.follower_id, 'system',
         COALESCE(v_name, '크리에이터') || '님의 새 영상 🎬',
         left(COALESCE(NEW.title, '새 영상'), 60),
         '/?video=' || NEW.id::text
  FROM public.creator_followers cf
  LEFT JOIN public.notification_preferences np ON np.user_id = cf.follower_id
  WHERE cf.creator_id = NEW.creator_id
    AND cf.follower_id <> NEW.creator_id
    AND COALESCE(np.email_new_video_from_followed, false) = true;  -- opt-in (기본 OFF)

  RETURN NEW;
END; $fn$;
