-- ════════════════════════════════════════════════════════════════════════════
-- 버그 제보 스크린샷 첨부 (2026-06-11)
--   ① bug-screenshots Storage 버킷 (본인 폴더 업로드 / 읽기: 본인·어드민)
--   ② bug_reports.image_urls text[] 컬럼 추가
--
--   ⚠️ 하드닝됨(2026-06-25 bug_screenshots_private_20260625.sql) — 이 버킷은 스크린샷
--      속 PII(결제화면 등) 때문에 비공개다. 이 파일은 원래 public=true + 완전공개 read
--      정책이었으나, 재실행 시 공개로 되돌아가는 것을 막기 위해 아래를 비공개로 중화함.
--      (SELECT 정책은 private 파일의 "Read own or admin bug screenshots" 가 정본)
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ① 버킷 (비공개 — 서명URL 로만 접근. 본인 폴더 업로드)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'bug-screenshots',
  'bug-screenshots',
  false,   -- 비공개(2026-06-25 하드닝) — 재실행해도 공개로 안 돌아가게
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 공개 read 정책은 제거(비공개 버킷) — 읽기 정책 정본은 bug_screenshots_private_20260625.sql
DROP POLICY IF EXISTS "Public read bug screenshots" ON storage.objects;

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
