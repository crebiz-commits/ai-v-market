-- ════════════════════════════════════════════════════════════════════════════
-- ⛔ 재실행 금지 (SUPERSEDED) — 이 파일은 시네마 임계값이 180초(3분)인 옛 버전.
--    정본은 content_policy_v2.sql → cinema_rpc_hardening_20260708.sql (시네마 60초/1분).
--    이 파일을 다시 Run 하면 classify_video_placement 가 180초로 되돌아가 60~179초 단편이
--    시네마에서 전부 사라지고 신규 업로드도 오분류됨. 트리거 정의·백필은 절대 재실행하지 말 것.
--    (트리거 부착 CREATE TRIGGER 문만은 정본과 동일해 무해하나, 함수 재정의가 위험.)
-- ════════════════════════════════════════════════════════════════════════════
-- Phase 1: 영상 분류 자동화 (홈 / 시네마 / OTT)
-- 적용 일자: 2026-05-05
--
-- 목적:
--   영상 길이(duration)에 따라 자동으로 등록될 피드를 결정:
--   - 0~3분 (0~179초)   : 홈만
--   - 3분+ (180~599초)   : 홈 + 시네마
--   - 10분+ (600초+)     : 홈 + 시네마 + OTT
--
--   기존 영상은 자동 백필. 신규 업로드 시에도 트리거가 자동 처리.
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: videos 테이블에 분류 컬럼 추가
-- ────────────────────────────────────────────────────────────────────────────

-- 영상 길이(초). 기존 duration(text "MM:SS")에서 파싱
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- 각 피드 노출 여부 (트리거가 duration_seconds 기반으로 자동 계산)
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS show_on_home BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS show_on_cinema BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS show_on_ott BOOLEAN NOT NULL DEFAULT false;

-- 광고 수익 카운팅 시작 시점 (created_at + 48시간 검수 기간)
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS ad_eligibility_at TIMESTAMPTZ;

COMMENT ON COLUMN public.videos.duration_seconds IS '영상 총 길이(초). duration 텍스트("MM:SS"/"HH:MM:SS")에서 자동 파싱';
COMMENT ON COLUMN public.videos.show_on_home IS '홈 피드 노출 여부 (모든 영상은 기본 true)';
COMMENT ON COLUMN public.videos.show_on_cinema IS '시네마 피드 노출 여부 (3분+ 자동 true)';
COMMENT ON COLUMN public.videos.show_on_ott IS 'OTT 피드 노출 여부 (10분+ 자동 true)';
COMMENT ON COLUMN public.videos.ad_eligibility_at IS '광고 수익 카운팅 시작 시점 (created_at + 48h 검수 기간)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 분류 자동화 트리거 함수
--
-- 동작:
--   1. duration_seconds가 NULL이면 duration 텍스트에서 파싱
--   2. show_on_home / cinema / ott를 길이 기반으로 자동 설정
--   3. ad_eligibility_at이 NULL이면 created_at + 48h로 설정
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.classify_video_placement()
RETURNS TRIGGER AS $$
DECLARE
  parsed INTEGER;
BEGIN
  -- duration_seconds 자동 파싱 (NULL일 때만)
  IF NEW.duration_seconds IS NULL AND NEW.duration IS NOT NULL THEN
    NEW.duration_seconds :=
      CASE
        -- "HH:MM:SS" 형식
        WHEN NEW.duration ~ '^\d+:\d+:\d+$' THEN
          (split_part(NEW.duration, ':', 1)::int * 3600) +
          (split_part(NEW.duration, ':', 2)::int * 60) +
          (split_part(NEW.duration, ':', 3)::int)
        -- "MM:SS" 형식
        WHEN NEW.duration ~ '^\d+:\d+$' THEN
          (split_part(NEW.duration, ':', 1)::int * 60) +
          (split_part(NEW.duration, ':', 2)::int)
        -- 기타 형식 (예: 숫자만)
        WHEN NEW.duration ~ '^\d+$' THEN
          NEW.duration::int
        ELSE 0
      END;
  END IF;

  parsed := COALESCE(NEW.duration_seconds, 0);

  -- 모든 영상은 홈에 노출
  NEW.show_on_home := true;

  -- 시네마: 3분(180초) 이상
  NEW.show_on_cinema := parsed >= 180;

  -- OTT: 10분(600초) 이상
  NEW.show_on_ott := parsed >= 600;

  -- 광고 수익 카운팅 시작 시점 (NULL일 때만 — 한 번 설정되면 변경 안 함)
  IF NEW.ad_eligibility_at IS NULL THEN
    NEW.ad_eligibility_at := COALESCE(NEW.created_at, now()) + interval '48 hours';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.classify_video_placement IS
  'videos 테이블 INSERT/UPDATE 시 자동으로 영상 분류 (홈/시네마/OTT) + 광고 검수 시작 시점 설정';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 트리거 등록 (INSERT + duration/duration_seconds UPDATE 시 발동)
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS videos_classify_placement ON public.videos;
CREATE TRIGGER videos_classify_placement
  BEFORE INSERT OR UPDATE OF duration, duration_seconds ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.classify_video_placement();

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 기존 영상 백필
--   duration 컬럼을 자기 자신으로 UPDATE → 트리거 발동 → 자동 분류
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.videos SET duration = duration WHERE duration IS NOT NULL;

-- duration이 NULL/공백인 영상 (홈만 노출 + 광고 검수 시점 설정)
UPDATE public.videos
SET
  duration_seconds = COALESCE(duration_seconds, 0),
  show_on_home = true,
  show_on_cinema = false,
  show_on_ott = false,
  ad_eligibility_at = COALESCE(ad_eligibility_at, COALESCE(created_at, now()) + interval '48 hours')
WHERE duration IS NULL OR duration = '';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: 인덱스 (피드 쿼리 성능)
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_videos_show_on_home
  ON public.videos(show_on_home, created_at DESC)
  WHERE show_on_home = true;

CREATE INDEX IF NOT EXISTS idx_videos_show_on_cinema
  ON public.videos(show_on_cinema, created_at DESC)
  WHERE show_on_cinema = true;

CREATE INDEX IF NOT EXISTS idx_videos_show_on_ott
  ON public.videos(show_on_ott, created_at DESC)
  WHERE show_on_ott = true;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 분류 결과 확인
--   SELECT
--     count(*) FILTER (WHERE show_on_home) AS home_count,
--     count(*) FILTER (WHERE show_on_cinema) AS cinema_count,
--     count(*) FILTER (WHERE show_on_ott) AS ott_count,
--     count(*) AS total
--   FROM public.videos;
--
--   -- 영상별 분류 결과 (sample)
--   SELECT id, title, duration, duration_seconds,
--          show_on_home, show_on_cinema, show_on_ott, ad_eligibility_at
--   FROM public.videos
--   ORDER BY duration_seconds DESC NULLS LAST
--   LIMIT 10;
--
--   -- 길이 분포 분석
--   SELECT
--     CASE
--       WHEN duration_seconds < 180 THEN '0~3분 (홈만)'
--       WHEN duration_seconds < 600 THEN '3~10분 (홈+시네마)'
--       ELSE '10분+ (홈+시네마+OTT)'
--     END AS tier,
--     count(*) AS video_count,
--     min(duration) AS min_dur,
--     max(duration) AS max_dur
--   FROM public.videos
--   GROUP BY 1
--   ORDER BY 1;
-- ════════════════════════════════════════════════════════════════════════════
