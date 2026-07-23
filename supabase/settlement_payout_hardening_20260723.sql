-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 정산 지급 하드닝 (2026-07-23) — 정지자 보류(U1) · 클로백 자동차감(F2) · 세금리포트(F3)
--
--   정산 4차 감사에서 확인된 지급 단계 결함 3건. phase32_tax_withholding.sql 의
--   mark_revenue_paid / admin_get_tax_annual_report 두 함수만 재정의(나머지 phase32 유지).
--
--   [U1] 정지 크리에이터 지급 보류 (정책: 제외 + 기발생분 보류)
--     mark_revenue_paid 가 is_suspended 를 안 봐, 정지된 크리에이터에게도 지급 처리 가능했다.
--     정책(정지=수익 지급 제외, 기발생분은 몰수 아닌 보류)에 맞춰 지급 시점에 차단.
--     행은 pending 으로 유지 → 금액 보존(보류), 정지 해제 후 정상 지급. 지급 대상 행에
--     FOR UPDATE 락을 걸어 동시 지급의 이중 부작용(클로백 이중적용 등)도 차단.
--
--   [F2] 처리 대기 클로백 자동 차감 (환불 회수분 재송금 방지)
--     기존엔 settlement_clawbacks 가 추적 원장일 뿐 지급이 안 읽어, 관리자가 pending
--     클로백을 잊고 전액 지급하면 환불된 돈을 재송금하는 위험이 있었다. 지급 시 해당
--     크리에이터의 pending 클로백을 net 에서 자동 차감(이 지급이 흡수 가능한 범위 내에서
--     오래된 것부터 통째로 applied, 초과분은 다음 지급으로 이월). 실지급액=net 이 이미
--     회수분을 반영하므로 관리자의 실제 송금액에서 자동 차감된다.
--
--   [F3] 연말 원천징수 리포트에 회수분(clawed_back) 표기
--     지급완료 후 환불(클로백)이 연말정산 자료에 안 잡혀 소득 과대신고 소지. 세금 숫자를
--     임의 재계산하지 않고(연도·세율·환원 판단은 세무 영역) 회수분을 별도 컬럼으로 노출해
--     회계사가 gross 에서 조정하도록 한다. (net 은 F2 로 이미 회수 반영됨.)
--
--   ★ mark_revenue_paid / admin_get_tax_annual_report 새 정본.
--     phase32_tax_withholding.sql 의 두 함수 + admin_audit_hardening_20260714.sql ③
--     (admin_get_tax_annual_report KST 귀속) 재실행 금지 — U1·F2·F3 소실.
--     ※ 리포트는 0714 의 KST 연도귀속(paid_at AT TIME ZONE 'Asia/Seoul')을 그대로 보존.
--
-- 적용: Supabase SQL Editor → Run (멱등). settlement_clawbacks_20260711.sql 선적용 필요.
-- ════════════════════════════════════════════════════════════════════════════

-- ── mark_revenue_paid : U1(정지 보류) + F2(클로백 자동차감) ────────────────────
CREATE OR REPLACE FUNCTION public.mark_revenue_paid(
  p_distribution_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id     UUID;
  v_total          INTEGER;
  v_status         TEXT;
  v_tax_type       TEXT;
  v_is_suspended   BOOLEAN;
  v_withholding    INTEGER;
  v_net            INTEGER;
  v_max_deduct     INTEGER;
  v_clawback_total INTEGER := 0;
  v_cb             RECORD;
BEGIN
  PERFORM public.assert_admin();

  -- 지급 대상 행 잠금(FOR UPDATE) — 동시 지급의 이중 부작용(클로백 이중적용) 차단.
  SELECT creator_id, total_revenue, payout_status
  INTO v_creator_id, v_total, v_status
  FROM public.revenue_distributions
  WHERE id = p_distribution_id
  FOR UPDATE;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Revenue distribution not found: %', p_distribution_id;
  END IF;

  -- 이미 지급됐거나 pending 이 아니면 no-op (원본 멱등성 유지).
  IF v_status IS DISTINCT FROM 'pending' THEN
    RETURN;
  END IF;

  -- 크리에이터 세금유형 + 정지여부
  SELECT COALESCE(tax_type, 'individual'), COALESCE(is_suspended, false)
  INTO v_tax_type, v_is_suspended
  FROM public.profiles
  WHERE id = v_creator_id;

  -- U1(2026-07-23): 정지 크리에이터는 지급 보류 — 행을 pending 으로 유지(금액 보존).
  --   정책: 정지 = 수익 지급 제외, 기발생분은 몰수 아닌 보류(정지 해제 후 지급).
  IF v_is_suspended THEN
    RAISE EXCEPTION '정지된 크리에이터의 정산은 지급 보류 대상입니다. 정지 해제 후 지급하세요.';
  END IF;

  -- 세금: 비사업자 3.3% 원천징수(소득세 3% + 지방세 0.3%) / 사업자 0
  IF v_tax_type = 'individual' THEN
    v_withholding := FLOOR(v_total * 0.033)::INTEGER;
  ELSE
    v_withholding := 0;
  END IF;

  -- F2(2026-07-23): 처리 대기 클로백 자동 차감 — 이 지급이 흡수 가능한 범위 내에서
  --   오래된 것부터 통째로 applied, 초과분은 다음 지급으로 이월. net 에서 회수.
  v_max_deduct := GREATEST(v_total - v_withholding, 0);
  FOR v_cb IN
    SELECT id, amount
    FROM public.settlement_clawbacks
    WHERE creator_id = v_creator_id AND status = 'pending' AND amount > 0
    ORDER BY created_at ASC, id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_clawback_total + v_cb.amount > v_max_deduct;
    UPDATE public.settlement_clawbacks
    SET status = 'applied',
        resolved_at = now(),
        resolved_by = auth.uid(),
        note = COALESCE(note || ' ', '') || '[지급 #' || p_distribution_id || ' 에서 자동 차감]'
    WHERE id = v_cb.id;
    v_clawback_total := v_clawback_total + v_cb.amount;
  END LOOP;

  v_net := v_total - v_withholding - v_clawback_total;

  UPDATE public.revenue_distributions SET
    payout_status     = 'paid',
    paid_at           = now(),
    tax_withholding   = v_withholding,
    net_amount        = v_net,
    tax_type_snapshot = v_tax_type,
    updated_at        = now()
  WHERE id = p_distribution_id
    AND payout_status = 'pending';

  IF FOUND THEN
    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'revenue_payout', 'revenue_distribution', p_distribution_id::text,
            jsonb_build_object('creator_id', v_creator_id, 'total', v_total,
                               'withholding', v_withholding, 'clawback_applied', v_clawback_total,
                               'net', v_net, 'tax_type', v_tax_type));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_revenue_paid(BIGINT) TO authenticated;

-- ── admin_get_tax_annual_report : F3(회수분 별도 표기) ────────────────────────
--   RETURNS TABLE 에 total_clawed_back 컬럼 추가. gross/withholding 은 지급 원장 그대로
--   두고(세무 판단 영역), 그 해 applied 된 클로백 합계를 별도 노출 → 회계사 조정용.
--   net 은 F2 로 이미 회수 반영됨(이중차감 방지 위해 net 에서 재차감하지 않음).
DROP FUNCTION IF EXISTS public.admin_get_tax_annual_report(INTEGER);
CREATE FUNCTION public.admin_get_tax_annual_report(
  p_year INTEGER
)
RETURNS TABLE (
  creator_id        UUID,
  creator_name      TEXT,
  tax_type          TEXT,
  business_number   TEXT,
  business_name     TEXT,
  total_gross       INTEGER,     -- 세전 지급 합계(지급 원장 그대로)
  total_withholding INTEGER,     -- 원천징수 합계
  total_net         INTEGER,     -- 세후 실지급 합계(클로백 F2 반영됨)
  total_clawed_back INTEGER,     -- 그 해 회수(환불 클로백 applied) 합계 — gross 조정용
  distribution_count INTEGER     -- 정산 건수
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  WITH paid AS (
    SELECT rd.creator_id AS cid,
           SUM(rd.total_revenue)::INTEGER   AS gross,
           SUM(rd.tax_withholding)::INTEGER AS wh,
           SUM(rd.net_amount)::INTEGER      AS net,
           COUNT(*)::INTEGER                AS cnt
    FROM public.revenue_distributions rd
    WHERE rd.payout_status = 'paid'
      AND EXTRACT(YEAR FROM rd.paid_at AT TIME ZONE 'Asia/Seoul') = p_year  -- KST 귀속 유지(0714 ③)
    GROUP BY rd.creator_id
  ),
  clawed AS (
    SELECT c.creator_id AS cid, SUM(c.amount)::INTEGER AS clawed
    FROM public.settlement_clawbacks c
    WHERE c.status = 'applied'
      AND c.resolved_at IS NOT NULL
      AND EXTRACT(YEAR FROM c.resolved_at AT TIME ZONE 'Asia/Seoul') = p_year  -- KST 통일
    GROUP BY c.creator_id
  )
  SELECT
    p.cid,
    pr.display_name,
    COALESCE(pr.tax_type, 'individual'),
    pr.business_number,
    pr.business_name,
    p.gross,
    p.wh,
    p.net,
    COALESCE(cl.clawed, 0),
    p.cnt
  FROM paid p
  LEFT JOIN public.profiles pr ON pr.id = p.cid
  LEFT JOIN clawed cl ON cl.cid = p.cid
  ORDER BY p.gross DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_tax_annual_report(INTEGER) TO authenticated;

-- ── 검증 ──
SELECT 'U1: mark_revenue_paid 정지자 보류' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'is_suspended' AND prosrc ~ 'FOR UPDATE'
             FROM pg_proc WHERE proname='mark_revenue_paid')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'F2: mark_revenue_paid 클로백 자동차감',
  CASE WHEN (SELECT prosrc ~ 'settlement_clawbacks' AND prosrc ~ 'clawback_applied'
             FROM pg_proc WHERE proname='mark_revenue_paid')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'F3: 연말리포트 clawed_back 컬럼',
  CASE WHEN (SELECT pg_get_function_result(oid) LIKE '%total_clawed_back%'
             FROM pg_proc WHERE proname='admin_get_tax_annual_report')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
