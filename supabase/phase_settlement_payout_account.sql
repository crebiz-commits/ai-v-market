-- ════════════════════════════════════════════════════════════════════════════
-- 정산 화면에 크리에이터 정산 계좌 노출 (2026-05-31, R4 수정)
--
-- 문제:
--   get_revenue_distributions_by_period 가 payout_info(은행/계좌)를 반환하지 않아,
--   어드민이 "지급 완료 표시" 를 눌러도 실제 어디로 송금할지(계좌) 화면에서 볼 수 없었음.
--   → 정산 계좌 등록 기능(phase_payout_info.sql)을 만든 목적이 정산 화면에 연결 안 됨.
--
-- 변경:
--   RETURNS TABLE 에 payout_bank / payout_account / payout_holder 추가
--   (profiles.payout_info JSONB 에서 추출). 반환 타입 변경이라 DROP 후 재생성.
--   (클라이언트 AdminRevenueSettlement.tsx 는 이미 세 필드를 표시하도록 수정됨)
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
--   → "Success. No rows returned" 이면 성공
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.get_revenue_distributions_by_period(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.get_revenue_distributions_by_period(
  p_year INTEGER,
  p_month INTEGER
)
RETURNS TABLE (
  id                   BIGINT,
  creator_id           UUID,
  creator_name         TEXT,
  sale_revenue         INTEGER,
  ad_revenue           INTEGER,
  subscription_revenue INTEGER,
  total_revenue        INTEGER,
  payout_status        TEXT,
  paid_at              TIMESTAMPTZ,
  payout_bank          TEXT,
  payout_account       TEXT,
  payout_holder        TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    rd.id, rd.creator_id, p.display_name,
    rd.sale_revenue, rd.ad_revenue, rd.subscription_revenue, rd.total_revenue,
    rd.payout_status, rd.paid_at,
    p.payout_info->>'bank_name'      AS payout_bank,
    p.payout_info->>'account_number' AS payout_account,
    p.payout_info->>'account_holder' AS payout_holder
  FROM public.revenue_distributions rd
  LEFT JOIN public.profiles p ON p.id = rd.creator_id
  WHERE rd.period_start = make_date(p_year, p_month, 1)
  ORDER BY rd.total_revenue DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--   SELECT creator_name, payout_status, payout_bank, payout_account, payout_holder
--   FROM public.get_revenue_distributions_by_period(2026, 6);
--   → 계좌 등록한 크리에이터는 payout_bank/account 가 채워져 보임
-- ────────────────────────────────────────────────────────────────────────────
