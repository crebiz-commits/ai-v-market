-- ════════════════════════════════════════════════════════════════════════════
-- 🔞 보관함 커버 썸네일 연령 게이트 (2026-07-22) — get_my_playlists 에 등급 반환 추가
--
--   [결함] 보관함 그리드의 커버 썸네일(플레이리스트 첫 영상)이 19금이어도 무블러였다.
--     기록·구매·보관함 상세 목록은 useAgeRatings(video id → 등급) 로 막았는데,
--     커버만 **영상 id 를 안 받아** 클라이언트가 등급을 조회할 방법이 없었다
--     (RPC 가 preview_thumbnail 만 반환). 등급 미조회 → shouldBlur fail-open(무블러).
--
--     "담아둔 영상이니 봐도 된다"는 성립하지 않는다 — 담은 뒤 크리에이터 수정
--     (VideoEditModal)·관리자 검수로 19금 재등급이 가능하다.
--
--   [조치] preview_age_rating 컬럼 추가. 커버 썸네일을 고르는 **바로 그 LATERAL** 에서
--     같이 꺼내므로 추가 조회·왕복이 없고, 썸네일과 등급이 항상 같은 영상을 가리킨다
--     (별도 조회였다면 그 사이 목록이 바뀌어 등급/썸네일이 어긋날 수 있다).
--
--   ★ 이 파일이 get_my_playlists 의 새 정본.
--     playlist_hardening_20260722.sql 의 ②(get_my_playlists) 재실행 금지
--     — 컬럼이 사라지면 프론트가 undefined 를 받아 **조용히 무블러로 복귀**한다(fail-open).
--     그 파일의 나머지 함수(get_playlist_videos·remove_from_playlist·toggle_watch_later)는
--     이 파일이 건드리지 않으므로 그대로 유효하다.
--
--   ▣ 반환 시그니처가 바뀌므로 CREATE OR REPLACE 불가 → DROP 후 재생성.
--     hardening 판의 본문(노출가능 필터로 개수·썸네일·목록 기준 통일, 결정적 tiebreak,
--     search_path 고정)은 100% 보존하고 컬럼만 덧붙였다.
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.get_my_playlists();

CREATE FUNCTION public.get_my_playlists()
RETURNS TABLE (
  id                uuid,
  name              TEXT,
  description       TEXT,
  is_watch_later    BOOLEAN,
  created_at        timestamptz,
  updated_at        timestamptz,
  video_count       BIGINT,
  preview_thumbnail TEXT,
  preview_age_rating TEXT        -- ★ 추가(2026-07-22): 커버 블러 판정용
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    p.id, p.name, p.description, p.is_watch_later,
    p.created_at, p.updated_at,
    COALESCE(vc.cnt, 0)::BIGINT AS video_count,
    pv_first.thumbnail  AS preview_thumbnail,
    pv_first.age_rating AS preview_age_rating
  FROM public.playlists p
  -- 개수: 목록(get_playlist_videos)과 동일한 노출가능 필터 (hardening 판 유지)
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM public.playlist_videos pv
    JOIN public.videos v ON v.id = pv.video_id
    WHERE pv.playlist_id = p.id
      AND COALESCE(v.visibility, 'public') = 'public'
      AND COALESCE(v.is_hidden, false) = false
  ) vc ON true
  -- 커버: 같은 필터 + 등급을 함께 반환(썸네일과 항상 같은 영상)
  LEFT JOIN LATERAL (
    SELECT v.thumbnail, COALESCE(v.age_rating, 'all') AS age_rating
    FROM public.playlist_videos pv
    JOIN public.videos v ON v.id = pv.video_id
    WHERE pv.playlist_id = p.id
      AND COALESCE(v.visibility, 'public') = 'public'
      AND COALESCE(v.is_hidden, false) = false
    ORDER BY pv.position ASC, pv.added_at ASC, pv.id ASC
    LIMIT 1
  ) pv_first ON true
  WHERE p.user_id = auth.uid()
  ORDER BY p.is_watch_later DESC, p.updated_at DESC, p.id DESC;
$$;

COMMENT ON FUNCTION public.get_my_playlists IS
  '내 플레이리스트 목록. 개수·커버를 목록과 동일한 노출가능 필터로 산출하고, '
  '커버 영상의 age_rating 을 함께 반환(19금 커버 블러 판정용). 2026-07-22';

REVOKE ALL ON FUNCTION public.get_my_playlists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_playlists() TO authenticated;

COMMIT;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '커버 등급 컬럼 반환(preview_age_rating)' AS check_name,
  CASE WHEN (SELECT bool_or(pg_get_function_result(oid) LIKE '%preview_age_rating%')
             FROM pg_proc WHERE proname = 'get_my_playlists')
    THEN '✅ PASS' ELSE '🔴 FAIL — 커버 19금 무블러(fail-open)' END AS status
UNION ALL
SELECT 'hardening 판 노출가능 필터 보존(is_hidden)',
  CASE WHEN (SELECT prosrc ~ 'is_hidden' FROM pg_proc WHERE proname = 'get_my_playlists')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'anon EXECUTE 차단',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_my_playlists'
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
