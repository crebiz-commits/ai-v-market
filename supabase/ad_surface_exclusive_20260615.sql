-- ════════════════════════════════════════════════════════════════════════════
-- 광고 노출면(surface) 상호 배타화 (2026-06-15)
--   문제: 광고주 "오버레이 배너"가 format='overlay' AND ad_type='feed_display' 라
--         ① 영상 위 오버레이(get_ad_for_video: format 키) 와
--         ② 홈 피드 카드(DiscoveryFeed 쿼리: ad_type='feed_display' 키)
--         양쪽에 동시 노출됨. 사용자 기대: 오버레이/피드카드는 별개 상품.
--   해결: ad_type 에 'overlay' 추가 → 오버레이 광고는 ad_type='overlay' 로,
--         피드 쿼리(ad_type='feed_display')에서 제외. get_ad_for_video 는 format
--         키라 오버레이 노출은 그대로 유지.
--   surface ↔ 키 정리:
--     홈 피드 카드   = ad_type='feed_display'  (format='feed')
--     영상 프리롤    = ad_type='video_preroll' (pick_random_video_preroll)
--     오버레이 배너  = ad_type='overlay'        (format='overlay', get_ad_for_video)
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) ad_type 허용값에 'overlay' 추가
ALTER TABLE public.ads DROP CONSTRAINT IF EXISTS ads_ad_type_check;
ALTER TABLE public.ads ADD CONSTRAINT ads_ad_type_check
  CHECK (ad_type = ANY (ARRAY['feed_display'::text, 'video_preroll'::text, 'overlay'::text]));

-- 2) 기존 데이터 정정: 오버레이 광고가 feed_display 로 잘못 분류된 것 → overlay
--    (format='overlay' 는 영상 위 오버레이 surface 전용)
UPDATE public.ads
SET ad_type = 'overlay', updated_at = now()
WHERE format = 'overlay' AND ad_type = 'feed_display';
