-- ════════════════════════════════════════════════════════════════════════════
-- 버그 제보 스크린샷 첨부 (2026-06-11)
--   ① bug-screenshots Storage 버킷 (본인 폴더 업로드 / 공개 읽기 — 어드민 열람용)
--   ② bug_reports.image_urls text[] 컬럼 추가
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ① 버킷 (user-avatars 패턴과 동일: public 읽기 + 본인 폴더 업로드)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-screenshots',
  'bug-screenshots',
  true,
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read bug screenshots" ON storage.objects;
CREATE POLICY "Public read bug screenshots"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'bug-screenshots');

DROP POLICY IF EXISTS "Users upload own bug screenshot" ON storage.objects;
CREATE POLICY "Users upload own bug screenshot"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'bug-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own bug screenshot" ON storage.objects;
CREATE POLICY "Users delete own bug screenshot"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'bug-screenshots'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ② 스크린샷 URL 배열 컬럼
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS image_urls text[];

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT id FROM storage.buckets WHERE id = 'bug-screenshots';            -- 1행
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='bug_reports' AND column_name='image_urls';           -- 1행
-- ════════════════════════════════════════════════════════════════════════════
