-- ════════════════════════════════════════════════════════════════════════════
-- N3: billing-run 동시실행 race 방지 — 원자적 claim (2026-06-16)
--   기존: billing-run 이 PostgREST select 로 due 구독을 읽어 cron 2회 겹치면
--         같은 구독을 둘 다 청구 → 이중청구 위험.
--   해결: charging_at 락 컬럼 + FOR UPDATE SKIP LOCKED 로 원자적으로 claim.
--         claim 된 행만 반환하므로 동시 실행은 서로 다른(또는 빈) 집합을 처리.
--   복구: 성공 시 next_charge_at 이 한 달 뒤로 가 due 에서 빠짐. 실패/중단 시
--         charging_at 이 15분 stale 되면 자동 재시도.
-- 적용: SQL Editor → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.billing_subscriptions ADD COLUMN IF NOT EXISTS charging_at timestamptz;

CREATE OR REPLACE FUNCTION public.billing_claim_due(p_limit integer DEFAULT 200, p_due_before timestamptz DEFAULT now())
RETURNS TABLE(user_id uuid, billing_key text, customer_key text, amount integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  RETURN QUERY
  UPDATE public.billing_subscriptions b
  SET charging_at = now()
  WHERE b.user_id IN (
    SELECT s.user_id FROM public.billing_subscriptions s
    WHERE s.auto_renew = true AND s.status = 'active'
      AND s.next_charge_at <= p_due_before
      AND (s.charging_at IS NULL OR s.charging_at < now() - interval '15 minutes')
    ORDER BY s.next_charge_at
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  )
  RETURNING b.user_id, b.billing_key, b.customer_key, b.amount;
END;
$fn$;

-- claim 은 service_role(엣지) 전용
REVOKE EXECUTE ON FUNCTION public.billing_claim_due(integer, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_claim_due(integer, timestamptz) TO service_role;
