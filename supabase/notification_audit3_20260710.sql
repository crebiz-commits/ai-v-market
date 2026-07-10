-- ════════════════════════════════════════════════════════════════════════════
-- 알림 피드 3차 감사 — 벨(in-app) 타입별 opt-out + 웹푸시 게이트 분리 (2026-07-10)
--
--   [정책1] 벨 끄기: 지금까지 벨(notifications INSERT)은 설정과 무관하게 항상 발송돼
--           사용자가 특정 알림 벨을 끌 수 없었음. should_send_notification 에 'inapp'
--           채널 추가(컬럼 미존재 시 fail-open=발송 유지) + 끄고 싶을 법한 타입에
--           inapp_* opt-out 컬럼 신설(기본 true). Edge/트리거가 벨 발송 전 이 게이트를 봄.
--   [정책2] 웹푸시 분리: 지금까지 웹푸시가 이메일 게이트 통과 후에만 발송돼(이메일 끄면
--           푸시도 꺼짐) push_* 16컬럼이 死컬럼이었음. Edge 를 should_send(...,'push')
--           독립 판단으로 분리. push_* 기본값을 true 로 전환(웹푸시 구독=동의) + 기존행
--           백필 → 분리해도 현행 발송 유지되며 타입별로 끌 수 있게 됨.
--   ※ Edge(functions/server/index.ts) 재배포 필요 — 이 SQL 과 함께 적용.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 벨 opt-out 컬럼 신설(기본 true=수신). 끄고 싶을 법한 타입만. ──
--    (welcome=가입1회라 제외 → fail-open 유지, new_video 는 inapp_new_video_from_followed 기존)
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS inapp_subscription_receipt BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inapp_comment_reply        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inapp_new_follower         BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inapp_revenue_settled      BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inapp_report_result        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inapp_refund_completed     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inapp_sale                 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS inapp_comment              BOOLEAN NOT NULL DEFAULT true;

-- ── 2) 웹푸시 기본값 true 전환 + 기존행 백필(웹푸시 구독=동의, 분리 시 발송 유지) ──
ALTER TABLE public.notification_preferences
  ALTER COLUMN push_welcome                SET DEFAULT true,
  ALTER COLUMN push_subscription_receipt   SET DEFAULT true,
  ALTER COLUMN push_new_video_from_followed SET DEFAULT true,
  ALTER COLUMN push_comment_reply          SET DEFAULT true,
  ALTER COLUMN push_new_follower           SET DEFAULT true,
  ALTER COLUMN push_revenue_settled        SET DEFAULT true,
  ALTER COLUMN push_report_result          SET DEFAULT true,
  ALTER COLUMN push_ad_budget_low          SET DEFAULT true;
-- push_refund_completed 는 phase34_refund 에서 DEFAULT FALSE 로 추가됨 → 함께 true 로.
ALTER TABLE public.notification_preferences ALTER COLUMN push_refund_completed SET DEFAULT true;
-- 기존행 백필: 지금까지 push_* 는 UI 부재로 아무도 명시 설정한 적 없음(전부 기본 false) → 전 행 true.
UPDATE public.notification_preferences SET
  push_welcome = true, push_subscription_receipt = true, push_new_video_from_followed = true,
  push_comment_reply = true, push_new_follower = true, push_revenue_settled = true,
  push_report_result = true, push_ad_budget_low = true, push_refund_completed = true;

-- ── 3) should_send_notification: 'inapp' 채널 추가 + inapp 은 컬럼 미존재 시 fail-open ──
CREATE OR REPLACE FUNCTION public.should_send_notification(
  p_user_id UUID,
  p_type TEXT,
  p_channel TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_column_name TEXT;
  v_result BOOLEAN;
BEGIN
  IF p_channel NOT IN ('email', 'push', 'inapp') THEN
    RETURN FALSE;
  END IF;

  v_column_name := p_channel || '_' || p_type;   -- 예: 'inapp_comment_reply'

  INSERT INTO public.notification_preferences (user_id)
  VALUES (p_user_id) ON CONFLICT (user_id) DO NOTHING;

  BEGIN
    EXECUTE format(
      'SELECT %I FROM public.notification_preferences WHERE user_id = $1',
      v_column_name
    ) INTO v_result USING p_user_id;
  EXCEPTION WHEN undefined_column THEN
    -- 벨(inapp): opt-out 컬럼 없는 타입은 기본 발송(fail-open). 이메일/푸시: fail-closed.
    v_result := (p_channel = 'inapp');
  END;

  -- 컬럼값이 NULL(이론상 NOT NULL이라 없음)일 때도 inapp 은 발송 쪽으로.
  RETURN COALESCE(v_result, p_channel = 'inapp');
END;
$$;
GRANT EXECUTE ON FUNCTION public.should_send_notification(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ── 4) update_my_notification_preferences: inapp_* 8종 반영(기존 20컬럼 + inapp 9종 유지) ──
CREATE OR REPLACE FUNCTION public.update_my_notification_preferences(p_settings JSONB)
RETURNS public.notification_preferences
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_row public.notification_preferences;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  INSERT INTO public.notification_preferences (user_id)
  VALUES (v_user_id) ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.notification_preferences SET
    email_welcome                 = COALESCE((p_settings->>'email_welcome')::BOOLEAN, email_welcome),
    email_subscription_receipt    = COALESCE((p_settings->>'email_subscription_receipt')::BOOLEAN, email_subscription_receipt),
    email_new_video_from_followed = COALESCE((p_settings->>'email_new_video_from_followed')::BOOLEAN, email_new_video_from_followed),
    email_comment_reply           = COALESCE((p_settings->>'email_comment_reply')::BOOLEAN, email_comment_reply),
    email_new_follower            = COALESCE((p_settings->>'email_new_follower')::BOOLEAN, email_new_follower),
    email_revenue_settled         = COALESCE((p_settings->>'email_revenue_settled')::BOOLEAN, email_revenue_settled),
    email_report_result           = COALESCE((p_settings->>'email_report_result')::BOOLEAN, email_report_result),
    email_ad_budget_low           = COALESCE((p_settings->>'email_ad_budget_low')::BOOLEAN, email_ad_budget_low),
    email_refund_completed        = COALESCE((p_settings->>'email_refund_completed')::BOOLEAN, email_refund_completed),
    email_broadcast               = COALESCE((p_settings->>'email_broadcast')::BOOLEAN, email_broadcast),
    inapp_new_video_from_followed = COALESCE((p_settings->>'inapp_new_video_from_followed')::BOOLEAN, inapp_new_video_from_followed),
    inapp_subscription_receipt    = COALESCE((p_settings->>'inapp_subscription_receipt')::BOOLEAN, inapp_subscription_receipt),
    inapp_comment_reply           = COALESCE((p_settings->>'inapp_comment_reply')::BOOLEAN, inapp_comment_reply),
    inapp_new_follower            = COALESCE((p_settings->>'inapp_new_follower')::BOOLEAN, inapp_new_follower),
    inapp_revenue_settled         = COALESCE((p_settings->>'inapp_revenue_settled')::BOOLEAN, inapp_revenue_settled),
    inapp_report_result           = COALESCE((p_settings->>'inapp_report_result')::BOOLEAN, inapp_report_result),
    inapp_refund_completed        = COALESCE((p_settings->>'inapp_refund_completed')::BOOLEAN, inapp_refund_completed),
    inapp_sale                    = COALESCE((p_settings->>'inapp_sale')::BOOLEAN, inapp_sale),
    inapp_comment                 = COALESCE((p_settings->>'inapp_comment')::BOOLEAN, inapp_comment),
    push_welcome                  = COALESCE((p_settings->>'push_welcome')::BOOLEAN, push_welcome),
    push_subscription_receipt     = COALESCE((p_settings->>'push_subscription_receipt')::BOOLEAN, push_subscription_receipt),
    push_new_video_from_followed  = COALESCE((p_settings->>'push_new_video_from_followed')::BOOLEAN, push_new_video_from_followed),
    push_comment_reply            = COALESCE((p_settings->>'push_comment_reply')::BOOLEAN, push_comment_reply),
    push_new_follower             = COALESCE((p_settings->>'push_new_follower')::BOOLEAN, push_new_follower),
    push_revenue_settled          = COALESCE((p_settings->>'push_revenue_settled')::BOOLEAN, push_revenue_settled),
    push_report_result            = COALESCE((p_settings->>'push_report_result')::BOOLEAN, push_report_result),
    push_ad_budget_low            = COALESCE((p_settings->>'push_ad_budget_low')::BOOLEAN, push_ad_budget_low),
    push_refund_completed         = COALESCE((p_settings->>'push_refund_completed')::BOOLEAN, push_refund_completed),
    updated_at                    = now()
  WHERE user_id = v_user_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_my_notification_preferences(JSONB) TO authenticated;

-- ── 5) 판매/신규댓글 트리거에 벨 opt-out 게이트 추가(inapp_sale / inapp_comment) ──
CREATE OR REPLACE FUNCTION public.tg_notify_seller_on_sale()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_title TEXT;
  v_buyer TEXT;
BEGIN
  IF COALESCE(NEW.status, '') <> 'completed' THEN RETURN NEW; END IF;
  IF NEW.seller_id IS NULL OR NEW.seller_id = NEW.buyer_id THEN RETURN NEW; END IF;
  -- 벨 opt-out: 판매자가 판매 알림을 껐으면 스킵
  IF EXISTS (SELECT 1 FROM public.notification_preferences
             WHERE user_id = NEW.seller_id AND inapp_sale = false) THEN
    RETURN NEW;
  END IF;

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

CREATE OR REPLACE FUNCTION public.tg_notify_owner_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_owner UUID;
  v_link  TEXT;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_hidden, false) THEN RETURN NEW; END IF;

  IF NEW.video_id IS NOT NULL THEN
    SELECT creator_id INTO v_owner FROM public.videos WHERE id = NEW.video_id;
    v_link := '/?video=' || NEW.video_id || '&comment=1';
  ELSIF NEW.post_id IS NOT NULL THEN
    BEGIN
      SELECT user_id INTO v_owner FROM public.community_posts WHERE id = NEW.post_id::uuid;
    EXCEPTION WHEN others THEN
      v_owner := NULL;
    END;
    v_link := '/?tab=community&sub=posts&post=' || NEW.post_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;
  -- 벨 opt-out: 콘텐츠 주인이 댓글 알림을 껐으면 스킵
  IF EXISTS (SELECT 1 FROM public.notification_preferences
             WHERE user_id = v_owner AND inapp_comment = false) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    v_owner, 'comment',
    '새 댓글이 달렸어요 💬',
    COALESCE(NULLIF(NEW.author_name, ''), '누군가') || ': ' || left(COALESCE(NEW.content, ''), 80),
    v_link
  );
  RETURN NEW;
END; $fn$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT public.should_send_notification(auth.uid(), 'sale', 'inapp');      -- 기본 true
--   SELECT public.should_send_notification(auth.uid(), 'comment_reply','push'); -- 백필 후 true
--   SELECT count(*) FROM information_schema.columns
--     WHERE table_name='notification_preferences' AND column_name LIKE 'inapp_%';  -- 9
