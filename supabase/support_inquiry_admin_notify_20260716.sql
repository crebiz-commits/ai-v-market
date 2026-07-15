-- ════════════════════════════════════════════════════════════════════════════
-- 고객 문의 감사(2차) — 새 문의 도착 시 관리자 인앱 알림 (2026-07-16)
--
--   문제: 고객이 문의를 제출해도 관리자에게 알림이 없음. AdminLayout 배지(open 수)는
--         관리자 패널을 "열었을 때만" 보여, 관리자가 사이트를 그냥 쓰는 중엔 새 문의를
--         모르고 방치될 수 있음(특히 결제/환불 등 시급 문의).
--   해결: support_inquiries INSERT 시 전 관리자(is_admin)에게 인앱 벨 알림 1건.
--         (헤더 벨 + 실시간 구독 → 사이트 어디서든 즉시 인지). 이메일/푸시는 미발송
--         — DB 트리거는 Edge 를 못 부르고, 벨로 충분(요청 시 후속으로 이메일 확장 가능).
--
--   적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_notify_admins_new_support()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cat_label TEXT;
BEGIN
  -- 카테고리 한글 라벨(고객/관리자 화면과 동일 매핑)
  v_cat_label := CASE NEW.category
    WHEN 'payment' THEN '결제/환불' WHEN 'account' THEN '계정/로그인'
    WHEN 'subscription' THEN '구독'   WHEN 'video' THEN '영상/콘텐츠'
    WHEN 'bug' THEN '오류/버그'       ELSE '기타' END;

  -- ⚠️ 알림 실패가 문의 접수(AFTER INSERT)를 롤백시키면 안 됨 → 예외를 삼킴(방어).
  BEGIN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT p.id, 'system',
           '새 고객 문의 (' || v_cat_label || ')',
           '「' || left(COALESCE(NEW.subject, '문의'), 50) || '」',
           '/?tab=admin'
    FROM public.profiles p
    WHERE p.is_admin = true
      AND p.id <> NEW.user_id;   -- 본인이 관리자이며 스스로 문의한 경우 자기알림 제외
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'tg_notify_admins_new_support 알림 실패(무시): %', SQLERRM;
  END;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_admins_new_support ON public.support_inquiries;
CREATE TRIGGER trg_notify_admins_new_support
  AFTER INSERT ON public.support_inquiries
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_admins_new_support();

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 문의 1건 INSERT 후 관리자 계정 notifications 에 '새 고객 문의' 1행:
--   SELECT title, body, link FROM public.notifications
--   WHERE title LIKE '새 고객 문의%' ORDER BY created_at DESC LIMIT 3;
-- ════════════════════════════════════════════════════════════════════════════
