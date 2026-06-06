-- ════════════════════════════════════════════════════════════════════════════
-- OTT 히어로 미리보기 클립 (hero_clip_url)
--
-- 배경: 풀영화를 스트리밍하며 하이라이트 지점으로 deep seek 하면 버퍼링/디코드 문제로
--       영상이 멈추거나 검게 나오는 일이 빈번했다(HLS·MP4·video.js 모두). OTT 표준대로
--       "미리 잘린 짧은 클립을 처음부터(=seek 0) 네이티브 <video> 로 루프 재생"하도록 전환.
--
--   - videos.hero_clip_url: 30초 하이라이트 클립(MP4)의 공개 URL. 있으면 히어로가 이걸 재생.
--                           없으면 풀영상 MP4 폴백을 0초부터 재생(이것도 seek 없어 안정적).
--   - 클립은 ffmpeg 로 하이라이트(highlight_start~+30s)를 잘라 인코딩(H.264/yuv420p/faststart)
--     후 public 버킷 hero-clips 에 업로드. 클라이언트는 네이티브 <video autoplay muted loop>.
--
-- 향후(방법 B): 업로드 파이프라인에서 모든 영상의 클립을 자동 생성하면 전 영화에 적용된다.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 컬럼
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS hero_clip_url text;

-- 2) 동영상 전용 공개 버킷 (video/mp4, 50MB)
INSERT INTO storage.buckets (id, name, public, allowed_mime_types, file_size_limit)
VALUES ('hero-clips', 'hero-clips', true, ARRAY['video/mp4'], 52428800)
ON CONFLICT (id) DO UPDATE
  SET public = true, allowed_mime_types = ARRAY['video/mp4'], file_size_limit = 52428800;

-- 참고: 현재 히어로(Star Wreck)는 클립이 생성·연결돼 있음(hero_clip_url 세팅).
--       다른 영화가 히어로가 되면 클립이 없으면 풀영상 0초 재생(폴백)으로 안전 동작.
