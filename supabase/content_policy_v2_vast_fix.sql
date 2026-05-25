-- ════════════════════════════════════════════════════════════════════════════
-- 콘텐츠 정책 v2 — VAST Pre-roll 광고 차단 보강 (2026-05-26)
--
-- 배경:
--   content_policy_v2.sql은 Phase 28 RPC(get_ad_for_video)만 갱신해서
--   1분 미만 영상의 본편 광고를 차단했지만, Bunny 플레이어 내장 VAST
--   pre-roll은 별도 RPC(pick_random_video_preroll)를 호출하기 때문에
--   여전히 짧은 영상에서도 광고가 노출되는 버그 발견.
--
-- 추가 발견 (v2):
--   Bunny 플레이어의 vastTagUrl 파라미터는 query string 부분을 보존하지
--   못해서 source_video_id 가 IMA SDK 까지 전달되지 않음. 클라이언트와
--   Edge Function 은 path parameter 방식(/vast-tag/<id>)으로 우회. 본 SQL
--   은 그래도 source_video_id 가 누락된 호출이 들어오면 보수적으로 광고를
--   차단하도록 방어선 역할.
--
-- 변경 사항:
--   pick_random_video_preroll(p_source_video_id TEXT DEFAULT NULL) —
--   source_video_id 가 NULL/'' 이면 즉시 RETURN (광고 X).
--   source_video_id 가 있으면 영상 duration_seconds 조회 후
--   min_duration_for_preroll_seconds (기본 60) 미만이면 빈 결과 반환.
--   → /vast-tag Edge Function은 빈 결과 시 빈 VAST XML 응답 → Bunny 광고 스킵.
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 → 본 파일 전체 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- 기존 시그니처(인자 없음) 명시적 제거 — 시그니처 변경이라 CREATE OR REPLACE만으론 안 됨
DROP FUNCTION IF EXISTS public.pick_random_video_preroll();
DROP FUNCTION IF EXISTS public.pick_random_video_preroll(TEXT);

CREATE OR REPLACE FUNCTION public.pick_random_video_preroll(
  p_source_video_id TEXT DEFAULT NULL
)
RETURNS SETOF public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_duration_sec INTEGER;
  v_min_preroll  INTEGER;
BEGIN
  -- source_video_id 가 없으면 보수적으로 광고 차단 (Bunny query-string 누락 가드)
  IF p_source_video_id IS NULL OR p_source_video_id = '' THEN
    RETURN;
  END IF;

  SELECT duration_seconds INTO v_duration_sec
  FROM public.videos
  WHERE id = p_source_video_id;

  -- duration 미상은 광고 X (get_ad_for_video와 동일한 보수적 정책)
  IF v_duration_sec IS NULL THEN
    RETURN;
  END IF;

  -- 동적 임계값 (platform_settings, fallback 60초)
  v_min_preroll := COALESCE(
    public.get_platform_setting('min_duration_for_preroll_seconds')::INTEGER,
    60
  );

  IF v_duration_sec < v_min_preroll THEN
    RETURN;  -- 1분 미만 영상: VAST pre-roll 차단
  END IF;

  -- 통과 — 가중치 기반 랜덤 광고 1개 반환 (기존 로직 그대로)
  RETURN QUERY
  SELECT * FROM public.ads
  WHERE ad_type = 'video_preroll'
    AND is_active = true
    AND video_url IS NOT NULL
    AND video_url <> ''
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  ORDER BY random() * weight DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.pick_random_video_preroll IS
  'VAST pre-roll 광고 랜덤 선택. source_video_id 미상 또는 1분 미만 영상이면 빈 결과 (콘텐츠 정책 v2)';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--
--   -- 1. 30초 영상 ID로 호출 → 결과 0건이어야 정상
--   SELECT * FROM pick_random_video_preroll('<sub-1min-video-id>');
--
--   -- 2. 1분+ 영상 ID로 호출 → 광고 1건 (있을 경우)
--   SELECT * FROM pick_random_video_preroll('<long-video-id>');
--
--   -- 3. 인자 없이 호출 → 광고 차단 (보수적)
--   SELECT * FROM pick_random_video_preroll();
-- ════════════════════════════════════════════════════════════════════════════
