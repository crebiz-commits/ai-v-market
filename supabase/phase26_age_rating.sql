-- ════════════════════════════════════════════════════════════════════════════
-- Phase 26 — 연령 등급/제한 (19+ 게이트)
-- 적용 일자: 2026-05-17
-- 선행: videos, profiles
--
-- 목적:
--   1. 영상에 연령 등급 (all / 13 / 15 / 19)
--   2. 사용자 본인 인증 (MVP: 생일 자가 입력)
--   3. 19+ 영상은 인증된 만 19세+ 사용자만 시청 가능
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: videos 컬럼 — age_rating
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS age_rating TEXT NOT NULL DEFAULT 'all';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'videos_age_rating_check'
  ) THEN
    ALTER TABLE public.videos
      ADD CONSTRAINT videos_age_rating_check
      CHECK (age_rating IN ('all', '13', '15', '19'));
  END IF;
END$$;

COMMENT ON COLUMN public.videos.age_rating IS
  '연령 등급: all(전체)/13/15/19. 19는 본인 인증된 만 19세+ 사용자만 시청';

CREATE INDEX IF NOT EXISTS idx_videos_age_rating
  ON public.videos(age_rating)
  WHERE age_rating <> 'all';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: profiles 컬럼 — birthdate, age_verified
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS birthdate DATE;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_verified_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.birthdate IS '사용자 생년월일 (만 나이 계산용)';
COMMENT ON COLUMN public.profiles.age_verified IS '만 19세+ 본인 인증 완료 여부 (현재 MVP: 생일 자가 입력)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 본인 연령 인증 RPC (생일 자가 입력)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.verify_my_age(p_birthdate DATE)
RETURNS TABLE (
  verified  BOOLEAN,
  age       INTEGER,
  message   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_age INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  IF p_birthdate IS NULL OR p_birthdate > CURRENT_DATE OR p_birthdate < '1900-01-01' THEN
    RAISE EXCEPTION '올바른 생년월일을 입력해주세요';
  END IF;

  v_age := EXTRACT(YEAR FROM AGE(p_birthdate))::INTEGER;

  IF v_age >= 19 THEN
    UPDATE public.profiles
    SET birthdate = p_birthdate,
        age_verified = true,
        age_verified_at = now()
    WHERE id = v_uid;
    RETURN QUERY SELECT true, v_age, '본인 인증이 완료되었습니다.'::TEXT;
  ELSE
    UPDATE public.profiles
    SET birthdate = p_birthdate,
        age_verified = false,
        age_verified_at = NULL
    WHERE id = v_uid;
    RETURN QUERY SELECT false, v_age, '만 19세 미만은 19+ 콘텐츠를 시청할 수 없습니다.'::TEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.verify_my_age IS
  '본인 연령 인증 (생일 자가 입력). 만 19세+면 verified=true, 아니면 false';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: Phase 22의 update_my_video_metadata에 age_rating 파라미터 추가
--   (기존 함수를 확장)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_my_video_metadata(
  p_video_id     TEXT,
  p_thumbnail    TEXT     DEFAULT NULL,
  p_chapters     JSONB    DEFAULT NULL,
  p_subtitle_url TEXT     DEFAULT NULL,
  p_clear_subtitle BOOLEAN DEFAULT false,
  p_age_rating   TEXT     DEFAULT NULL   -- Phase 26 추가
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

  IF p_age_rating IS NOT NULL AND p_age_rating NOT IN ('all', '13', '15', '19') THEN
    RAISE EXCEPTION '잘못된 연령 등급: %', p_age_rating;
  END IF;

  UPDATE public.videos
  SET
    thumbnail = COALESCE(p_thumbnail, thumbnail),
    chapters = COALESCE(p_chapters, chapters),
    subtitle_url = CASE
      WHEN p_clear_subtitle THEN NULL
      WHEN p_subtitle_url IS NOT NULL THEN p_subtitle_url
      ELSE subtitle_url
    END,
    age_rating = COALESCE(p_age_rating, age_rating)
  WHERE id = p_video_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 본인 연령 인증
--   SELECT * FROM public.verify_my_age('1990-01-01');
--
--   -- 2. 영상 등급 변경
--   SELECT public.update_my_video_metadata('영상id', NULL, NULL, NULL, false, '19');
--
--   -- 3. 19+ 영상 조회 (인증 여부 확인용)
--   SELECT id, title, age_rating FROM public.videos WHERE age_rating = '19' LIMIT 5;
-- ════════════════════════════════════════════════════════════════════════════
