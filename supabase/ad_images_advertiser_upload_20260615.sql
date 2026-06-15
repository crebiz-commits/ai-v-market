-- ════════════════════════════════════════════════════════════════════════════
-- 광고주 셀프서비스 — ad-images 버킷 본인 폴더 업로드 허용 (2026-06-15)
--   기존: 업로드 어드민 전용. 광고주가 본인 폴더({uid}/...)에 소재 업로드 가능하게.
--   읽기는 기존 "Public read" 정책 유지(광고 노출용).
-- 적용: SQL Editor → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Advertisers upload own ad images" ON storage.objects;
CREATE POLICY "Advertisers upload own ad images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'ad-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Advertisers update own ad images" ON storage.objects;
CREATE POLICY "Advertisers update own ad images"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'ad-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Advertisers delete own ad images" ON storage.objects;
CREATE POLICY "Advertisers delete own ad images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'ad-images' AND (storage.foldername(name))[1] = auth.uid()::text);
