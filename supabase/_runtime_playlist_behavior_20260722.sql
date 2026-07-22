-- ════════════════════════════════════════════════════════════════════════════
-- 🧪 런타임 동작 검증 — 보관함 RPC 를 **실제로 호출**해 확인 (2026-07-22)
--
--   왜 필요한가: 지금까지 보관함 검증은 전부 **정적**이었다(prosrc LIKE '%...%').
--   그런데 이 프로젝트에서 "정의는 멀쩡한데 호출하면 실패"가 이미 세 번 나왔다 —
--     · admin_grant_premium : column reference "email" is ambiguous (한 번도 동작 안 함)
--     · toggle_watch_later  : 호출부 0건이라 기능 전체가 도달 불가
--     · update_playlist     : 호출부 0건이라 검증 없는 채 잠들어 있었음
--   정의만 보는 검증은 이런 걸 절대 못 잡는다. 그래서 **직접 호출**한다.
--
--   ▣ 안전장치
--     · 전체를 BEGIN … ROLLBACK 으로 감싼다 → **어떤 변경도 남지 않는다.**
--     · 성공해야 할 쓰기는 하지 않는다. 검증하는 쓰기는 "거부되어야 하는 것"뿐이라
--       정상 동작 시 애초에 아무것도 안 써진다.
--     · auth.uid() 는 SQL Editor 에서 NULL 이라 RPC 가 전부 빈 결과를 준다 →
--       request.jwt.claims 를 트랜잭션 로컬로 세팅해 실제 사용자로 가장한다.
--
--   ▣ 대상 사용자: 플레이리스트를 가장 많이 가진 계정(없으면 전 항목 SKIP).
--
--   사용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run.
--   ▶ 결과의 status 가 ✅ PASS / ⚪ SKIP 이면 정상. 🔴 FAIL 이 실제 동작 결함이다.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _rt(sort INT, check_name TEXT, status TEXT, detail TEXT) ON COMMIT DROP;

DO $$
DECLARE
  v_uid       uuid;
  v_pl        uuid;
  v_badge     BIGINT;
  v_actual    BIGINT;
  v_hidden    TEXT;
  v_other_pl  uuid;
  v_msg       TEXT;
  v_cnt       INT;
BEGIN
  -- 플레이리스트가 가장 많은 사용자를 고른다(테스트 대상)
  SELECT user_id INTO v_uid FROM public.playlists
  GROUP BY user_id ORDER BY count(*) DESC LIMIT 1;

  IF v_uid IS NULL THEN
    INSERT INTO _rt VALUES (0, '대상 사용자', '⚪ SKIP', '플레이리스트를 가진 계정이 없어 전 항목 건너뜀');
    RETURN;
  END IF;

  -- 이 트랜잭션 안에서만 그 사용자로 가장(auth.uid() 가 이 값을 반환하게 됨)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text)::text, true);
  INSERT INTO _rt VALUES (0, '대상 사용자 가장', '✅ PASS', 'user_id=' || v_uid::text);

  -- ── 1) get_my_playlists 가 실제로 행을 주는가 (호출 자체가 되는가) ──
  BEGIN
    SELECT count(*) INTO v_cnt FROM public.get_my_playlists();
    INSERT INTO _rt VALUES (1, 'get_my_playlists 호출 성공', '✅ PASS', v_cnt || '개 반환');
  EXCEPTION WHEN others THEN
    INSERT INTO _rt VALUES (1, 'get_my_playlists 호출 성공', '🔴 FAIL', SQLERRM);
    RETURN;
  END;

  -- ── 2) ★ 카드 개수 = 상세 목록 실제 행수 (정적 검사로는 절대 못 잡는 항목) ──
  --    두 RPC 가 같은 필터를 쓴다고 "코드상" 확인했어도, 실제 데이터에서 어긋날 수 있다.
  SELECT id, video_count INTO v_pl, v_badge
  FROM public.get_my_playlists() ORDER BY video_count DESC LIMIT 1;

  IF v_pl IS NULL THEN
    INSERT INTO _rt VALUES (2, '개수 = 실제 목록 일치', '⚪ SKIP', '플레이리스트 0개');
  ELSE
    BEGIN
      SELECT count(*) INTO v_actual FROM public.get_playlist_videos(v_pl);
      IF v_badge = v_actual THEN
        INSERT INTO _rt VALUES (2, '개수 = 실제 목록 일치', '✅ PASS',
          '뱃지 ' || v_badge || ' = 목록 ' || v_actual);
      ELSE
        INSERT INTO _rt VALUES (2, '개수 = 실제 목록 일치', '🔴 FAIL',
          '뱃지 ' || v_badge || ' ≠ 목록 ' || v_actual || ' — 카드 숫자와 실제가 다름');
      END IF;
    EXCEPTION WHEN others THEN
      INSERT INTO _rt VALUES (2, '개수 = 실제 목록 일치', '🔴 FAIL', 'get_playlist_videos 실패: ' || SQLERRM);
    END;
  END IF;

  -- ── 3) 커버 등급 컬럼이 실제 값으로 오는가(19금 블러 판정 재료) ──
  BEGIN
    PERFORM preview_age_rating FROM public.get_my_playlists() LIMIT 1;
    INSERT INTO _rt VALUES (3, '커버 등급(preview_age_rating) 반환', '✅ PASS', '컬럼 접근 가능');
  EXCEPTION WHEN others THEN
    INSERT INTO _rt VALUES (3, '커버 등급(preview_age_rating) 반환', '🔴 FAIL', SQLERRM);
  END;

  -- ── 4) 노출 불가 영상 담기가 **실제로 거부되는가** (2차 감사 수정분) ──
  SELECT id INTO v_hidden FROM public.videos
  WHERE COALESCE(is_hidden, false) = true OR COALESCE(visibility, 'public') <> 'public'
  LIMIT 1;

  IF v_hidden IS NULL OR v_pl IS NULL THEN
    INSERT INTO _rt VALUES (4, '숨김 영상 담기 거부', '⚪ SKIP', '숨김 영상 또는 플레이리스트 없음');
  ELSE
    BEGIN
      PERFORM public.add_to_playlist(v_pl, v_hidden);
      INSERT INTO _rt VALUES (4, '숨김 영상 담기 거부', '🔴 FAIL',
        '거부되지 않고 담겼다 — 목록엔 안 보이는 유령 행이 생긴다');
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      INSERT INTO _rt VALUES (4, '숨김 영상 담기 거부', '✅ PASS', '거부됨: ' || left(v_msg, 60));
    END;
  END IF;

  -- ── 5) 타인 플레이리스트 접근이 **실제로 막히는가** (IDOR) ──
  SELECT id INTO v_other_pl FROM public.playlists WHERE user_id <> v_uid LIMIT 1;
  IF v_other_pl IS NULL THEN
    INSERT INTO _rt VALUES (5, '타인 플레이리스트 접근 차단', '⚪ SKIP', '다른 사용자의 플레이리스트 없음');
  ELSE
    BEGIN
      PERFORM public.get_playlist_videos(v_other_pl);
      INSERT INTO _rt VALUES (5, '타인 플레이리스트 접근 차단', '🔴 FAIL', '타인 목록이 조회됐다(IDOR)');
    EXCEPTION WHEN others THEN
      INSERT INTO _rt VALUES (5, '타인 플레이리스트 접근 차단', '✅ PASS', '거부됨');
    END;
  END IF;

  -- ── 6) 타인 플레이리스트 이름 변경이 막히는가 (2차 감사에서 가드 추가분) ──
  IF v_other_pl IS NULL THEN
    INSERT INTO _rt VALUES (6, '타인 플레이리스트 이름변경 차단', '⚪ SKIP', '대상 없음');
  ELSE
    BEGIN
      PERFORM public.update_playlist(v_other_pl, '해킹시도', NULL);
      INSERT INTO _rt VALUES (6, '타인 플레이리스트 이름변경 차단', '🔴 FAIL', '타인 이름이 변경됐다');
    EXCEPTION WHEN others THEN
      INSERT INTO _rt VALUES (6, '타인 플레이리스트 이름변경 차단', '✅ PASS', '거부됨');
    END;
  END IF;

  -- ── 7) "나중에 보기" 이름 변경 차단 (시스템 플레이리스트 보호) ──
  SELECT id INTO v_other_pl FROM public.playlists
  WHERE user_id = v_uid AND is_watch_later = true LIMIT 1;
  IF v_other_pl IS NULL THEN
    INSERT INTO _rt VALUES (7, '나중에보기 이름변경 차단', '⚪ SKIP', '이 계정에 나중에보기 없음');
  ELSE
    BEGIN
      PERFORM public.update_playlist(v_other_pl, '이름바꾸기', NULL);
      INSERT INTO _rt VALUES (7, '나중에보기 이름변경 차단', '🔴 FAIL', '시스템 플레이리스트 이름이 바뀌었다');
    EXCEPTION WHEN others THEN
      INSERT INTO _rt VALUES (7, '나중에보기 이름변경 차단', '✅ PASS', '거부됨');
    END;
  END IF;

  -- ── 8) 이름 길이 상한이 **실제로** 걸리는가 ──
  BEGIN
    PERFORM public.create_playlist(repeat('가', 61), NULL);
    INSERT INTO _rt VALUES (8, '이름 60자 상한', '🔴 FAIL', '61자가 통과했다');
  EXCEPTION WHEN others THEN
    INSERT INTO _rt VALUES (8, '이름 60자 상한', '✅ PASS', '거부됨');
  END;

  -- ── 9) 내보내기에 플레이리스트 내용물이 **실제 값으로** 담기는가 ──
  BEGIN
    SELECT jsonb_array_length(public.export_my_data() -> 'playlist_videos') INTO v_cnt;
    IF v_cnt IS NULL THEN
      INSERT INTO _rt VALUES (9, '내보내기 playlist_videos 실값', '🔴 FAIL', '키가 없거나 배열이 아님');
    ELSE
      INSERT INTO _rt VALUES (9, '내보내기 playlist_videos 실값', '✅ PASS', v_cnt || '건 포함');
    END IF;
  EXCEPTION WHEN others THEN
    INSERT INTO _rt VALUES (9, '내보내기 playlist_videos 실값', '🔴 FAIL', SQLERRM);
  END;

  -- ── 10) 표시 이름 해석이 런타임에 실제로 동작하는가(교차 파일 의존) ──
  --     get_playlist_videos 가 resolve_display_name 을 호출한다. plpgsql 은 생성 시
  --     검증하지 않으므로, 그 함수가 없으면 여기서 처음 터진다.
  IF v_pl IS NULL THEN
    INSERT INTO _rt VALUES (10, '표시이름 해석 런타임 동작', '⚪ SKIP', '대상 없음');
  ELSE
    BEGIN
      PERFORM creator_display_name FROM public.get_playlist_videos(v_pl) LIMIT 1;
      INSERT INTO _rt VALUES (10, '표시이름 해석 런타임 동작', '✅ PASS', 'resolve_display_name 호출 성공');
    EXCEPTION WHEN others THEN
      INSERT INTO _rt VALUES (10, '표시이름 해석 런타임 동작', '🔴 FAIL', SQLERRM);
    END;
  END IF;
END $$;

SELECT sort, check_name, status, detail FROM _rt ORDER BY sort;

ROLLBACK;   -- ★ 어떤 변경도 남기지 않는다
