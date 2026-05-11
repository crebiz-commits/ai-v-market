-- ════════════════════════════════════════════════════════════════════════════
-- 사용자 프로필 + 구독 테이블 (Phase 1 — 페이월 기반)
-- 적용 일자: 2026-05-02
--
-- 목적:
--   1. auth.users와 1:1 매핑되는 public.profiles 테이블 생성
--   2. 가입 시 자동으로 profile 생성 (trigger)
--   3. subscription_tier (free/basic/premium)로 페이월 게이트 결정
--   4. payout_info에 크리에이터 정산 정보 저장 (첫 수익 발생 시)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. profiles 테이블 생성 (이미 존재하면 누락된 컬럼만 추가)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 누락된 컬럼 보강 (기존 테이블이 이미 존재하는 경우 대비)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_tier TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS payout_info JSONB;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- subscription_tier 기본값 + NULL을 'free'로 백필 + CHECK 제약
UPDATE public.profiles SET subscription_tier = 'free' WHERE subscription_tier IS NULL;
ALTER TABLE public.profiles ALTER COLUMN subscription_tier SET DEFAULT 'free';
ALTER TABLE public.profiles ALTER COLUMN subscription_tier SET NOT NULL;

-- CHECK 제약 (이미 있으면 스킵)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_subscription_tier_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_subscription_tier_check
      CHECK (subscription_tier IN ('free', 'basic', 'premium'));
  END IF;
END$$;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier
  ON public.profiles(subscription_tier);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. updated_at 자동 갱신 트리거
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 3. 구독 정보 보호 트리거 (일반 사용자가 자기 tier를 premium으로 못 바꾸게)
--    허용 역할: postgres / supabase_admin / service_role
--    차단 역할: anon / authenticated (PostgREST 클라이언트 호출)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.protect_subscription_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Dashboard SQL Editor (postgres) / Edge Function service_role / supabase_admin은 허용
  -- 일반 사용자(anon, authenticated)만 보호 컬럼 변경 차단
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.subscription_started_at := OLD.subscription_started_at;
    NEW.subscription_expires_at := OLD.subscription_expires_at;
    NEW.payout_info := OLD.payout_info;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS profiles_protect_subscription ON public.profiles;
CREATE TRIGGER profiles_protect_subscription
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_subscription_columns();

-- ────────────────────────────────────────────────────────────────────────────
-- 4. 신규 가입 시 자동으로 profile 생성
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ────────────────────────────────────────────────────────────────────────────
-- 5. 기존 사용자 백필 (이미 가입한 모두에게 free tier profile 생성)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.profiles (id, display_name, avatar_url)
SELECT
  id,
  COALESCE(
    raw_user_meta_data->>'name',
    raw_user_meta_data->>'full_name',
    split_part(email, '@', 1)
  ),
  raw_user_meta_data->>'avatar_url'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RLS 정책
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 모두 읽기 가능 (크리에이터 이름/아바타 표시용)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

-- 본인은 자기 프로필 update 가능 (구독/정산 컬럼은 트리거가 막음)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- INSERT는 트리거(handle_new_user)가 SECURITY DEFINER로 처리하므로 정책 불필요
-- service_role은 RLS 우회하므로 결제 웹훅에서 자유롭게 update 가능

-- ────────────────────────────────────────────────────────────────────────────
-- 7. 헬퍼 함수: 현재 사용자가 구독자인지 확인
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_subscriber(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND subscription_tier IN ('basic', 'premium')
      AND (subscription_expires_at IS NULL OR subscription_expires_at > now())
  );
$$ LANGUAGE sql STABLE;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT * FROM public.profiles LIMIT 5;  -- 백필 확인
--   SELECT public.is_subscriber();          -- 현재 사용자 구독 상태
-- ════════════════════════════════════════════════════════════════════════════
