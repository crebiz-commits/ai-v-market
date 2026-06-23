-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 긴급 보안 복구 — protect_subscription_columns 에 is_admin 보호 재추가 (2026-06-24)
--
--   회귀(regression): referral_20260618.sql 이 protect_subscription_columns 트리거를
--   CREATE OR REPLACE 로 덮으면서, C1 패치(security_patch_critical_20260614.sql:22)의
--   `NEW.is_admin := OLD.is_admin` 보호 줄을 빠뜨림(referral 컬럼만 추가). referral 이
--   더 나중 적용이라 프로덕션에서 is_admin 보호가 사라져 일반 사용자가
--   `UPDATE profiles SET is_admin=true WHERE id=auth.uid()` 로 관리자 권한 탈취 가능했음(치명).
--
--   복구: 보호 컬럼 전체(구독 3 + 정산 + is_admin + 레퍼럴 3)를 합친 완전판으로 재정의.
--   적용: Supabase Dashboard → SQL Editor → Run (멱등). ⚠️ 최우선 적용 권장.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.protect_subscription_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- Dashboard(postgres)/Edge(service_role)/supabase_admin 은 허용. 일반 사용자(anon/authenticated)만 차단.
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    -- 구독 (결제 웹훅·관리자만)
    NEW.subscription_tier := OLD.subscription_tier;
    NEW.subscription_started_at := OLD.subscription_started_at;
    NEW.subscription_expires_at := OLD.subscription_expires_at;
    -- 정산 계좌 (전용 RPC만)
    NEW.payout_info := OLD.payout_info;
    -- 관리자 권한 (C1: 자가 권한상승 차단 — referral 마이그레이션에서 누락됐던 것 복구)
    NEW.is_admin := OLD.is_admin;
    -- 레퍼럴 (claim_referral RPC만)
    NEW.referral_code := OLD.referral_code;
    NEW.referred_by := OLD.referred_by;
    NEW.referral_count := OLD.referral_count;
  END IF;
  RETURN NEW;
END;
$fn$;

-- 트리거(profiles_protect_subscription)는 profiles_table.sql 에서 BEFORE UPDATE 로 이미 연결됨 — 재생성 불필요.

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT pg_get_functiondef('public.protect_subscription_columns()'::regprocedure);
--   -- 본문에 NEW.is_admin := OLD.is_admin 이 있어야 함.
--   -- (테스트) 일반 사용자 세션에서 UPDATE profiles SET is_admin=true WHERE id=auth.uid() → is_admin 그대로 false 유지여야 함.
-- ════════════════════════════════════════════════════════════════════════════
