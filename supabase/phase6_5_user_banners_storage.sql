-- ════════════════════════════════════════════════════════════════════════════
-- Phase 6.5 — 채널 배너 Storage 버킷 (2026-05-12)
--
-- 사용자가 채널 배너 이미지를 직접 업로드할 수 있도록 Supabase Storage 버킷 생성.
-- - public read (누구나 배너 이미지 보기)
-- - 본인만 자기 폴더(`{user_id}/...`)에 업로드/덮어쓰기/삭제
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 만들어서 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- 1. 버킷 생성 (이미 있으면 설정만 업데이트)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-banners',
  'user-banners',
  true,           -- 공개 (누구나 URL로 접근)
  5242880,        -- 5MB 제한
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. 정책: 누구나 읽기 (배너는 공개 이미지)
DROP POLICY IF EXISTS "Public read user banners" ON storage.objects;
CREATE POLICY "Public read user banners"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-banners');

-- 3. 정책: 본인 폴더에만 업로드 (파일 경로 = `{user_id}/banner.{ext}`)
DROP POLICY IF EXISTS "Users upload own banner" ON storage.objects;
CREATE POLICY "Users upload own banner"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 4. 정책: 본인 파일 덮어쓰기 (upsert: true 시 필요)
DROP POLICY IF EXISTS "Users update own banner" ON storage.objects;
CREATE POLICY "Users update own banner"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user-banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. 정책: 본인 파일 삭제
DROP POLICY IF EXISTS "Users delete own banner" ON storage.objects;
CREATE POLICY "Users delete own banner"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-banners'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
