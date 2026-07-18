-- ════════════════════════════════════════════════════════════════════════════
-- OTT 히어로 전용 광고 형식 신설 — ad_type='hero_display' / format='hero' (2026-07-18)
--
--   [배경] OTT 히어로에 프리롤 재사용이 아니라 "독립 영상광고"(TV 광고처럼 그냥 재생)를
--     싣기로 함. 세로 소재 업로드, 자체광고·수주 모두 별도 히어로 형식으로 입력.
--   [조치] ads 의 ad_type/format CHECK 제약에 새 값 추가.
--     · advertiser_create_ad / AdminDashboard 는 format/ad_type 을 직접 insert(화이트리스트
--       검증 없음) → 이 CHECK 제약이 유일한 게이트. 여기만 넓히면 히어로 형식 등록 가능.
--     · ads_public 뷰는 ad_type 무필터(승인·활성·기간·예산만) → 히어로 광고 자동 노출.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) ad_type 에 hero_display 추가 (기존 명시 제약: ad_surface_exclusive_20260615.sql)
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_ad_type_check;
ALTER TABLE public.ads ADD CONSTRAINT ads_ad_type_check
  CHECK (ad_type = ANY (ARRAY['feed_display'::text, 'video_preroll'::text, 'overlay'::text, 'hero_display'::text]));

-- 2) format 에 hero 추가 (기존 컬럼 CHECK 자동이름: ads_format_check — phase28_ad_diversification.sql)
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_format_check;
ALTER TABLE public.ads ADD CONSTRAINT ads_format_check
  CHECK (format IN ('feed', 'preroll', 'midroll', 'overlay', 'postroll', 'bumper', 'hero'));

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.ads'::regclass AND conname IN ('ads_ad_type_check','ads_format_check');
--     → 각각 hero_display / hero 포함돼야 정상.
-- ════════════════════════════════════════════════════════════════════════════
