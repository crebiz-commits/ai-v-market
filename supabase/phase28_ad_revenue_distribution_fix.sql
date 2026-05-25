-- ════════════════════════════════════════════════════════════════════════════
-- Phase 28 광고 수익 분배 보강 (2026-05-25)
--
-- 문제:
--   Phase 28에서 추가된 광고 형식들(overlay/midroll/postroll/bumper)의 임프레션이
--   ad_impressions 테이블에만 기록되고 ad_video_events 에는 안 들어가서,
--   calculate_monthly_revenue 가 집계를 못함 → 영상 크리에이터에게 광고 수익
--   분배 누락 발생.
--
-- 정책:
--   - 홈피드 광고 (feed_display) → 회사 전유 수익 (현재 그대로 유지)
--   - 영상에 붙은 광고 (preroll/overlay/midroll/postroll/bumper) → 영상 크리에이터에게
--     수익 분배 (홈 50% / 시네마 55% / OTT 60%)
--
-- 해결:
--   record_ad_impression / record_ad_click 가 ad_impressions 외에 ad_video_events 에도
--   기록하도록 수정. calculate_monthly_revenue 는 변경 불필요 (이미 ad_video_events 집계).
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1) record_ad_impression — ad_impressions + ad_video_events 양쪽 INSERT
-- ────────────────────────────────────────────────────────────────────────────
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
  -- 영상 작성자 조회 (수익 분배 대상)
  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = p_video_id;

  -- ① Phase 28: 형식별 노출 상세 (운영 통계용)
  INSERT INTO public.ad_impressions (
    ad_id, video_id, creator_id, viewer_id, format,
    position_seconds, completed, skipped
  ) VALUES (
    p_ad_id, p_video_id, v_creator_id, auth.uid(), p_format,
    p_position_seconds, p_completed, p_skipped
  );

  -- ② Phase 8 수익 분배: ad_video_events 에도 'impression' 기록
  -- → calculate_monthly_revenue 가 영상 크리에이터에게 광고 수익 자동 분배
  -- (홈피드 feed_display 는 increment_ad_impressions 만 호출하므로 ad_video_events 에
  --  들어가지 않음 → 회사 전유 수익 유지)
  INSERT INTO public.ad_video_events (
    ad_id, event_type, source_video_id, viewer_user_id, occurred_at
  ) VALUES (
    p_ad_id, 'impression', p_video_id, auth.uid(), now()
  );

  -- ③ ads 테이블의 누적 impressions 증가 (기존 RPC 호환)
  UPDATE public.ads SET impressions = impressions + 1 WHERE id = p_ad_id;
END;
$$;

COMMENT ON FUNCTION public.record_ad_impression IS
  '영상 광고 노출 기록 (Phase 28). ad_impressions(통계) + ad_video_events(수익 분배) 양쪽 INSERT';

-- ────────────────────────────────────────────────────────────────────────────
-- 2) record_ad_click — 일관성 위해 동일 패턴 (수익 분배 영향 X, 통계용)
-- ────────────────────────────────────────────────────────────────────────────
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

  -- ad_video_events 에도 'click' 기록 (일관성, 통계용)
  INSERT INTO public.ad_video_events (
    ad_id, event_type, source_video_id, viewer_user_id, occurred_at
  ) VALUES (
    p_ad_id, 'click', p_video_id, auth.uid(), now()
  );

  UPDATE public.ads SET clicks = clicks + 1 WHERE id = p_ad_id;
END;
$$;

COMMENT ON FUNCTION public.record_ad_click IS
  '영상 광고 클릭 기록 (Phase 28). ad_clicks + ad_video_events 양쪽 INSERT';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--
--   -- 1. 테스트 영상에 대해 record_ad_impression 호출 (실제 환경에서는 광고 노출 시 자동)
--   -- SELECT public.record_ad_impression(
--   --   '<ad_uuid>'::UUID, '<video_id>', 'overlay', 30, false, false
--   -- );
--
--   -- 2. ad_video_events 에 impression 기록 확인
--   SELECT event_type, source_video_id, occurred_at FROM public.ad_video_events
--   ORDER BY occurred_at DESC LIMIT 10;
--
--   -- 3. 다음 정산 시 ad_revenue 가 올바르게 분배되는지 확인
--   -- (테스트 정산 RPC 호출 또는 다음 달 정산 시 확인)
-- ────────────────────────────────────────────────────────────────────────────
