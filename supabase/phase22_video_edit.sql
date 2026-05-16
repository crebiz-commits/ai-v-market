-- ════════════════════════════════════════════════════════════════════════════
-- Phase 22 — 영상 후편집 (썸네일 교체 + 챕터 + 자막)
-- 적용 일자: 2026-05-17
-- 선행: videos
--
-- 목적:
--   1. 영상 작성자가 등록 후에도 썸네일/챕터/자막 수정 가능
--   2. 영상 플레이어에 챕터 마커 + 자막 텍스트 트랙 표시
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: videos 컬럼 추가
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS chapters JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS subtitle_url TEXT;

COMMENT ON COLUMN public.videos.chapters IS
  '영상 챕터 배열. [{"title":"인트로","time_seconds":0}, ...]. time_seconds 오름차순 권장';
COMMENT ON COLUMN public.videos.subtitle_url IS
  'WebVTT (.vtt) 자막 파일 URL. video.js text track으로 로드됨';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 영상 메타 업데이트 RPC (본인 영상만)
--   - 썸네일/챕터/자막을 한 번에 갱신 가능
--   - 각 필드는 옵셔널 (NULL이면 변경 안 함)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_my_video_metadata(
  p_video_id     TEXT,
  p_thumbnail    TEXT     DEFAULT NULL,
  p_chapters     JSONB    DEFAULT NULL,
  p_subtitle_url TEXT     DEFAULT NULL,
  p_clear_subtitle BOOLEAN DEFAULT false   -- true면 subtitle_url을 NULL로 클리어
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT creator_id INTO v_owner FROM public.videos WHERE id = p_video_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION '영상을 찾을 수 없습니다';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION '본인 영상만 편집할 수 있습니다';
  END IF;

  UPDATE public.videos
  SET
    thumbnail = COALESCE(p_thumbnail, thumbnail),
    chapters = COALESCE(p_chapters, chapters),
    subtitle_url = CASE
      WHEN p_clear_subtitle THEN NULL
      WHEN p_subtitle_url IS NOT NULL THEN p_subtitle_url
      ELSE subtitle_url
    END
  WHERE id = p_video_id;
END;
$$;

COMMENT ON FUNCTION public.update_my_video_metadata IS
  '본인 영상의 썸네일/챕터/자막 일괄 갱신. NULL이면 해당 필드 변경 안 함. p_clear_subtitle=true면 자막 제거';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: Storage 버킷 생성 (video-thumbnails + video-subtitles)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('video-thumbnails', 'video-thumbnails', true, 5242880,
   ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/jpg']),
  ('video-subtitles', 'video-subtitles', true, 1048576,
   ARRAY['text/vtt', 'text/plain', 'application/octet-stream'])
ON CONFLICT (id) DO NOTHING;

-- Storage RLS — 본인이 본인 영상의 파일만 업로드 가능
-- 정책 이름이 이미 있으면 DROP & CREATE
DROP POLICY IF EXISTS "thumbnails_insert_own" ON storage.objects;
CREATE POLICY "thumbnails_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'video-thumbnails'
    AND auth.uid() IS NOT NULL
    -- 파일명 규칙: {auth.uid()}/{video_id}/...
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "thumbnails_update_own" ON storage.objects;
CREATE POLICY "thumbnails_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'video-thumbnails'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "thumbnails_select_all" ON storage.objects;
CREATE POLICY "thumbnails_select_all"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'video-thumbnails');

DROP POLICY IF EXISTS "subtitles_insert_own" ON storage.objects;
CREATE POLICY "subtitles_insert_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'video-subtitles'
    AND auth.uid() IS NOT NULL
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "subtitles_update_own" ON storage.objects;
CREATE POLICY "subtitles_update_own"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'video-subtitles'
    AND (storage.foldername(name))[1] = auth.uid()::TEXT
  );

DROP POLICY IF EXISTS "subtitles_select_all" ON storage.objects;
CREATE POLICY "subtitles_select_all"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'video-subtitles');

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 챕터 업데이트
--   SELECT public.update_my_video_metadata(
--     '영상_id',
--     NULL,
--     '[{"title":"인트로","time_seconds":0},{"title":"본편","time_seconds":15}]'::jsonb,
--     NULL,
--     false
--   );
--
--   -- 2. 자막 URL 설정
--   SELECT public.update_my_video_metadata('영상_id', NULL, NULL, 'https://.../subtitle.vtt', false);
--
--   -- 3. 자막 제거
--   SELECT public.update_my_video_metadata('영상_id', NULL, NULL, NULL, true);
--
--   -- 4. Storage 버킷 확인
--   SELECT id, name, public, file_size_limit FROM storage.buckets
--   WHERE id IN ('video-thumbnails', 'video-subtitles');
-- ════════════════════════════════════════════════════════════════════════════
