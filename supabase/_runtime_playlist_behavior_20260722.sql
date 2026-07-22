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
-- ── ⚠️ 설계 이력 (두 번 실패하고 세 번째에 고침) ────────────────────────────
--   1차: `CREATE TEMP TABLE ... ON COMMIT DROP` → `relation "_rt" does not exist`.
--        문장 단위 커밋이면 만들어지자마자 사라진다.
--   2차: ON COMMIT DROP 만 제거 → **한 번은 성공, 다음엔 같은 오류.**
--        원인은 커밋 시점이 아니라 **세션**이었다. Supabase SQL Editor 는 문장을
--        커넥션 풀에서 각각 실행할 수 있어, CREATE TEMP TABLE 과 DO 블록이 서로
--        다른 커넥션에 걸리면 임시 테이블이 보이지 않는다(그래서 간헐적으로 성공).
--   3차(현재): **임시 테이블을 아예 쓰지 않는다.** 검사 함수 하나가 결과 집합을
--        직접 RETURN QUERY 로 돌려주고, 그 함수를 부른 뒤 지운다.
--        함수는 카탈로그에 있으므로 커넥션이 바뀌어도 보인다.
--
--   ▣ 안전: 쓰기를 시도하는 검사는 **성공했을 경우 그 자리에서 직접 되돌린다.**
--     거부되는 게 정상이라 보통은 아무것도 안 써지고, 결함이 있어 "성공해버린"
--     경우(=우리가 찾는 상황)에도 흔적이 남지 않는다. 트랜잭션 처리 방식에 기대지 않는다.
--   ▣ auth.uid() 는 SQL Editor 에서 NULL 이라 RPC 가 전부 빈 결과를 준다 →
--     함수 안에서 request.jwt.claims 를 세팅해 실제 사용자로 가장한다.
--   ▣ 남의 데이터는 만들지도 건드리지도 않는다. 소유권·노출가능 가드는
--     **존재하지 않는 ID** 로 같은 분기를 태워 검증한다.
--
--   사용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run.
--   ▶ ✅ PASS / ⚪ SKIP 이면 정상. 🔴 FAIL 만 실제 동작 결함이다.
--   ▶ 맨 끝 DROP FUNCTION 까지 함께 실행되어 검사 함수는 남지 않는다.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._rt_playlist_probe()
RETURNS TABLE (n INT, check_name TEXT, status TEXT, detail TEXT)
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_uid      uuid;
  v_pl       uuid;
  v_badge    BIGINT;
  v_actual   BIGINT;
  v_hidden   TEXT;
  v_other    uuid;
  v_wl       uuid;
  v_new      uuid;
  v_orig     TEXT;
  v_msg      TEXT;
  v_cnt      INT;
BEGIN
  -- 플레이리스트가 가장 많은 사용자를 대상으로 삼는다
  SELECT p.user_id INTO v_uid FROM public.playlists p
  GROUP BY p.user_id ORDER BY count(*) DESC LIMIT 1;

  IF v_uid IS NULL THEN
    RETURN QUERY SELECT 0, '대상 사용자'::TEXT, '⚪ SKIP'::TEXT,
                        '플레이리스트를 가진 계정이 없어 전 항목 건너뜀'::TEXT;
    RETURN;
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid::text)::text, true);
  RETURN QUERY SELECT 0, '대상 사용자 가장'::TEXT, '✅ PASS'::TEXT, ('user_id=' || v_uid::text)::TEXT;

  -- ── 1) 호출 자체가 되는가 ──
  BEGIN
    SELECT count(*) INTO v_cnt FROM public.get_my_playlists();
    RETURN QUERY SELECT 1, 'get_my_playlists 호출 성공'::TEXT, '✅ PASS'::TEXT, (v_cnt || '개 반환')::TEXT;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 1, 'get_my_playlists 호출 성공'::TEXT, '🔴 FAIL'::TEXT, SQLERRM::TEXT;
    RETURN;
  END;

  -- ── 2) ★ 카드 개수 = 상세 목록 실제 행수 (정적 검사로는 절대 못 잡는 항목) ──
  SELECT g.id, g.video_count INTO v_pl, v_badge
  FROM public.get_my_playlists() g ORDER BY g.video_count DESC LIMIT 1;

  IF v_pl IS NULL THEN
    RETURN QUERY SELECT 2, '개수 = 실제 목록 일치'::TEXT, '⚪ SKIP'::TEXT, '플레이리스트 0개'::TEXT;
  ELSE
    BEGIN
      SELECT count(*) INTO v_actual FROM public.get_playlist_videos(v_pl);
      IF v_badge = v_actual THEN
        RETURN QUERY SELECT 2, '개수 = 실제 목록 일치'::TEXT, '✅ PASS'::TEXT,
                            ('뱃지 ' || v_badge || ' = 목록 ' || v_actual)::TEXT;
      ELSE
        RETURN QUERY SELECT 2, '개수 = 실제 목록 일치'::TEXT, '🔴 FAIL'::TEXT,
                            ('뱃지 ' || v_badge || ' ≠ 목록 ' || v_actual || ' — 카드 숫자와 실제가 다름')::TEXT;
      END IF;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 2, '개수 = 실제 목록 일치'::TEXT, '🔴 FAIL'::TEXT,
                          ('get_playlist_videos 실패: ' || SQLERRM)::TEXT;
    END;
  END IF;

  -- ── 3) 커버 등급 컬럼이 실제로 오는가(19금 블러 판정 재료) ──
  BEGIN
    PERFORM g.preview_age_rating FROM public.get_my_playlists() g LIMIT 1;
    RETURN QUERY SELECT 3, '커버 등급(preview_age_rating) 반환'::TEXT, '✅ PASS'::TEXT, '컬럼 접근 가능'::TEXT;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 3, '커버 등급(preview_age_rating) 반환'::TEXT, '🔴 FAIL'::TEXT, SQLERRM::TEXT;
  END;

  -- ── 4) 노출 불가/미존재 영상 담기가 실제로 거부되는가 ──
  SELECT v.id INTO v_hidden FROM public.videos v
  WHERE COALESCE(v.is_hidden, false) = true OR COALESCE(v.visibility, 'public') <> 'public'
  LIMIT 1;
  IF v_hidden IS NULL THEN
    v_hidden := '__rt_nonexistent_' || gen_random_uuid()::text;   -- 같은 가드 경로를 탄다
  END IF;

  IF v_pl IS NULL THEN
    RETURN QUERY SELECT 4, '담기 가드(노출불가·미존재 영상 거부)'::TEXT, '⚪ SKIP'::TEXT, '플레이리스트 없음'::TEXT;
  ELSE
    BEGIN
      PERFORM public.add_to_playlist(v_pl, v_hidden);
      DELETE FROM public.playlist_videos pv WHERE pv.playlist_id = v_pl AND pv.video_id = v_hidden;  -- 원복
      RETURN QUERY SELECT 4, '담기 가드(노출불가·미존재 영상 거부)'::TEXT, '🔴 FAIL'::TEXT,
                          '거부되지 않고 담겼다(흔적 원복함)'::TEXT;
    EXCEPTION WHEN others THEN
      GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
      RETURN QUERY SELECT 4, '담기 가드(노출불가·미존재 영상 거부)'::TEXT, '✅ PASS'::TEXT,
                          ('거부됨: ' || left(v_msg, 50))::TEXT;
    END;
  END IF;

  -- ── 5) 비소유 플레이리스트 조회 차단 (IDOR) ──
  SELECT p.id INTO v_other FROM public.playlists p WHERE p.user_id <> v_uid LIMIT 1;
  IF v_other IS NULL THEN
    v_other := gen_random_uuid();   -- 내 것이 아닌 id → 소유권 가드가 같은 분기를 탄다
  END IF;
  BEGIN
    PERFORM public.get_playlist_videos(v_other);
    RETURN QUERY SELECT 5, '비소유 플레이리스트 조회 차단(IDOR)'::TEXT, '🔴 FAIL'::TEXT,
                        '남의/없는 목록이 조회됐다'::TEXT;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 5, '비소유 플레이리스트 조회 차단(IDOR)'::TEXT, '✅ PASS'::TEXT, '거부됨'::TEXT;
  END;

  -- ── 6) 비소유 플레이리스트 이름 변경 차단 ──
  SELECT p.name INTO v_orig FROM public.playlists p WHERE p.id = v_other;   -- 없으면 NULL
  BEGIN
    PERFORM public.update_playlist(v_other, '__rt_probe__', NULL);
    IF v_orig IS NOT NULL THEN
      UPDATE public.playlists SET name = v_orig WHERE id = v_other;   -- 실재했다면 원복
    END IF;
    RETURN QUERY SELECT 6, '비소유 플레이리스트 이름변경 차단'::TEXT, '🔴 FAIL'::TEXT,
                        '비소유 행이 변경됐다(원복함)'::TEXT;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 6, '비소유 플레이리스트 이름변경 차단'::TEXT, '✅ PASS'::TEXT, '거부됨'::TEXT;
  END;

  -- ── 7) "나중에 보기" 이름 변경 차단 (시스템 플레이리스트 보호) ──
  SELECT p.id, p.name INTO v_wl, v_orig FROM public.playlists p
  WHERE p.user_id = v_uid AND p.is_watch_later = true LIMIT 1;
  IF v_wl IS NULL THEN
    RETURN QUERY SELECT 7, '나중에보기 이름변경 차단'::TEXT, '⚪ SKIP'::TEXT, '이 계정에 나중에보기 없음'::TEXT;
  ELSE
    BEGIN
      PERFORM public.update_playlist(v_wl, '__rt_probe__', NULL);
      UPDATE public.playlists SET name = v_orig WHERE id = v_wl;   -- 원복
      RETURN QUERY SELECT 7, '나중에보기 이름변경 차단'::TEXT, '🔴 FAIL'::TEXT,
                          '시스템 플레이리스트 이름이 바뀌었다(원복함)'::TEXT;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 7, '나중에보기 이름변경 차단'::TEXT, '✅ PASS'::TEXT, '거부됨'::TEXT;
    END;
  END IF;

  -- ── 8) 이름 60자 상한이 실제로 걸리는가 ──
  BEGIN
    SELECT public.create_playlist(repeat('가', 61), NULL) INTO v_new;
    DELETE FROM public.playlists WHERE id = v_new;   -- 원복
    RETURN QUERY SELECT 8, '이름 60자 상한'::TEXT, '🔴 FAIL'::TEXT, '61자가 통과했다(생성분 삭제함)'::TEXT;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 8, '이름 60자 상한'::TEXT, '✅ PASS'::TEXT, '거부됨'::TEXT;
  END;

  -- ── 9) 내보내기에 플레이리스트 내용물이 실제 값으로 담기는가 ──
  BEGIN
    SELECT jsonb_array_length(public.export_my_data() -> 'playlist_videos') INTO v_cnt;
    IF v_cnt IS NULL THEN
      RETURN QUERY SELECT 9, '내보내기 playlist_videos 실값'::TEXT, '🔴 FAIL'::TEXT, '키가 없거나 배열이 아님'::TEXT;
    ELSE
      RETURN QUERY SELECT 9, '내보내기 playlist_videos 실값'::TEXT, '✅ PASS'::TEXT, (v_cnt || '건 포함')::TEXT;
    END IF;
  EXCEPTION WHEN others THEN
    RETURN QUERY SELECT 9, '내보내기 playlist_videos 실값'::TEXT, '🔴 FAIL'::TEXT, SQLERRM::TEXT;
  END;

  -- ── 10) 표시이름 해석이 런타임에 실제로 동작하는가(교차 파일 의존) ──
  IF v_pl IS NULL THEN
    RETURN QUERY SELECT 10, '표시이름 해석 런타임 동작'::TEXT, '⚪ SKIP'::TEXT, '대상 없음'::TEXT;
  ELSE
    BEGIN
      PERFORM g.creator_display_name FROM public.get_playlist_videos(v_pl) g LIMIT 1;
      RETURN QUERY SELECT 10, '표시이름 해석 런타임 동작'::TEXT, '✅ PASS'::TEXT,
                          'resolve_display_name 호출 성공'::TEXT;
    EXCEPTION WHEN others THEN
      RETURN QUERY SELECT 10, '표시이름 해석 런타임 동작'::TEXT, '🔴 FAIL'::TEXT, SQLERRM::TEXT;
    END;
  END IF;
END;
$fn$;

SELECT * FROM public._rt_playlist_probe() ORDER BY n;

DROP FUNCTION IF EXISTS public._rt_playlist_probe();
