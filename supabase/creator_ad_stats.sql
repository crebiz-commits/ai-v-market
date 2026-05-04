-- ════════════════════════════════════════════════════════════════════════════
-- 크리에이터 광고 수익 통계 RPC (Phase 1 — 페이월 지원 작업)
-- 적용 일자: 2026-05-02
--
-- 목적:
--   ad_video_events는 RLS가 모두 차단(SELECT 불가)이므로, 크리에이터가 자기
--   영상의 광고 노출/클릭/완료 카운트만 조회할 수 있는 RPC 제공.
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 크리에이터 광고 통계 (집계)
--   호출 예: SELECT * FROM get_creator_ad_stats();  -- 본인 통계
--           SELECT * FROM get_creator_ad_stats('uuid-here');  -- 특정 사용자
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_ad_stats(
  p_creator_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  total_impressions BIGINT,
  total_clicks BIGINT,
  total_completes BIGINT,
  total_skips BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COUNT(*) FILTER (WHERE event_type = 'impression')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'click')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'complete')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'skip')::BIGINT
  FROM public.ad_video_events
  WHERE source_video_id IN (
    SELECT id::TEXT FROM public.videos WHERE creator_id = p_creator_id
  );
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 영상별 광고 통계 (sales 탭의 상품별 광고 수익 표시용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_ad_stats_by_video(
  p_creator_id UUID DEFAULT auth.uid()
)
RETURNS TABLE (
  video_id TEXT,
  impressions BIGINT,
  clicks BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    e.source_video_id::TEXT AS video_id,
    COUNT(*) FILTER (WHERE event_type = 'impression')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'click')::BIGINT
  FROM public.ad_video_events e
  WHERE e.source_video_id IN (
    SELECT id::TEXT FROM public.videos WHERE creator_id = p_creator_id
  )
  GROUP BY e.source_video_id;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT * FROM public.get_creator_ad_stats();
--   SELECT * FROM public.get_creator_ad_stats_by_video();
-- ════════════════════════════════════════════════════════════════════════════
