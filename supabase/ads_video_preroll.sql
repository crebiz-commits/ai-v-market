-- ════════════════════════════════════════════════════════════════════════════
-- 비디오 Pre-roll 광고 시스템 (House Ads MVP — Phase 2)
-- 적용 일자: 2026-05-01
--
-- 기존 ads 테이블 확장:
--   - ad_type 컬럼: feed_display (홈피드 카드) vs video_preroll (영상 pre-roll)
--   - skip_offset: 몇 초 후 스킵 가능 (보통 5초)
--   - max_duration: 광고 최대 길이 (초)
--   - weight: 가중치 (높을수록 자주 노출)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- 광고 타입 분류
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS ad_type TEXT DEFAULT 'feed_display'
  CHECK (ad_type IN ('feed_display', 'video_preroll'));

-- 비디오 광고 전용 컬럼
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS skip_offset INTEGER DEFAULT 5;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS max_duration INTEGER DEFAULT 30;
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS weight INTEGER DEFAULT 1;

-- 인덱스: 활성 비디오 광고 조회 자주 사용
CREATE INDEX IF NOT EXISTS idx_ads_video_preroll_active
  ON public.ads(ad_type, is_active, starts_at, ends_at)
  WHERE ad_type = 'video_preroll' AND is_active = true;

COMMENT ON COLUMN public.ads.ad_type IS 'feed_display: 홈피드 카드 / video_preroll: 영상 pre-roll';
COMMENT ON COLUMN public.ads.skip_offset IS '몇 초 후 SKIP 가능 (Bunny Player에서 사용)';
COMMENT ON COLUMN public.ads.max_duration IS '광고 영상 최대 길이 (초)';
COMMENT ON COLUMN public.ads.weight IS '랜덤 선택 시 가중치 (높을수록 자주 노출)';

-- ────────────────────────────────────────
-- VAST 광고 노출 상세 추적 (집계 외 별도)
-- ads.impressions/clicks는 누적 카운터, 아래는 raw 이벤트
-- ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_video_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id        uuid NOT NULL REFERENCES public.ads(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL CHECK (event_type IN ('impression', 'start', 'firstQuartile', 'midpoint', 'thirdQuartile', 'complete', 'skip', 'click')),
  source_video_id  TEXT,        -- 어느 영상 pre-roll에 표시됐는지
  viewer_user_id   uuid,        -- 로그인 사용자라면 ID (nullable)
  user_agent       TEXT,
  ip_address       TEXT,
  occurred_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ad_video_events_ad ON public.ad_video_events(ad_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_video_events_type ON public.ad_video_events(event_type, occurred_at DESC);

ALTER TABLE public.ad_video_events ENABLE ROW LEVEL SECURITY;

-- 누구나 이벤트 기록 가능 (Edge Function이 service role로 처리)
-- 누구도 직접 SELECT 불가 (관리자만 통계 조회)
CREATE POLICY "Service role only"
  ON public.ad_video_events FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.ad_video_events IS 'VAST 표준 이벤트 raw 로그 (impression/start/quartile/complete/skip/click)';

-- ────────────────────────────────────────
-- VAST 이벤트 RPC (Edge Function 또는 클라이언트에서 호출)
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION track_video_ad_event(
  p_ad_id uuid,
  p_event_type TEXT,
  p_source_video_id TEXT DEFAULT NULL,
  p_viewer_user_id uuid DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS void AS $$
BEGIN
  -- 이벤트 raw 로그 저장
  INSERT INTO public.ad_video_events (
    ad_id, event_type, source_video_id, viewer_user_id, user_agent, ip_address
  ) VALUES (
    p_ad_id, p_event_type, p_source_video_id, p_viewer_user_id, p_user_agent, p_ip_address
  );

  -- 누적 카운터 갱신 (impression/click만)
  IF p_event_type = 'impression' THEN
    UPDATE public.ads SET impressions = impressions + 1 WHERE id = p_ad_id;
  ELSIF p_event_type = 'click' THEN
    UPDATE public.ads SET clicks = clicks + 1 WHERE id = p_ad_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────
-- 가중치 기반 비디오 광고 랜덤 선택 RPC
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION pick_random_video_preroll()
RETURNS SETOF public.ads AS $$
  SELECT * FROM public.ads
  WHERE ad_type = 'video_preroll'
    AND is_active = true
    AND video_url IS NOT NULL
    AND video_url <> ''
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  ORDER BY random() * weight DESC
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- 샘플 비디오 광고 (테스트용 — 운영 시 삭제)
-- INSERT INTO public.ads (title, advertiser, video_url, link_url, cta_text, ad_type, is_active, weight)
-- VALUES (
--   '샘플 Pre-roll 광고',
--   'CREAITE',
--   'https://vz-6e85411f-96a.b-cdn.net/{video-guid}/playlist.m3u8',
--   'https://creaite.net',
--   '지금 체험하기',
--   'video_preroll',
--   true,
--   10
-- );
