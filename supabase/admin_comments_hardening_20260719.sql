-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 댓글 관리 RPC 하드닝 (2026-07-19) — search_path 고정 + 최소권한
--
--   관리자 "댓글 관리"(AdminComments) 4함수 감사 결과. 배선·필터·삭제 정합성은 정상:
--     · admin_search_comments: assert_admin ✓, 반환 17컬럼 CommentRow 일치, 필터 5종
--       (all/visible/hidden/filtered/reported) 정확, 검색 3필드(내용·작성자·영상제목)
--     · admin_hide/unhide/delete_comment: assert_admin ✓, admin_logs ✓,
--       delete 는 parent_id/comment_id FK 가 ON DELETE CASCADE 라 답글·좋아요 동반삭제(고아 없음)
--
--   [하드닝] 원본(phase23_admin_comments.sql)이 4함수 모두 SET search_path 없이 SECURITY DEFINER →
--     search_path hijack 방어 미비(게이트 #9). 라이브는 security_definer_search_path_sweep 로
--     이미 고정됐으나 소스가 없어 재실행 시 #9 WARN 회귀. 병렬 세션의 신고/숨김 함수와 정합.
--     + anon/PUBLIC EXECUTE 회수(심층방어) — assert_admin 이 SSOT 이나 anon 은 호출조차 불가하게.
--   [식별성] admin_search_comments 에 post_id/post_title 반환 추가 — 프론트가 "어떤 영상/커뮤니티글
--     의 댓글인지"를 클릭 링크(?video=id&comment=1 / ?post=id)로 열 수 있게(2026-07-19 요청).
--     그 외 본문 로직은 phase23_admin_comments.sql 과 동일 + search_path·grant.
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등.
--
--   ★ 4함수의 새 정본. phase23_admin_comments.sql 재실행 금지(search_path 빠진 판으로 회귀).
-- ════════════════════════════════════════════════════════════════════════════

-- A. 어드민 댓글 검색 (post_id/post_title 추가 → 반환 시그니처 변경, DROP 선행)
--    프론트가 어떤 영상/커뮤니티글의 댓글인지 클릭 링크로 이동할 수 있게 위치정보 반환.
DROP FUNCTION IF EXISTS public.admin_search_comments(TEXT, TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.admin_search_comments(
  p_query  TEXT    DEFAULT NULL,
  p_filter TEXT    DEFAULT 'all',
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              UUID,
  video_id        TEXT,
  video_title     TEXT,
  post_id         TEXT,       -- 커뮤니티 글 댓글(그 외 NULL) — 딥링크 ?post=
  post_title      TEXT,       -- 커뮤니티 글 제목
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
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    c.id,
    c.video_id,
    v.title,
    c.post_id,
    cp.title,
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
  LEFT JOIN public.videos          v  ON v.id = c.video_id
  LEFT JOIN public.community_posts cp ON cp.id::TEXT = c.post_id
  LEFT JOIN public.profiles        p  ON p.id = c.user_id
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

-- B. 강제 숨김 / 복원 / 영구 삭제 (admin_logs 자동 기록)
CREATE OR REPLACE FUNCTION public.admin_hide_comment(
  p_comment_id UUID,
  p_reason     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preview TEXT;
BEGIN
  PERFORM public.assert_admin();
  SELECT LEFT(content, 80) INTO v_preview FROM public.comments WHERE id = p_comment_id;
  DELETE FROM public.comments WHERE id = p_comment_id;   -- 답글·좋아요 FK CASCADE 동반삭제
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'delete_comment', 'comment', p_comment_id::TEXT,
    jsonb_build_object('preview', v_preview));
END;
$$;

-- C. 최소권한 — anon/PUBLIC 회수, authenticated 만 (본문 assert_admin 이 실질 게이트)
REVOKE ALL ON FUNCTION public.admin_search_comments(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_hide_comment(UUID, TEXT)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_unhide_comment(UUID)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_comment(UUID)      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_comments(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hide_comment(UUID, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unhide_comment(UUID)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_comment(UUID)      TO authenticated;

-- ── 검증 (선택) ──
--   SELECT proname, prosrc ~ 'assert_admin' AS gated,
--     EXISTS(SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search_path=%') AS has_sp
--   FROM pg_proc WHERE proname IN
--     ('admin_search_comments','admin_hide_comment','admin_unhide_comment','admin_delete_comment');
--     → 4행 모두 gated=true, has_sp=true 여야 정상.
-- ════════════════════════════════════════════════════════════════════════════
