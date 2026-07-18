-- ════════════════════════════════════════════════════════════════════════════
-- 자체광고 모바일 전용 이미지(선택) — image_url_mobile 컬럼 + ads_public 뷰 노출 (2026-07-18)
--
--   [배경] 자체광고 피드 카드가 데스크탑(DesktopAdCard=aspect-video 16:9 가로)과
--     모바일(AdCard=.discovery-section, 화면폭×(뷰포트-헤더)/2 = 가로형 대략 4:3~3:2) 규격이
--     달라, object-cover 로 한 이미지를 양쪽에 쓰면 한쪽이 잘림(16:9로 편집→모바일 좌우 잘림).
--   [정책] 데스크탑=image_url(필수·폴백), 모바일=image_url_mobile(선택). 모바일값이 NULL 이면
--     image_url 로 폴백 → 기존 광고 안 깨짐. "중요한 광고만 2장" 준비하면 되는 실무 표준.
--   [연결] 표시측=DiscoveryFeed 모바일 카드(image_url_mobile || image_url).
--     생성측=AdminDashboard(자체광고) ads INSERT payload(폼 스프레드로 자동 반영).
--     ※ advertiser_create_ad RPC(셀프서브 광고주)는 후속 과제(현재 미반영 — 셀프서브는
--       데스크탑 이미지만. 피드광고 판매 게이트가 아직 off 라 실사용 영향 없음).
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run (멱등).
--
--   ★ ads_public 뷰의 새 정본. ads_public_view_20260620.sql 재실행 금지(image_url_mobile
--     빠진 옛 뷰로 되돌아가 피드 광고쿼리가 그 컬럼을 못 찾음). 이 파일이 최신 뷰 정의.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 모바일 전용 이미지 컬럼(선택) ─────────────────────────────────────────────
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS image_url_mobile text;
COMMENT ON COLUMN public.ads.image_url_mobile IS
  '모바일 피드 카드용 가로 4:3(~3:2) 광고 이미지(선택). NULL이면 image_url로 폴백. 2026-07-18.';

-- 2) ads_public 뷰에 image_url_mobile 노출 ────────────────────────────────────
--   CREATE OR REPLACE VIEW 은 기존 컬럼 순서를 바꿀 수 없음 → 새 컬럼은 반드시 맨 끝에 추가.
CREATE OR REPLACE VIEW public.ads_public AS
SELECT
  id, title, advertiser, image_url, video_url, thumbnail_url,
  link_url, cta_text, interval_count, ad_type,
  image_url_mobile
FROM public.ads
WHERE status = 'approved'
  AND is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >= now());

GRANT SELECT ON public.ads_public TO anon, authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='ads_public' AND column_name='image_url_mobile';   -- 1행이면 정상
-- ════════════════════════════════════════════════════════════════════════════
