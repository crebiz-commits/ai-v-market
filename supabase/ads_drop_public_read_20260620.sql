-- ════════════════════════════════════════════════════════════════════════════
-- 홈피드 감사 #5 보강 — ads 잔존 공개 SELECT 정책 제거 (2026-06-20)
--
--   ads_public_view_20260620.sql 적용 후에도 base ads 에 "public read active ads"
--   정책이 남아 anon 이 민감컬럼(budget_krw/spent_krw/owner_id 등)을 계속 읽을 수 있었음.
--   (이 정책은 저장소에 없던 프로덕션 전용 정책 — SSOT 밖이라 1차 드롭 목록에서 누락)
--
--   조치: 잔존 공개 읽기 정책 제거. base ads 직접 SELECT 는 소유자/관리자만.
--         공개 노출은 ads_public 뷰로만(안전컬럼). 코드 영향범위는 #5 와 동일(피드=ads_public,
--         관리자=admin 정책, 광고주/프리롤=RPC) → 안전.
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "public read active ads" ON public.ads;

-- 혹시 모를 다른 이름의 공개읽기 변형들도 함께 정리(있으면 제거, 없으면 무시)
DROP POLICY IF EXISTS "Public read active ads"  ON public.ads;
DROP POLICY IF EXISTS "public_read_active_ads"  ON public.ads;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증: anon 공개읽기 정책이 모두 사라지고 소유자/관리자 정책만 남아야 함
--   SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='ads';
--   -- 기대: "Advertiser can view own ads"(owner_id=auth.uid()) + "ads_admin_manage"(admin) 만.
-- ════════════════════════════════════════════════════════════════════════════
