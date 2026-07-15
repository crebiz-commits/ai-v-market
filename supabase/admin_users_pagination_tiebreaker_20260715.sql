-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 사용자 관리 목록 — 페이지네이션 결정적 정렬 + search_path 인라인 고정 (2026-07-15)
--   ★ 이 파일이 admin_search_users 의 새 정본(SSOT). phase10_6_admin_management.sql
--     의 admin_search_users 는 이 파일로 대체됨 → phase10_6 재실행 금지(회귀 유발).
--
--   [결함] admin_search_users 가 `ORDER BY p.created_at DESC` 단일 정렬 →
--     동일 created_at(시드/테스트 대량생성분 등) 이 있으면 정렬이 비결정적이라
--     OFFSET 기반 "더 보기" 페이지네이션에서 같은 사용자가 중복 노출되거나
--     일부가 건너뛰어져 누락되던 문제(2026-07-14 관리자 3차 감사 보류 항목).
--     → 시네마/OTT 피드가 이미 `v.id` 2차키로 고친 것과 동일 조치.
--   [수정] ① 유니크 2차 정렬키 `p.id` 추가 → 전순서(total order) 확정, 페이지 안정.
--          ② SECURITY DEFINER 인라인 `SET search_path` 고정(#9) — 스윕(ALTER)에만
--             의존하면 정본 CREATE OR REPLACE 재실행 시 풀리는 취약성 제거.
--          ③ 명시 GRANT(anon 실행 회수) — 관리자 콘솔(authenticated)에서만 호출.
--   반환 시그니처 동일 → CREATE OR REPLACE 로 교체(DROP 불필요).
--
--   적용: Supabase Dashboard → SQL Editor → 이 파일 붙여넣기 → Run (멱등).
--   검증(하단): 같은 created_at 2건 이상일 때 페이지 경계에서 중복/누락 0.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_query TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',   -- 'all' / 'premium' / 'suspended' / 'admins'
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                   UUID,
  email                TEXT,
  display_name         TEXT,
  avatar_url           TEXT,
  subscription_tier    TEXT,
  is_admin             BOOLEAN,
  is_suspended         BOOLEAN,
  suspended_reason     TEXT,
  created_at           TIMESTAMPTZ,
  video_count          BIGINT,
  total_payments       BIGINT
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
    p.id,
    u.email::TEXT,
    p.display_name,
    p.avatar_url,
    p.subscription_tier,
    COALESCE(p.is_admin, false),
    COALESCE(p.is_suspended, false),
    p.suspended_reason,
    p.created_at,
    (SELECT COUNT(*) FROM public.videos v WHERE v.creator_id = p.id)::BIGINT,
    (SELECT COALESCE(SUM(pay.amount), 0)
       FROM public.payments pay
       WHERE pay.user_id = p.id AND pay.status = 'completed')::BIGINT
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE
    (p_query IS NULL OR p_query = '' OR
       p.display_name ILIKE '%' || p_query || '%' OR
       u.email ILIKE '%' || p_query || '%')
    AND (
      p_filter = 'all'
      OR (p_filter = 'premium'   AND p.subscription_tier = 'premium')
      OR (p_filter = 'suspended' AND p.is_suspended = true)
      OR (p_filter = 'admins'    AND p.is_admin = true)
    )
  ORDER BY p.created_at DESC, p.id DESC   -- 🔑 유니크 2차키 → 결정적 페이지네이션
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 관리자 콘솔 전용 — anon 실행 회수, authenticated 만(본문 assert_admin 이 최종 게이트)
REVOKE ALL ON FUNCTION public.admin_search_users(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

COMMENT ON FUNCTION public.admin_search_users(TEXT, TEXT, INTEGER, INTEGER) IS
  '사용자 검색/목록 (어드민 전용). created_at DESC, id DESC 결정적 정렬로 OFFSET 페이지네이션 안정. search_path 인라인 고정.';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 1) 결정적 정렬 확인 — 같은 created_at 이 있어도 페이지 경계 중복/누락 0.
--   --    (관리자 세션) 50건씩 두 페이지를 이어붙였을 때 id 중복이 없어야 함:
--   WITH pg0 AS (SELECT id FROM public.admin_search_users(NULL,'all',50,0)),
--        pg1 AS (SELECT id FROM public.admin_search_users(NULL,'all',50,50))
--   SELECT count(*) AS overlap FROM pg0 JOIN pg1 USING (id);   -- 기대: 0
--
--   -- 2) search_path 인라인 고정 확인(#9 게이트 대상에서 제외되어야):
--   SELECT proconfig FROM pg_proc WHERE proname='admin_search_users';  -- search_path=... 포함
--
--   -- ⚠️ 형제 관리자 목록 RPC(admin_search_videos / admin_get_all_payments /
--   --    admin_get_activity_logs)도 동일한 단일-timestamp 정렬 → 같은 잠재 결함 있음.
--   --    각기 다른 SSOT 파일이라 이 파일 범위(사용자 관리)에서는 미포함. 필요 시 별도 조치.
-- ════════════════════════════════════════════════════════════════════════════
