-- ════════════════════════════════════════════════════════════════════════════
-- Phase 23 — 어드민 통합 댓글 관리 (보강)
-- 적용 일자: 2026-05-23
-- 선행: phase23_comment_management.sql (comments 확장), phase10_6/10_7 (assert_admin + admin_logs)
--
-- 목적:
--   어드민이 전체 댓글을 검색/필터(공개·숨김·자동필터·신고)하고
--   강제 숨김 / 복원 / 영구 삭제를 처리한다.
--
--   ※ 크리에이터별 댓글 관리는 phase23_comment_management.sql + CommentSettings.tsx가 담당.
--     신고된 댓글 처리는 phase10_reports.sql + AdminReports.tsx가 담당.
--     본 RPC는 어드민이 능동적으로 부적절 댓글을 발견·처리할 때 사용.
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- A. 어드민 댓글 검색
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_search_comments(
  p_query  TEXT    DEFAULT NULL,
  p_filter TEXT    DEFAULT 'all',   -- 'all' / 'visible' / 'hidden' / 'filtered' / 'reported'
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  video_id        TEXT,
  video_title     TEXT,
  user_id         UUID,
  author_name     TEXT,
  content         TEXT,
  likes_count     INTEGER,
  is_hidden       BOOLEAN,
  hidden_reason   TEXT,
  hidden_at       TIMESTAMPTZ,
  is_filtered     BOOLEAN,
  filter_reason   TEXT,
  is_pinned       BOOLEAN,
  creator_hearted BOOLEAN,
  parent_id       UUID,
  created_at      TIMESTAMPTZ,
  pending_reports BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    c.id,
    c.video_id,
    v.title,
    c.user_id,
    p.display_name,
    c.content,
    COALESCE(c.likes_count, 0),
    COALESCE(c.is_hidden, false),
    c.hidden_reason,
    c.hidden_at,
    COALESCE(c.is_filtered, false),
    c.filter_reason,
    COALESCE(c.is_pinned, false),
    COALESCE(c.creator_hearted, false),
    c.parent_id,
    c.created_at,
    (SELECT COUNT(*) FROM public.reports r
       WHERE r.target_type = 'comment'
         AND r.target_id   = c.id::TEXT
         AND r.status      = 'pending')::BIGINT
  FROM public.comments c
  LEFT JOIN public.videos   v ON v.id = c.video_id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE
    (p_query IS NULL OR p_query = '' OR
       c.content ILIKE '%' || p_query || '%' OR
       p.display_name ILIKE '%' || p_query || '%' OR
       v.title ILIKE '%' || p_query || '%')
    AND (
      p_filter = 'all'
      OR (p_filter = 'visible'  AND COALESCE(c.is_hidden,   false) = false)
      OR (p_filter = 'hidden'   AND c.is_hidden   = true)
      OR (p_filter = 'filtered' AND c.is_filtered = true)
      OR (p_filter = 'reported' AND EXISTS (
            SELECT 1 FROM public.reports r
            WHERE r.target_type = 'comment'
              AND r.target_id   = c.id::TEXT
              AND r.status      = 'pending'))
    )
  ORDER BY c.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.admin_search_comments IS
  '어드민이 전체 댓글을 검색·필터링(공개/숨김/자동필터/신고). 영상·작성자 조인 + 신고 카운트 포함';

-- ────────────────────────────────────────────────────────────────────────────
-- B. 어드민 댓글 강제 숨김 / 복원 / 영구 삭제 (admin_logs 자동 기록)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_hide_comment(
  p_comment_id UUID,
  p_reason     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.comments
  SET is_hidden     = true,
      hidden_reason = COALESCE(p_reason, '관리자 강제 숨김'),
      hidden_at     = now()
  WHERE id = p_comment_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'hide_comment', 'comment', p_comment_id::TEXT,
    jsonb_build_object('reason', p_reason));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unhide_comment(p_comment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.comments
  SET is_hidden     = false,
      hidden_reason = NULL,
      hidden_at     = NULL,
      -- 자동 필터링도 같이 해제 (어드민이 명시적 복원)
      is_filtered   = false,
      filter_reason = NULL
  WHERE id = p_comment_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'unhide_comment', 'comment', p_comment_id::TEXT, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_comment(p_comment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_preview TEXT;
BEGIN
  PERFORM public.assert_admin();
  SELECT LEFT(content, 80) INTO v_preview FROM public.comments WHERE id = p_comment_id;
  DELETE FROM public.comments WHERE id = p_comment_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'delete_comment', 'comment', p_comment_id::TEXT,
    jsonb_build_object('preview', v_preview));
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   SELECT * FROM public.admin_search_comments(NULL, 'all',      20, 0);
--   SELECT * FROM public.admin_search_comments(NULL, 'hidden',   20, 0);
--   SELECT * FROM public.admin_search_comments(NULL, 'filtered', 20, 0);
--   SELECT * FROM public.admin_search_comments(NULL, 'reported', 20, 0);
--   SELECT * FROM public.admin_search_comments('스팸', 'all',    20, 0);
-- ════════════════════════════════════════════════════════════════════════════
