-- ════════════════════════════════════════════════════════════════════════════
-- ad-images 버킷 업로드/삭제 정책 수정 (2026-06-11)
--
-- 문제: 정책이 profiles.is_admin 을 직접 참조(EXISTS SELECT FROM profiles ...).
--   C2 보안 수정으로 authenticated 가 profiles.is_admin 컬럼 SELECT 불가 →
--   관리자가 이미지 업로드 시 "permission denied for table profiles" 로 실패.
--   (광고 이미지 + 이벤트 배너 이미지 업로드 모두 영향)
--
-- 해결: SECURITY DEFINER 함수 public.is_admin() 로 교체 (phase_admin_rls_unify 패턴).
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Admins can upload ad images" ON storage.objects;
CREATE POLICY "Admins can upload ad images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ad-images' AND public.is_admin());

DROP POLICY IF EXISTS "Admins can delete ad images" ON storage.objects;
CREATE POLICY "Admins can delete ad images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ad-images' AND public.is_admin());

-- 검증:
--   SELECT polname, pg_get_expr(polwithcheck, polrelid)
--   FROM pg_policy WHERE polrelid='storage.objects'::regclass
--     AND polname LIKE '%ad images%';   -- is_admin() 호출로 바뀌어 있어야 함
