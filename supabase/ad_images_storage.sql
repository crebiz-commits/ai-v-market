-- ════════════════════════════════════════════════════════════════════════════
-- 광고 이미지 Storage 버킷 생성 (Phase 2 — 이미지 직접 업로드)
-- 적용 일자: 2026-05-01
--
-- 광고 등록 시 관리자가 이미지를 직접 업로드할 수 있도록 Supabase Storage
-- 버킷 생성. public read (누구나 광고 이미지 보기) + 관리자만 업로드.
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- 광고 이미지 버킷 생성 (이미 있으면 무시)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ad-images',
  'ad-images',
  true, -- 공개 (누구나 이미지 URL로 접근)
  10485760, -- 10MB 제한
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 정책: 누구나 읽기 가능 (광고 노출용)
DROP POLICY IF EXISTS "Public read access for ad images" ON storage.objects;
CREATE POLICY "Public read access for ad images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ad-images');

-- 정책: 관리자만 업로드 가능
DROP POLICY IF EXISTS "Admins can upload ad images" ON storage.objects;
CREATE POLICY "Admins can upload ad images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'ad-images'
    AND auth.uid() IN (
      SELECT id FROM auth.users
      WHERE email IN (
        'crebizlogistics@gmail.com'
        -- 관리자 이메일을 추가하려면 위에 ', email' 형식으로 추가
      )
    )
  );

-- 정책: 관리자만 삭제 가능 (광고 삭제 시 같이 정리하기 위함)
DROP POLICY IF EXISTS "Admins can delete ad images" ON storage.objects;
CREATE POLICY "Admins can delete ad images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'ad-images'
    AND auth.uid() IN (
      SELECT id FROM auth.users
      WHERE email IN ('crebizlogistics@gmail.com')
    )
  );
