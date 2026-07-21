-- ════════════════════════════════════════════════════════════════════════════
-- 📚 보관함 저위험 잔여 — 순서 변경 + 개수/길이 상한 (2026-07-22)
--
--   playlist_hardening_20260722.sql 로 정합성·권한을 고친 뒤 남겨둔 저위험 항목 3건 중
--   DB 쪽 2건을 처리한다(모달 포커스 트랩은 프론트 전용).
--
--   [L1] 순서 변경이 DB 계층에 미구현
--     playlist_videos.position 컬럼과 인덱스는 있으나 append-only 로만 쓰였고
--     재배열 RPC 가 없었다. 항목을 지우면 번호에 빈칸이 남고(재압축 없음),
--     사용자가 담은 순서를 바꿀 방법이 아예 없었다.
--     → set_playlist_order(playlist_id, video_ids[]) 신설.
--       "전달된 배열 순서대로 1..N 재부여" 방식이라 위/아래 버튼과 향후 드래그앤드롭이
--       같은 RPC 를 쓴다. 빈칸·중복 position 도 호출 한 번으로 정규화된다.
--     ▣ 화면에 안 뜬 항목(숨김·비공개로 필터된 것)은 배열에 없다. 이들을 그냥 두면
--       새로 부여한 1..N 과 번호가 겹치므로, 먼저 뒤쪽 고정 구간(1000000+)으로 밀어둔다.
--       "기존 position 에 +N" 방식이 아니라 고정 구간이라 반복 호출해도 값이 커지지 않는다.
--
--   [L2] 상한 부재 — create_playlist 는 빈 이름만 막고 길이·개수 제한이 없었고,
--     add_to_playlist 도 항목 수 제한이 없었다. add_to_playlist 는 영상 존재 검증도
--     없었으나 그건 hardening 파일의 FK(video_id → videos ON DELETE CASCADE)가
--     이미 막는다(존재하지 않는 id INSERT 시 FK 위반). 여기서는 수량·길이만 건다.
--     → 사용자당 플레이리스트 100개 / 플레이리스트당 항목 500개 / 이름 60자.
--       (60자는 클라이언트 maxLength=60 과 일치시킨 값)
--
--   ★ 이 파일이 create_playlist / add_to_playlist 의 새 정본.
--     phase18_playlists.sql 의 이 두 함수 재실행 금지(상한이 사라진다).
--     본문은 phase18 원본 + 상한 검사만 추가했고 나머지 로직은 그대로다.
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) create_playlist — 이름 길이 + 사용자당 개수 상한 ──────────────────────
CREATE OR REPLACE FUNCTION public.create_playlist(
  p_name        TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION '플레이리스트 이름을 입력해주세요';
  END IF;
  -- ★ 상한 추가(2026-07-22): 클라이언트 maxLength=60 과 동일 기준을 서버에도 건다.
  IF length(trim(p_name)) > 60 THEN
    RAISE EXCEPTION '플레이리스트 이름은 60자 이하여야 합니다';
  END IF;

  SELECT count(*) INTO v_count FROM public.playlists WHERE user_id = v_user;
  IF v_count >= 100 THEN
    RAISE EXCEPTION '플레이리스트는 최대 100개까지 만들 수 있습니다';
  END IF;

  INSERT INTO public.playlists (user_id, name, description)
  VALUES (v_user, trim(p_name), p_description)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── 2) add_to_playlist — 플레이리스트당 항목 상한 ────────────────────────────
CREATE OR REPLACE FUNCTION public.add_to_playlist(
  p_playlist_id uuid,
  p_video_id    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_pos INTEGER;
  v_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = p_playlist_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION '플레이리스트에 접근할 권한이 없습니다';
  END IF;

  -- ★ 상한 추가(2026-07-22). 이미 담긴 영상을 다시 담는 경우(ON CONFLICT DO NOTHING)는
  --   개수가 늘지 않으므로 상한에 걸리지 않게 EXISTS 로 먼저 걸러낸다.
  IF NOT EXISTS (
    SELECT 1 FROM public.playlist_videos
    WHERE playlist_id = p_playlist_id AND video_id = p_video_id
  ) THEN
    SELECT count(*) INTO v_count FROM public.playlist_videos WHERE playlist_id = p_playlist_id;
    IF v_count >= 500 THEN
      RAISE EXCEPTION '플레이리스트당 영상은 최대 500개까지 담을 수 있습니다';
    END IF;
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_pos
  FROM public.playlist_videos
  WHERE playlist_id = p_playlist_id;

  INSERT INTO public.playlist_videos (playlist_id, video_id, position)
  VALUES (p_playlist_id, p_video_id, v_next_pos)
  ON CONFLICT (playlist_id, video_id) DO NOTHING;

  UPDATE public.playlists SET updated_at = now() WHERE id = p_playlist_id;
END;
$$;

-- ── 3) set_playlist_order — 순서 재배열(신설) ────────────────────────────────
--   전달된 배열 순서대로 position 을 1..N 으로 재부여한다.
--   위/아래 버튼도, 향후 드래그앤드롭도 "정렬된 id 배열"만 보내면 되므로 UI 방식과 무관하다.
CREATE OR REPLACE FUNCTION public.set_playlist_order(
  p_playlist_id uuid,
  p_video_ids   TEXT[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = p_playlist_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION '플레이리스트에 접근할 권한이 없습니다';
  END IF;

  IF p_video_ids IS NULL OR array_length(p_video_ids, 1) IS NULL THEN
    RETURN;   -- 빈 배열이면 할 일 없음(에러 아님)
  END IF;
  IF array_length(p_video_ids, 1) > 500 THEN
    RAISE EXCEPTION '한 번에 정렬할 수 있는 항목은 500개까지입니다';
  END IF;

  -- ① 배열에 없는 항목(숨김 등으로 화면에 안 뜬 것)을 뒤쪽 고정 구간으로 이동.
  --   먼저 밀어두지 않으면 아래 1..N 과 번호가 겹친다. 고정 구간이라 반복 호출해도 값이 안 커진다.
  WITH rest AS (
    SELECT pv.id, row_number() OVER (ORDER BY pv.position, pv.added_at, pv.id) AS rn
    FROM public.playlist_videos pv
    WHERE pv.playlist_id = p_playlist_id
      AND NOT (pv.video_id = ANY(p_video_ids))
  )
  UPDATE public.playlist_videos pv
  SET position = 1000000 + rest.rn::INTEGER
  FROM rest
  WHERE rest.id = pv.id;

  -- ② 전달된 순서대로 1..N
  UPDATE public.playlist_videos pv
  SET position = o.ord::INTEGER
  FROM unnest(p_video_ids) WITH ORDINALITY AS o(vid, ord)
  WHERE pv.playlist_id = p_playlist_id
    AND pv.video_id = o.vid;

  UPDATE public.playlists
  SET updated_at = now()
  WHERE id = p_playlist_id AND user_id = auth.uid();
END;
$$;

-- ── 권한 표준 ────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.create_playlist(TEXT, TEXT)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_to_playlist(uuid, TEXT)          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_playlist_order(uuid, TEXT[])     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_playlist(TEXT, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_to_playlist(uuid, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_playlist_order(uuid, TEXT[])  TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '① 순서 변경 RPC 생성' AS check_name,
  CASE WHEN to_regprocedure('public.set_playlist_order(uuid,text[])') IS NOT NULL
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '② 플레이리스트 개수 상한(100)',
  CASE WHEN (SELECT prosrc LIKE '%>= 100%' FROM pg_proc WHERE proname = 'create_playlist')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '③ 이름 길이 상한(60)',
  CASE WHEN (SELECT prosrc LIKE '%> 60%' FROM pg_proc WHERE proname = 'create_playlist')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '④ 항목 수 상한(500)',
  CASE WHEN (SELECT prosrc LIKE '%>= 500%' FROM pg_proc WHERE proname = 'add_to_playlist')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑤ 소유자 검증 3함수 유지',
  CASE WHEN (SELECT bool_and(prosrc LIKE '%auth.uid()%') FROM pg_proc
             WHERE proname IN ('create_playlist','add_to_playlist','set_playlist_order'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑥ search_path 고정 3함수',
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname IN ('create_playlist','add_to_playlist','set_playlist_order')
               AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
                           WHERE c LIKE 'search_path=%')) = 3
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑦ anon EXECUTE 차단',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_playlist','add_to_playlist','set_playlist_order')
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
