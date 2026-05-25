-- ════════════════════════════════════════════════════════════════════════════
-- 콘텐츠 정책 v2 — platform_settings note 컬럼 정리 (2026-05-26)
--
-- 목적:
--   콘텐츠 정책 v2 도입 후 옛 분배율 키 2개의 note (부제) 가 옛 설명 그대로
--   남아있어 어드민 페이지에서 헷갈림. 신규 정책에 맞춰 명확히 정리.
--
-- 영향:
--   값 변경 없음. note 컬럼(설명 텍스트)만 갱신.
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 → 본 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- 1) creator_share_ad_home — "홈 0~3분" → "1분 미만 영상 (현재 미적용)"
UPDATE public.platform_settings
SET note = '1분 미만 영상 광고 분배율. 콘텐츠 정책 v2에서 1분 미만 본편 광고 X — 정책 완화 시에만 적용'
WHERE key = 'creator_share_ad_home'
  AND effective_to IS NULL;

-- 2) creator_share_ad_cinema — "시네마 3분+" → "시네마 1~10분"
UPDATE public.platform_settings
SET note = '시네마 코너(1분~10분) 영상 광고 크리에이터 분배율'
WHERE key = 'creator_share_ad_cinema'
  AND effective_to IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--   SELECT key, value, note FROM public.platform_settings
--   WHERE key IN ('creator_share_ad_home', 'creator_share_ad_cinema')
--     AND effective_to IS NULL;
-- ════════════════════════════════════════════════════════════════════════════
