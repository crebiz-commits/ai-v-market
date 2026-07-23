-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ ad_impressions / ad_clicks 쓰기 잠금 (2026-07-23 전체감사, RLS/Edge)
--
--   [MED] 두 테이블의 INSERT RLS 가 `WITH CHECK (true)` + Supabase 기본 default-privilege
--         (신규 public 테이블 → anon/authenticated INSERT)가 어디에서도 REVOKE 안 됨 →
--         **anon(비로그인 포함)이 PostgREST 로 임의 행 무한 삽입 가능**(테이블 블로트/비용),
--         authenticated 는 creator_id=본인 uid 삽입 후 SELECT-own 으로 자기 노출/클릭 지표
--         위조 가능. 삽입은 record_ad_impression/record_ad_click(SECURITY DEFINER, Edge
--         service_role 경유)만으로 충분하다(DEFINER 는 owner 로 실행돼 RLS·GRANT 무관).
--         ※ 현재 정산·통계는 ad_video_events(service_role only)를 쓰고 이 두 테이블을
--           SELECT 하는 소비처가 없어 금전 미전이(MED)나, 향후 소비처 생기면 지표조작으로 승격.
--
--   조치: WITH CHECK(true) INSERT 정책 제거 + anon/authenticated 의 쓰기 GRANT 회수.
--         SELECT-own 정책은 유지(본인 지표 조회용, RLS 로 본인 한정).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- INSERT 개방 정책 제거 (삽입은 DEFINER RPC 만)
DROP POLICY IF EXISTS "Insert ad impressions" ON public.ad_impressions;
DROP POLICY IF EXISTS "Insert ad clicks"      ON public.ad_clicks;

-- 기본 GRANT 쓰기권 회수 (직접 삽입·조작 차단). SELECT 는 SELECT-own 정책으로 유지.
REVOKE INSERT, UPDATE, DELETE ON public.ad_impressions FROM anon, authenticated, PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.ad_clicks      FROM anon, authenticated, PUBLIC;

-- ── 검증 ──
SELECT 'ad_impressions/clicks anon·authenticated 쓰기 미부여' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema='public' AND table_name IN ('ad_impressions','ad_clicks')
      AND grantee IN ('anon','authenticated','PUBLIC')
      AND privilege_type IN ('INSERT','UPDATE','DELETE'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'WITH CHECK(true) INSERT 정책 제거',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename IN ('ad_impressions','ad_clicks') AND cmd='INSERT')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
