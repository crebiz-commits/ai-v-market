-- ════════════════════════════════════════════════════════════════════════════
-- 🔎 videos 직접 UPDATE 우회 실측 (read-only, 2026-07-11)
--
--   목적: 앱은 안전한 RPC(update_my_video_metadata 등)로만 videos 를 수정하지만,
--         authenticated 롤이 테이블에 직접 UPDATE 권한을 가지고 있고 UPDATE RLS 가
--         "본인 행"을 허용하면, 클라가 PostgREST 로
--           UPDATE videos SET is_hidden=false, moderation_status='passed',
--                             show_on_ott=true WHERE id=<본인영상>
--         를 직접 실행해 (a) 검수 없이 self-approve, (b) 짧은 영상에 OTT 티어 위조
--         (광고배분 60% 강탈) 가 가능하다. 편집 재검수 게이트/티어 트리거는 각각
--         UPDATE-우회/INSERT-only 라 이 경로를 못 막는다.
--
--   사용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run.
--         맨 아래 verdict 행이 🔴 이면 방어(컬럼 REVOKE 또는 BEFORE UPDATE 가드)가 필요.
--   (아무 것도 변경하지 않는 진단 쿼리 3개.)
-- ════════════════════════════════════════════════════════════════════════════

-- ① videos 의 UPDATE / ALL RLS 정책 (qual = 대상행 조건, with_check = 저장 허용 조건)
SELECT '① UPDATE 정책' AS section, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'videos' AND cmd IN ('UPDATE', 'ALL')
ORDER BY policyname;

-- ② anon/authenticated 의 videos 직접 UPDATE 권한 (테이블 단위 + 민감 컬럼 단위)
SELECT '② UPDATE 권한' AS section,
       g.grantee,
       COALESCE(c.column_name, '(테이블 전체)') AS target,
       g.privilege_type
FROM information_schema.role_table_grants g
LEFT JOIN information_schema.role_column_grants c
  ON c.table_schema = g.table_schema AND c.table_name = g.table_name
 AND c.grantee = g.grantee AND c.privilege_type = g.privilege_type
 AND c.column_name IN ('is_hidden','moderation_status','moderation_score',
                       'show_on_ott','show_on_cinema','creator_id',
                       'price_standard','price_commercial','price_exclusive','duration_seconds')
WHERE g.table_schema = 'public' AND g.table_name = 'videos'
  AND g.privilege_type = 'UPDATE'
  AND g.grantee IN ('anon','authenticated','PUBLIC')
ORDER BY g.grantee;

-- ③ 종합 판정 — 직접 UPDATE 권한 존재 여부
SELECT '③ 판정' AS section,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.role_table_grants
      WHERE table_schema='public' AND table_name='videos'
        AND privilege_type='UPDATE' AND grantee IN ('anon','authenticated','PUBLIC')
    )
    THEN '🔴 REVIEW: authenticated/anon 이 videos 테이블을 직접 UPDATE 가능. '
      || '①의 UPDATE 정책 with_check 가 is_hidden/moderation_status/show_on_ott 변경을 '
      || '막지 못하면 self-approve·티어위조 가능 → 컬럼 REVOKE 또는 BEFORE UPDATE 가드 필요.'
    ELSE '✅ SAFE: authenticated/anon 에 videos 직접 UPDATE 권한 없음 (RPC 전용) → 우회 불가.'
  END AS verdict;

-- ════════════════════════════════════════════════════════════════════════════
-- 해석:
--   ③ = ✅ SAFE  → 조치 불필요(직접 UPDATE 자체가 막힘).
--   ③ = 🔴 REVIEW → ①의 with_check 를 확인. 본인행 UPDATE 를 허용하면서 민감컬럼
--                   변경을 못 막으면(대부분의 기본 정책) 실제 취약. 방어책:
--                   (A) REVOKE UPDATE (is_hidden,moderation_status,moderation_score,
--                       show_on_ott,show_on_cinema,creator_id,price_*,duration_seconds)
--                       ON public.videos FROM anon, authenticated;  (앱은 RPC라 무영향)
--                   (B) 또는 BEFORE UPDATE 트리거로 비-service_role 의 민감컬럼 변경을 되돌림.
--   결과(①②③)를 알려주시면 필요한 방어 SQL 을 정확히 만들어 드립니다.
-- ════════════════════════════════════════════════════════════════════════════
