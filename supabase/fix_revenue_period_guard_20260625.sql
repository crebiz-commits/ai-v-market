-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 정산 계좌 조회 가드 재확정 (2026-06-25) — 데이터 유출 감사
--
--   위험: get_revenue_distributions_by_period 는 전 크리에이터의 은행/계좌번호/예금주
--   (payout_info)를 반환. 정의가 2곳 —
--     · phase_settlement_payout_account.sql : 무가드(SQL, assert_admin 없음)  ← 위험
--     · security_patch_critical_20260614.sql(C2) : plpgsql + assert_admin 가드  ← 안전
--   DROP+CREATE 형태라 "나중 적용본이 이김". 만약 settlement(무가드)가 더 나중에
--   적용됐다면 임의 로그인 사용자가 supabase.rpc() 로 전 크리에이터 계좌를 덤프 가능(치명).
--   (is_admin 회귀와 동일한 "어느 마이그레이션이 이겼나" 위험 → 추측 대신 가드본을 재적용해 확정.)
--
--   조치: 가드본(assert_admin + search_path)을 다시 CREATE OR REPLACE 해 최신본으로 고정.
--   적용: Supabase SQL Editor → Run (멱등). ⚠️ 최우선.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_revenue_distributions_by_period(p_year integer, p_month integer)
RETURNS TABLE(id bigint, creator_id uuid, creator_name text, sale_revenue integer, ad_revenue integer,
              subscription_revenue integer, total_revenue integer, payout_status text,
              paid_at timestamp with time zone, tax_withholding integer, net_amount integer,
              tax_type_snapshot text, payout_bank text, payout_account text, payout_holder text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  PERFORM public.assert_admin();   -- 어드민만 (전 크리에이터 계좌번호 노출 차단)
  RETURN QUERY
  SELECT rd.id, rd.creator_id, p.display_name,
         rd.sale_revenue, rd.ad_revenue, rd.subscription_revenue, rd.total_revenue,
         rd.payout_status, rd.paid_at,
         rd.tax_withholding, rd.net_amount, rd.tax_type_snapshot,
         p.payout_info->>'bank_name'      AS payout_bank,
         p.payout_info->>'account_number' AS payout_account,
         p.payout_info->>'account_holder' AS payout_holder
  FROM public.revenue_distributions rd
  LEFT JOIN public.profiles p ON p.id = rd.creator_id
  WHERE rd.period_start = make_date(p_year, p_month, 1)
  ORDER BY rd.total_revenue DESC;
END;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT prosecdef, (prosrc ~ 'assert_admin') AS has_guard
--   FROM pg_proc WHERE proname='get_revenue_distributions_by_period';   -- has_guard=true 여야 함
--   -- 비관리자 세션: SELECT * FROM get_revenue_distributions_by_period(2026,6); → 예외
-- ════════════════════════════════════════════════════════════════════════════
