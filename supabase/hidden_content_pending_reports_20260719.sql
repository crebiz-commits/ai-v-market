-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 숨김 콘텐츠 — 미처리 신고 경고(M-2) (2026-07-19)
--
--   hidden_content_enhance_20260719.sql 후속. 관리자가 숨김 콘텐츠를 "복원"할 때,
--   그 대상에 아직 처리 안 된 신고(reports.status='pending')가 남아 있으면 경고하도록
--   admin_get_hidden_content 가 pending_reports 카운트를 함께 반환한다.
--   (공유 is_hidden 을 여러 시스템이 공유 → AI/신고로 동시에 숨겨진 콘텐츠를 한 경로에서
--    복원하면 미처리 신고가 남은 채 노출되던 문제(M-2)를 UI 경고로 방어. 하드블록 아님.)
--   서브쿼리 선례: admin_content_delete_guard_20260715.sql:95 (동일 패턴 재사용).
--
--   반환 컬럼 추가(pending_reports BIGINT) → DROP 후 재생성. 트랜잭션 원자화. 멱등.
--   ★ admin_get_hidden_content 새 정본(hidden_content_enhance_20260719.sql 대체).
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.admin_get_hidden_content(TEXT);
CREATE OR REPLACE FUNCTION public.admin_get_hidden_content(
  p_target_type TEXT DEFAULT 'all'   -- 'all' / 'video' / 'comment' / 'community_post' / 'user'
)
RETURNS TABLE (
  target_type       TEXT,
  target_id         TEXT,
  title             TEXT,
  thumbnail         TEXT,
  reason            TEXT,
  hidden_at         TIMESTAMPTZ,
  creator_name      TEXT,
  moderation_status TEXT,      -- 영상 전용
  moderation_score  INTEGER,   -- 영상 전용
  comment_video_id  TEXT,      -- 댓글 전용(딥링크)
  comment_post_id   TEXT,      -- 댓글 전용(딥링크)
  pending_reports   BIGINT     -- 대상에 남은 미처리 신고 수(복원 전 경고용, M-2)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  -- 숨김 영상
  SELECT
    'video'::TEXT, v.id::TEXT, v.title, v.thumbnail, v.hidden_reason, v.hidden_at,
    p.display_name, v.moderation_status, v.moderation_score::INTEGER,
    NULL::TEXT, NULL::TEXT,
    (SELECT COUNT(*) FROM public.reports r
       WHERE r.target_type = 'video' AND r.target_id = v.id::TEXT AND r.status = 'pending')::BIGINT
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE v.is_hidden = true AND (p_target_type = 'all' OR p_target_type = 'video')
  UNION ALL
  -- 숨김 댓글 — 크리에이터 사적필터(is_filtered) 제외(플랫폼 모더레이션만). 부모 딥링크.
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
  ORDER BY hidden_at DESC NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_hidden_content(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_hidden_content(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_hidden_content(TEXT) TO authenticated;

COMMIT;

-- ── 검증 (선택) ──
-- 1) pending_reports 컬럼 반환 확인
SELECT 'admin_get_hidden_content pending_reports 컬럼' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.routines r
    JOIN information_schema.parameters pa ON pa.specific_name = r.specific_name
    WHERE r.routine_name = 'admin_get_hidden_content' AND pa.parameter_name = 'pending_reports'
  ) THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
-- 2) [B 확인] admin_unhide_video 가 status 정규화(→passed) 하는 07-14 SSOT 버전인가
--    (교차탭 정합: Tab1 복원 시 Tab2 rejected 목록에서도 이탈해야 stale 안 남음)
SELECT 'admin_unhide_video status 정규화(교차탭 정합)' AS check_name,
  CASE WHEN (SELECT bool_or(prosrc ~ 'passed') FROM pg_proc WHERE proname = 'admin_unhide_video')
    THEN '✅ PASS (07-14 SSOT 라이브)'
    ELSE '🔴 FAIL — admin_audit_hardening_20260714.sql 의 admin_unhide_video 재적용 필요' END AS status;
