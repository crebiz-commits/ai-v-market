-- ════════════════════════════════════════════════════════════════════════════
-- 알림 피드 2차 감사 — 새 영상 벨 "검수 통과 시점" 발동 수정 (2026-07-10)
--
--   [HIGH] 새 영상 벨이 실제로 아무에게도 안 감. 원인: 업로드는 save-metadata 가
--          is_hidden=true(pending)로 INSERT(functions/server/index.ts:807) → 기존 AFTER
--          INSERT 트리거가 is_hidden 게이트에서 즉시 early-return. 검수 통과는 UPDATE
--          (is_hidden=false, index.ts:2008)라 AFTER INSERT 트리거가 안 탐 → 벨 발송 0건.
--   [수정] 트리거를 AFTER INSERT OR UPDATE OF is_hidden, visibility 로 바꾸고,
--          "숨김/비공개 → 공개"로 새로 전환되는 시점에만 1회 발송(제목수정 등 이미
--          공개였던 UPDATE 는 재발송 금지). 검수 통과 = is_hidden true→false 전환에 발동.
--
--   ⚠️ SUPERSEDED (2026-07-23): 이 파일은 더 이상 tg_notify_followers_new_video 의 최신 SSOT
--     가 아니다. 최신 정본 = admin_audit_hardening_20260714.sql(⑩ 재공개 시 팔로워 전원 중복
--     벨 방지 디듀프 idx_notifications_link + EXISTS 추가). 이 파일을 재실행하면 그 디듀프가
--     사라져 숨김→공개 재전환(신고 자동숨김→관리자 복원 등) 때 팔로워 전원에 새영상 벨이
--     재발송된다. update_my_notification_preferences 도 이 파일 판은 inapp_*/refund 매핑이 없어
--     재실행 시 벨 opt-out 이 회귀. **재실행 금지 — tg_notify_followers_new_video·
--     update_my_notification_preferences 는 admin_audit_hardening_20260714.sql 를 정본으로.**
--
--     옛 정의 재실행 금지: new_video_follower_notify_20260612.sql(AFTER INSERT + email 게이트),
--     medium_fixes_db_20260614.sql(email opt-in 게이트, 전 행 OFF),
--     notification_audit_20260710.sql(AFTER INSERT + inapp 게이트). 전부 SUPERSEDED.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_notify_followers_new_video()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_name TEXT;
BEGIN
  IF NEW.creator_id IS NULL THEN RETURN NEW; END IF;
  -- 지금 "공개(비숨김·public)" 상태가 아니면 알림 안 함(숨김/비공개/검수대기).
  IF COALESCE(NEW.visibility, 'public') <> 'public' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_hidden, false) THEN RETURN NEW; END IF;

  -- 신규 "공개 전환" 시점에만 1회: INSERT 로 바로 공개거나, UPDATE 로 (숨김/비공개)→공개.
  --   이미 공개였던 상태에서의 UPDATE(제목·태그 수정 등)엔 재발송 금지.
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.is_hidden, false) = false
     AND COALESCE(OLD.visibility, 'public') = 'public' THEN
    RETURN NEW;
  END IF;

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
    AND COALESCE(np.inapp_new_video_from_followed, true) = true;  -- 벨 기본 수신

  RETURN NEW;
END; $fn$;

-- 트리거를 INSERT + (is_hidden/visibility) UPDATE 로 확장 재바인딩
DROP TRIGGER IF EXISTS trg_notify_followers_new_video ON public.videos;
CREATE TRIGGER trg_notify_followers_new_video
  AFTER INSERT OR UPDATE OF is_hidden, visibility ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_followers_new_video();

-- ── 새 영상 벨 opt-out 토글 저장 지원 — update RPC 에 inapp_new_video_from_followed 반영 ──
--   (get 은 RETURNS notification_preferences + SELECT * 라 신규 컬럼 자동 반환 → 수정 불필요)
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

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   -- 트리거가 INSERT+UPDATE 로 걸렸는지(tgtype 비트: INSERT=4, UPDATE=16 → 둘 다면 event 다수):
--   SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger
--     WHERE tgrelid='public.videos'::regclass AND tgname='trg_notify_followers_new_video';
--   -- 함수가 TG_OP/OLD 를 참조(공개전환 판정)하는지:
--   SELECT pg_get_functiondef(oid) ILIKE '%TG_OP%' AS ok
--     FROM pg_proc WHERE proname='tg_notify_followers_new_video';
