-- ════════════════════════════════════════════════════════════════════════════
-- 비즈니스 문의 감사(2차) — 새 문의 도착 시 관리자 인앱 벨 + 이메일 (2026-07-16)
--
--   목적: 광고·투자·제휴 등 고가치 문의를 관리자가 앱을 안 열어도 즉시 인지하도록,
--         제출 시점에 ① 전 관리자에게 인앱 벨 + ② 관리자 이메일 발송.
--   설계: AFTER INSERT 트리거가 (a) notifications 벨 INSERT(서버측·항상), (b) pg_net 로
--         Edge /notify-business-inquiry 비동기 호출(이메일). 둘 다 EXCEPTION 로 감싸
--         알림/HTTP 실패가 문의 접수를 롤백하지 않게 방어.
--   ⚠️ 증폭 방지(2차 재감사 F1): business_inquiries INSERT 는 공개(anon)라, 트리거가
--         INSERT 마다 벨 N + 이메일 N 을 무제한 증폭하면 공격자가 대량 INSERT 로 관리자
--         받은편지함·Resend 비용·발신도메인 평판을 훼손할 수 있음. self-guard(dedup)는
--         "같은 id 재호출"만 막을 뿐 대량 신규 INSERT 증폭은 못 막음 → 트리거에 전역
--         스로틀 추가(최근 10분 문의 > 10건이면 알림 스킵. 문의 자체는 저장돼 패널·배지엔
--         그대로 보임). Edge 도 self-guard(존재·미통지·최근10분) 유지.
--   감사 강제(F2): 상태변경을 admin_set_inquiry_status RPC 로만 하도록 business_inquiries
--         의 관리자 직접 UPDATE RLS 정책 제거(RPC=DEFINER, Edge=service_role 로 무영향).
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
  v_recent    INT;
BEGIN
  -- 전역 스로틀(F1): 최근 10분 문의가 10건 초과면 알림(벨·이메일) 스킵 — 무인증 공개
  --   INSERT 증폭(이메일 폭탄·Resend 비용·평판) 상한. 문의는 이미 저장돼 패널·배지엔 보임.
  SELECT count(*) INTO v_recent FROM public.business_inquiries
    WHERE created_at > now() - interval '10 minutes';
  IF v_recent > 10 THEN
    RAISE WARNING '비즈니스 문의 급증(최근10분 %건) — 알림 스로틀 적용, 이번 건 알림 스킵', v_recent;
    RETURN NEW;
  END IF;

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

-- ── F2: 관리자 직접 UPDATE RLS 정책 제거 → 상태변경은 admin_set_inquiry_status RPC 로만 ──
--   (RPC=SECURITY DEFINER·Edge=service_role 는 RLS 우회라 무영향. 직접 PostgREST UPDATE 로
--    admin_logs 없이 상태 바꾸던 감사 우회 경로 차단.)
DROP POLICY IF EXISTS "Admins can update inquiries" ON public.business_inquiries;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 테스트 문의 INSERT 후:
--   --   ① 관리자 notifications 에 '새 비즈니스 문의' 1행
--   SELECT title, link FROM public.notifications WHERE title LIKE '새 비즈니스 문의%' ORDER BY created_at DESC LIMIT 3;
--   --   ② admin_notified_at 설정됨(이메일 발송 완료 표시, Edge 배포 후):
--   SELECT company_name, admin_notified_at FROM public.business_inquiries ORDER BY created_at DESC LIMIT 3;
-- ════════════════════════════════════════════════════════════════════════════
