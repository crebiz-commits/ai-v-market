-- ════════════════════════════════════════════════════════════════════════════
-- Phase 8.5 — 광고 예산 회계 시스템
-- 적용 일자: 2026-05-13
-- 선행: phase8_platform_settings.sql (ad_cpm_krw 정책값 필요)
--
-- 목적:
--   광고주가 등록한 예산(budget_krw)에서 노출이 일어날 때마다 자동 차감.
--   잔액이 0이 되면 광고가 자동으로 노출 대상에서 제외.
--   기존 "가상 CPM × 노출수 = 가짜 매출" 회계 적자 구조 해결.
--
-- 회계 모델:
--   - 광고 등록 시 budget_krw 입력 (총 예산, NULL = 무제한 = 자체 광고)
--   - 노출 1회 발생 시: spent_krw += (ad_cpm_krw / 1000) — 글로벌 CPM 적용 (옵션 A)
--   - spent_krw >= budget_krw 시: 광고 노출 자동 중단
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: ads 테이블에 예산/지출 컬럼 추가
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS budget_krw INTEGER;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS spent_krw  INTEGER NOT NULL DEFAULT 0;

-- CHECK 제약 (이미 있으면 스킵)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ads_budget_check'
  ) THEN
    ALTER TABLE public.ads
      ADD CONSTRAINT ads_budget_check
      CHECK (budget_krw IS NULL OR budget_krw >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ads_spent_check'
  ) THEN
    ALTER TABLE public.ads
      ADD CONSTRAINT ads_spent_check
      CHECK (spent_krw >= 0);
  END IF;
END$$;

COMMENT ON COLUMN public.ads.budget_krw IS '광고 총 예산(원). NULL = 무제한(자체 House Ads). 0 이상';
COMMENT ON COLUMN public.ads.spent_krw  IS '누적 집행액(원). 노출당 platform_settings.ad_cpm_krw/1000 자동 차감';

-- 인덱스: "노출 가능한 광고" 빠른 조회용
CREATE INDEX IF NOT EXISTS idx_ads_active_budget
  ON public.ads(is_active, budget_krw, spent_krw)
  WHERE is_active = true;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: track_video_ad_event 수정 — impression 시 spent_krw 자동 차감
-- (기존 함수 덮어쓰기, 시그니처는 동일)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_video_ad_event(
  p_ad_id uuid,
  p_event_type TEXT,
  p_source_video_id TEXT DEFAULT NULL,
  p_viewer_user_id uuid DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cpm           NUMERIC;
  v_cost_per_imp  NUMERIC;
BEGIN
  -- 이벤트 raw 로그 저장 (기존 동작 유지)
  INSERT INTO public.ad_video_events (
    ad_id, event_type, source_video_id, viewer_user_id, user_agent, ip_address
  ) VALUES (
    p_ad_id, p_event_type, p_source_video_id, p_viewer_user_id, p_user_agent, p_ip_address
  );

  -- impression: 누적 카운터 + 예산 차감
  IF p_event_type = 'impression' THEN
    -- 글로벌 CPM 로드 (옵션 A — 전 광고 동일 단가)
    v_cpm := COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000);
    v_cost_per_imp := v_cpm / 1000.0;  -- 노출 1회당 비용

    UPDATE public.ads
    SET
      impressions = impressions + 1,
      spent_krw   = spent_krw + CEIL(v_cost_per_imp)::INTEGER
      -- CEIL(): 소수점 반올림 — 잔액보다 더 차감되지 않도록 보수적 처리
    WHERE id = p_ad_id;

  -- click: 카운터만 (광고비 차감 없음 — CPM 모델은 노출 기준)
  ELSIF p_event_type = 'click' THEN
    UPDATE public.ads SET clicks = clicks + 1 WHERE id = p_ad_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.track_video_ad_event IS
  'VAST 이벤트 기록 + impression 시 ads.spent_krw 자동 차감 (글로벌 ad_cpm_krw 적용)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: increment_ad_impressions 수정 — feed_display(홈피드 광고)도 차감
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_ad_impressions(ad_id uuid)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cpm NUMERIC;
BEGIN
  v_cpm := COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000);

  UPDATE public.ads
  SET
    impressions = impressions + 1,
    spent_krw   = spent_krw + CEIL(v_cpm / 1000.0)::INTEGER
  WHERE id = ad_id;
END;
$$;

COMMENT ON FUNCTION public.increment_ad_impressions IS
  '홈피드 광고 노출 카운트 + spent_krw 자동 차감';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: pick_random_video_preroll 수정 — 잔액 부족 광고 제외
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pick_random_video_preroll()
RETURNS SETOF public.ads
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT * FROM public.ads
  WHERE ad_type = 'video_preroll'
    AND is_active = true
    AND video_url IS NOT NULL
    AND video_url <> ''
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >= now())
    -- ✨ 예산 체크: 무제한(House Ads) 또는 잔액 > 0
    AND (budget_krw IS NULL OR spent_krw < budget_krw)
  ORDER BY random() * weight DESC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.pick_random_video_preroll IS
  '활성 + 일정 내 + 잔액 있는 video_preroll 광고 중 가중치 기반 랜덤 선택';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: RLS 정책 수정 — 일반 사용자에게도 잔액 부족 광고 제외
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can view active ads" ON public.ads;
CREATE POLICY "Anyone can view active ads"
  ON public.ads FOR SELECT
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >= now())
    AND (budget_krw IS NULL OR spent_krw < budget_krw)
  );

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: 어드민용 헬퍼 RPC — 광고별 진행 상황 조회 (UI에서 표시용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ad_budget_status(p_ad_id UUID)
RETURNS TABLE (
  budget_krw      INTEGER,
  spent_krw       INTEGER,
  remaining_krw   INTEGER,
  spent_ratio     NUMERIC(5,4),
  is_depleted     BOOLEAN,
  estimated_remaining_impressions INTEGER
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    a.budget_krw,
    a.spent_krw,
    CASE WHEN a.budget_krw IS NULL THEN NULL ELSE GREATEST(a.budget_krw - a.spent_krw, 0) END,
    CASE
      WHEN a.budget_krw IS NULL OR a.budget_krw = 0 THEN NULL
      ELSE LEAST(a.spent_krw::numeric / a.budget_krw::numeric, 1.0)
    END,
    CASE WHEN a.budget_krw IS NULL THEN false ELSE a.spent_krw >= a.budget_krw END,
    CASE
      WHEN a.budget_krw IS NULL THEN NULL
      ELSE FLOOR(
        GREATEST(a.budget_krw - a.spent_krw, 0)::numeric
        / GREATEST(CEIL(COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000) / 1000.0), 1)
      )::INTEGER
    END
  FROM public.ads a
  WHERE a.id = p_ad_id;
$$;

COMMENT ON FUNCTION public.get_ad_budget_status IS
  '광고 예산 진행 상황 조회 (어드민 UI 진행률 표시용)';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 기존 광고에 예산 부여 (테스트)
--   UPDATE public.ads SET budget_krw = 10000 WHERE id = '광고ID';
--
--   -- 2. 가짜 노출 발생 (impression 5회 = 5 × CEIL(2) = ₩10 차감)
--   SELECT public.track_video_ad_event('광고ID', 'impression', NULL, NULL, NULL, NULL);
--
--   -- 3. 진행 상황 확인
--   SELECT * FROM public.get_ad_budget_status('광고ID');
--   -- → budget=10000, spent=10, remaining=9990, ratio=0.001, is_depleted=false,
--   --   estimated_remaining_impressions=4995
--
--   -- 4. 모든 광고의 진행률 확인
--   SELECT id, title, advertiser, budget_krw, spent_krw,
--          CASE WHEN budget_krw IS NULL THEN '무제한' ELSE
--               ROUND(spent_krw::numeric / budget_krw * 100, 1) || '%'
--          END AS progress
--   FROM public.ads
--   ORDER BY created_at DESC;
-- ════════════════════════════════════════════════════════════════════════════
