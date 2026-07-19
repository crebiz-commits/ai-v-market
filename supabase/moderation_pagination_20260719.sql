-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 숨김 콘텐츠 / AI 검토 큐 페이지네이션 (2026-07-19) — A / M-4
--
--   Tab1(admin_get_hidden_content)·Tab2(get_moderation_queue) 둘 다 LIMIT/OFFSET 부재로
--   대량(특히 인코딩 중 pending 영상 누적) 시 전량 반환/렌더. p_limit/p_offset 추가로
--   "더 보기" 페이지네이션 지원.
--
--   · 인자 추가 = 시그니처 변경 → 오버로드 난립/모호성 방지 위해 DROP 후 재생성.
--     신 인자에 DEFAULT 가 있어 기존 호출(1~2 named arg)은 그대로 동작.
--   · 정렬값(hidden_at / moderation_checked_at)에 NULL 이 많아 페이지 경계가 흔들리므로
--     안정 정렬용 tiebreaker(id) 추가 — 페이지 간 중복/누락 방지.
--   · admin_get_hidden_content 는 pending_reports 판(hidden_content_pending_reports_20260719)의
--     정확한 superset — 본문 동일, 페이지네이션만 추가. ★ 새 정본.
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 트랜잭션 원자화. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) admin_get_hidden_content — p_limit/p_offset (A) ──
DROP FUNCTION IF EXISTS public.admin_get_hidden_content(TEXT);
CREATE OR REPLACE FUNCTION public.admin_get_hidden_content(
  p_target_type TEXT    DEFAULT 'all',   -- 'all' / 'video' / 'comment' / 'community_post' / 'user'
  p_limit       INTEGER DEFAULT 30,
  p_offset      INTEGER DEFAULT 0
)
RETURNS TABLE (
  target_type       TEXT,
  target_id         TEXT,
  title             TEXT,
  thumbnail         TEXT,
  reason            TEXT,
  hidden_at         TIMESTAMPTZ,
  creator_name      TEXT,
  moderation_status TEXT,
  moderation_score  INTEGER,
  comment_video_id  TEXT,
  comment_post_id   TEXT,
  pending_reports   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT * FROM (
    -- 숨김 영상
    SELECT
      'video'::TEXT AS target_type, v.id::TEXT AS target_id, v.title, v.thumbnail, v.hidden_reason AS reason, v.hidden_at,
      p.display_name AS creator_name, v.moderation_status, v.moderation_score::INTEGER AS moderation_score,
      NULL::TEXT AS comment_video_id, NULL::TEXT AS comment_post_id,
      (SELECT COUNT(*) FROM public.reports r
         WHERE r.target_type = 'video' AND r.target_id = v.id::TEXT AND r.status = 'pending')::BIGINT AS pending_reports
    FROM public.videos v
    LEFT JOIN public.profiles p ON p.id = v.creator_id
    WHERE v.is_hidden = true AND (p_target_type = 'all' OR p_target_type = 'video')
    UNION ALL
    -- 숨김 댓글 — 크리에이터 사적필터(is_filtered) 제외
    SELECT
      'comment'::TEXT, c.id::TEXT, LEFT(c.content, 50)::TEXT, NULL::TEXT, c.hidden_reason, c.hidden_at,
      p.display_name, NULL::TEXT, NULL::INTEGER, c.video_id, c.post_id,
      (SELECT COUNT(*) FROM public.reports r
         WHERE r.target_type = 'comment' AND r.target_id = c.id::TEXT AND r.status = 'pending')::BIGINT
    FROM public.comments c
    LEFT JOIN public.profiles p ON p.id = c.user_id
    WHERE c.is_hidden = true AND NOT COALESCE(c.is_filtered, false)
      AND (p_target_type = 'all' OR p_target_type = 'comment')
    UNION ALL
    -- 숨김 커뮤니티 글
    SELECT
      'community_post'::TEXT, cp.id::TEXT, cp.title, NULL::TEXT, cp.hidden_reason, cp.hidden_at,
      p.display_name, NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
      (SELECT COUNT(*) FROM public.reports r
         WHERE r.target_type = 'community_post' AND r.target_id = cp.id::TEXT AND r.status = 'pending')::BIGINT
    FROM public.community_posts cp
    LEFT JOIN public.profiles p ON p.id = cp.user_id
    WHERE cp.is_hidden = true AND (p_target_type = 'all' OR p_target_type = 'community_post')
    UNION ALL
    -- 정지 사용자
    SELECT
      'user'::TEXT, p.id::TEXT, p.display_name, p.avatar_url, p.suspended_reason, p.suspended_at,
      NULL::TEXT, NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT,
      (SELECT COUNT(*) FROM public.reports r
         WHERE r.target_type = 'user' AND r.target_id = p.id::TEXT AND r.status = 'pending')::BIGINT
    FROM public.profiles p
    WHERE p.is_suspended = true AND (p_target_type = 'all' OR p_target_type = 'user')
  ) q
  ORDER BY q.hidden_at DESC NULLS LAST, q.target_id   -- tiebreaker: 안정 페이지네이션
  LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_hidden_content(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_hidden_content(TEXT, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_hidden_content(TEXT, INTEGER, INTEGER) TO authenticated;

-- ── 2) get_moderation_queue — p_offset (M-4) ──
DROP FUNCTION IF EXISTS public.get_moderation_queue(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.get_moderation_queue(
  p_status TEXT    DEFAULT 'flagged',
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
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
SET search_path = public, pg_temp
AS $$
BEGIN
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
  ORDER BY v.moderation_checked_at DESC NULLS LAST, v.id   -- tiebreaker: 안정 페이지네이션
  LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.get_moderation_queue(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_moderation_queue(TEXT, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_moderation_queue(TEXT, INTEGER, INTEGER) TO authenticated;

COMMIT;

-- ── 검증 (선택) ──
SELECT 'admin_get_hidden_content 페이지네이션(3-arg)' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_get_hidden_content' AND pronargs=3)
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'get_moderation_queue 페이지네이션(3-arg)',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_moderation_queue' AND pronargs=3)
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'admin_get_hidden_content anon 차단',
  CASE WHEN NOT has_function_privilege('anon',
    'public.admin_get_hidden_content(text,integer,integer)', 'EXECUTE') THEN '✅ PASS' ELSE '🔴 FAIL' END;
