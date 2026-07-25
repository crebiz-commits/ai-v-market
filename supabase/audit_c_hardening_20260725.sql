-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ C 심층감사 하드닝 (2026-07-25) — 값싸고 안전한 예방 2건
--
--   ① videos.tags GIN 인덱스 (성능/스케일)
--      챌린지 참여작 수(Community/CommunityChallengeDetail/AdminChallenges)가
--      `videos.tags @> ARRAY[…]`(.contains) 로 조회되는데 인덱스가 없어 영상 수천 편부터
--      매번 seq scan(챌린지당 1회 → 커뮤니티 로드마다 수십 회). GIN 인덱스로 근본 완화.
--      → 추가만 하는 안전한 변경(기존 쿼리 결과 불변, 옵티마이저가 알아서 사용).
--
--   ② confirm_payment SET search_path (보안 DEFINER 하드닝)
--      phase29_license_type_unify.sql 의 최신 정의에 SET search_path 가 없다. EXECUTE 는
--      service_role 로 잠겨(anon/authenticated 미노출) 실위험은 낮으나, 코드베이스는 모든
--      SECURITY DEFINER 함수에 search_path 고정을 표준으로 삼는다(게이트 #9 계열). 정합화.
--      → 함수 본문 불변, ALTER 로 속성만 고정(멱등, 존재할 때만).
--
-- 적용: Supabase SQL Editor → Run (멱등). 게이트 #60(confirm_payment search_path) 감시.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① videos.tags GIN 인덱스 ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_videos_tags_gin ON public.videos USING gin (tags);

-- ── ② confirm_payment search_path 고정 (존재할 때만, 멱등) ────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.confirm_payment(text,text,text,timestamptz,jsonb)') IS NOT NULL THEN
    ALTER FUNCTION public.confirm_payment(text,text,text,timestamptz,jsonb) SET search_path = public;
  END IF;
END $$;

-- ── 검증 ──
SELECT 'videos.tags GIN 인덱스' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='idx_videos_tags_gin')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'confirm_payment search_path 고정',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.oid = to_regprocedure('public.confirm_payment(text,text,text,timestamptz,jsonb)')
      AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  ) THEN '✅ PASS' ELSE '🔴 FAIL' END;
