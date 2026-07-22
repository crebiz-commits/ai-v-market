-- ════════════════════════════════════════════════════════════════════════════
-- 📚 보관함(플레이리스트) 감사 수정 — 정합성 + 권한 하드닝 (2026-07-22)
--
--   phase18_playlists.sql(2026-05-15) 이후 하드닝 후속 파일이 한 번도 없어,
--   이 도메인만 프로젝트 표준(GRANT/REVOKE·search_path)에서 통째로 빠져 있었다.
--   전수 감사 결과 확정 결함을 아래 순서로 고친다. (중복 정의는 없었음 — 정본은 phase18 하나)
--
-- ── 확정 결함 ────────────────────────────────────────────────────────────────
--   [H1] 시리즈 2화 이상이 보관함에서 영구 증발
--     get_playlist_videos 가 **피드용 뷰** v_available_videos 를 INNER JOIN 하는데,
--     그 뷰는 fix_series_feed_representative_20260712.sql:55-63 에서 "시리즈당 가장 앞
--     화 1편만" 남기도록 NOT EXISTS 필터를 건다(피드에선 의도된 접힘).
--     → 2화 이상을 담으면 저장은 되는데(쓰기엔 필터 없음) 목록에선 안 보이고,
--       행이 안 그려지니 **삭제 버튼도 없어 영구히 못 꺼낸다.**
--     ★ 원인은 뷰의 오용이다. 보관함은 피드가 아니라 "사용자가 명시적으로 담은 목록"이라
--       대표작 접힘을 적용하면 안 된다. → 뷰 대신 videos 직접 조인 + 노출가능 필터만 적용.
--       (같은 오용이 시청기록에도 있는지 확인했으나 phase17:65 는 원본 videos 조인 → 무관)
--
--   [H2] 개수·썸네일·목록이 서로 다른 기준
--     카드 개수 = playlist_videos 원시 COUNT(무필터, :84-88)
--     카드 썸네일 = 원본 videos 조인(:92)
--     실제 목록 = v_available_videos(:138)
--     → 카드는 "3개"인데 열면 2개. 숨김 영상이 1번이면 **열어도 없는 영상의 썸네일**이 커버로 남고,
--       모더레이션으로 내린 영상 썸네일이 계속 노출된다.
--     → 셋을 같은 기준(노출가능 필터)으로 통일한다.
--
--   [H3] remove_from_playlist 의 소유자 미검증 UPDATE (권한 밖 쓰기)
--     :253-259 DELETE 에는 EXISTS 소유자 검사가 있으나 바로 다음 :261
--       UPDATE public.playlists SET updated_at=now() WHERE id = p_playlist_id;
--     에는 없다. SECURITY DEFINER 라 RLS 도 우회 → 임의 playlist_id 로 타인 행 UPDATE 성공.
--     정렬이 updated_at DESC(:98)라 피해자 보관함 순서가 흔들린다. 유출은 아니나 명백한 결함이고,
--     이 UPDATE 에 컬럼이 추가되는 순간 즉시 심각한 IDOR 로 승격된다.
--     → 소유자 조건 추가 + 형제 함수(update/delete/add)와 같이 비소유자면 RAISE.
--       (기존엔 0행 삭제도 조용한 no-op → 프론트가 "제거됨" 거짓 토스트를 띄웠다)
--
--   [H4] 9개 SECURITY DEFINER 함수 전부 GRANT/REVOKE 0건 · SET search_path 0건
--     실측: grep -c 결과 GRANT|REVOKE=0, search_path=0, SECURITY DEFINER=9.
--     다른 파일의 보정도 없음(전수 확인). 게이트 #9 WARN 대상이며 최근 736001d 가
--     시청기록 2종을 정리한 그 부채다. → 9개 전부 표준 적용.
--
--   [H5] playlist_videos.video_id 에 FK 없음 → 영상 삭제 시 고아 행 영구 잔존
--     videos 를 참조하는 다른 테이블 6개는 전부 REFERENCES ... ON DELETE CASCADE 인데
--     여기만 예외(:34). 관리자 하드삭제 경로에도 정리 로직이 없다
--     (admin_content_delete_guard_20260715.sql:39 은 videos DELETE 뿐).
--     → 기존 고아 정리 후 FK 부여. videos.id 는 TEXT 라 타입 호환 확인됨.
--
--   [H6] toggle_watch_later lazy-create 경쟁 조건
--     SELECT→IF NULL→INSERT 사이 잠금이 없어 동시 2건이면 uq_playlists_watch_later_per_user
--     (:25-26) 위반으로 raw Postgres 오류가 사용자에게 그대로 노출.
--     → ON CONFLICT DO NOTHING + 재조회로 정리.
--
--   ▣ 표시 이름: 뷰가 p.display_name 만 쓰던 것을 resolve_display_name(2026-07-22 SSOT)으로
--     교체 — 소셜 로그인 크리에이터가 보관함에서 이름 없이 보이던 것도 함께 해소.
--
--   ⛔ 2026-07-22 갱신 — 이 파일도 이제 **재실행하면 중간에 깨진다.**
--     커버 연령게이트(playlist_cover_age_rating_20260722.sql)가 get_my_playlists 를
--     9컬럼으로 늘렸는데(preview_age_rating), 아래 §2 는 8컬럼 CREATE OR REPLACE 라
--     `cannot change return type of existing function` 으로 **§2 에서 중단**된다.
--     그러면 §5(search_path 3함수)·§6(전체 GRANT)·§7(고아정리·FK)가 미적용으로 남는다.
--     → 재적용이 필요하면 cover_age_rating(9컬럼, DROP 선행)을 마지막에 한 번 더 돌릴 것.
--     ▣ 이 파일 이후 이관된 함수:
--        get_my_playlists → playlist_cover_age_rating_20260722.sql (필터·tiebreak 보존 확인됨)
--        add_to_playlist  → playlist_limits_reorder → playlist_audit2_20260722.sql
--        update/delete/get_playlist_memberships → playlist_audit2_20260722.sql (SET 절 인라인 승격)
--        ※ 아래 "나머지 5함수는 phase18 이 그대로 정본"은 작성 시점 기준이며 지금은 위가 맞다.
--
--   ★ 이 파일이 위 4함수의 새 정본. phase18_playlists.sql 의 **해당 함수** 재실행 금지
--     (시리즈 증발·개수 불일치·소유자 미검증 UPDATE 로 회귀). 나머지 5함수와 테이블·RLS
--     정의는 phase18 이 그대로 정본이며 여기서는 search_path·GRANT 만 얹는다.
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) get_playlist_videos — 시리즈 접힘 제거, 노출가능 필터만 적용 ───────────
CREATE OR REPLACE FUNCTION public.get_playlist_videos(
  p_playlist_id uuid
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id uuid, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  pl_position INTEGER, added_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  -- 소유자 검증 (RLS는 SELECT만 — 함수 안에선 직접 체크)
  IF NOT EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = p_playlist_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION '플레이리스트에 접근할 권한이 없습니다';
  END IF;

  RETURN QUERY
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id,
    public.resolve_display_name(v.creator_id),   -- 표시이름 SSOT(소셜 가입자 대응)
    pr.avatar_url,
    v.category, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    pv.position, pv.added_at
  FROM public.playlist_videos pv
  -- ★ v_available_videos(피드 뷰) 대신 videos 직접 조인 — 시리즈 대표작 접힘을 적용하지 않는다.
  JOIN public.videos v ON v.id = pv.video_id
  LEFT JOIN public.profiles pr ON pr.id = v.creator_id
  WHERE pv.playlist_id = p_playlist_id
    -- 노출가능 조건만 뷰와 동일하게 유지(숨김·비공개는 계속 제외)
    AND COALESCE(v.visibility, 'public') = 'public'
    AND COALESCE(v.is_hidden, false) = false
  ORDER BY pv.position ASC, pv.added_at ASC, pv.id ASC;   -- id = 결정적 tiebreak
END;
$$;

-- ── 2) get_my_playlists — 개수·썸네일을 목록과 같은 기준으로 ──────────────────
CREATE OR REPLACE FUNCTION public.get_my_playlists()
RETURNS TABLE (
  id              uuid,
  name            TEXT,
  description     TEXT,
  is_watch_later  BOOLEAN,
  created_at      timestamptz,
  updated_at      timestamptz,
  video_count     BIGINT,
  preview_thumbnail TEXT
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
    pv_first.thumbnail AS preview_thumbnail
  FROM public.playlists p
  -- ★ 개수: 목록(RPC 2)과 **동일한 노출가능 필터**. 예전엔 원시 COUNT 라 카드 숫자가 실제와 달랐다.
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM public.playlist_videos pv
    JOIN public.videos v ON v.id = pv.video_id
    WHERE pv.playlist_id = p.id
      AND COALESCE(v.visibility, 'public') = 'public'
      AND COALESCE(v.is_hidden, false) = false
  ) vc ON true
  -- ★ 커버 썸네일: 같은 필터. 예전엔 원본 videos 라 "열어도 없는 영상"의 썸네일이 남았다.
  LEFT JOIN LATERAL (
    SELECT v.thumbnail
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

-- ── 3) remove_from_playlist — 소유자 검증 + 비소유자 RAISE ────────────────────
CREATE OR REPLACE FUNCTION public.remove_from_playlist(
  p_playlist_id uuid,
  p_video_id    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- ★ 선행 소유자 검증 — 형제 함수(update/delete/add_to_playlist)와 동일 규약.
  --   예전엔 DELETE 안 EXISTS 로만 막고 그 뒤 UPDATE 는 무방비였다(타인 행 갱신 가능).
  IF NOT EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = p_playlist_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION '플레이리스트에 접근할 권한이 없습니다';
  END IF;

  DELETE FROM public.playlist_videos
  WHERE playlist_id = p_playlist_id
    AND video_id = p_video_id;

  -- 소유자 조건 재확인(방어) — 위 게이트를 통과했으므로 사실상 항상 참
  UPDATE public.playlists
  SET updated_at = now()
  WHERE id = p_playlist_id AND user_id = auth.uid();
END;
$$;

-- ── 4) toggle_watch_later — lazy-create 경쟁 조건 제거 ───────────────────────
CREATE OR REPLACE FUNCTION public.toggle_watch_later(
  p_video_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pl_id uuid;
  v_exists BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- ★ lazy create 경쟁 조건 제거: 동시 2건이 둘 다 NULL 을 보고 INSERT → 부분 UNIQUE 인덱스
  --   위반으로 raw 오류가 사용자에게 노출되던 것. ON CONFLICT 로 흡수 후 재조회.
  INSERT INTO public.playlists (user_id, name, is_watch_later)
  VALUES (v_user, '나중에 보기', true)
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_pl_id
  FROM public.playlists
  WHERE user_id = v_user AND is_watch_later = true;

  SELECT EXISTS (
    SELECT 1 FROM public.playlist_videos
    WHERE playlist_id = v_pl_id AND video_id = p_video_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.playlist_videos
    WHERE playlist_id = v_pl_id AND video_id = p_video_id;
    UPDATE public.playlists SET updated_at = now() WHERE id = v_pl_id;
    RETURN false;
  ELSE
    PERFORM public.add_to_playlist(v_pl_id, p_video_id);
    RETURN true;
  END IF;
END;
$$;

-- ── 5) 나머지 5함수 search_path 고정 (본문 미변경 → ALTER 로 최소 개입) ───────
ALTER FUNCTION public.create_playlist(TEXT, TEXT)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.update_playlist(uuid, TEXT, TEXT)           SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_playlist(uuid)                       SET search_path = public, pg_temp;
ALTER FUNCTION public.add_to_playlist(uuid, TEXT)                 SET search_path = public, pg_temp;
ALTER FUNCTION public.get_playlist_memberships(TEXT)              SET search_path = public, pg_temp;

-- ── 6) 권한 표준 적용 — anon 은 호출 자체 불가, 내부 auth.uid() 검증이 SSOT ───
REVOKE ALL ON FUNCTION public.get_my_playlists()                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_playlist_videos(uuid)           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_playlist(TEXT, TEXT)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_playlist(uuid, TEXT, TEXT)   FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_playlist(uuid)               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_to_playlist(uuid, TEXT)         FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_from_playlist(uuid, TEXT)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.toggle_watch_later(TEXT)            FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_playlist_memberships(TEXT)      FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_playlists()               TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_playlist_videos(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_playlist(TEXT, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_playlist(uuid, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_playlist(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_to_playlist(uuid, TEXT)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_from_playlist(uuid, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_watch_later(TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_playlist_memberships(TEXT)   TO authenticated;

-- ── 7) 고아 행 정리 → FK 부여 (순서 중요: 고아가 있으면 FK 생성이 실패한다) ───
--   삭제되는 행 = 이미 존재하지 않는 영상을 가리키던 항목. 화면에 뜬 적도, 지울 수도 없던 죽은 행.
--   몇 건이 지워졌는지는 맨 아래 검증 결과에 함께 표시된다.
--   (ON COMMIT DROP 은 쓰지 않는다 — SQL Editor 가 문장 단위로 커밋하면 맨 아래 검증 SELECT 가
--    읽기 전에 사라진다. 세션 임시테이블로 두고 재실행 대비 DROP IF EXISTS 를 앞에 건다.)
DROP TABLE IF EXISTS _pl_cleanup;
CREATE TEMP TABLE _pl_cleanup AS
WITH del AS (
  DELETE FROM public.playlist_videos pv
  WHERE NOT EXISTS (SELECT 1 FROM public.videos v WHERE v.id = pv.video_id)
  RETURNING 1
)
SELECT count(*)::INT AS orphans_deleted FROM del;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_playlist_videos_video'
  ) THEN
    ALTER TABLE public.playlist_videos
      ADD CONSTRAINT fk_playlist_videos_video
      FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '① 고아 행 정리 건수' AS check_name,
  (SELECT orphans_deleted::TEXT FROM _pl_cleanup) AS status
UNION ALL
SELECT '② video_id FK(ON DELETE CASCADE) 생성',
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_playlist_videos_video')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
-- ⚠️ 이 검사는 "JOIN 구문"만 봐야 한다. 단순히 prosrc 에 v_available_videos 문자열이 있는지
--    보면 **본문 주석에 그 단어가 있다는 이유로 거짓 FAIL** 이 난다(2026-07-22 실제 발생).
--    정의만 보는 검증의 함정과 같은 계열 — 문자열 존재 ≠ 실제 사용.
SELECT '③ 시리즈 접힘 제거(피드뷰 조인 없음)',
  CASE WHEN (SELECT prosrc NOT LIKE '%JOIN public.v_available_videos%' FROM pg_proc
             WHERE proname = 'get_playlist_videos')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '③-2 videos 직접 조인으로 교체됨',
  CASE WHEN (SELECT prosrc LIKE '%JOIN public.videos v ON v.id = pv.video_id%' FROM pg_proc
             WHERE proname = 'get_playlist_videos')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '④ 개수·목록 기준 일치(카운트에 노출필터)',
  CASE WHEN (SELECT prosrc LIKE '%is_hidden%' FROM pg_proc WHERE proname = 'get_my_playlists')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑤ remove_from_playlist 소유자 검증',
  CASE WHEN (SELECT prosrc LIKE '%RAISE EXCEPTION%' FROM pg_proc
             WHERE proname = 'remove_from_playlist')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑥ 9함수 search_path 고정',
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname IN ('get_my_playlists','get_playlist_videos','create_playlist',
                                 'update_playlist','delete_playlist','add_to_playlist',
                                 'remove_from_playlist','toggle_watch_later','get_playlist_memberships')
               AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
                           WHERE c LIKE 'search_path=%')) = 9
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑦ anon EXECUTE 차단(9함수)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('get_my_playlists','get_playlist_videos','create_playlist',
                        'update_playlist','delete_playlist','add_to_playlist',
                        'remove_from_playlist','toggle_watch_later','get_playlist_memberships')
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑧ authenticated EXECUTE 유지(9함수)',
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname IN ('get_my_playlists','get_playlist_videos','create_playlist',
                                 'update_playlist','delete_playlist','add_to_playlist',
                                 'remove_from_playlist','toggle_watch_later','get_playlist_memberships')
               AND has_function_privilege('authenticated', p.oid, 'EXECUTE')) = 9
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
