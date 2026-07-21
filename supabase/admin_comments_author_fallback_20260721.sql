-- ════════════════════════════════════════════════════════════════════════════
-- 🐛 관리자 댓글 관리 — 작성자가 "이름 없음"으로 표시되는 문제 (2026-07-21)
--
--   [증상] 같은 댓글인데 벨 알림엔 "최대승: 와 시라소니 형님" 으로 나오고,
--     관리자 → 댓글 관리 목록에선 작성자가 **"이름 없음"** 으로 표시된다.
--
--   [원인] 두 곳이 서로 다른 출처를 쓴다.
--     · 알림 트리거(comment_notification_deeplink_20260721): `NEW.author_name`
--       = comments 행에 **작성 시점 스냅샷**으로 저장된 이름 → "최대승"
--     · admin_search_comments: `p.display_name`
--       = profiles 의 **라이브** 표시명 → 이 사용자는 NULL
--     프론트(AdminComments.tsx:164)가 `c.author_name || "이름 없음"` 이라 NULL → "이름 없음".
--
--     실데이터 확인(2026-07-21):
--       author_name="김정수" / display_name="김정수"   → 정상 표시
--       author_name="최대승" / display_name=NULL       → "이름 없음" (5건)
--     즉 데이터 손상이 아니라 **표시 경로가 폴백을 안 한 것**이다.
--
--   [수정] 이 저장소의 다른 화면들이 이미 쓰는 폴백 패턴으로 통일:
--       COALESCE(NULLIF(p.display_name,''), NULLIF(c.author_name,''))
--     · search_creators / get_creator_profile: NULLIF(display_name,'') 폴백 사용
--     · admin_list_upload_milestones: COALESCE(NULLIF(p.display_name,''), email 앞부분, '크리에이터')
--     · CommentPanel: creatorInfo[...]?.name ?? comment.author_name (동일 우선순위)
--     라이브 display_name 을 우선하고(개명 반영), 없으면 작성 시점 이름으로 떨어진다.
--
--     검색(p_query)도 같이 고친다 — 지금은 display_name 으로만 찾아서
--     "최대승"으로 검색하면 그 사람 댓글이 하나도 안 나온다.
--
--   ★ 라이브 대조 완료: admin_search_comments 를 관리자 계정으로 호출해 반환 19컬럼의
--     이름·순서가 admin_comments_hardening_20260719.sql 과 일치함을 확인(= 그 파일이 라이브).
--     본문은 거기서 그대로 가져오고 위 두 곳만 바꿨다. assert_admin·필터 5종·pending_reports
--     서브쿼리·정렬 전부 보존.
--   ★ 이 파일이 admin_search_comments 새 정본.
--     admin_comments_hardening_20260719.sql / phase23_admin_comments.sql 의 이 함수 재실행 금지
--     (폴백이 사라져 "이름 없음" 재발).
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

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
    -- ★ 라이브 표시명 우선, 없으면 작성 시점 스냅샷(알림·댓글창과 같은 기준)
    COALESCE(NULLIF(p.display_name, ''), NULLIF(c.author_name, '')),
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
       c.author_name ILIKE '%' || p_query || '%' OR   -- ★ 스냅샷 이름으로도 검색되게
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

REVOKE ALL ON FUNCTION public.admin_search_comments(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_comments(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '작성자 이름 폴백(display_name → author_name)' AS check_name,
  CASE WHEN (SELECT prosrc LIKE '%NULLIF(c.author_name%' FROM pg_proc WHERE proname='admin_search_comments')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '스냅샷 이름으로도 검색 가능',
  CASE WHEN (SELECT prosrc LIKE '%c.author_name ILIKE%' FROM pg_proc WHERE proname='admin_search_comments')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'assert_admin 게이트 유지',
  CASE WHEN (SELECT prosrc LIKE '%assert_admin%' FROM pg_proc WHERE proname='admin_search_comments')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '필터 5종·신고건수 보존',
  CASE WHEN (SELECT prosrc LIKE '%p_filter = ''reported''%' AND prosrc LIKE '%pending%'
             FROM pg_proc WHERE proname='admin_search_comments')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'anon 차단',
  CASE WHEN NOT has_function_privilege('anon',
    'public.admin_search_comments(text,text,integer,integer)', 'EXECUTE') THEN '✅ PASS' ELSE '🔴 FAIL' END;
