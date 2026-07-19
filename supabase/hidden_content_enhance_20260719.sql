-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 숨김 콘텐츠 페이지 심층 감사 보강 (2026-07-19) — 식별성·크리에이터 경계·하드닝
--
--   관리자 "숨김 콘텐츠" 페이지(AdminModeration HiddenContentTab) 3방향 감사 결과.
--   핵심 복원 흐름(모든 숨김이 순수 boolean으로 목록에 뜨고 4종 unhide 로 복원)은 정상.
--   아래는 정합성/식별성/경계 결함 해소:
--
--   [M-1] AI 자동숨김·flagged·업로드pending·편집 재검수 영상은 hidden_reason=NULL 이라
--         목록에서 "사유 없음"으로 뭉뚱그려져 관리자가 숨김 원인을 식별 불가.
--         → 영상 행에 moderation_status/score 를 함께 반환(프론트가 사유 라벨 파생).
--   [M-3] 크리에이터의 사적 댓글 모더레이션(is_filtered: 차단/금칙어/크리에이터 수동숨김)이
--         플랫폼 관리자 목록을 오염(수천 건)하고, 관리자 복원이 크리에이터 필터를 무단 해제.
--         → 관리자 전역 목록에서 is_filtered=true(크리에이터 스코프) 댓글 제외.
--         (신고 remove·관리자 숨김·AI 는 is_filtered 를 세팅하지 않으므로 그대로 노출됨 — 검증됨)
--   [L-2] 댓글 딥링크 부재 → comment_video_id/comment_post_id 반환(프론트가 부모로 이동).
--   (+ 하드닝) 원본 함수에 SET search_path 없음 → 고정. anon/PUBLIC EXECUTE 회수 + authenticated GRANT.
--
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등.
--   반환 시그니처 변경(컬럼 추가) 때문에 DROP 후 재생성 → 트랜잭션으로 원자화.
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
  moderation_status TEXT,      -- 영상 전용(그 외 NULL) — 사유 NULL 인 AI/편집 숨김 식별용
  moderation_score  INTEGER,   -- 영상 전용
  comment_video_id  TEXT,      -- 댓글 전용 — 부모 영상(딥링크)
  comment_post_id   TEXT       -- 댓글 전용 — 부모 커뮤니티글(딥링크)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  -- 숨김 영상 (+moderation_status/score: '사유 없음' AI/편집 숨김 식별)
  SELECT
    'video'::TEXT, v.id::TEXT, v.title, v.thumbnail, v.hidden_reason, v.hidden_at,
    p.display_name,
    v.moderation_status, v.moderation_score::INTEGER,
    NULL::TEXT, NULL::TEXT
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE v.is_hidden = true AND (p_target_type = 'all' OR p_target_type = 'video')
  UNION ALL
  -- 숨김 댓글 — 크리에이터 사적 필터(is_filtered)는 제외(플랫폼 모더레이션만). 부모 딥링크 반환.
  SELECT
    'comment'::TEXT, c.id::TEXT, LEFT(c.content, 50)::TEXT, NULL::TEXT, c.hidden_reason, c.hidden_at,
    p.display_name,
    NULL::TEXT, NULL::INTEGER,
    c.video_id, c.post_id
  FROM public.comments c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE c.is_hidden = true AND NOT COALESCE(c.is_filtered, false)
    AND (p_target_type = 'all' OR p_target_type = 'comment')
  UNION ALL
  -- 숨김 커뮤니티 글
  SELECT
    'community_post'::TEXT, cp.id::TEXT, cp.title, NULL::TEXT, cp.hidden_reason, cp.hidden_at,
    p.display_name,
    NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT
  FROM public.community_posts cp
  LEFT JOIN public.profiles p ON p.id = cp.user_id
  WHERE cp.is_hidden = true AND (p_target_type = 'all' OR p_target_type = 'community_post')
  UNION ALL
  -- 정지 사용자
  SELECT
    'user'::TEXT, p.id::TEXT, p.display_name, p.avatar_url, p.suspended_reason, p.suspended_at,
    NULL::TEXT,
    NULL::TEXT, NULL::INTEGER, NULL::TEXT, NULL::TEXT
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
-- 1) 새 컬럼 반환 확인
SELECT 'admin_get_hidden_content moderation_status 컬럼' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.routines r
    JOIN information_schema.parameters pa ON pa.specific_name = r.specific_name
    WHERE r.routine_name = 'admin_get_hidden_content' AND pa.parameter_name = 'moderation_status'
  ) THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
-- 2) 크리에이터 사적필터 제외 반영 확인
SELECT 'admin_get_hidden_content is_filtered 제외' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'is_filtered' FROM pg_proc WHERE proname='admin_get_hidden_content')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
-- 3) anon 차단 확인
SELECT 'admin_get_hidden_content anon 차단' AS check_name,
  CASE WHEN NOT has_function_privilege('anon',
    'public.admin_get_hidden_content(text)', 'EXECUTE') THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
