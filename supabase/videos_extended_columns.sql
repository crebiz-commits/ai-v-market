-- ════════════════════════════════════════════════════════════════════════════
-- videos 테이블 확장 마이그레이션
-- 적용 일자: 2026-04-30
-- 추가 컬럼:
--   - AI 제작 증빙 (3개): seed, ai_model_version
--   - 시네마 메타데이터 (7개): director, writer, composer, cast_credits,
--                              production_year, language, subtitle_language
--   - 공개 설정 (1개): visibility
--   - 하이라이트 구간 (2개): highlight_start, highlight_end
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
--   (이미 적용된 컬럼은 IF NOT EXISTS로 안전하게 스킵)
-- ════════════════════════════════════════════════════════════════════════════

-- AI 제작 증빙
ALTER TABLE videos ADD COLUMN IF NOT EXISTS ai_model_version TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS seed TEXT DEFAULT '';

-- 시네마 메타데이터
ALTER TABLE videos ADD COLUMN IF NOT EXISTS director TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS writer TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS composer TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS cast_credits TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS production_year SMALLINT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS language TEXT DEFAULT '';
ALTER TABLE videos ADD COLUMN IF NOT EXISTS subtitle_language TEXT DEFAULT '';

-- 공개 설정 (public / unlisted / private)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS visibility TEXT DEFAULT 'public'
  CHECK (visibility IN ('public', 'unlisted', 'private'));

-- 하이라이트 구간 (홈 피드/큐레이션 노출용 10~30초)
ALTER TABLE videos ADD COLUMN IF NOT EXISTS highlight_start REAL DEFAULT 0;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS highlight_end REAL DEFAULT 15;

-- 컬럼이 이전에 INTEGER로 만들어졌을 가능성 대비 (IF NOT EXISTS는 타입 변경 안 함)
-- 이미 REAL이면 NO-OP, INTEGER였다면 REAL로 안전 변환
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos'
      AND column_name = 'highlight_start'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE videos ALTER COLUMN highlight_start TYPE REAL USING highlight_start::REAL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'videos'
      AND column_name = 'highlight_end'
      AND data_type = 'integer'
  ) THEN
    ALTER TABLE videos ALTER COLUMN highlight_end TYPE REAL USING highlight_end::REAL;
  END IF;
END $$;

-- 인덱스: 공개 설정 필터링 자주 사용
CREATE INDEX IF NOT EXISTS idx_videos_visibility ON videos(visibility);

-- 인덱스: 카테고리 + 공개 설정 복합 (홈 피드 쿼리)
CREATE INDEX IF NOT EXISTS idx_videos_category_visibility
  ON videos(category, visibility)
  WHERE visibility = 'public';

COMMENT ON COLUMN videos.ai_model_version IS 'AI 모델 세부 버전 (예: Sora v2.1, Runway Turbo)';
COMMENT ON COLUMN videos.seed IS 'AI 생성 시드값 (재현 가능성 + 저작권 증거)';
COMMENT ON COLUMN videos.director IS '시네마 메타: 감독';
COMMENT ON COLUMN videos.writer IS '시네마 메타: 각본';
COMMENT ON COLUMN videos.composer IS '시네마 메타: 음악';
COMMENT ON COLUMN videos.cast_credits IS '시네마 메타: 출연/가상 캐릭터 (콤마 구분)';
COMMENT ON COLUMN videos.production_year IS '시네마 메타: 제작 연도';
COMMENT ON COLUMN videos.language IS '시네마 메타: 영상 음성 언어';
COMMENT ON COLUMN videos.subtitle_language IS '시네마 메타: 자막 언어';
COMMENT ON COLUMN videos.visibility IS 'public(전체) / unlisted(링크) / private(비공개)';
COMMENT ON COLUMN videos.highlight_start IS '홈 피드 노출용 하이라이트 시작 (초)';
COMMENT ON COLUMN videos.highlight_end IS '홈 피드 노출용 하이라이트 종료 (초)';
