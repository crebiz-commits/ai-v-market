-- ════════════════════════════════════════════════════════════════════════════
-- get_creator_received_comments 에 hidden_reason 추가 (2026-07-10)
--
--   배경: channel_feed_audit4_20260710.sql 이 creator_restore_comment 를 화이트리스트
--         (크리에이터 사유 3개만 복원)로 좁히면서, 받은 댓글(ReceivedCommentsSection)이
--         admin/신고 숨김 댓글에도 "다시 표시" 버튼을 띄워 클릭 시 RPC 가 거부(에러)하는
--         disconnect 발생. 프론트가 사유별로 버튼을 게이트할 수 있게 hidden_reason 을 반환에 추가.
--   변경: RETURNS TABLE 에 hidden_reason TEXT 한 컬럼 추가(반환타입 변경 → DROP 선행). 그 외 동일.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_creator_received_comments(INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.get_creator_received_comments(
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id             UUID,
  video_id       TEXT,
  video_title    TEXT,
  parent_id      UUID,
  content        TEXT,
  author_name    TEXT,
  author_avatar  TEXT,
  author_user_id UUID,
  is_hidden      BOOLEAN,
  hidden_reason  TEXT,
  created_at     TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  RETURN QUERY
  SELECT
    c.id, c.video_id, v.title, c.parent_id, c.content,
    c.author_name, p.avatar_url, c.user_id,
    COALESCE(c.is_hidden, false), c.hidden_reason, c.created_at
  FROM public.comments c
  JOIN public.videos v   ON v.id = c.video_id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE v.creator_id = v_uid       -- 내 영상에 달린 댓글만
    AND c.user_id <> v_uid         -- 내가 쓴 댓글/답글은 제외 (받은 것만)
  ORDER BY c.created_at DESC
  LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_creator_received_comments(INTEGER, INTEGER) TO authenticated;
