-- ════════════════════════════════════════════════════════════════════════════
-- 🔎 크리에이터 검색 페이지네이션 (2026-07-19) — 2단계
--
--   search_creators 가 p_limit 만 받고 p_offset 이 없어 프론트가 상위 20명에서 멈춰 있었음
--   (21번째부터 도달 불가). p_offset 추가로 '더 보기' 지원.
--
--   ⚠️ phase12_search_enhancements.sql 는 재실행 금지(검색 RPC 회귀) — 이 파일은 그 중
--      search_creators **하나만** 새로 정의한다. ★ search_creators 새 정본.
--
--   함께 바로잡는 것(둘 다 페이지네이션의 전제):
--   · 정렬 tiebreaker 부재 → follower_count/video_count 동률(특히 둘 다 0인 신규 크리에이터가
--     다수)일 때 페이지마다 순서가 흔들려 중복/누락 발생. p.id 추가로 결정적 정렬.
--   · LIKE 이스케이프 부재 → 검색어의 % _ \ 가 와일드카드로 해석됨("100%" 검색 시 오작동).
--     search_videos 정본(search_feed_audit_20260710)의 v_esc 방식과 동일하게 맞춤.
--     LANGUAGE sql 이라 변수를 못 쓰므로 CTE(q)에서 이스케이프한 값을 계산.
--
--   유지(변경 없음): SECURITY DEFINER, 정지 크리에이터 제외, 반환 6컬럼, 팔로워순 정렬.
--     · creator_followers SELECT RLS 는 '본인 팔로잉만'으로 좁혀져 있으나(channel_feed_audit_20260709)
--       이 함수는 DEFINER 라 집계 COUNT 가 정상 동작 — 그대로 둔다.
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 인자 추가 = 시그니처 변경. 구 2-arg 와 공존하면 기본값 호출이 모호해지므로 DROP 후 재생성.
DROP FUNCTION IF EXISTS public.search_creators(TEXT, INTEGER);
CREATE OR REPLACE FUNCTION public.search_creators(
  p_query  TEXT,
  p_limit  INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  creator_id      UUID,
  display_name    TEXT,
  avatar_url      TEXT,
  bio             TEXT,
  video_count     BIGINT,
  follower_count  BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  WITH q AS (
    SELECT
      lower(btrim(COALESCE(p_query, ''))) AS lq,
      -- LIKE 특수문자 이스케이프 (search_videos v_esc 와 동일 순서: \ 먼저)
      replace(replace(replace(
        lower(btrim(COALESCE(p_query, ''))), '\', '\\'), '%', '\%'), '_', '\_') AS esc
  )
  SELECT
    p.id AS creator_id,
    p.display_name,
    p.avatar_url,
    p.bio,
    COALESCE((SELECT COUNT(*) FROM public.v_available_videos v WHERE v.creator_id = p.id), 0) AS video_count,
    COALESCE((SELECT COUNT(*) FROM public.creator_followers cf WHERE cf.creator_id = p.id), 0) AS follower_count
  FROM public.profiles p, q
  WHERE q.lq <> ''
    AND lower(COALESCE(p.display_name, '')) LIKE '%' || q.esc || '%'
    AND COALESCE(p.is_suspended, false) = false
  ORDER BY follower_count DESC, video_count DESC, p.id   -- tiebreaker: 안정 페이지네이션
  LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

COMMENT ON FUNCTION public.search_creators IS
  '크리에이터 검색. display_name ilike 매칭(LIKE 이스케이프). 팔로워 많은 순 + id tiebreaker, offset 페이지네이션';

REVOKE ALL ON FUNCTION public.search_creators(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_creators(TEXT, INTEGER, INTEGER) TO anon, authenticated;

COMMIT;

-- ── 검증 (선택) ──
SELECT 'search_creators 페이지네이션(3-arg)' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='search_creators' AND pronargs=3)
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '구 2-arg search_creators 제거(오버로드 모호성 방지)',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='search_creators' AND pronargs=2)
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'tiebreaker(p.id) 적용',
  CASE WHEN (SELECT bool_or(prosrc ~ 'p\.id') FROM pg_proc WHERE proname='search_creators')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '검색은 비로그인도 가능(anon EXECUTE 유지)',
  CASE WHEN has_function_privilege('anon',
    'public.search_creators(text,integer,integer)', 'EXECUTE') THEN '✅ PASS' ELSE '🔴 FAIL' END;
