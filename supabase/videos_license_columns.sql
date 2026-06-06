-- ════════════════════════════════════════════════════════════════════════════
-- videos 테이블 — 라이선스/출처 컬럼 추가 (어드민 시드 콘텐츠용)
-- 적용 일자: 2026-06-06
-- 목적: 어드민이 CC0/CC-BY/퍼블릭도메인 등 오픈 라이선스 작품을 시드로 올릴 때
--       출처·라이선스·크레딧을 기록 (CC-BY 출처표기 컴플라이언스 + 분쟁 대비).
--       일반 크리에이터 업로드는 기본값 'original'(본인 창작)로 들어감.
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리("+")에 이 파일 내용 붙여넣기 → Run
--   (IF NOT EXISTS 라 이미 적용된 컬럼은 안전하게 스킵)
-- ════════════════════════════════════════════════════════════════════════════

-- 라이선스 종류 (기본 original = 본인 창작)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS license_type TEXT DEFAULT 'original'
  CHECK (license_type IN ('original', 'cc0', 'cc-by', 'cc-by-sa', 'public-domain'));

-- 원본 출처 URL (예: archive.org / studio.blender.org 링크)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS license_source_url TEXT DEFAULT '';

-- 출처표기(크레딧) 문구 (예: "© Blender Foundation — studio.blender.org (CC BY)")
ALTER TABLE videos ADD COLUMN IF NOT EXISTS attribution TEXT DEFAULT '';

-- 원작자명 (선택)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS original_creator TEXT DEFAULT '';

COMMENT ON COLUMN videos.license_type IS '라이선스: original(본인창작)/cc0/cc-by/cc-by-sa/public-domain';
COMMENT ON COLUMN videos.license_source_url IS '오픈 라이선스 원본 출처 URL';
COMMENT ON COLUMN videos.attribution IS 'CC-BY 등 출처표기 크레딧 문구';
COMMENT ON COLUMN videos.original_creator IS '원작자명 (오픈 라이선스 작품)';
