-- ════════════════════════════════════════════════════════════════════════════
-- 📢 관리자 광고 목록 집계 (2026-07-19) — 3단계
--
--   [문제] AdminDashboard 가 `from("ads").select("*")` 로 LIMIT 없이 전량 조회한 뒤
--     클라이언트에서 탭(자체/광고주) 분리·합계를 계산한다. 종료 캠페인도 계속 쌓이므로
--     목록이 무한정 길어지고 select("*") 라 페이로드도 크다.
--
--   ★ 목록만 자르면 화면 숫자가 틀어진다 — 합계가 목록 위에 얹혀 있기 때문:
--       AdminDashboard.tsx:483-485  visibleAds.reduce() → 노출·클릭 합계, 활성 개수
--       AdminDashboard.tsx:499       houseAds.length / advertiserAds.length → 탭 배지
--     PostgREST 집계함수는 이 프로젝트에서 비활성 → 합계를 RPC 로 분리한다.
--     (목록 자체는 ads 직접 조회 + .range() + count:exact 로 처리 — 추가 RPC 불필요)
--
--   기존 get_ad_performance_summary() 는 전체 ads 를 한 덩어리로 집계해 탭 구분이 없음.
--   → 자체광고(owner_id IS NULL) / 광고주광고(owner_id IS NOT NULL) 를 나눠 한 번에 반환.
--     그 함수는 대시보드 개요용으로 그대로 두고 건드리지 않는다(#19 보안게이트 대상).
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_ads_summary()
RETURNS TABLE (
  house_total        BIGINT,
  house_active       BIGINT,
  house_impressions  BIGINT,
  house_clicks       BIGINT,
  adv_total          BIGINT,
  adv_active         BIGINT,
  adv_impressions    BIGINT,
  adv_clicks         BIGINT
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
    COUNT(*) FILTER (WHERE a.owner_id IS NULL)::BIGINT,
    COUNT(*) FILTER (WHERE a.owner_id IS NULL AND a.is_active)::BIGINT,
    COALESCE(SUM(a.impressions) FILTER (WHERE a.owner_id IS NULL), 0)::BIGINT,
    COALESCE(SUM(a.clicks)      FILTER (WHERE a.owner_id IS NULL), 0)::BIGINT,
    COUNT(*) FILTER (WHERE a.owner_id IS NOT NULL)::BIGINT,
    COUNT(*) FILTER (WHERE a.owner_id IS NOT NULL AND a.is_active)::BIGINT,
    COALESCE(SUM(a.impressions) FILTER (WHERE a.owner_id IS NOT NULL), 0)::BIGINT,
    COALESCE(SUM(a.clicks)      FILTER (WHERE a.owner_id IS NOT NULL), 0)::BIGINT
  FROM public.ads a;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_ads_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_ads_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_ads_summary() TO authenticated;

COMMIT;

-- ── 검증 (선택) ──
SELECT 'admin_get_ads_summary 생성' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_get_ads_summary')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'assert_admin 게이트',
  CASE WHEN (SELECT bool_and(prosrc ~ 'assert_admin') FROM pg_proc WHERE proname='admin_get_ads_summary')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'anon 차단',
  CASE WHEN NOT has_function_privilege('anon','public.admin_get_ads_summary()','EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '기존 get_ad_performance_summary 보존(대시보드 개요용)',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_ad_performance_summary')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
