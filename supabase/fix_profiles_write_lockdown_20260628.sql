-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 profiles 직접 쓰기 잠금 — 민감컬럼 자가수정 차단 (2026-06-28, 보안게이트 #4 검출)
--
--   문제: Supabase 기본 권한으로 anon/authenticated 가 profiles 전 컬럼에
--         INSERT/UPDATE/REFERENCES 를 보유(진단 78행 전부 쓰기, SELECT 는 0).
--         fix_profiles_column_exposure_20260625.sql 는 SELECT(읽기 PII)만 잠갔고
--         쓰기는 기본값 그대로였음. RLS(본인 행) + protect_subscription_columns
--         트리거(8컬럼)로 대부분 가려지나, 트리거 미보호 컬럼은 본인이 직접 UPDATE 가능:
--           · is_suspended       → 정지 사용자가 자가 정지해제 (가장 위험)
--           · deletion_requested_at → 삭제 예약 시각 조작
--           · email / birthdate / business_* / tax_* → 검증 RPC 우회 직접 수정
--   조치: profiles 쓰기를 전면 회수하고, 클라가 직접 쓰는 유일 경로(MyPage 프로필 편집,
--         MyPage.tsx:1027-1036 upsert)의 5개 컬럼만 authenticated 에 재부여.
--         그 외 모든 프로필 변경(정산계좌/세금/구독/정지/삭제/레퍼럴)은 SECURITY DEFINER
--         RPC 경유라 table grant 영향을 받지 않음 → 정상 동작 유지.
--   적용: Supabase Dashboard → SQL Editor → Run (멱등 재실행 안전).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) profiles 쓰기 권한 전면 회수 (읽기 SELECT 화이트리스트 7컬럼은 fix_profiles_column_exposure 유지)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES ON public.profiles FROM anon, authenticated, PUBLIC;

-- 2) 클라 직접 쓰기 유일 경로 = MyPage 프로필 편집 upsert. 그 컬럼만 authenticated 에 재부여.
--    (민감컬럼은 일절 미부여 → 자가수정 불가. upsert 의 INSERT 경로용으로 id 포함.)
GRANT INSERT (id, display_name, bio, avatar_url, banner_url, updated_at) ON public.profiles TO authenticated;
GRANT UPDATE (display_name, bio, avatar_url, banner_url, updated_at)     ON public.profiles TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- (A) 민감컬럼 쓰기 0행이어야 함 (보안게이트 #4 = PASS):
--   SELECT grantee, column_name, privilege_type FROM information_schema.role_column_grants
--   WHERE table_schema='public' AND table_name='profiles' AND grantee IN ('anon','authenticated')
--     AND column_name IN ('payout_info','is_admin','email','birthdate','business_number',
--       'business_name','tax_invoice_email','tax_type','referral_code','referred_by',
--       'referral_count','deletion_requested_at','is_suspended');                       -- → 0행
--   -- (B) 프로필 편집 권한은 5컬럼(+id INSERT)만 남아야:
--   SELECT grantee, column_name, privilege_type FROM information_schema.role_column_grants
--   WHERE table_schema='public' AND table_name='profiles' AND grantee='authenticated'
--     AND privilege_type IN ('INSERT','UPDATE') ORDER BY 2,3;
--   -- (C) 앱: 마이페이지 프로필 편집(이름/소개/아바타/배너) 저장 정상 동작 확인.
-- ════════════════════════════════════════════════════════════════════════════
