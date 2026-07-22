-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 점검 (read-only) — 보관함 SQL 4파일이 라이브에 전부 적용됐는가 (2026-07-22)
--
--   보관함 도메인은 하루 사이 파일이 4개로 늘었다(원본 + 하드닝 + 상한/순서 + 커버등급).
--   그중 일부만 Run 되면 **프론트는 새 필드를 기대하는데 RPC 는 옛 시그니처**인
--   어긋남이 생기고, 화면엔 조용히 빈 값/무블러로 나타나 발견이 늦다.
--   → 파일별 대표 효과를 하나씩 확인해 "어느 파일이 안 돌았는지"를 짚어준다.
--
--   대상 파일
--     ① phase18_playlists.sql               (원본 — 테이블·RLS·9함수)
--     ② playlist_hardening_20260722.sql     (시리즈 증발·개수 불일치·소유자·FK·권한)
--     ③ playlist_limits_reorder_20260722.sql(순서 변경 RPC·수량 상한)
--     ④ playlist_cover_age_rating_20260722.sql(커버 19금 블러용 등급 반환)
--
--   사용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run. read-only.
--   ▶ 전부 ✅ PASS 여야 정상. FAIL 이 가리키는 파일만 다시 Run 하면 된다.
-- ════════════════════════════════════════════════════════════════════════════

SELECT * FROM (

  SELECT 1 AS sort, '① 원본 — 테이블·RLS 존재' AS check_name,
    CASE WHEN (SELECT count(*) FROM pg_tables
               WHERE schemaname='public' AND tablename IN ('playlists','playlist_videos')) = 2
      AND (SELECT bool_and(rowsecurity) FROM pg_tables
           WHERE schemaname='public' AND tablename IN ('playlists','playlist_videos'))
      THEN '✅ PASS' ELSE '🔴 FAIL → phase18_playlists.sql' END AS status

  UNION ALL
  SELECT 2, '② 하드닝 — 시리즈 접힘 제거(피드뷰 미조인)',
    CASE WHEN (SELECT prosrc NOT LIKE '%JOIN public.v_available_videos%' FROM pg_proc
               WHERE proname='get_playlist_videos')
      THEN '✅ PASS' ELSE '🔴 FAIL → playlist_hardening_20260722.sql' END

  UNION ALL
  SELECT 3, '② 하드닝 — 개수·목록 기준 일치(카운트에 노출필터)',
    CASE WHEN (SELECT prosrc LIKE '%is_hidden%' FROM pg_proc WHERE proname='get_my_playlists')
      THEN '✅ PASS' ELSE '🔴 FAIL → playlist_hardening(② 또는 ④가 덮어썼는지 확인)' END

  UNION ALL
  SELECT 4, '② 하드닝 — remove_from_playlist 소유자 검증',
    CASE WHEN (SELECT prosrc LIKE '%RAISE EXCEPTION%' FROM pg_proc
               WHERE proname='remove_from_playlist')
      THEN '✅ PASS' ELSE '🔴 FAIL → playlist_hardening_20260722.sql' END

  UNION ALL
  SELECT 5, '② 하드닝 — video_id FK(ON DELETE CASCADE)',
    CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_playlist_videos_video')
      THEN '✅ PASS' ELSE '🔴 FAIL → playlist_hardening_20260722.sql ⑦' END

  UNION ALL
  SELECT 6, '③ 상한/순서 — set_playlist_order 존재',
    CASE WHEN to_regprocedure('public.set_playlist_order(uuid,text[])') IS NOT NULL
      THEN '✅ PASS' ELSE '🔴 FAIL → playlist_limits_reorder_20260722.sql' END

  UNION ALL
  SELECT 7, '③ 상한/순서 — 수량 상한(100/500)',
    CASE WHEN (SELECT prosrc LIKE '%>= 100%' FROM pg_proc WHERE proname='create_playlist')
     AND (SELECT prosrc LIKE '%>= 500%' FROM pg_proc WHERE proname='add_to_playlist')
      THEN '✅ PASS' ELSE '🔴 FAIL → playlist_limits_reorder_20260722.sql' END

  UNION ALL
  SELECT 8, '④ 커버등급 — get_my_playlists 가 preview_age_rating 반환',
    CASE WHEN (SELECT bool_or(pg_get_function_result(oid) LIKE '%preview_age_rating%')
               FROM pg_proc WHERE proname='get_my_playlists')
      THEN '✅ PASS' ELSE '🔴 FAIL → playlist_cover_age_rating_20260722.sql (19금 커버 무블러 상태)' END

  UNION ALL
  -- 9함수 전체 위생 — 하나라도 빠지면 어느 파일이 덮으면서 놓친 것이다
  SELECT 9, '전체 — 9함수 search_path 고정',
    CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public'
                 AND p.proname IN ('get_my_playlists','get_playlist_videos','create_playlist',
                                   'update_playlist','delete_playlist','add_to_playlist',
                                   'remove_from_playlist','toggle_watch_later','get_playlist_memberships')
                 AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
                             WHERE c LIKE 'search_path=%')) = 9
      THEN '✅ PASS' ELSE '🔴 FAIL → 덮어쓴 파일이 SET search_path 를 빠뜨림' END

  UNION ALL
  SELECT 10, '전체 — anon EXECUTE 차단(9+1함수)',
    CASE WHEN NOT EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.proname IN ('get_my_playlists','get_playlist_videos','create_playlist',
                          'update_playlist','delete_playlist','add_to_playlist',
                          'remove_from_playlist','toggle_watch_later','get_playlist_memberships',
                          'set_playlist_order')
        AND has_function_privilege('anon', p.oid, 'EXECUTE'))
      THEN '✅ PASS' ELSE '🔴 FAIL → 덮어쓴 파일이 REVOKE 를 빠뜨림' END

  UNION ALL
  SELECT 11, '전체 — authenticated EXECUTE 유지(9+1함수)',
    CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
               WHERE n.nspname='public'
                 AND p.proname IN ('get_my_playlists','get_playlist_videos','create_playlist',
                                   'update_playlist','delete_playlist','add_to_playlist',
                                   'remove_from_playlist','toggle_watch_later','get_playlist_memberships',
                                   'set_playlist_order')
                 AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 10
      THEN '✅ PASS' ELSE '🔴 FAIL → 어느 함수가 authenticated 에게 막혔다(기능 정지)' END

  UNION ALL
  -- 오버로드 잔존 = 클라이언트가 옛 판으로 해소돼 수정이 무력화되는 클래스(#11/#17/#34 와 동일)
  SELECT 12, '전체 — 오버로드 잔존 0건',
    CASE WHEN NOT EXISTS (
      SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public'
        AND p.proname IN ('get_my_playlists','get_playlist_videos','create_playlist',
                          'update_playlist','delete_playlist','add_to_playlist',
                          'remove_from_playlist','toggle_watch_later','get_playlist_memberships',
                          'set_playlist_order')
      GROUP BY p.proname HAVING count(*) > 1)
      THEN '✅ PASS' ELSE '🔴 FAIL → 같은 이름 함수가 2개 이상(옛 시그니처 잔존)' END

) AS gate
ORDER BY sort;
