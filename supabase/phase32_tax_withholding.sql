-- ════════════════════════════════════════════════════════════════════════════
-- Phase 32 — 세금/원천징수 자동화
--
-- 흐름:
--   1. 사용자가 MyPage에서 세금 정보 등록 (tax_type, business_*)
--   2. 정산 (mark_revenue_paid) 시 세금 자동 계산:
--      - individual (비사업자): 3.3% 원천징수 → net_amount = total - 3.3%
--      - business_* (사업자): 원천징수 없음 → net_amount = total (세금계산서 별도)
--   3. 어드민 연말정산 자료 CSV 다운로드
--
-- 한국 세법:
--   - 비사업자 프리랜서: 3.3% 원천징수 (소득세 3% + 지방세 0.3%)
--   - 사업자: 부가세 별도 (세금계산서 발행, 수동 처리)
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: profiles 세금 정보 컬럼 5개 추가
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tax_type TEXT
    CHECK (tax_type IS NULL OR tax_type IN ('individual', 'business_simple', 'business_general', 'business_corp'));
COMMENT ON COLUMN public.profiles.tax_type IS
  '세금 유형: individual(비사업자, 3.3% 원천징수) / business_simple(간이과세자) / business_general(일반과세자) / business_corp(법인). NULL이면 미등록(individual 처리).';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_number TEXT;
COMMENT ON COLUMN public.profiles.business_number IS '사업자등록번호 (사업자만, 10자리 또는 13자리)';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS business_name TEXT;
COMMENT ON COLUMN public.profiles.business_name IS '상호 (사업자만)';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tax_invoice_email TEXT;
COMMENT ON COLUMN public.profiles.tax_invoice_email IS '세금계산서 이메일 (사업자, 별도 수신처)';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tax_consent_at TIMESTAMPTZ;
COMMENT ON COLUMN public.profiles.tax_consent_at IS '세금 정보 등록·동의 시점 (분쟁 대비)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: revenue_distributions 세금 컬럼 3개 추가
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.revenue_distributions
  ADD COLUMN IF NOT EXISTS tax_withholding INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.revenue_distributions.tax_withholding IS
  '원천징수액 (원). 비사업자만 3.3% 차감. 사업자는 0.';

ALTER TABLE public.revenue_distributions
  ADD COLUMN IF NOT EXISTS net_amount INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.revenue_distributions.net_amount IS
  '세후 실제 지급액 (원). total_revenue - tax_withholding.';

ALTER TABLE public.revenue_distributions
  ADD COLUMN IF NOT EXISTS tax_type_snapshot TEXT;
COMMENT ON COLUMN public.revenue_distributions.tax_type_snapshot IS
  '정산 시점의 세금 유형 스냅샷 (분쟁 대비, profiles.tax_type 변경 후에도 보존).';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: RPC — mark_revenue_paid 재정의 (세금 자동 계산 추가)
--   기존 동작: pending → paid + paid_at
--   추가 동작: tax_type 조회 → tax_withholding/net_amount/tax_type_snapshot 계산
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_revenue_paid(
  p_distribution_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_total INTEGER;
  v_tax_type TEXT;
  v_withholding INTEGER;
  v_net INTEGER;
BEGIN
  PERFORM public.assert_admin();

  -- 정산 행에서 creator_id + total_revenue 조회
  SELECT creator_id, total_revenue
  INTO v_creator_id, v_total
  FROM public.revenue_distributions
  WHERE id = p_distribution_id;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION 'Revenue distribution not found: %', p_distribution_id;
  END IF;

  -- 크리에이터의 세금 유형 조회 (없으면 individual 기본값)
  SELECT COALESCE(tax_type, 'individual') INTO v_tax_type
  FROM public.profiles
  WHERE id = v_creator_id;

  -- 세금 계산
  IF v_tax_type = 'individual' THEN
    -- 비사업자: 3.3% 원천징수 (소득세 3% + 지방세 0.3%)
    v_withholding := FLOOR(v_total * 0.033)::INTEGER;
  ELSE
    -- 사업자: 원천징수 없음 (세금계산서 별도)
    v_withholding := 0;
  END IF;

  v_net := v_total - v_withholding;

  -- 지급 처리 + 세금 정보 저장
  UPDATE public.revenue_distributions SET
    payout_status = 'paid',
    paid_at = now(),
    tax_withholding = v_withholding,
    net_amount = v_net,
    tax_type_snapshot = v_tax_type,
    updated_at = now()
  WHERE id = p_distribution_id
    AND payout_status = 'pending';

  -- 감사로그 (정산 지급 — 금전 처리 책임추적, 2026-06-28 B4)
  IF FOUND THEN
    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'revenue_payout', 'revenue_distribution', p_distribution_id::text,
            jsonb_build_object('creator_id', v_creator_id, 'total', v_total,
                               'withholding', v_withholding, 'net', v_net, 'tax_type', v_tax_type));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_revenue_paid(BIGINT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: RPC — get_my_tax_info (본인 세금 정보 조회)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_tax_info()
RETURNS TABLE (
  tax_type TEXT,
  business_number TEXT,
  business_name TEXT,
  tax_invoice_email TEXT,
  tax_consent_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT p.tax_type, p.business_number, p.business_name, p.tax_invoice_email, p.tax_consent_at
  FROM public.profiles p
  WHERE p.id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_tax_info() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: RPC — update_my_tax_info (본인 세금 정보 등록·변경)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_my_tax_info(
  p_tax_type TEXT,
  p_business_number TEXT DEFAULT NULL,
  p_business_name TEXT DEFAULT NULL,
  p_tax_invoice_email TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_tax_type NOT IN ('individual', 'business_simple', 'business_general', 'business_corp') THEN
    RAISE EXCEPTION 'Invalid tax_type: %', p_tax_type;
  END IF;

  -- 사업자면 사업자등록번호 필수
  IF p_tax_type LIKE 'business_%' AND (p_business_number IS NULL OR LENGTH(TRIM(p_business_number)) = 0) THEN
    RAISE EXCEPTION '사업자등록번호는 필수입니다.';
  END IF;

  UPDATE public.profiles SET
    tax_type = p_tax_type,
    business_number = CASE WHEN p_tax_type LIKE 'business_%' THEN p_business_number ELSE NULL END,
    business_name = CASE WHEN p_tax_type LIKE 'business_%' THEN p_business_name ELSE NULL END,
    tax_invoice_email = CASE WHEN p_tax_type LIKE 'business_%' THEN p_tax_invoice_email ELSE NULL END,
    tax_consent_at = now()
  WHERE id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_tax_info(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: RPC — admin_get_tax_annual_report (어드민 연말정산 자료)
--   특정 연도의 크리에이터별 합계 + 세금 정보 → CSV 다운로드 자료
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_tax_annual_report(
  p_year INTEGER
)
RETURNS TABLE (
  creator_id UUID,
  creator_name TEXT,
  tax_type TEXT,
  business_number TEXT,
  business_name TEXT,
  total_gross INTEGER,        -- 세전 합계
  total_withholding INTEGER,  -- 원천징수 합계
  total_net INTEGER,          -- 세후 지급 합계
  distribution_count INTEGER  -- 정산 건수
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  RETURN QUERY
  SELECT
    rd.creator_id,
    p.display_name,
    COALESCE(p.tax_type, 'individual'),
    p.business_number,
    p.business_name,
    SUM(rd.total_revenue)::INTEGER,
    SUM(rd.tax_withholding)::INTEGER,
    SUM(rd.net_amount)::INTEGER,
    COUNT(*)::INTEGER
  FROM public.revenue_distributions rd
  LEFT JOIN public.profiles p ON p.id = rd.creator_id
  WHERE rd.payout_status = 'paid'
    AND EXTRACT(YEAR FROM rd.paid_at) = p_year
  GROUP BY rd.creator_id, p.display_name, p.tax_type, p.business_number, p.business_name
  ORDER BY SUM(rd.total_revenue) DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_tax_annual_report(INTEGER) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리
--
--   -- 1. profiles 세금 컬럼 추가 확인
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='profiles' AND (column_name LIKE 'tax_%' OR column_name LIKE 'business_%');
--
--   -- 2. revenue_distributions 세금 컬럼 확인
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='revenue_distributions' AND (column_name LIKE 'tax_%' OR column_name = 'net_amount');
--
--   -- 3. 본인 세금 정보 조회 (NULL이면 미등록)
--   SELECT * FROM public.get_my_tax_info();
--
--   -- 4. 세금 정보 등록 테스트 (개인)
--   SELECT public.update_my_tax_info('individual');
--
--   -- 5. 연말정산 자료 조회 (어드민)
--   SELECT * FROM public.admin_get_tax_annual_report(2026);
-- ────────────────────────────────────────────────────────────────────────────
