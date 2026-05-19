-- ════════════════════════════════════════════════════════════════════════════
-- Phase 28 — 광고 다변화 (mid-roll/overlay/post-roll/bumper/sponsorship)
--
-- 결정 사항:
--   - Mid-roll: 10분+ 영상(OTT tier)에만
--   - Overlay: 영상 30% 지점, 1분 미만 영상 제외
--   - Bumper: 6초 SKIP 불가 (무료) / 5초 후 SKIP (BASIC) / 광고 제거 (PREMIUM)
--   - Sponsorship: 시작 5초 배지 (Native 형식)
--
-- 적용:
--   ads 테이블 확장 — format 컬럼 + 형식별 옵션
--   videos 테이블 확장 — sponsor 정보 컬럼
--   ad_impressions/ad_clicks 테이블 신규 — 형식별 추적
--
-- 참고:
--   videos.id 는 TEXT 타입 (UUID 아님) — FK 컬럼도 TEXT로 맞춤
-- ════════════════════════════════════════════════════════════════════════════

-- Step 1: ads 테이블 확장 (광고 형식 다변화)
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'feed'
    CHECK (format IN ('feed', 'preroll', 'midroll', 'overlay', 'postroll', 'bumper'));

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS trigger_position_pct INTEGER
    CHECK (trigger_position_pct IS NULL OR (trigger_position_pct >= 0 AND trigger_position_pct <= 100));
COMMENT ON COLUMN public.ads.trigger_position_pct IS 'Mid-roll/Overlay 트리거 시점 (영상 길이의 %). Overlay는 30 기본, Mid-roll은 50 기본.';

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER
    CHECK (duration_seconds IS NULL OR (duration_seconds > 0 AND duration_seconds <= 60));
COMMENT ON COLUMN public.ads.duration_seconds IS 'Overlay 노출 시간 (초). Bumper는 6초 고정. 다른 형식은 NULL.';

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS skip_after_seconds INTEGER DEFAULT 5
    CHECK (skip_after_seconds IS NULL OR skip_after_seconds >= 0);
COMMENT ON COLUMN public.ads.skip_after_seconds IS 'SKIP 허용 시간 (초). Bumper 무료 사용자는 NULL(불가), BASIC은 5.';

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS target_tiers TEXT[]
    CHECK (target_tiers IS NULL OR target_tiers <@ ARRAY['home', 'cinema', 'ott']::TEXT[]);
COMMENT ON COLUMN public.ads.target_tiers IS '노출 영상 tier. NULL이면 모든 tier. Mid-roll은 [''ott''] 권장.';

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS target_categories TEXT[];
COMMENT ON COLUMN public.ads.target_categories IS '노출 카테고리 (NULL이면 모든 카테고리). 예: [''액션'', ''드라마''].';

ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS min_video_duration_sec INTEGER DEFAULT 0;
COMMENT ON COLUMN public.ads.min_video_duration_sec IS '최소 영상 길이 (초). Overlay는 60(1분 미만 제외), Mid-roll은 600(10분 미만 제외).';

-- Step 2: videos 테이블 확장 (Sponsorship)
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS sponsor_brand TEXT;
COMMENT ON COLUMN public.videos.sponsor_brand IS 'Sponsorship 후원 브랜드명. NULL이면 협찬 없음.';

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS sponsor_logo_url TEXT;
COMMENT ON COLUMN public.videos.sponsor_logo_url IS 'Sponsor 로고 이미지 URL.';

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS sponsor_disclosure TEXT DEFAULT '유료 광고 포함';
COMMENT ON COLUMN public.videos.sponsor_disclosure IS '공정거래법 표시 문구. 기본 "유료 광고 포함".';

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS sponsor_link_url TEXT;
COMMENT ON COLUMN public.videos.sponsor_link_url IS 'Sponsor 클릭 시 이동 URL (선택).';

-- Step 3: ad_impressions 테이블 (형식별 노출 추적)
-- 주의: video_id는 videos.id 타입과 일치해야 함 (TEXT)
DROP TABLE IF EXISTS public.ad_impressions CASCADE;
CREATE TABLE public.ad_impressions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id           UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  video_id        TEXT REFERENCES public.videos(id) ON DELETE SET NULL,
  creator_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  format          TEXT NOT NULL,
  position_seconds INTEGER,
  completed       BOOLEAN NOT NULL DEFAULT FALSE,
  skipped         BOOLEAN NOT NULL DEFAULT FALSE,
  shown_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad ON public.ad_impressions(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_video ON public.ad_impressions(video_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_creator ON public.ad_impressions(creator_id);
CREATE INDEX IF NOT EXISTS idx_ad_impressions_shown_at ON public.ad_impressions(shown_at DESC);

ALTER TABLE public.ad_impressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Insert ad impressions" ON public.ad_impressions;
CREATE POLICY "Insert ad impressions"
  ON public.ad_impressions FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "View own creator impressions" ON public.ad_impressions;
CREATE POLICY "View own creator impressions"
  ON public.ad_impressions FOR SELECT
  USING (creator_id = auth.uid());

-- Step 4: ad_clicks 테이블 (형식별 클릭 추적)
DROP TABLE IF EXISTS public.ad_clicks CASCADE;
CREATE TABLE public.ad_clicks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id       UUID NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  video_id    TEXT REFERENCES public.videos(id) ON DELETE SET NULL,
  creator_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewer_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  format      TEXT NOT NULL,
  clicked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad ON public.ad_clicks(ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_creator ON public.ad_clicks(creator_id);

ALTER TABLE public.ad_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Insert ad clicks" ON public.ad_clicks;
CREATE POLICY "Insert ad clicks"
  ON public.ad_clicks FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "View own creator clicks" ON public.ad_clicks;
CREATE POLICY "View own creator clicks"
  ON public.ad_clicks FOR SELECT
  USING (creator_id = auth.uid());

-- Step 5: 광고 매칭 RPC — 영상에 적합한 광고 1개 선택
-- 영상 tier, 카테고리, 길이, 광고 형식, 활성 상태로 필터링
-- 주의: p_video_id는 videos.id 타입(TEXT)과 일치
DROP FUNCTION IF EXISTS public.get_ad_for_video(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_ad_for_video(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.get_ad_for_video(
  p_video_id TEXT,
  p_format TEXT  -- 'preroll' | 'midroll' | 'overlay' | 'postroll' | 'bumper'
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
  v_tier         TEXT;
BEGIN
  -- 영상 정보 조회
  SELECT duration_seconds, category INTO v_duration_sec, v_category
  FROM public.videos WHERE id = p_video_id;

  IF v_duration_sec IS NULL THEN
    RETURN;
  END IF;

  -- tier 판정 (3분 미만=home, 3~10분=cinema, 10분+=ott)
  v_tier := CASE
    WHEN v_duration_sec < 180 THEN 'home'
    WHEN v_duration_sec < 600 THEN 'cinema'
    ELSE 'ott'
  END;

  -- 매칭 광고 1개 랜덤 반환
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
    AND (a.target_tiers IS NULL OR v_tier = ANY(a.target_tiers))
    AND (a.target_categories IS NULL OR v_category = ANY(a.target_categories))
    AND v_duration_sec >= COALESCE(a.min_video_duration_sec, 0)
    -- 예산 체크 (Phase 8.5)
    AND (a.budget_krw IS NULL OR a.spent_krw < a.budget_krw)
  ORDER BY random()
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ad_for_video(TEXT, TEXT) TO authenticated, anon;

-- Step 6: 노출 기록 RPC
DROP FUNCTION IF EXISTS public.record_ad_impression(UUID, TEXT, TEXT, INTEGER, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.record_ad_impression(UUID, UUID, TEXT, INTEGER, BOOLEAN, BOOLEAN);
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id UUID,
  p_video_id TEXT,
  p_format TEXT,
  p_position_seconds INTEGER DEFAULT NULL,
  p_completed BOOLEAN DEFAULT FALSE,
  p_skipped BOOLEAN DEFAULT FALSE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  -- 영상 작성자 조회
  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = p_video_id;

  INSERT INTO public.ad_impressions (
    ad_id, video_id, creator_id, viewer_id, format,
    position_seconds, completed, skipped
  ) VALUES (
    p_ad_id, p_video_id, v_creator_id, auth.uid(), p_format,
    p_position_seconds, p_completed, p_skipped
  );

  -- ads 테이블의 누적 impressions 증가 (기존 RPC 호환)
  UPDATE public.ads SET impressions = impressions + 1 WHERE id = p_ad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ad_impression(UUID, TEXT, TEXT, INTEGER, BOOLEAN, BOOLEAN) TO authenticated, anon;

-- Step 7: 클릭 기록 RPC
DROP FUNCTION IF EXISTS public.record_ad_click(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_ad_click(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.record_ad_click(
  p_ad_id UUID,
  p_video_id TEXT,
  p_format TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
BEGIN
  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = p_video_id;

  INSERT INTO public.ad_clicks (
    ad_id, video_id, creator_id, viewer_id, format
  ) VALUES (
    p_ad_id, p_video_id, v_creator_id, auth.uid(), p_format
  );

  UPDATE public.ads SET clicks = clicks + 1 WHERE id = p_ad_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_ad_click(UUID, TEXT, TEXT) TO authenticated, anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리
--   SELECT format, COUNT(*) FROM public.ads GROUP BY format;
--   SELECT * FROM public.get_ad_for_video((SELECT id FROM public.videos LIMIT 1), 'overlay');
--   SELECT public.record_ad_impression('<광고 UUID>', '<영상 id>', 'overlay', 18, FALSE, FALSE);
-- ────────────────────────────────────────────────────────────────────────────
