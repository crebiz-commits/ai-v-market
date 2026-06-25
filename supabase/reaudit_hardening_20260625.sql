-- ════════════════════════════════════════════════════════════════════════════
-- 전체 재감사 하드닝 (2026-06-25) — 교차 스윕 발견분
--   R-budget : get_ad_budget_status 무가드 → 본인/관리자만 (타 광고주 예산 노출 차단)
--   R-history: get_platform_setting_history 무가드 → assert_admin (관리자 UUID·이력 노출 차단)
--   R-log    : log_notification / should_send_notification 를 authenticated 에서 REVOKE
--              (Edge service_role 만 호출 — 임의 p_user_id 로그 위조·알림설정 탐지 차단)
--   R-path   : SECURITY DEFINER search_path 일괄 재보강(블랭킷 픽스 재실행 — 멱등)
-- 적용: Supabase SQL Editor → Run (멱등 재실행 안전)
-- ════════════════════════════════════════════════════════════════════════════

-- ── R-budget: 광고 예산 진행률 — 본인 광고 또는 관리자만 ──────────────────────
CREATE OR REPLACE FUNCTION public.get_ad_budget_status(p_ad_id UUID)
RETURNS TABLE (
  budget_krw      INTEGER,
  spent_krw       INTEGER,
  remaining_krw   INTEGER,
  spent_ratio     NUMERIC(5,4),
  is_depleted     BOOLEAN,
  estimated_remaining_impressions INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.ads WHERE id = p_ad_id AND (owner_id = auth.uid() OR public.is_admin())
  ) THEN
    RAISE EXCEPTION '본인 광고 또는 관리자만 조회할 수 있습니다';
  END IF;
  RETURN QUERY
  SELECT
    a.budget_krw,
    a.spent_krw,
    CASE WHEN a.budget_krw IS NULL THEN NULL ELSE GREATEST(a.budget_krw - a.spent_krw, 0) END,
    CASE WHEN a.budget_krw IS NULL OR a.budget_krw = 0 THEN NULL
         ELSE LEAST(a.spent_krw::numeric / a.budget_krw::numeric, 1.0) END,
    CASE WHEN a.budget_krw IS NULL THEN false ELSE a.spent_krw >= a.budget_krw END,
    CASE WHEN a.budget_krw IS NULL THEN NULL
         ELSE FLOOR(
           GREATEST(a.budget_krw - a.spent_krw, 0)::numeric
           / GREATEST(CEIL(COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000) / 1000.0), 1)
         )::INTEGER END
  FROM public.ads a
  WHERE a.id = p_ad_id;
END;
$fn$;

-- ── R-history: 정책 변경 이력 — 관리자만 ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_setting_history(p_key TEXT DEFAULT NULL)
RETURNS TABLE (
  id BIGINT, key TEXT, value NUMERIC, effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ, note TEXT, updated_by UUID, updater_name TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT s.id, s.key, s.value, s.effective_from, s.effective_to, s.note, s.updated_by, p.display_name
  FROM public.platform_settings s
  LEFT JOIN public.profiles p ON p.id = s.updated_by
  WHERE p_key IS NULL OR s.key = p_key
  ORDER BY s.key, s.effective_from DESC;
END;
$fn$;

-- ── R-log: 알림 로그/설정 헬퍼 — Edge(service_role) 전용으로 축소 ──────────────
REVOKE EXECUTE ON FUNCTION public.log_notification(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.should_send_notification(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
-- (service_role GRANT 는 유지됨 — Edge /send-email 이 service_role 클라이언트로 호출)

-- ── R-path: SECURITY DEFINER search_path 일괄 재보강 (security_definer_search_path_fix 재실행) ──
DO $$
DECLARE r RECORD; v_fixed INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    IF r.proconfig IS NULL
       OR NOT EXISTS (SELECT 1 FROM unnest(r.proconfig) AS c WHERE c LIKE 'search_path=%') THEN
      BEGIN
        EXECUTE format('ALTER FUNCTION public.%I(%s) SET search_path = public, pg_temp', r.proname, r.args);
        v_fixed := v_fixed + 1;
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '실패: public.%(%) - %', r.proname, r.args, SQLERRM;
      END;
    END IF;
  END LOOP;
  RAISE NOTICE '✅ search_path 재보강: % 개 함수', v_fixed;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- R-budget/R-history: 비관리자 세션에서 호출 시 예외
--   -- R-log: SELECT has_function_privilege('authenticated','public.log_notification(uuid,text,text,text,text,text,text,text)','EXECUTE'); → false
--   -- R-path: 0행이어야 함
--   SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--    WHERE n.nspname='public' AND p.prosecdef=true
--      AND (p.proconfig IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'));
-- ════════════════════════════════════════════════════════════════════════════
