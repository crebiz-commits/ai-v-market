-- ════════════════════════════════════════════════════════════════════════════
-- Phase 25 — 자동 모더레이션 (Google Vision SafeSearch)
--
-- 흐름:
--   1. Upload 완료 → Edge Function /moderate-video 호출
--   2. Google Vision SafeSearch (Bunny 썸네일 1장 분석)
--   3. 점수 90+ → moderation_status='rejected' + is_hidden=true (자동 숨김)
--   4. 점수 70~90 → moderation_status='flagged' (어드민 검토 대기)
--   5. 점수 <70 → moderation_status='passed' (통과)
--   6. error 발생 → moderation_status='pending' 유지 (재시도 가능)
--
-- 어드민 흐름:
--   1. get_moderation_queue('flagged') → 검토 대기 목록
--   2. resolve_moderation_flag(video_id, 'pass'|'reject') → 결정 반영
-- ════════════════════════════════════════════════════════════════════════════

-- Step 1: videos 테이블 모더레이션 컬럼 5개 추가
ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS moderation_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'passed', 'flagged', 'rejected'));
COMMENT ON COLUMN public.videos.moderation_status IS 'AI 모더레이션 상태: pending(분석 대기/실패) / passed(통과) / flagged(검토 대기) / rejected(자동 숨김)';

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS moderation_score INTEGER
    CHECK (moderation_score IS NULL OR (moderation_score >= 0 AND moderation_score <= 100));
COMMENT ON COLUMN public.videos.moderation_score IS '최대 카테고리 점수 (0~100). adult/violence/racy 기준.';

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS moderation_categories JSONB;
COMMENT ON COLUMN public.videos.moderation_categories IS 'Google Vision SafeSearch 카테고리별 점수. 예: {"adult": 50, "violence": 0, "racy": 25, "spoof": 0, "medical": 0}';

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS moderation_checked_at TIMESTAMPTZ;
COMMENT ON COLUMN public.videos.moderation_checked_at IS '마지막 Vision API 분석 시점.';

ALTER TABLE public.videos
  ADD COLUMN IF NOT EXISTS moderation_error TEXT;
COMMENT ON COLUMN public.videos.moderation_error IS 'Vision API 호출 실패 시 에러 메시지. NULL이면 성공.';

-- 부분 인덱스 — 어드민 검토 큐 빠른 조회용 (pending + flagged만)
CREATE INDEX IF NOT EXISTS idx_videos_moderation_pending
  ON public.videos(moderation_status, moderation_checked_at DESC)
  WHERE moderation_status IN ('pending', 'flagged');

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: RPC — update_video_moderation
--   Edge Function이 Vision API 호출 후 결과를 이 RPC로 전달.
--   점수에 따라 자동으로 status 결정 + is_hidden 조절.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_video_moderation(
  p_video_id TEXT,
  p_score INTEGER,
  p_categories JSONB,
  p_error TEXT DEFAULT NULL
)
RETURNS public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status TEXT;
  v_should_hide BOOLEAN := FALSE;
  v_row public.videos;
BEGIN
  -- 점수에 따라 status 결정 (에러 또는 score NULL → pending)
  IF p_error IS NOT NULL OR p_score IS NULL THEN
    v_status := 'pending';  -- 에러/NULL 시 재시도 가능하게 pending 유지
  ELSIF p_score >= 90 THEN
    v_status := 'rejected';
    v_should_hide := TRUE;
  ELSIF p_score >= 70 THEN
    v_status := 'flagged';
    -- is_hidden 유지 (사용자에겐 일단 보임. 어드민 검토 결과에 따라 결정)
  ELSE
    v_status := 'passed';
  END IF;

  UPDATE public.videos SET
    moderation_status = v_status,
    moderation_score = p_score,
    moderation_categories = p_categories,
    moderation_checked_at = now(),
    moderation_error = p_error,
    is_hidden = CASE WHEN v_should_hide THEN TRUE ELSE is_hidden END
  WHERE id = p_video_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_video_moderation(TEXT, INTEGER, JSONB, TEXT) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: RPC — get_moderation_queue
--   어드민이 flagged/rejected/pending 영상 목록 조회.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_moderation_queue(
  p_status TEXT DEFAULT 'flagged',
  p_limit INTEGER DEFAULT 50
)
RETURNS TABLE (
  video_id TEXT,
  title TEXT,
  creator_id UUID,
  creator_name TEXT,
  thumbnail TEXT,
  m_status TEXT,
  m_score INTEGER,
  m_categories JSONB,
  m_checked_at TIMESTAMPTZ,
  m_error TEXT,
  is_hidden BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 어드민 권한 체크 (Phase 10 헬퍼)
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    v.id::TEXT,
    v.title,
    v.creator_id,
    v.creator,
    v.thumbnail,
    v.moderation_status,
    v.moderation_score,
    v.moderation_categories,
    v.moderation_checked_at,
    v.moderation_error,
    v.is_hidden,
    v.created_at
  FROM public.videos v
  WHERE v.moderation_status = p_status
  ORDER BY v.moderation_checked_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_moderation_queue(TEXT, INTEGER) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: RPC — resolve_moderation_flag
--   어드민이 flagged 영상을 검토 후 pass(통과) 또는 reject(거부) 결정.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.resolve_moderation_flag(
  p_video_id TEXT,
  p_decision TEXT  -- 'pass' | 'reject'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  IF p_decision NOT IN ('pass', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  UPDATE public.videos SET
    moderation_status = CASE p_decision WHEN 'pass' THEN 'passed' ELSE 'rejected' END,
    is_hidden = CASE p_decision WHEN 'reject' THEN TRUE ELSE is_hidden END
  WHERE id = p_video_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_moderation_flag(TEXT, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 별도 확인)
--
--   -- 1. 컬럼 추가 확인
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name='videos' AND column_name LIKE 'moderation%';
--
--   -- 2. 기존 영상 모두 'pending' (분석 안 됨)
--   SELECT moderation_status, COUNT(*) FROM public.videos GROUP BY moderation_status;
--
--   -- 3. 어드민 — 검토 큐 조회 (현재는 비어있음)
--   SELECT * FROM public.get_moderation_queue('flagged');
-- ────────────────────────────────────────────────────────────────────────────
