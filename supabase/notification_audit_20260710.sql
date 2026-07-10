-- ════════════════════════════════════════════════════════════════════════════
-- 알림 피드 감사 — 커버리지 확장 + 벨 기본수신 (2026-07-10)
--
--   [정책1] 새 영상 벨 알림을 "팔로우 시 기본 수신"으로. 기존엔 이메일 opt-in 컬럼
--           (email_new_video_from_followed, 기본 OFF)에 벨을 겸용 게이트로 묶어
--           대부분 팔로워가 벨 알림조차 못 받았음. 벨 전용 opt-out 컬럼 신설(기본 true).
--   [신설1] 판매 알림 — 라이선스 구매 완료(orders AFTER INSERT, status=completed) 시
--           판매자(seller_id)에게 'sale' 벨 알림. 크리에이터가 판매를 실시간 인지.
--   [신설2] 신규 댓글 알림 — 최상위 댓글(parent_id IS NULL) 작성 시 콘텐츠 주인에게
--           'comment' 알림(영상=videos.creator_id / 글=community_posts.user_id).
--           기존엔 '답글(comment_reply)'만 알림이 갔음.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 정책1: 벨 전용 opt-out 컬럼 신설(기본 수신) + 새 영상 벨 트리거 게이트 전환 ──
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS inapp_new_video_from_followed BOOLEAN NOT NULL DEFAULT true;

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
    AND COALESCE(np.inapp_new_video_from_followed, true) = true;  -- 벨 기본 수신(설정행 없거나 true면 발송)

  RETURN NEW;
END; $fn$;

-- ── 신설1: 판매 알림 (orders AFTER INSERT, 완료 건만, 판매자에게) ──
CREATE OR REPLACE FUNCTION public.tg_notify_seller_on_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_title TEXT;
  v_buyer TEXT;
BEGIN
  -- 완료 건 + 자기구매 아님 + 판매자 식별 가능할 때만
  IF COALESCE(NEW.status, '') <> 'completed' THEN RETURN NEW; END IF;
  IF NEW.seller_id IS NULL OR NEW.seller_id = NEW.buyer_id THEN RETURN NEW; END IF;

  SELECT left(COALESCE(NULLIF(title, ''), '내 영상'), 40) INTO v_title
  FROM public.videos WHERE id = NEW.video_id;

  SELECT COALESCE(NULLIF(display_name, ''), '구매자') INTO v_buyer
  FROM public.profiles WHERE id = NEW.buyer_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    NEW.seller_id, 'sale',
    '영상이 판매되었어요 💰',
    COALESCE(v_title, '내 영상') || ' · ' || COALESCE(NEW.amount, 0)::text || '원' ||
      CASE WHEN v_buyer IS NOT NULL THEN ' (' || v_buyer || ')' ELSE '' END,
    '/?tab=mypage&section=sales'
  );

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS orders_notify_seller ON public.orders;
CREATE TRIGGER orders_notify_seller
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_seller_on_sale();

-- ── 신설2: 신규 최상위 댓글 알림 (영상/글 주인에게) ──
CREATE OR REPLACE FUNCTION public.tg_notify_owner_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_owner UUID;
  v_link  TEXT;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN RETURN NEW; END IF;           -- 최상위 댓글만(답글은 comment_reply 가 처리)
  IF COALESCE(NEW.is_hidden, false) THEN RETURN NEW; END IF;      -- 숨김/필터된 댓글은 알림 안 함

  IF NEW.video_id IS NOT NULL THEN
    SELECT creator_id INTO v_owner FROM public.videos WHERE id = NEW.video_id;
    v_link := '/?video=' || NEW.video_id || '&comment=1';
  ELSIF NEW.post_id IS NOT NULL THEN
    BEGIN
      SELECT user_id INTO v_owner FROM public.community_posts WHERE id = NEW.post_id::uuid;
    EXCEPTION WHEN others THEN
      v_owner := NULL;   -- post_id 가 uuid 아니면 조용히 스킵
    END;
    v_link := '/?tab=community&sub=posts&post=' || NEW.post_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;  -- 주인 없음/자기댓글 제외

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    v_owner, 'comment',
    '새 댓글이 달렸어요 💬',
    COALESCE(NULLIF(NEW.author_name, ''), '누군가') || ': ' || left(COALESCE(NEW.content, ''), 80),
    v_link
  );

  RETURN NEW;
END; $fn$;

DROP TRIGGER IF EXISTS comments_notify_owner ON public.comments;
CREATE TRIGGER comments_notify_owner
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_owner_on_comment();

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.orders'::regclass AND NOT tgisinternal;
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.comments'::regclass AND NOT tgisinternal;
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='notification_preferences' AND column_name='inapp_new_video_from_followed';
