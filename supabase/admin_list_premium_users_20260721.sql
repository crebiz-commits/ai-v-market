-- ════════════════════════════════════════════════════════════════════════════
-- 👑 프리미엄 구독자 현황 목록 RPC (2026-07-21 신설)
--
--   [배경] 프리미엄 수동 지급 화면이 "지급 직후 결과 1건"만 보여줘서, 누구에게 줬는지·
--     언제 끝나는지 다시 확인할 방법이 없었다(2026-07-21 요청).
--     · 지급 "이력"은 활동 로그(admin_logs, action='grant_premium')에 이미 남는다.
--     · 없는 건 "현황" — 지금 누가 프리미엄이고 남은 기간이 얼마인가.
--   [해결] 현황 목록 RPC. 결제 구독자와 수동 지급분을 함께 보되 구분해서 표시한다.
--
--   ▣ profiles 는 컬럼 화이트리스트 GRANT 로 잠겨 있어(profiles-column-grant SSOT)
--     클라이언트가 subscription_* 를 직접 SELECT 할 수 없다 → SECURITY DEFINER RPC 로 서빙.
--   ▣ assert_admin() 게이트 = 정지된 관리자도 차단(#25 클래스와 동일 규약).
--   ▣ 페이지네이션: 목록을 자르면서 합계를 클라가 세면 숫자가 틀어진다(pagination SSOT).
--     → total_count 를 서버에서 같은 필터로 계산해 매 행에 실어 보낸다.
--   ▣ 남은 일수는 **KST 날짜 기준**(admin_dashboard_kst_20260718 와 동일 규약).
--     UTC 로 재면 한국 시간 자정 근처에서 하루가 어긋난다.
--
--   ★ RETURNS TABLE 컬럼명이 본문에서 변수로 살아 있어 무별칭 컬럼 참조 시
--     `column reference ... is ambiguous` 런타임 예외가 난다(admin_grant_premium 전례).
--     → `#variable_conflict use_column` + 모든 참조에 테이블 별칭. 작성 후
--       _verify_returns_table_ambiguity_20260721.sql 로 재확인할 것.
--
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_list_premium_users(text, integer, integer);
CREATE OR REPLACE FUNCTION public.admin_list_premium_users(
  p_filter text    DEFAULT 'active',   -- 'active' | 'expired' | 'all'
  p_limit  integer DEFAULT 30,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  user_id                 uuid,
  email                   text,
  display_name            text,
  subscription_tier       text,
  subscription_started_at timestamptz,
  subscription_expires_at timestamptz,
  days_left               integer,
  is_active               boolean,
  manual_grants           integer,      -- 수동 지급 횟수(admin_logs 기준). 0 이면 결제 구독
  last_granted_at         timestamptz,  -- 마지막 수동 지급 시각
  total_count             bigint        -- 같은 필터 기준 전체 건수(페이지네이션용)
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
#variable_conflict use_column
DECLARE
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::DATE;
BEGIN
  PERFORM public.assert_admin();

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION '조회 개수는 1~200 사이여야 합니다';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      pr.id                                                            AS uid,
      pr.display_name                                                  AS dname,
      pr.subscription_tier                                             AS tier,
      pr.subscription_started_at                                       AS started,
      pr.subscription_expires_at                                       AS expires,
      -- KST 날짜 기준 남은 일수(음수 = 만료 후 경과일)
      ((pr.subscription_expires_at AT TIME ZONE 'Asia/Seoul')::DATE - v_today)::INTEGER AS dleft,
      (pr.subscription_expires_at > now())                             AS active
    FROM public.profiles pr
    WHERE pr.subscription_tier IS DISTINCT FROM 'free'
      AND pr.subscription_expires_at IS NOT NULL
  ),
  filtered AS (
    SELECT b.* FROM base b
    WHERE (p_filter = 'all')
       OR (p_filter = 'active'  AND b.active)
       OR (p_filter = 'expired' AND NOT b.active)
  ),
  -- 수동 지급 이력 집계(감사로그). target_id 는 TEXT 라 uuid 를 캐스팅해 비교.
  grants AS (
    SELECT
      al.target_id                AS tid,
      count(*)::INTEGER           AS cnt,
      max(al.created_at)          AS last_at
    FROM public.admin_logs al
    WHERE al.action = 'grant_premium'
      AND al.target_type = 'user'
    GROUP BY al.target_id
  )
  SELECT
    f.uid,
    u.email::text,
    f.dname,
    f.tier,
    f.started,
    f.expires,
    f.dleft,
    f.active,
    COALESCE(g.cnt, 0),
    g.last_at,
    (SELECT count(*) FROM filtered)     -- 같은 필터 기준 전체 건수
  FROM filtered f
  JOIN auth.users u ON u.id = f.uid
  LEFT JOIN grants g ON g.tid = f.uid::text
  ORDER BY
    -- 활성: 만료 임박 순(먼저 챙겨야 할 것부터) / 만료: 최근 만료 순
    CASE WHEN f.active THEN 0 ELSE 1 END,
    CASE WHEN f.active THEN f.expires END ASC,
    CASE WHEN NOT f.active THEN f.expires END DESC,
    f.uid                                -- 결정적 tiebreak(페이지 경계 중복·누락 방지)
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;

-- 권한: anon 은 호출 자체 불가(심층방어). 내부 assert_admin 이 SSOT.
REVOKE ALL ON FUNCTION public.admin_list_premium_users(text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_premium_users(text, integer, integer) TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '함수 생성됨' AS check_name,
  CASE WHEN to_regprocedure('public.admin_list_premium_users(text,integer,integer)') IS NOT NULL
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '정지관리자 게이트(assert_admin)',
  CASE WHEN (SELECT prosrc LIKE '%assert_admin%' FROM pg_proc
             WHERE proname = 'admin_list_premium_users')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '모호성 방어(#variable_conflict)',
  CASE WHEN (SELECT prosrc LIKE '%#variable_conflict%' FROM pg_proc
             WHERE proname = 'admin_list_premium_users')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '서버측 총건수(total_count) 반환',
  CASE WHEN (SELECT proargnames @> ARRAY['total_count'] FROM pg_proc
             WHERE proname = 'admin_list_premium_users')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'anon EXECUTE 차단',
  CASE WHEN NOT has_function_privilege('anon',
    'public.admin_list_premium_users(text, integer, integer)', 'EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
