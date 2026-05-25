-- ════════════════════════════════════════════════════════════════════════════
-- 콘텐츠 정책 v2 — 영상 길이별 분류·페이월·광고 정책 통합 (2026-05-26)
--
-- 변경 사항:
--   1. platform_settings 키 6개 추가 (어드민이 조절 가능)
--   2. classify_video_placement 트리거 — 시네마 임계값 180→60초 (1분)
--   3. get_ad_for_video — 1분 미만 영상은 광고 노출 X
--   4. 기존 영상 백필 (분류 재계산)
--
-- 새 정책:
--   영상 업로드: 30초 미만 차단
--   홈 피드: 모든 영상 (15초 하이라이트 자동재생)
--   시네마 코너: 60초+ (1분 이상)
--   OTT 코너: 600초+ (10분 이상)
--   비구독자 영상 상세: 1분 미리보기 (영상 길이 무관 단일 규칙)
--   광고: 1분 미만 영상 본편 광고 X / 1분+ pre-roll·overlay / 10분+ + mid-roll
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 → 본 파일 전체 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: platform_settings 키 6개 추가 (어드민 조절 가능)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value, note) VALUES
  ('min_upload_duration_seconds',       30,  '영상 업로드 최소 길이(초). 미만은 등록 차단. 2026-05-26 신설'),
  ('cinema_min_duration_seconds',       60,  '시네마 코너 노출 최소 길이(초). 1분+ 영상만 시네마 등록'),
  ('ott_min_duration_seconds',          600, 'OTT 코너 노출 최소 길이(초). 10분+ 영상만 OTT 등록'),
  ('cinema_preview_seconds',            60,  '비구독자 영상 상세 미리보기 시간(초). 모든 영상 동일 (단순화)'),
  ('min_duration_for_preroll_seconds',  60,  'Pre-roll·Overlay 광고 적용 최소 영상 길이(초)'),
  ('min_duration_for_midroll_seconds',  600, 'Mid-roll 광고 적용 최소 영상 길이(초)')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: classify_video_placement 트리거 함수 재정의
--   시네마 임계값 180초(3분) → 60초(1분)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.classify_video_placement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parsed         INTEGER;
  v_cinema_min   INTEGER;
  v_ott_min      INTEGER;
BEGIN
  -- 동적 임계값 (platform_settings에서 조회, 없으면 fallback)
  v_cinema_min := COALESCE(public.get_platform_setting('cinema_min_duration_seconds')::INTEGER, 60);
  v_ott_min    := COALESCE(public.get_platform_setting('ott_min_duration_seconds')::INTEGER, 600);

  -- duration_seconds 자동 파싱 (NULL일 때만)
  IF NEW.duration_seconds IS NULL AND NEW.duration IS NOT NULL THEN
    NEW.duration_seconds :=
      CASE
        WHEN NEW.duration ~ '^\d+:\d+:\d+$' THEN
          (split_part(NEW.duration, ':', 1)::int * 3600) +
          (split_part(NEW.duration, ':', 2)::int * 60) +
          (split_part(NEW.duration, ':', 3)::int)
        WHEN NEW.duration ~ '^\d+:\d+$' THEN
          (split_part(NEW.duration, ':', 1)::int * 60) +
          (split_part(NEW.duration, ':', 2)::int)
        WHEN NEW.duration ~ '^\d+$' THEN
          NEW.duration::int
        ELSE 0
      END;
  END IF;

  parsed := COALESCE(NEW.duration_seconds, 0);

  -- 모든 영상은 홈에 노출
  NEW.show_on_home := true;

  -- 시네마: 1분(60초) 이상 — 신규 정책
  NEW.show_on_cinema := parsed >= v_cinema_min;

  -- OTT: 10분(600초) 이상
  NEW.show_on_ott := parsed >= v_ott_min;

  -- 광고 검수 시작 시점
  IF NEW.ad_eligibility_at IS NULL THEN
    NEW.ad_eligibility_at := COALESCE(NEW.created_at, now()) + interval '48 hours';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.classify_video_placement IS
  '영상 INSERT/UPDATE 시 자동 분류 (홈/시네마/OTT). 임계값은 platform_settings에서 동적 조회';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 기존 영상 백필 — 트리거 발동으로 자동 재분류
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.videos
SET duration = duration
WHERE duration IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: get_ad_for_video 수정 — 1분 미만 영상은 광고 노출 X
--   (phase28의 함수 재정의)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ad_for_video(
  p_video_id TEXT,
  p_format TEXT
)
RETURNS TABLE (
  ad_id          UUID,
  title          TEXT,
  advertiser     TEXT,
  image_url      TEXT,
  video_url      TEXT,
  thumbnail_url  TEXT,
  link_url       TEXT,
  cta_text       TEXT,
  duration_seconds INTEGER,
  skip_after_seconds INTEGER,
  trigger_position_pct INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration_sec INTEGER;
  v_category     TEXT;
  v_min_preroll  INTEGER;
  v_min_midroll  INTEGER;
BEGIN
  -- 영상 정보 조회 — alias 명시 (RETURNS TABLE 의 duration_seconds 와 ambiguous 회피)
  SELECT v.duration_seconds, v.category INTO v_duration_sec, v_category
  FROM public.videos v WHERE v.id = p_video_id;

  IF v_duration_sec IS NULL THEN
    RETURN;
  END IF;

  -- 동적 광고 임계값
  v_min_preroll := COALESCE(public.get_platform_setting('min_duration_for_preroll_seconds')::INTEGER, 60);
  v_min_midroll := COALESCE(public.get_platform_setting('min_duration_for_midroll_seconds')::INTEGER, 600);

  -- 영상 길이별 광고 형식 제한
  IF p_format IN ('preroll', 'overlay', 'postroll', 'bumper') AND v_duration_sec < v_min_preroll THEN
    -- 1분 미만 영상: pre-roll·overlay·postroll·bumper 광고 노출 X
    RETURN;
  END IF;

  IF p_format = 'midroll' AND v_duration_sec < v_min_midroll THEN
    -- 10분 미만 영상: mid-roll 광고 노출 X
    RETURN;
  END IF;

  -- 광고 매칭 (Phase 28 기존 로직 유지)
  RETURN QUERY
  SELECT
    a.id,
    a.title,
    a.advertiser,
    a.image_url,
    a.video_url,
    a.thumbnail_url,
    a.link_url,
    a.cta_text,
    a.duration_seconds,
    a.skip_after_seconds,
    a.trigger_position_pct
  FROM public.ads a
  WHERE a.is_active = true
    AND a.format = p_format
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at >= now())
    AND (a.budget_krw IS NULL OR a.spent_krw < a.budget_krw)
    AND (a.min_video_duration_sec IS NULL OR v_duration_sec >= a.min_video_duration_sec)
    AND (
      a.target_categories IS NULL
      OR array_length(a.target_categories, 1) IS NULL
      OR v_category = ANY(a.target_categories)
    )
  ORDER BY random()
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.get_ad_for_video IS
  '영상에 적합한 광고 1개 선택. 1분 미만 영상은 광고 노출 X (콘텐츠 정책 v2)';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 확인)
--
--   -- 1. 새 키 6개 확인
--   SELECT key, value, note FROM public.platform_settings
--   WHERE key IN (
--     'min_upload_duration_seconds', 'cinema_min_duration_seconds',
--     'ott_min_duration_seconds', 'cinema_preview_seconds',
--     'min_duration_for_preroll_seconds', 'min_duration_for_midroll_seconds'
--   ) AND effective_to IS NULL
--   ORDER BY key;
--
--   -- 2. 영상 재분류 결과 (1분+ 영상이 시네마에 등록되어야 함)
--   SELECT
--     CASE
--       WHEN duration_seconds < 30 THEN '0~30초 (업로드 차단 대상)'
--       WHEN duration_seconds < 60 THEN '30~60초 (홈만)'
--       WHEN duration_seconds < 600 THEN '1~10분 (홈+시네마)'
--       ELSE '10분+ (홈+시네마+OTT)'
--     END AS tier,
--     count(*) AS video_count
--   FROM public.videos
--   GROUP BY 1 ORDER BY 1;
-- ════════════════════════════════════════════════════════════════════════════
