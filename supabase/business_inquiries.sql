-- ════════════════════════════════════════════════════════════════════════════
-- 비즈니스 문의 테이블 (Phase 8 직전 — 2026-05-12)
--
-- 외부 광고주/투자자/제휴 제안을 받기 위한 문의함.
-- - 누구나 INSERT 가능 (비로그인도 포함, 외부인 영입 창구)
-- - 본인이 만든 row만 자기 것만 SELECT (확인용)
-- - 관리자만 전체 조회 (admin 대시보드)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 만들어서 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.business_inquiries (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  category     TEXT NOT NULL CHECK (category IN ('advertising', 'investment', 'partnership', 'b2b_license', 'other')),
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  message      TEXT NOT NULL,
  -- 처리 상태
  status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewing', 'replied', 'closed')),
  reviewed_at  TIMESTAMPTZ,
  reviewer_notes TEXT,
  -- 추적 (선택)
  source_url   TEXT,        -- 어느 페이지에서 제출됐는지
  user_agent   TEXT,
  -- 인증된 사용자가 제출했다면 user_id 기록 (비로그인 OK)
  submitted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_business_inquiries_created_at
  ON public.business_inquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_inquiries_status
  ON public.business_inquiries(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_business_inquiries_category
  ON public.business_inquiries(category, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- RLS: 누구나 INSERT, 관리자만 SELECT
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.business_inquiries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit inquiry" ON public.business_inquiries;
CREATE POLICY "Anyone can submit inquiry"
  ON public.business_inquiries FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can read all inquiries" ON public.business_inquiries;
CREATE POLICY "Admins can read all inquiries"
  ON public.business_inquiries FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE email IN ('crebizlogistics@gmail.com')
    )
  );

DROP POLICY IF EXISTS "Admins can update inquiries" ON public.business_inquiries;
CREATE POLICY "Admins can update inquiries"
  ON public.business_inquiries FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE email IN ('crebizlogistics@gmail.com')
    )
  );
