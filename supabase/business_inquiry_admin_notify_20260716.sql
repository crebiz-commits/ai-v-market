-- ════════════════════════════════════════════════════════════════════════════
-- 비즈니스 문의 감사(2차) — 새 문의 도착 시 관리자 인앱 벨 + 이메일 (2026-07-16)
--
--   목적: 광고·투자·제휴 등 고가치 문의를 관리자가 앱을 안 열어도 즉시 인지하도록,
--         제출 시점에 ① 전 관리자에게 인앱 벨 + ② 관리자 이메일 발송.
--   설계: AFTER INSERT 트리거가 (a) notifications 벨 INSERT(서버측·항상), (b) pg_net 로
--         Edge /notify-business-inquiry 비동기 호출(이메일). 둘 다 EXCEPTION 로 감싸
--         알림/HTTP 실패가 문의 접수를 롤백하지 않게 방어.
--   남용 방지: Edge 는 secret 없이 self-guard — 전달된 id 로 실제 문의를 조회해 존재·
--         미통지(admin_notified_at NULL)·최근(10분) 인 경우에만 이메일 후 admin_notified_at
--         설정(dedup). 임의 POST 로는 관리자에게 스팸 불가.
--   의존: pg_net(billing_cron 에서 이미 활성), Edge 재배포(/notify-business-inquiry 신설).
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net;

-- 이메일 통지 dedup 표시(1회만)
ALTER TABLE public.business_inquiries
  ADD COLUMN IF NOT EXISTS admin_notified_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.tg_notify_admins_new_business_inquiry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cat_label TEXT;
BEGIN
  v_cat_label := CASE NEW.category
    WHEN 'advertising' THEN '광고'  WHEN 'investment' THEN '투자/IR'
    WHEN 'partnership' THEN '제휴'  WHEN 'b2b_license' THEN 'B2B 라이선스'
    ELSE '기타' END;

  -- (a) 인앱 벨 — 전 관리자(자기 제출 제외). 실패해도 접수 롤백 금지.
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT p.id, 'system',
           '새 비즈니스 문의 (' || v_cat_label || ')',
           '「' || left(COALESCE(NEW.company_name, '문의'), 40) || '」 · ' || COALESCE(NEW.contact_name, ''),
           '/?tab=admin'
    FROM public.profiles p
    WHERE p.is_admin = true
      AND (NEW.submitted_by IS NULL OR p.id <> NEW.submitted_by);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_notify_admins_new_business_inquiry 벨 실패(무시): %', SQLERRM;
  END;

  -- (b) 관리자 이메일 — pg_net 비동기 호출(Edge 가 self-guard·dedup·발송). 실패 무시.
  BEGIN
    PERFORM net.http_post(
      url := 'https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/notify-business-inquiry',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', 'sb_publishable_K3wmxz8uqsvUdeYXUhJv2g_g09eNNR8'
      ),
      body := jsonb_build_object('id', NEW.id::text)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify-business-inquiry http 실패(무시): %', SQLERRM;
  END;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_business_inquiry ON public.business_inquiries;
CREATE TRIGGER trg_notify_admins_new_business_inquiry
  AFTER INSERT ON public.business_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_admins_new_business_inquiry();

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 테스트 문의 INSERT 후:
--   --   ① 관리자 notifications 에 '새 비즈니스 문의' 1행
--   SELECT title, link FROM public.notifications WHERE title LIKE '새 비즈니스 문의%' ORDER BY created_at DESC LIMIT 3;
--   --   ② admin_notified_at 설정됨(이메일 발송 완료 표시, Edge 배포 후):
--   SELECT company_name, admin_notified_at FROM public.business_inquiries ORDER BY created_at DESC LIMIT 3;
-- ════════════════════════════════════════════════════════════════════════════
