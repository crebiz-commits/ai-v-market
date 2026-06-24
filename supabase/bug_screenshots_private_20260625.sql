-- ════════════════════════════════════════════════════════════════════════════
-- bug-screenshots 버킷 비공개 전환 (2026-06-25) — 스토리지 감사
--
--   문제: 버그 제보 스크린샷 버킷이 public=true → URL 을 아는 사람은 누구나 열람.
--   스크린샷에 사용자 화면(개인정보·결제화면 등)이 담길 수 있어 공개 자세가 부적절.
--   (실위험은 낮음 — URL 이 owner/admin 만 보는 bug_reports.image_urls 에만 저장 —
--    이나 로그/공유/캐시 유출 시 영구 노출되므로 비공개 + 서명 URL 로 전환)
--
--   변경:
--   - 버킷 public=false (공개 URL 차단). 업로드/표시는 서명 URL(createSignedUrl)로.
--   - SELECT 정책: 공개 → "본인 폴더 또는 관리자"만. (createSignedUrl 시 RLS 평가)
--   - INSERT/DELETE(본인 폴더) 정책은 그대로 유지.
--   클라 동반 변경: StaticPages(경로 저장+로컬 미리보기), AdminBugReports(서명 URL 표시).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

UPDATE storage.buckets SET public = false WHERE id = 'bug-screenshots';

DROP POLICY IF EXISTS "Public read bug screenshots" ON storage.objects;
CREATE POLICY "Read own or admin bug screenshots"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'bug-screenshots'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT id, public FROM storage.buckets WHERE id='bug-screenshots';  -- public=false
--   SELECT policyname FROM pg_policies WHERE tablename='objects' AND schemaname='storage'
--     AND policyname='Read own or admin bug screenshots';               -- 1행
--   -- 비로그인/타인: 공개 URL 200→이제 접근 불가, 관리자/본인만 서명 URL 발급 가능.
-- ════════════════════════════════════════════════════════════════════════════
