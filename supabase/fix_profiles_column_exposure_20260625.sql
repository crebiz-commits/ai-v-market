-- ════════════════════════════════════════════════════════════════════════════
-- 🔴🔴 긴급 — profiles 민감 컬럼 공개 노출 차단 (2026-06-25 데이터 유출 감사)
--
--   확인된 실제 유출(프로덕션 검증): profiles 의 민감 컬럼이 anon·authenticated 에
--   GRANT 되어 있고 SELECT RLS 가 USING(true) 라, **공개 anon key 만으로 전 사용자의**
--   email / payout_info(은행계좌) / birthdate / business_number / business_name /
--   tax_invoice_email / tax_type / is_admin / is_suspended / referral_* /
--   deletion_requested_at **를 덤프 가능** = 실시간 PII 유출.
--
--   원인: C2(phase_security_hardening_20260531) 의 컬럼 화이트리스트 GRANT 이후
--   추가된 컬럼(birthdate/business_*/tax_*/referral_* 등) 또는 테이블 단위 재-GRANT 로
--   전 컬럼이 다시 노출됨.
--
--   조치: 테이블 단위 SELECT 회수 후, 공개 표시에 필요한 안전 컬럼만 컬럼 단위 재부여.
--   (클라는 profiles 를 직접 SELECT 하지 않음 — 전부 SECURITY DEFINER RPC 경유라
--    이 회수가 정상 동작을 깨지 않음. 본인 민감값은 get_my_profile 등으로만.)
--   적용: Supabase SQL Editor → Run. ⚠️⚠️ 최우선 즉시 적용.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 테이블 단위 SELECT 회수 (전 컬럼 노출의 주원인)
REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- 1-b) 방어적: 혹시 컬럼 단위로도 부여됐을 경우까지 민감 컬럼 명시 회수 (없으면 no-op)
REVOKE SELECT (
  payout_info, is_admin, is_suspended, birthdate,
  business_number, business_name, tax_invoice_email, tax_type,
  referral_code, referred_by, referral_count, deletion_requested_at, email
) ON public.profiles FROM anon, authenticated;

-- 2) 공개 표시에 필요한 안전 컬럼만 재부여 (C2 화이트리스트와 동일)
GRANT SELECT (id, display_name, avatar_url, banner_url, bio, subscription_tier, created_at)
  ON public.profiles TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 (적용 후):
--   -- 민감 컬럼 노출 0행이어야 함:
--   SELECT grantee, column_name FROM information_schema.role_column_grants
--   WHERE table_name='profiles' AND grantee IN ('anon','authenticated')
--     AND column_name IN ('payout_info','is_admin','email','birthdate','business_number',
--       'business_name','tax_invoice_email','tax_type','referral_code','referred_by',
--       'referral_count','deletion_requested_at','is_suspended');
--   -- 안전 컬럼 7종만 남았는지:
--   SELECT grantee, column_name FROM information_schema.role_column_grants
--   WHERE table_name='profiles' AND grantee IN ('anon','authenticated') ORDER BY 1,2;
--   -- 앱 동작: 로그인·마이페이지·채널·검색 정상(전부 RPC 경유). 본인 프로필도 정상.
-- ════════════════════════════════════════════════════════════════════════════
