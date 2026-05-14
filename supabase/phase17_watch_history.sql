-- ════════════════════════════════════════════════════════════════════════════
-- Phase 17 — 시청 기록 RPC (사용자 마이페이지에서 본인 시청 이력 조회)
-- 적용 일자: 2026-05-14
-- 선행: video_views (Phase 8), videos
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_my_watch_history(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  view_id           BIGINT,
  video_id          TEXT,
  title             TEXT,
  thumbnail         TEXT,
  creator_id        UUID,
  creator_name      TEXT,
  duration_seconds  INTEGER,
  watch_seconds     INTEGER,
  watch_ratio       NUMERIC,
  is_valid          BOOLEAN,
  occurred_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- 같은 영상은 가장 최근 시청 기록만 (DISTINCT ON video_id)
  WITH latest_per_video AS (
    SELECT DISTINCT ON (vv.video_id)
      vv.id,
      vv.video_id,
      vv.watch_seconds,
      vv.watch_ratio,
      vv.is_valid,
      vv.occurred_at,
      vv.video_duration
    FROM public.video_views vv
    WHERE vv.viewer_user_id = v_user_id
    ORDER BY vv.video_id, vv.occurred_at DESC
  )
  SELECT
    lv.id AS view_id,
    lv.video_id,
    v.title,
    v.thumbnail,
    v.creator_id,
    p.display_name AS creator_name,
    COALESCE(v.duration_seconds, lv.video_duration) AS duration_seconds,
    lv.watch_seconds,
    lv.watch_ratio,
    lv.is_valid,
    lv.occurred_at
  FROM latest_per_video lv
  LEFT JOIN public.videos v ON v.id = lv.video_id
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE v.id IS NOT NULL                          -- 삭제된 영상 제외
    AND COALESCE(v.is_hidden, false) = false      -- 숨김 영상 제외
  ORDER BY lv.occurred_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_my_watch_history IS
  '본인 시청 기록 (같은 영상은 가장 최근 시청만). 마이페이지 시청 기록 탭용';

-- ────────────────────────────────────────────────────────────────────────────
-- 시청 기록 삭제 (한 영상의 모든 기록 또는 전체)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_my_watch_history(
  p_video_id TEXT DEFAULT NULL    -- NULL이면 전체 삭제, 특정 영상은 해당 영상만
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  IF p_video_id IS NULL THEN
    DELETE FROM public.video_views WHERE viewer_user_id = v_user_id;
  ELSE
    DELETE FROM public.video_views WHERE viewer_user_id = v_user_id AND video_id = p_video_id;
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.delete_my_watch_history IS
  '본인 시청 기록 삭제 (특정 영상 또는 전체)';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT * FROM public.get_my_watch_history(20, 0);
--   SELECT public.delete_my_watch_history();  -- 전체 삭제 (조심)
-- ════════════════════════════════════════════════════════════════════════════
