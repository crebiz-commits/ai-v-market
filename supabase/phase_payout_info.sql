-- ════════════════════════════════════════════════════════════════════════════
-- 크리에이터 정산 계좌 등록/수정 RPC (2026-05-31)
--
-- 문제:
--   profiles.payout_info(JSONB) 컬럼은 있고 MyPage가 표시도 하지만,
--   크리에이터가 직접 등록/수정할 RPC·폼이 없었음(버튼이 "곧 출시" 토스트).
--   → 정산받을 계좌를 입력할 방법이 없어 수익 지급 불가 (출시 전 블로커).
--
-- 동작:
--   본인 profiles.payout_info 에 { bank_name, account_number, account_holder, updated_at } 저장.
--   SECURITY DEFINER(owner=postgres)이므로 protect_subscription_columns 트리거의
--   payout_info 되돌림(current_user NOT IN postgres/...)을 우회 → 정상 저장.
--   (confirm_payment 가 동일 방식으로 subscription_tier 를 변경하는 것과 같은 패턴)
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
--   → "Success. No rows returned" 이면 성공
-- ════════════════════════════════════════════════════════════════════════════

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

  -- 계좌번호: 숫자만 추출. 은행별 자릿수 상이(체크섬 없음) → 6~16 sanity(2026-07-07).
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

COMMENT ON FUNCTION public.update_my_payout_info IS
  '본인 정산 계좌(payout_info) 등록/수정. SECURITY DEFINER로 protect_subscription_columns 트리거 우회';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--   SELECT public.update_my_payout_info('국민은행', '123456-78-901234', '홍길동');
--   SELECT payout_info FROM public.profiles WHERE id = auth.uid();
-- ────────────────────────────────────────────────────────────────────────────
