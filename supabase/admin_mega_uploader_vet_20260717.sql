-- ════════════════════════════════════════════════════════════════════════════
-- 메가 업로더 감사(2차) — 관리자 검토 지원: 현재 게시 편수 노출 (2026-07-17)
--
--   [갭] 카운트는 "업로드 기준"(전체 영상 COUNT, 숨김/반려 포함) 유지가 확정됨
--     → 남용 방어선은 "관리자 수동검토"뿐인데, 목록은 달성 시점 누적수(video_count)만
--     보여줘 "지금 실제로 게시(검수통과)된 영상이 몇 편인지" 알 수 없음. 30편 업로드
--     달성했으나 대부분 숨김/반려면 정크 파밍 신호인데 관리자가 못 봄.
--   [수정] admin_list_upload_milestones 에 current_visible(현재 is_hidden=false 영상 수)
--     컬럼 추가 → 관리자가 지급 전 한눈에 판단(게시 5/30 = 의심). 채널 확인 링크(프론트)와
--     함께 검토 수단 완비.
--
--   ★ 이 파일이 admin_list_upload_milestones 새 정본(본문 동일 + current_visible 추가).
--     mega_uploader_event_20260611.sql 의 해당 함수 재실행 금지. REVOKE/GRANT 재적용.
--   보안: SECURITY DEFINER + inline search_path 유지, assert_admin 게이트, PUBLIC/anon 회수.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 반환 컬럼(current_visible) 추가라 CREATE OR REPLACE 불가(42P13) → DROP 후 재생성.
--   (이 함수에 의존 객체 없음. anon/authenticated 는 아래 GRANT 로 재부여)
DROP FUNCTION IF EXISTS public.admin_list_upload_milestones();

CREATE OR REPLACE FUNCTION public.admin_list_upload_milestones()
RETURNS TABLE (
  id uuid, user_id uuid, milestone int, video_count int, status text,
  note text, created_at timestamptz, rewarded_at timestamptz,
  creator_name text, creator_email text, current_visible int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  -- auth.users.email 은 varchar → text 캐스팅(RETURNS TABLE 시그니처 일치)
  SELECT m.id, m.user_id, m.milestone, m.video_count, m.status::text,
         m.note, m.created_at, m.rewarded_at,
         COALESCE(NULLIF(p.display_name, ''), split_part(u.email::text, '@', 1), '크리에이터')::text,
         u.email::text,
         (SELECT COUNT(*)::int FROM public.videos v
            WHERE v.creator_id = m.user_id
              AND COALESCE(v.is_hidden, false) = false) AS current_visible
  FROM public.upload_milestones m
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  ORDER BY (m.status = 'pending') DESC, m.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_upload_milestones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_upload_milestones() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   SELECT creator_name, milestone, video_count, current_visible
--     FROM public.admin_list_upload_milestones();
--   -- current_visible 가 milestone 보다 크게 작으면(예: 5/30) 검토 필요 신호
-- ════════════════════════════════════════════════════════════════════════════
