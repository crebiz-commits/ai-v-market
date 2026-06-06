-- ════════════════════════════════════════════════════════════════════════════
-- 관리자 RLS 정책 일괄 전환: profiles.is_admin 직접참조 → public.is_admin() 함수
--
-- 배경(버그):
--   profiles 테이블은 PII 보호를 위해 anon/authenticated 에게 컬럼 레벨 SELECT 만
--   허용한다(avatar_url, banner_url, bio, created_at, display_name, id,
--   subscription_tier). is_admin 컬럼은 의도적으로 클라이언트에 비공개.
--   그런데 여러 RLS 정책이 `EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid()
--   AND is_admin=true)` 형태로 is_admin 컬럼을 직접 참조해서, 정책 평가 시
--   "permission denied for table profiles" 가 발생했다.
--   특히 ads 의 admin ALL 정책은 permissive 라서 SELECT 에도 적용 → 익명/일반
--   사용자의 ads 조회까지 전부 실패(홈피드 광고 사라짐, 관리자 광고목록 로드 실패).
--
-- 해법:
--   SECURITY DEFINER 함수 public.is_admin() 로 관리자 판별을 캡슐화.
--   함수 소유자(postgres)가 profiles 전체 컬럼을 읽으므로 호출자는 컬럼 권한 불필요.
--   영향 정책 6개를 모두 is_admin() 호출로 재작성.
-- ════════════════════════════════════════════════════════════════════════════

-- SECURITY DEFINER admin checker
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) $fn$;
REVOKE ALL ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- ads: 깨진 profiles 직접참조 정책 2개(profiles-EXISTS + 레거시 이메일 화이트리스트) 제거
DROP POLICY IF EXISTS "Admin full access" ON public.ads;
DROP POLICY IF EXISTS "admin full access" ON public.ads;
CREATE POLICY "ads_admin_manage" ON public.ads FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- admin_logs
DROP POLICY IF EXISTS "admin_logs_admin_only" ON public.admin_logs;
CREATE POLICY "admin_logs_admin_only" ON public.admin_logs FOR SELECT
  USING (public.is_admin());

-- business_inquiries
DROP POLICY IF EXISTS "Admins can read all inquiries" ON public.business_inquiries;
CREATE POLICY "Admins can read all inquiries" ON public.business_inquiries FOR SELECT
  USING (public.is_admin());
DROP POLICY IF EXISTS "Admins can update inquiries" ON public.business_inquiries;
CREATE POLICY "Admins can update inquiries" ON public.business_inquiries FOR UPDATE
  USING (public.is_admin());

-- reports (본인 신고 또는 관리자)
DROP POLICY IF EXISTS "reports_select_own_or_admin" ON public.reports;
CREATE POLICY "reports_select_own_or_admin" ON public.reports FOR SELECT
  USING ((auth.uid() = reporter_id) OR public.is_admin());

-- revenue_distributions (본인 정산 또는 관리자)
DROP POLICY IF EXISTS "rev_dist_select_own" ON public.revenue_distributions;
CREATE POLICY "rev_dist_select_own" ON public.revenue_distributions FOR SELECT
  USING ((auth.uid() = creator_id) OR public.is_admin());
