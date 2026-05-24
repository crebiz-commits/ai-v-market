-- ════════════════════════════════════════════════════════════════════════════
-- Storage DELETE 정책 보강 (2026-05-24)
--
-- 목적:
--   video-thumbnails / video-subtitles 버킷의 DELETE 정책 누락 보완.
--   현재 사용자가 본인 썸네일·자막 교체 시 이전 파일을 못 지움 → orphan 누적.
--
-- 추가 정책 3개:
--   1. thumbnails_delete_own — 본인 폴더의 썸네일 삭제
--   2. subtitles_delete_own  — 본인 폴더의 자막 삭제
--   3. admin_delete_any_storage — 어드민은 모든 Storage 파일 삭제 가능 (cleanup용)
--
-- 안전성:
--   - 각 사용자는 본인 폴더만 영향 (auth.uid()::text = (storage.foldername(name))[1])
--   - 어드민 정책은 profiles.is_admin = true 체크 (서버측 검증)
--   - DROP POLICY IF EXISTS 로 idempotent (재실행 안전)
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ① 본인 썸네일 삭제 정책
DROP POLICY IF EXISTS "thumbnails_delete_own" ON storage.objects;
CREATE POLICY "thumbnails_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'video-thumbnails'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ② 본인 자막 삭제 정책
DROP POLICY IF EXISTS "subtitles_delete_own" ON storage.objects;
CREATE POLICY "subtitles_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'video-subtitles'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ③ 어드민 cleanup 정책 (모든 버킷, 모든 사용자 파일 삭제 가능)
--   주의: profiles.is_admin = true 인 어드민만 통과. 일반 사용자에겐 영향 없음.
DROP POLICY IF EXISTS "admin_delete_any_storage" ON storage.objects;
CREATE POLICY "admin_delete_any_storage"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 (실행 후 확인)
--
--   -- 새로 추가된 3개 정책 확인 (총 17개 정책이어야 함)
--   SELECT pol.polname AS policy_name,
--     CASE pol.polcmd
--       WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
--       WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE'
--     END AS command
--   FROM pg_policy pol
--   JOIN pg_class cls ON cls.oid = pol.polrelid
--   JOIN pg_namespace ns ON ns.oid = cls.relnamespace
--   WHERE ns.nspname = 'storage' AND cls.relname = 'objects'
--     AND pol.polname IN ('thumbnails_delete_own', 'subtitles_delete_own', 'admin_delete_any_storage');
-- ────────────────────────────────────────────────────────────────────────────
