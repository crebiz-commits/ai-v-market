-- ════════════════════════════════════════════════════════════════════════════
-- 받은 댓글 (크리에이터) — 내 영상에 달린 댓글 조회 + 숨김 (2026-07-03)
--
--   get_creator_received_comments(limit, offset) — 내 영상 댓글(내가 쓴 건 제외) 최신순
--   creator_hide_comment(id) — 크리에이터가 자기 영상 댓글을 수동 숨김
--     (복원은 기존 creator_restore_comment 재사용)
-- 보안: 전부 auth.uid() 기준, 본인 영상만. SECURITY DEFINER + authenticated GRANT.
-- ════════════════════════════════════════════════════════════════════════════

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
    COALESCE(c.is_hidden, false), c.created_at
  FROM public.comments c
  JOIN public.videos v   ON v.id = c.video_id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE v.creator_id = v_uid       -- 내 영상에 달린 댓글만
    AND c.user_id <> v_uid         -- 내가 쓴 댓글/답글은 제외 (받은 것만)
  ORDER BY c.created_at DESC
  LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.creator_hide_comment(p_comment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid(); v_creator UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  SELECT v.creator_id INTO v_creator
  FROM public.comments c
  JOIN public.videos v ON v.id = c.video_id
  WHERE c.id = p_comment_id;
  IF v_creator IS NULL OR v_creator <> v_uid THEN
    RAISE EXCEPTION '영상 작성자만 댓글을 숨길 수 있습니다';
  END IF;
  UPDATE public.comments
  SET is_hidden = true,
      hidden_reason = '크리에이터 숨김',
      hidden_at = COALESCE(hidden_at, now())
  WHERE id = p_comment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_received_comments(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.creator_hide_comment(UUID) TO authenticated;

-- 검증:
--   SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM auth.users WHERE email='crebizlogistics@gmail.com'), true);
--   SELECT * FROM public.get_creator_received_comments(20, 0);
