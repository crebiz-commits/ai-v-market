-- ════════════════════════════════════════════════════════════════════════════
-- 긴급 보안 패치 — 전체감사 2026-06-14 Critical C1~C4
--   상세: docs/full-audit-2026-06-14.md
--   적용: Supabase SQL Editor → 전체 Run (또는 Management API). 멱등 재실행 안전.
--   ⚠️ 모두 운영 DB 직접 검증 후 작성. 어드민/Edge 정상 흐름 보존 확인됨.
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;

-- ── C1. 권한 상승 차단 ──────────────────────────────────────────────────────
-- 기존 트리거가 service_role 외 사용자의 구독/정산 컬럼 변경을 되돌림. is_admin 추가.
-- (어드민 승격은 service_role 또는 SQL Editor(postgres)로만 가능 — 일반 사용자 차단)
CREATE OR REPLACE FUNCTION public.protect_subscription_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.subscription_started_at := OLD.subscription_started_at;
    NEW.subscription_expires_at := OLD.subscription_expires_at;
    NEW.payout_info := OLD.payout_info;
    NEW.is_admin := OLD.is_admin;   -- 2026-06-14 C1: 권한상승 차단
  END IF;
  RETURN NEW;
END;
$fn$;

-- ── C2. 정산 계좌 조회 어드민 가드 ──────────────────────────────────────────
-- SQL 함수 → plpgsql 로 전환해 assert_admin() 선행 + search_path 고정.
-- (어드민 패널은 authenticated JWT 로 호출하므로 REVOKE 대신 내부 가드 — 진짜 어드민만 통과)
CREATE OR REPLACE FUNCTION public.get_revenue_distributions_by_period(p_year integer, p_month integer)
RETURNS TABLE(id bigint, creator_id uuid, creator_name text, sale_revenue integer, ad_revenue integer,
              subscription_revenue integer, total_revenue integer, payout_status text,
              paid_at timestamp with time zone, tax_withholding integer, net_amount integer,
              tax_type_snapshot text, payout_bank text, payout_account text, payout_holder text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  PERFORM public.assert_admin();   -- 2026-06-14 C2: 어드민만 (계좌번호 노출 차단)
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

-- ── C3. 결제 RPC 노출 차단 ──────────────────────────────────────────────────
-- confirm_payment: 클라이언트 호출 없음(Edge service_role 전용) → anon/authenticated REVOKE.
REVOKE EXECUTE ON FUNCTION public.confirm_payment(text, text, text, timestamp with time zone, jsonb)
  FROM anon, authenticated;

-- fail_payment: 클라이언트(PaymentResult)가 직접 호출 → REVOKE 불가. 본인 결제로만 제한.
--   (Edge service_role 호출은 role 클레임으로 허용 — 기존 트리거와 동일 검증 패턴)
CREATE OR REPLACE FUNCTION public.fail_payment(p_order_id text, p_failure_code text, p_failure_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  UPDATE public.payments
  SET status = 'failed', failure_code = p_failure_code, failure_reason = p_failure_reason, updated_at = now()
  WHERE order_id = p_order_id AND status = 'pending'
    AND (
      user_id = auth.uid()
      OR COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    );
END;
$fn$;

-- ── C4. 회계 원장 CASCADE 소실 차단 ─────────────────────────────────────────
-- 계정 삭제(auth.users 삭제) 시 결제·정산 원장을 삭제하지 말고 익명화 보존(SET NULL).
-- 전자상거래법 보존의무 + 정산 분쟁 근거 유지. + orders.buyer_id 는 NO ACTION 이라
-- 구매 이력 있는 사용자의 삭제를 막으므로 함께 SET NULL 로 보강(삭제 가능 + 원장 보존).
ALTER TABLE public.payments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.payments DROP CONSTRAINT payments_user_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.revenue_distributions ALTER COLUMN creator_id DROP NOT NULL;
ALTER TABLE public.revenue_distributions DROP CONSTRAINT revenue_distributions_creator_id_fkey;
ALTER TABLE public.revenue_distributions ADD CONSTRAINT revenue_distributions_creator_id_fkey
  FOREIGN KEY (creator_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.orders ALTER COLUMN buyer_id DROP NOT NULL;
ALTER TABLE public.orders DROP CONSTRAINT orders_buyer_id_fkey;
ALTER TABLE public.orders ADD CONSTRAINT orders_buyer_id_fkey
  FOREIGN KEY (buyer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMIT;
