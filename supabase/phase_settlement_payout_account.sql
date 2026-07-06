-- ════════════════════════════════════════════════════════════════════════════
-- 정산 화면에 크리에이터 정산 계좌 노출 (2026-05-31, R4 수정)
--
-- 🛑 경고(2026-07-05): 아래 get_revenue_distributions_by_period 는 admin 가드 없는 SQL 함수.
--   재실행 시 아무 로그인 사용자가 전 크리에이터 은행계좌를 덤프할 수 있다. 보안 정본(SSOT) =
--   fix_revenue_period_guard_20260625.sql(assert_admin 포함). **이 함수 블록 재실행 금지.**
--   재발 감지: 게이트 #12 (_verify_security_invariants_20260628.sql).
--
-- 문제:
--   get_revenue_distributions_by_period 가 payout_info(은행/계좌)를 반환하지 않아,
--   어드민이 "지급 완료 표시" 를 눌러도 실제 어디로 송금할지(계좌) 화면에서 볼 수 없었음.
--   → 정산 계좌 등록 기능(phase_payout_info.sql)을 만든 목적이 정산 화면에 연결 안 됨.
--
-- 변경:
--   RETURNS TABLE 에 payout_bank / payout_account / payout_holder 추가 (정산 계좌, R4)
--   + tax_withholding / net_amount / tax_type_snapshot 추가 (Phase 32 세금 표시가
--     이 RPC 미반환으로 그동안 죽어 있던 것 복구, R6).
--   (profiles.payout_info JSONB 추출 + revenue_distributions 세금 컬럼). DROP 후 재생성.
--   클라이언트 AdminRevenueSettlement.tsx 는 이미 표시하도록 수정됨.
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
  tax_withholding      INTEGER,
  net_amount           INTEGER,
  tax_type_snapshot    TEXT,
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
    rd.tax_withholding, rd.net_amount, rd.tax_type_snapshot,
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
