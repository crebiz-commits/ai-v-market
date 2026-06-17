-- ════════════════════════════════════════════════════════════════════════════
-- 크리에이터/사용자 레퍼럴(초대) 시스템 — 자동 확산 엔진
-- 적용 일자: 2026-06-18
--
-- 목적:
--   1. 모든 프로필에 고유 초대코드(referral_code) 부여
--   2. 신규 가입자가 초대링크(?ref=CODE)로 들어오면 referred_by 기록 + 초대자 카운트 증가
--   3. 보상은 비현금(초대수 추적) — 현금 보상은 결제(토스) 오픈 후 referral_count 기반으로 별도 정산
--
-- 적용 방법: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등)
-- 검증: supabase/_verify_migrations_applied.sql 또는 아래 하단 주석 쿼리
--
-- 설계 메모:
--   - referral_code/referred_by/referral_count 는 사용자가 직접 못 바꾸게
--     protect_subscription_columns 트리거에 묶어 보호(아래 5번).
--   - 코드 생성/초대 연결은 SECURITY DEFINER 함수로만 수행 → 보호 트리거 통과(definer=postgres).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. 컬럼 추가 (멱등)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code  TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_count INT NOT NULL DEFAULT 0;

-- 고유 인덱스(코드) + 조회 인덱스(누가 누구를 초대했나)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_referral_code ON public.profiles(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON public.profiles(referred_by);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. 고유 초대코드 생성기 (혼동 문자 제외: 0/O/1/I/L 제외, 8자리)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gen_referral_code()
RETURNS TEXT AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code TEXT;
  i INT;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..8 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    -- 충돌 없으면 채택
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code);
  END LOOP;
  RETURN code;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. 기존 프로필 백필 (코드 없는 행에 부여)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles WHERE referral_code IS NULL LOOP
    UPDATE public.profiles SET referral_code = public.gen_referral_code() WHERE id = r.id;
  END LOOP;
END$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. 신규 가입 트리거 확장 — profile 생성 시 referral_code 자동 부여
--    (기존 handle_new_user 동작 유지 + referral_code 추가)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url, referral_code)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url',
    public.gen_referral_code()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 트리거 자체는 profiles_table.sql 에서 이미 생성됨(on_auth_user_created). 재생성 불필요.

-- ────────────────────────────────────────────────────────────────────────────
-- 5. 보호 트리거 확장 — 일반 사용자가 레퍼럴 컬럼 임의 변경 차단
--    (기존 subscription/payout 보호 + referral 3컬럼 추가)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_subscription_columns()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.subscription_started_at := OLD.subscription_started_at;
    NEW.subscription_expires_at := OLD.subscription_expires_at;
    NEW.payout_info := OLD.payout_info;
    -- 레퍼럴 컬럼도 사용자 직접 변경 금지 (연결은 claim_referral RPC로만)
    NEW.referral_code := OLD.referral_code;
    NEW.referred_by := OLD.referred_by;
    NEW.referral_count := OLD.referral_count;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- 트리거(profiles_protect_subscription)는 profiles_table.sql 에서 이미 BEFORE UPDATE로 연결됨.

-- ────────────────────────────────────────────────────────────────────────────
-- 6. 초대 연결 RPC — 신규 가입자가 호출 (SECURITY DEFINER)
--    가드: 코드 존재 / 자기 자신 아님 / 아직 미연결(referred_by IS NULL)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_referral(p_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_referrer UUID;
  v_already UUID;
BEGIN
  IF v_uid IS NULL OR p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN FALSE;
  END IF;

  -- 이미 초대 연결됨 → 무시(멱등)
  SELECT referred_by INTO v_already FROM public.profiles WHERE id = v_uid;
  IF v_already IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  -- 초대자 찾기 (대문자 정규화)
  SELECT id INTO v_referrer FROM public.profiles WHERE referral_code = upper(trim(p_code));
  IF v_referrer IS NULL OR v_referrer = v_uid THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles SET referred_by = v_referrer WHERE id = v_uid AND referred_by IS NULL;
  UPDATE public.profiles SET referral_count = referral_count + 1 WHERE id = v_referrer;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.claim_referral(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_referral(TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. 내 레퍼럴 정보 조회 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_referral()
RETURNS JSON AS $$
  SELECT json_build_object(
    'code', referral_code,
    'count', referral_count,
    'referred', referred_by IS NOT NULL
  )
  FROM public.profiles
  WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.get_my_referral() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_referral() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT id, referral_code, referred_by, referral_count FROM public.profiles LIMIT 5;
--   SELECT public.get_my_referral();              -- 로그인 사용자 본인 코드/카운트
--   SELECT public.claim_referral('ABCD2345');     -- 초대 연결 테스트
-- ════════════════════════════════════════════════════════════════════════════
