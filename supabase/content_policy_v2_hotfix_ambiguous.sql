-- ════════════════════════════════════════════════════════════════════════════
-- 콘텐츠 정책 v2 — get_ad_for_video duration_seconds ambiguous 핫픽스 (2026-05-26)
--
-- 배경:
--   content_policy_v2.sql 적용 후 콘솔에서 다음 에러 발견:
--     [ad bumper]   fetch error: column reference "duration_seconds" is ambiguous
--     [ad overlay]  fetch error: column reference "duration_seconds" is ambiguous
--     POST .../rpc/get_ad_for_video 400 (Bad Request)
--
--   원인: 함수의 RETURNS TABLE 컬럼명 `duration_seconds` 가 OUT 파라미터로
--   변수 scope 에 들어가는데, 함수 본문의 SELECT 절에서 같은 이름 컬럼
--   `videos.duration_seconds` 와 충돌. PL/pgSQL 이 어느 쪽을 가리키는지
--   모름 → ambiguous 에러.
--
-- 변경 사항:
--   영상 조회 SELECT 에 테이블 alias `v.` 명시.
--     SELECT duration_seconds, category INTO ... FROM public.videos WHERE id = ...
--   → SELECT v.duration_seconds, v.category INTO ... FROM public.videos v WHERE v.id = ...
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 → 본 파일 전체 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

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
  '영상에 적합한 광고 1개 선택. 1분 미만 영상은 광고 노출 X (콘텐츠 정책 v2). alias 명시로 ambiguous 회피';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--
--   -- 4분 영상 ID 로 bumper 광고 호출 (에러 없어야 정상)
--   SELECT * FROM get_ad_for_video('a4991a29-85f9-4843-b0ab-878589b74547', 'bumper');
--
--   -- 7초 영상 ID 로 호출 → 결과 0건 (1분 미만이라 차단)
--   SELECT * FROM get_ad_for_video('e203eae0-721a-4b47-b984-7ad1fa02305c', 'bumper');
-- ════════════════════════════════════════════════════════════════════════════
