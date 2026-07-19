-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 활동 로그 2차 감사 (2026-07-19) — 누가/언제 필터 + 감사기록 무결성
--
--   [A] 관리자별 필터 미연결 — RPC 는 p_admin_id 를 지원하는데 프론트가 항상 null.
--       드롭다운용 admin_list_admins() 신설(관리자 목록은 profiles.is_admin 인데 그 컬럼이
--       authenticated 에 GRANT 안 돼 클라 직접조회 불가 → DEFINER RPC 필요).
--   [B] 기간 필터 부재 — 감사툴 핵심("언제~언제")인데 RPC 에 날짜 파라미터가 없었음.
--       p_from/p_to 추가.
--   [F5] 정본 미확정 — admin_get_activity_logs 가 2곳에 정의(구판은 ORDER BY created_at 만).
--       구판이 라이브면 동일 created_at 행(admin_review_ad→ad_approve+update_ad,
--       moderate_report→report_*+트리거 등 한 트랜잭션 2행)에서 페이지 경계 중복/누락 발생.
--       이 파일이 DROP 후 재생성하므로 tiebreaker(id DESC)가 **확정 적용**된다. ★새 정본.
--   [F3] admin_logs.admin_id 가 auth.users FK + ON DELETE SET NULL 인데, 이 플랫폼은 탈퇴
--       30일 후 실제 계정 파기(functions/server/index.ts deleteUser) → 관리자가 탈퇴하면
--       그가 남긴 모든 감사기록의 행위자가 일괄 NULL 로 소거되어 복구 불가.
--       감사 테이블은 역사적 행위자를 보존해야 하므로 FK 제거(값은 그대로 남음).
--   [F6] 감사 테이블 락다운 — profiles 는 write REVOKE 됐는데 admin_logs 는 미적용.
--       RLS 로 막히지 않는 TRUNCATE/REFERENCES 포함 회수(append-only 강화).
--
--   적용: Supabase SQL Editor → Run. 트랜잭션 원자화. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) admin_get_activity_logs — 기간(p_from/p_to) 추가 + tiebreaker 확정 ──
DROP FUNCTION IF EXISTS public.admin_get_activity_logs(UUID, TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.admin_get_activity_logs(
  p_admin_id UUID        DEFAULT NULL,
  p_action   TEXT        DEFAULT NULL,
  p_limit    INTEGER     DEFAULT 100,
  p_offset   INTEGER     DEFAULT 0,
  p_from     TIMESTAMPTZ DEFAULT NULL,   -- 기간 시작(이상)
  p_to       TIMESTAMPTZ DEFAULT NULL    -- 기간 끝(미만)
)
RETURNS TABLE (
  id           BIGINT,
  admin_id     UUID,
  admin_name   TEXT,
  admin_email  TEXT,
  action       TEXT,
  target_type  TEXT,
  target_id    TEXT,
  details      JSONB,
  created_at   TIMESTAMPTZ
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
    l.id,
    l.admin_id,
    p.display_name,
    u.email::TEXT,
    l.action,
    l.target_type,
    l.target_id,
    l.details,
    l.created_at
  FROM public.admin_logs l
  LEFT JOIN public.profiles p ON p.id = l.admin_id
  LEFT JOIN auth.users u ON u.id = l.admin_id
  WHERE
    (p_admin_id IS NULL OR l.admin_id = p_admin_id)
    AND (p_action IS NULL OR l.action = p_action)
    AND (p_from IS NULL OR l.created_at >= p_from)
    AND (p_to   IS NULL OR l.created_at <  p_to)
  ORDER BY l.created_at DESC, l.id DESC   -- 🔑 동일 created_at 페이지 경계 중복/누락 방지
  LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_activity_logs(UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_activity_logs(UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_activity_logs(UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ── 2) admin_list_admins — 관리자별 필터 드롭다운용 (A) ──
CREATE OR REPLACE FUNCTION public.admin_list_admins()
RETURNS TABLE (
  id           UUID,
  display_name TEXT,
  email        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT p.id, p.display_name, u.email::TEXT
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE COALESCE(p.is_admin, false) = true
  ORDER BY p.display_name NULLS LAST;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_admins() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_admins() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_admins() TO authenticated;

-- ── 3) F3: admin_id FK 제거 — 관리자 계정 파기 시에도 행위자 UUID 보존 ──
--   (감사 테이블은 참조무결성보다 '역사 보존'이 우선. 값은 남고 이름/이메일만 조인 불가가 됨)
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.admin_logs'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.admin_logs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- ── 4) F6: 감사 테이블 락다운 (append-only 강화) ──
--   기록은 SECURITY DEFINER 함수(소유자)로만. RLS 로 막히지 않는 TRUNCATE/REFERENCES 포함 회수.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.admin_logs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.admin_logs FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.admin_logs FROM PUBLIC;

COMMIT;

-- ── 검증 (선택) ──
SELECT 'admin_get_activity_logs 기간필터(6-arg)' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_get_activity_logs' AND pronargs=6)
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'admin_get_activity_logs tiebreaker(id DESC) 확정',
  CASE WHEN (SELECT bool_or(prosrc ~ 'id DESC') FROM pg_proc WHERE proname='admin_get_activity_logs')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'admin_list_admins 생성',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_list_admins')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'admin_logs FK 제거(행위자 보존)',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='public.admin_logs'::regclass AND contype='f')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'admin_logs authenticated 쓰기 차단',
  CASE WHEN NOT has_table_privilege('authenticated','public.admin_logs','INSERT')
   AND NOT has_table_privilege('authenticated','public.admin_logs','DELETE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
