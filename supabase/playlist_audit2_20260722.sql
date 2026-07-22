-- ════════════════════════════════════════════════════════════════════════════
-- 📚 보관함 2차 감사 수정 (2026-07-22)
--
--   1차(playlist_hardening/limits_reorder)와 병렬 세션의 커버 연령게이트 이후,
--   **경계를 넘는 연결**과 **정본 위생**을 다시 훑어 나온 확정 결함을 고친다.
--
-- ── 확정 결함 ────────────────────────────────────────────────────────────────
--   [M1] 데이터 내보내기가 플레이리스트 "내용물"을 통째로 빠뜨림
--     phase27_user_data_rights.sql 의 export_my_data 는 `'playlists'` 로 playlists
--     테이블만 내보낸다(이름·설명·is_watch_later…). **playlist_videos 는 전체 함수에
--     0회 등장** — 즉 어떤 영상을 담았는지, 어떤 순서로 정렬했는지가 하나도 안 나간다.
--     같은 함수의 형제 섹션(video_likes·watch_history·orders)은 전부 자식 행을 내보내므로
--     컬렉션인데 내용을 안 주는 건 playlists 뿐이다.
--     ▣ PRD(docs/prd/01-auth-onboarding.md:141)는 "플레이리스트…를 단일 JSONB로 반환"이라
--       명시 → 문서와 구현 불일치. 사용자는 "포함됐다"를 믿고 백업한 뒤 계정을 파기한다.
--     ▣ position 은 set_playlist_order 로 **사용자가 직접 만든 값**이라 재생성 불가능한
--       사용자 생성 데이터다(데이터 이동권의 핵심 자산).
--     → 'playlist_videos' 키 추가. 형제 섹션과 같은 평면 구조(모양 변경 없음).
--
--   [L4] 노출 불가 영상 담기가 조용한 no-op
--     add_to_playlist 는 소유자·수량 상한만 보고 visibility/is_hidden 을 안 봤다.
--     INSERT 는 성공해 "추가되었습니다" 토스트가 뜨는데, 개수·커버·목록은 셋 다 노출가능
--     필터를 쓰므로 숫자도 안 늘고 목록에도 안 보인다. 행이 안 그려지니 **제거도 불가**.
--     (영상 상세를 열어둔 사이 관리자가 숨김 처리한 경우 등)
--     → 담기 시점에 노출가능 여부를 검증하고 명확한 사유로 거부.
--
--   [정본 위생] update_playlist / delete_playlist / get_playlist_memberships
--     이 3함수는 **본문 정본이 phase18(SET 절 없음)** 이고, search_path 는 hardening §5 가
--     ALTER 로만 걸어둔 상태였다. 누군가 phase18 본문을 복사해 재정의하면 search_path 가
--     **조용히** 사라진다(GRANT 는 남아 기능은 정상 동작 → 게이트 #9 WARN 만 재발, 발견 늦음).
--     → 본문에 SET 절을 인라인한 판으로 승격해 구조적 취약을 없앤다.
--
-- ── ⚠️ 재실행 주의 (2026-07-22 현재 라이브 기준) ─────────────────────────────
--   get_my_playlists 는 커버 연령게이트로 **9컬럼**이 됐다(preview_age_rating 추가).
--   그런데 phase18(8컬럼)·playlist_hardening(8컬럼)은 DROP 없이 CREATE OR REPLACE 라,
--   지금 그 두 파일을 재실행하면 `cannot change return type of existing function` 으로
--   **중단**된다. 손실이 아니라 "절반만 적용"이 문제다 —
--     · phase18: RPC 1 에서 죽어 나머지 8함수에 도달조차 못 함
--     · hardening: §2 에서 죽어 **§5(search_path)·§6(GRANT)·§7(고아정리·FK) 미적용**
--   ⇒ 두 파일은 재실행하지 말 것. 재적용이 필요하면 playlist_cover_age_rating(9컬럼,
--     DROP 선행)을 마지막에 한 번 더 돌려 정합을 맞춘다.
--
--   ★ 이 파일이 export_my_data / add_to_playlist / update_playlist / delete_playlist /
--     get_playlist_memberships 의 새 정본.
--     phase27_user_data_rights.sql 의 export_my_data,
--     playlist_limits_reorder_20260722.sql 의 add_to_playlist,
--     phase18_playlists.sql 의 update/delete/get_playlist_memberships 재실행 금지.
--   ▣ 본문은 각 원본에서 **스크립트로 추출·삽입**해 생성했다(수기 전사 없음).
--     export_my_data 는 원본 대비 7줄만 추가(주석 3 + 코드 4) — 기계 대조로 확인.
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) export_my_data — 플레이리스트 내용물 포함 ─────────────────────────────
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'platform', 'CREAITE',
    'profile',
      -- 개인정보만 내보내고 내부 운영 플래그·타인 민감정보는 제외(키 subtract — 없는 키는 무시되어 안전).
      (SELECT to_jsonb(p) - 'is_admin' - 'suspended_at' - 'suspended_reason'
                         - 'deletion_requested_at' - 'deletion_reason'
                         - 'referred_by' - 'referral_code'
       FROM public.profiles p WHERE p.id = v_uid),
    'videos_uploaded',
      COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM public.videos v WHERE v.creator_id = v_uid), '[]'::jsonb),
    'comments',
      COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.comments c WHERE c.user_id = v_uid), '[]'::jsonb),
    'video_likes',
      COALESCE((SELECT jsonb_agg(to_jsonb(vl)) FROM public.video_likes vl WHERE vl.user_id = v_uid), '[]'::jsonb),
    'watch_history',
      COALESCE((SELECT jsonb_agg(to_jsonb(vv)) FROM public.video_views vv WHERE vv.viewer_user_id = v_uid), '[]'::jsonb),
    'orders_purchased',
      COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o WHERE o.buyer_id = v_uid), '[]'::jsonb),
    'orders_sold',
      COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o WHERE o.seller_id = v_uid), '[]'::jsonb),
    'playlists',
      COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.playlists p WHERE p.user_id = v_uid), '[]'::jsonb),
    -- ★ 2026-07-22 추가: 플레이리스트 "내용물". 위 playlists 는 이름·설명뿐이라
    --   담은 영상과 사용자가 직접 정한 순서(position)가 내보내기에서 통째로 빠져 있었다.
    --   position 은 set_playlist_order 로 사용자가 만든 값이라 재생성 불가능한 사용자 생성 데이터다.
    'playlist_videos',
      COALESCE((SELECT jsonb_agg(to_jsonb(pv)) FROM public.playlist_videos pv
                 JOIN public.playlists pl ON pl.id = pv.playlist_id
                WHERE pl.user_id = v_uid), '[]'::jsonb),
    'following_creators',
      COALESCE((SELECT jsonb_agg(to_jsonb(cf)) FROM public.creator_followers cf WHERE cf.follower_id = v_uid), '[]'::jsonb),
    'followers',
      COALESCE((SELECT jsonb_agg(to_jsonb(cf)) FROM public.creator_followers cf WHERE cf.creator_id = v_uid), '[]'::jsonb),
    'blocked_users',
      COALESCE((SELECT jsonb_agg(to_jsonb(ub)) FROM public.user_blocks ub WHERE ub.blocker_id = v_uid), '[]'::jsonb),
    'creator_blocked_users',
      COALESCE((SELECT jsonb_agg(to_jsonb(cbu)) FROM public.creator_blocked_users cbu WHERE cbu.creator_id = v_uid), '[]'::jsonb),
    'creator_filter_words',
      COALESCE((SELECT jsonb_agg(to_jsonb(cfw)) FROM public.creator_filter_words cfw WHERE cfw.creator_id = v_uid), '[]'::jsonb),
    'search_history',
      COALESCE((SELECT jsonb_agg(to_jsonb(sl)) FROM public.search_logs sl WHERE sl.user_id = v_uid), '[]'::jsonb),
    'revenue_distributions',
      COALESCE((SELECT jsonb_agg(to_jsonb(rd)) FROM public.revenue_distributions rd WHERE rd.creator_id = v_uid), '[]'::jsonb),
    'reports_filed',
      COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.reports r WHERE r.reporter_id = v_uid), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ── 2) add_to_playlist — 노출 불가 영상 담기 거부 ────────────────────────────
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

  -- ★ 2026-07-22 추가: 노출 불가 영상은 담기를 거부한다.
  --   예전엔 INSERT 가 성공해 "추가되었습니다" 토스트가 뜨는데, 개수·커버·목록은 전부
  --   노출가능 필터를 쓰므로 숫자도 안 늘고 목록에도 안 보였다. 행이 안 그려지니 제거도 불가.
  --   (상세를 열어둔 사이 관리자가 숨김 처리한 경우 등)
  IF NOT EXISTS (
    SELECT 1 FROM public.videos v
    WHERE v.id = p_video_id
      AND COALESCE(v.visibility, 'public') = 'public'
      AND COALESCE(v.is_hidden, false) = false
  ) THEN
    RAISE EXCEPTION '지금은 담을 수 없는 영상입니다(비공개이거나 검수 중)';
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

-- ── 3) SET 절 인라인 승격 3함수 (본문 정본을 phase18 → 이 파일로 이관) ───────
CREATE OR REPLACE FUNCTION public.update_playlist(
  p_playlist_id uuid,
  p_name        TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.playlists
  SET name = trim(p_name),
      description = p_description,
      updated_at = now()
  WHERE id = p_playlist_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION '플레이리스트를 찾을 수 없거나 권한이 없습니다';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_playlist(
  p_playlist_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM public.playlists
  WHERE id = p_playlist_id
    AND user_id = auth.uid()
    AND is_watch_later = false;   -- Watch Later는 삭제 불가
  IF NOT FOUND THEN
    RAISE EXCEPTION '플레이리스트를 삭제할 수 없습니다 (없거나 권한 없음 또는 나중에 보기)';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_playlist_memberships(
  p_video_id TEXT
)
RETURNS TABLE (
  playlist_id     uuid,
  name            TEXT,
  is_watch_later  BOOLEAN,
  contains        BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT
    p.id AS playlist_id,
    p.name,
    p.is_watch_later,
    EXISTS (
      SELECT 1 FROM public.playlist_videos pv
      WHERE pv.playlist_id = p.id AND pv.video_id = p_video_id
    ) AS contains
  FROM public.playlists p
  WHERE p.user_id = auth.uid()
  ORDER BY p.is_watch_later DESC, p.updated_at DESC;
$$;

-- ── 권한 표준(멱등) ──────────────────────────────────────────────────────────
--   CREATE OR REPLACE 는 GRANT 는 보존하지만 SET(proconfig) 은 보존하지 않는다
--   ("ownership and permissions 만 불변, 나머지 속성은 명령이 지정한 값으로 재할당").
--   위 본문들이 모두 SET 절을 포함하므로 안전하나, 권한은 세트로 다시 명시해 둔다.
REVOKE ALL ON FUNCTION public.add_to_playlist(uuid, TEXT)        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_playlist(uuid, TEXT, TEXT)  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_playlist(uuid)              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_playlist_memberships(TEXT)     FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_to_playlist(uuid, TEXT)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_playlist(uuid, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_playlist(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_playlist_memberships(TEXT)    TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '① 내보내기에 playlist_videos 포함' AS check_name,
  CASE WHEN (SELECT prosrc LIKE '%playlist_videos%' FROM pg_proc WHERE proname = 'export_my_data')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '② 내보내기 기존 섹션 보존(orders·watch_history)',
  CASE WHEN (SELECT prosrc LIKE '%orders_purchased%' AND prosrc LIKE '%watch_history%'
             FROM pg_proc WHERE proname = 'export_my_data')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '③ 담기 — 노출가능 검증 추가',
  CASE WHEN (SELECT prosrc LIKE '%검수 중%' FROM pg_proc WHERE proname = 'add_to_playlist')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '④ 담기 — 수량 상한(500) 보존',
  CASE WHEN (SELECT prosrc LIKE '%>= 500%' FROM pg_proc WHERE proname = 'add_to_playlist')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑤ 승격 3함수 search_path 인라인',
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public'
               AND p.proname IN ('update_playlist','delete_playlist','get_playlist_memberships')
               AND EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) c
                           WHERE c LIKE 'search_path=%')) = 3
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑥ 나중에보기 삭제 방지 보존(delete_playlist)',
  CASE WHEN (SELECT prosrc LIKE '%is_watch_later = false%' FROM pg_proc WHERE proname = 'delete_playlist')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑦ anon EXECUTE 차단(4함수)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('add_to_playlist','update_playlist','delete_playlist','get_playlist_memberships')
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
-- 교차 파일 의존 — hardening §1 의 get_playlist_videos 가 이 함수를 호출한다.
-- plpgsql 은 생성 시 검증하지 않으므로, 미적용이면 보관함 상세가 런타임에 통째로 실패한다.
SELECT '⑧ (의존) resolve_display_name 존재',
  CASE WHEN to_regprocedure('public.resolve_display_name(uuid)') IS NOT NULL
    THEN '✅ PASS' ELSE '🔴 FAIL → admin_name_fallback_20260722.sql 먼저 적용' END;
