-- ════════════════════════════════════════════════════════════════════════════
-- hero-clips 버킷 업로드 RLS 정책 (2026-07-09)
--
--   배경: hero_clip.sql 이 hero-clips 공개 버킷을 만들었으나 업로드(INSERT) 정책이 없어
--         크리에이터가 업로드 페이지에서 히어로 클립을 올리면 RLS 에 막혔다(관리자/하네스만
--         service_role 로 넣던 상태). OTT(10분+) 영상 업로드 시 크리에이터가 직접 히어로
--         클립을 등록할 수 있게 "자기 폴더(uid/...)에만" 업로드/수정/삭제 허용.
--   경로 규칙: 클라가 `${auth.uid()}/파일.mp4` 로 업로드(Upload.tsx). 정책이 첫 폴더=uid 확인.
--   읽기: 버킷이 public=true 라 CDN 공개 URL 로 조회(히어로가 <video src=publicUrl>). RLS 불필요.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Users upload own hero clip" ON storage.objects;
CREATE POLICY "Users upload own hero clip"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hero-clips'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own hero clip" ON storage.objects;
CREATE POLICY "Users update own hero clip"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hero-clips'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own hero clip" ON storage.objects;
CREATE POLICY "Users delete own hero clip"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'hero-clips'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 검증:
--   SELECT polname FROM pg_policy WHERE polrelid = 'storage.objects'::regclass
--     AND polname LIKE '%hero clip%';
--   -- 기대: upload/update/delete 3개
