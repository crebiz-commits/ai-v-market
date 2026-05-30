-- ════════════════════════════════════════════════════════════════════════════
-- 어드민 RLS 통일 — 이메일 화이트리스트 → profiles.is_admin (2026-05-30)
--
-- 목적:
--   ads / ad-images / business_inquiries 의 RLS 정책이 이메일 화이트리스트 기반이라
--   (특히 ads_table.sql 은 deprecated 'admin@ai-v-market.com'),
--   신규 어드민 추가·회수 시 SQL 재배포가 필요하고 다른 PC 재실행 시 권한이 깨질 수 있음.
--   profiles.is_admin (admin_set_admin_role RPC) 단일 source of truth 로 통일한다.
--
-- 적용 영향:
--   현재 어드민(crebizlogistics@gmail.com)은 phase8_platform_settings.sql 부트스트랩으로
--   이미 profiles.is_admin = true 이므로 권한 변화 없음. 모두 idempotent (DROP IF EXISTS).
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
--   → "Success. No rows returned" 이면 성공
--
-- 시점:
--   베타엔 어드민 1명이라 급하지 않음(현재 운영 영향 0). 어드민 추가 또는 출시 직전 적용 권장.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. public.ads ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admin full access" ON public.ads;
CREATE POLICY "Admin full access"
  ON public.ads FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ── 2. storage.objects (ad-images 버킷) ──────────────────────────────────────
DROP POLICY IF EXISTS "Admins can upload ad images" ON storage.objects;
CREATE POLICY "Admins can upload ad images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ad-images'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can delete ad images" ON storage.objects;
CREATE POLICY "Admins can delete ad images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ad-images'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ── 3. public.business_inquiries ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all inquiries" ON public.business_inquiries;
CREATE POLICY "Admins can read all inquiries"
  ON public.business_inquiries FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can update inquiries" ON public.business_inquiries;
CREATE POLICY "Admins can update inquiries"
  ON public.business_inquiries FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--   SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr
--   FROM pg_policy
--   WHERE polname IN ('Admin full access','Admins can read all inquiries',
--                     'Admins can update inquiries','Admins can upload ad images',
--                     'Admins can delete ad images');
--   → using_expr 에 'is_admin' 이 보이면 통일 완료
-- ────────────────────────────────────────────────────────────────────────────
