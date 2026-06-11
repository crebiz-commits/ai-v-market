-- ════════════════════════════════════════════════════════════════════════════
-- 고객 1:1 문의 (고객센터) — 2026-06-11
--   일반 고객이 사이트 내에서 문의 → 운영자가 사이트 내에서 답변 → 고객이
--   "내 문의 내역"에서 답변·상태 확인 + 답변 시 알림. (비즈니스 문의와 별개)
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.support_inquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  category    TEXT NOT NULL DEFAULT 'etc'
              CHECK (category IN ('payment','account','subscription','video','bug','etc')),
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  admin_reply TEXT,
  replied_at  TIMESTAMPTZ,
  replied_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_url  TEXT
);

CREATE INDEX IF NOT EXISTS idx_support_inq_user ON public.support_inquiries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_inq_status ON public.support_inquiries(status, created_at DESC);

ALTER TABLE public.support_inquiries ENABLE ROW LEVEL SECURITY;

-- 로그인 사용자가 자기 명의로 제출
DROP POLICY IF EXISTS "insert own support inquiry" ON public.support_inquiries;
CREATE POLICY "insert own support inquiry" ON public.support_inquiries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 본인 문의 또는 관리자(is_admin SECURITY DEFINER — profiles 직접참조 금지 원칙)
DROP POLICY IF EXISTS "read own or admin support inquiry" ON public.support_inquiries;
CREATE POLICY "read own or admin support inquiry" ON public.support_inquiries FOR SELECT
  USING (user_id = auth.uid() OR public.is_admin());

-- 답변/상태 변경은 관리자만
DROP POLICY IF EXISTS "admin update support inquiry" ON public.support_inquiries;
CREATE POLICY "admin update support inquiry" ON public.support_inquiries FOR UPDATE
  USING (public.is_admin());

-- ── 관리자 답변 RPC: 답변 저장 + 상태 answered + 고객에게 알림 ──
CREATE OR REPLACE FUNCTION public.admin_reply_support_inquiry(p_id uuid, p_reply text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid; v_subject text; v_reply text;
BEGIN
  PERFORM public.assert_admin();
  v_reply := btrim(COALESCE(p_reply, ''));
  IF v_reply = '' THEN RAISE EXCEPTION 'empty reply'; END IF;

  UPDATE public.support_inquiries
    SET admin_reply = v_reply, status = 'answered',
        replied_at = now(), replied_by = auth.uid(), updated_at = now()
    WHERE id = p_id
    RETURNING user_id, subject INTO v_user, v_subject;
  IF v_user IS NULL THEN RAISE EXCEPTION 'inquiry not found'; END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (v_user, 'system', '문의에 답변이 등록되었어요',
          '「' || COALESCE(v_subject, '문의') || '」 답변을 확인해 보세요.',
          '/?support=' || p_id::text);
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_reply_support_inquiry(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
