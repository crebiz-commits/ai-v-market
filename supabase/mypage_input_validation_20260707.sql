-- ════════════════════════════════════════════════════════════════════════════
-- 마이페이지 입력 검증 보강 (2026-07-07) — #5 데이터품질
--
--   목적: 정산/세금 자가입력에서 형식검증 없이 임의값이 저장되던 것을 입력단에서
--         차단(정산 시 어드민 수기확인 부담·오지급 위험 완화). 보안홀은 아님.
--     · 사업자등록번호: 국세청 체크섬(가중치 [1,3,7,1,3,7,1,3,5] + 9번째×5 십의자리)
--       으로 유효성 검사. 무작위 오입력 ~90% 1차 필터.
--       (출처: 국세청 사업자번호 검증 규칙 — top2blue/egovframework 등)
--     · 계좌번호: 은행별 자릿수 상이·체크섬 없음 → 숫자 6~16자리 sanity 만
--       (유효 계좌 오거부 방지 위해 느슨하게).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 사업자등록번호 체크섬 검증 헬퍼 ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_valid_biz_no(p_num TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digits  TEXT;
  v_weights INT[] := ARRAY[1,3,7,1,3,7,1,3,5];
  v_sum     INT := 0;
  v_i       INT;
  v_check   INT;
BEGIN
  v_digits := REGEXP_REPLACE(COALESCE(p_num, ''), '[^0-9]', '', 'g');
  IF LENGTH(v_digits) <> 10 THEN
    RETURN FALSE;
  END IF;
  FOR v_i IN 1..9 LOOP
    v_sum := v_sum + (substr(v_digits, v_i, 1))::INT * v_weights[v_i];
  END LOOP;
  -- 9번째 자리 × 5 의 십의 자리를 가산(국세청 규칙)
  v_sum := v_sum + ((substr(v_digits, 9, 1))::INT * 5) / 10;   -- 정수나눗셈=floor
  v_check := (10 - (v_sum % 10)) % 10;
  RETURN v_check = (substr(v_digits, 10, 1))::INT;
END;
$$;

-- ── update_my_tax_info: 사업자번호 체크섬 검증 추가 ──────────────────────────
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

  -- 사업자면 사업자등록번호 필수 + 체크섬 유효성
  IF p_tax_type LIKE 'business_%' THEN
    IF p_business_number IS NULL OR LENGTH(TRIM(p_business_number)) = 0 THEN
      RAISE EXCEPTION '사업자등록번호는 필수입니다.';
    END IF;
    IF NOT public.is_valid_biz_no(p_business_number) THEN
      RAISE EXCEPTION '올바른 사업자등록번호가 아닙니다 (10자리·검증번호 확인).';
    END IF;
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

-- ── update_my_payout_info: 계좌번호 자릿수 상·하한 sanity(6~16) ──────────────
CREATE OR REPLACE FUNCTION public.update_my_payout_info(
  p_bank_name      TEXT,
  p_account_number TEXT,
  p_account_holder TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_digits  TEXT;
  v_info    JSONB;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  IF p_bank_name IS NULL OR LENGTH(TRIM(p_bank_name)) = 0 THEN
    RAISE EXCEPTION '은행을 선택해주세요';
  END IF;

  -- 계좌번호: 숫자만 추출. 은행별 자릿수 상이(체크섬 없음) → 6~16 sanity.
  v_digits := REGEXP_REPLACE(COALESCE(p_account_number, ''), '[^0-9]', '', 'g');
  IF LENGTH(v_digits) < 6 OR LENGTH(v_digits) > 16 THEN
    RAISE EXCEPTION '올바른 계좌번호를 입력해주세요 (숫자 6~16자리)';
  END IF;

  IF p_account_holder IS NULL OR LENGTH(TRIM(p_account_holder)) = 0 THEN
    RAISE EXCEPTION '예금주를 입력해주세요';
  END IF;

  v_info := jsonb_build_object(
    'bank_name',      TRIM(p_bank_name),
    'account_number', REGEXP_REPLACE(TRIM(p_account_number), '[^0-9-]', '', 'g'),
    'account_holder', TRIM(p_account_holder),
    'updated_at',     now()
  );

  UPDATE public.profiles
  SET payout_info = v_info
  WHERE id = v_user_id;

  RETURN v_info;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_my_payout_info(TEXT, TEXT, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT public.is_valid_biz_no('124-81-00998');  -- true (유효 예시)
--   SELECT public.is_valid_biz_no('123-45-67890');  -- false (검증번호 불일치)
--   SELECT public.is_valid_biz_no('220-81-6251');   -- false (자릿수 미달)
-- ════════════════════════════════════════════════════════════════════════════
