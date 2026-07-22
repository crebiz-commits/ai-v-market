-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 시청 추적 정확도 + 이어보기 (2026-07-22)
--    ① 정산 위조 차단(치명)  ② 실제 시청시간 반영  ③ 이어보기 지점 저장
--
-- ── [C1] 🔴 치명: watch_seconds 무검증 → 구독 수익풀 탈취 ────────────────────
--   phase8_video_views.sql 의 track_video_view 는
--       v_ratio := LEAST(p_watch_seconds / v_duration, 1.0);   ← 비율만 클램프
--       INSERT ... watch_seconds = p_watch_seconds             ← 초는 클라이언트 값 그대로
--   인데 정산은 `SUM(vv.watch_seconds)` 로 구독 수익풀을 pro-rata 배분한다.
--   게다가 이 함수엔 GRANT/REVOKE 가 없어 **PUBLIC 기본 EXECUTE = anon 호출 가능**이고,
--   anon 은 auth.uid() 가 NULL 이라 셀프시청 차단(`v_viewer_id = v_creator_id`)도 건너뛴다.
--
--   ⇒ 공개 anon 키(클라이언트 번들에 있음)로 `track_video_view(내영상, 999999999, ...)`
--      **한 번만 호출하면 그 달 구독 수익풀의 거의 전부를 가져간다.**
--      비율은 1.0000, is_valid=true 로 저장돼 관리자 화면에서도 정상 시청으로 보인다.
--   → 시청초를 **영상 길이로 상한**(LEAST). IP 도 클라이언트 인자 대신 **서버 헤더**에서.
--
-- ── [C2] 정산이 실제 시청시간을 반영하지 않음 ───────────────────────────────
--   추적이 세션당 1회(30% 임계 도달 시)만 적재되고 이후 갱신이 없어, 10분 영상을
--   3분 보든 완주하든 정산 기여가 똑같이 180초였다(코드 주석의 의도 "전체 OTT 유효
--   시청시간"과 불일치). 풀 총액은 실수금 고정이므로 이는 **배분 정확도 문제**다.
--   → 중복창 내 같은 시청자/IP 의 기존 행을 **갱신**(GREATEST)한다. 클라이언트가 주기적으로
--     보고하면 그 세션의 시청시간이 누적된다. 행이 늘지 않아 테이블 비대도 없다.
--
-- ── [C3] 이어보기 미구현 ────────────────────────────────────────────────────
--   재생 위치를 저장하는 곳이 없어 기록에서 눌러도 항상 처음부터 재생됐다.
--   ▣ 시청시간과 재생위치는 **다른 값**이다. 앞으로 건너뛰면 위치는 뛰지만 시청시간은
--     안 늘어야 한다(그래야 정산이 정직하다). 한 컬럼에 담으면 둘 중 하나가 반드시 틀어진다.
--   → last_position_seconds 컬럼 신설. watch_seconds=실제 재생시간(정산),
--     last_position_seconds=마지막 재생지점(이어보기)으로 분리한다.
--
--   ★ track_video_view 의 새 정본. phase8_video_views.sql 재실행 금지
--     (상한·갱신·위치가 전부 사라지고 [C1] 탈취 경로가 되살아난다).
--     인자가 4개로 늘어 오버로드가 생기지 않게 옛 3-arg 판을 DROP 한 뒤 만든다.
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) 이어보기 지점 컬럼 ────────────────────────────────────────────────────
ALTER TABLE public.video_views
  ADD COLUMN IF NOT EXISTS last_position_seconds INTEGER;

COMMENT ON COLUMN public.video_views.last_position_seconds IS
  '마지막 재생 지점(초) — 이어보기용. watch_seconds(실제 재생시간, 정산 기준)와 다른 값: '
  '앞으로 건너뛰면 위치만 증가하고 시청시간은 증가하지 않는다. 2026-07-22';

-- ── 2) track_video_view — 상한·갱신·위치 ─────────────────────────────────────
DROP FUNCTION IF EXISTS public.track_video_view(TEXT, INTEGER, TEXT);

CREATE FUNCTION public.track_video_view(
  p_video_id         TEXT,
  p_watch_seconds    INTEGER,           -- 실제 재생시간(건너뛴 구간 제외)
  p_ip               TEXT DEFAULT NULL, -- 폴백용. 서버 헤더가 있으면 그쪽을 신뢰
  p_position_seconds INTEGER DEFAULT NULL  -- 마지막 재생 지점(이어보기)
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_viewer_id    UUID := auth.uid();
  v_creator_id   UUID;
  v_duration     INTEGER;
  v_min_ratio    NUMERIC;
  v_dedup_hours  NUMERIC;
  v_seconds      INTEGER;
  v_position     INTEGER;
  v_ratio        NUMERIC(5,4);
  v_is_valid     BOOLEAN := true;
  v_reason       TEXT := NULL;
  v_recent_count INTEGER := 0;
  v_view_id      BIGINT;
  v_ip           TEXT;
  v_existing     public.video_views%ROWTYPE;
BEGIN
  SELECT creator_id, duration_seconds
  INTO v_creator_id, v_duration
  FROM public.videos
  WHERE id = p_video_id;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION '영상을 찾을 수 없습니다: %', p_video_id;
  END IF;

  -- ★ [C1] IP 는 서버가 정한다. 클라이언트 인자는 헤더가 없을 때만 폴백으로 쓴다
  --   (인자를 신뢰하면 값만 바꿔가며 IP 중복차단을 무한 우회할 수 있다).
  BEGIN
    v_ip := NULLIF(split_part(
      COALESCE(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '');
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;
  IF v_ip IS NULL THEN
    v_ip := NULLIF(p_ip, '');
  END IF;

  v_min_ratio   := COALESCE(public.get_platform_setting('valid_view_min_ratio'), 0.30);
  v_dedup_hours := COALESCE(public.get_platform_setting('ip_dedup_hours'), 24);

  -- ★ [C1] 시청초 상한 — 영상 길이를 넘을 수 없다. 정산 SUM(watch_seconds) 위조 차단.
  v_seconds := GREATEST(COALESCE(p_watch_seconds, 0), 0);
  IF v_duration IS NOT NULL AND v_duration > 0 THEN
    v_seconds := LEAST(v_seconds, v_duration);
  END IF;
  IF v_seconds <= 0 THEN
    RETURN NULL;   -- 기록할 것 없음
  END IF;

  -- 재생 위치도 같은 상한(이어보기가 영상 끝을 넘어가지 않게)
  v_position := GREATEST(COALESCE(p_position_seconds, v_seconds), 0);
  IF v_duration IS NOT NULL AND v_duration > 0 THEN
    v_position := LEAST(v_position, v_duration);
  END IF;

  v_ratio := CASE WHEN v_duration IS NOT NULL AND v_duration > 0
                  THEN LEAST(v_seconds::numeric / v_duration::numeric, 1.0)
                  ELSE NULL END;

  -- ── [C2] 같은 세션(중복창 내 동일 시청자, 비로그인은 동일 IP)의 기존 행을 갱신 ──
  SELECT * INTO v_existing
  FROM public.video_views vv
  WHERE vv.video_id = p_video_id
    AND vv.occurred_at >= now() - (v_dedup_hours || ' hours')::INTERVAL
    AND (
      (v_viewer_id IS NOT NULL AND vv.viewer_user_id = v_viewer_id)
      OR
      (v_viewer_id IS NULL AND v_ip IS NOT NULL
       AND vv.viewer_user_id IS NULL AND vv.ip_address = v_ip)
    )
  ORDER BY vv.occurred_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.video_views vv
       SET
         -- 시청시간은 되돌아가지 않는다(감소 보고 무시)
         watch_seconds = GREATEST(vv.watch_seconds, v_seconds),
         watch_ratio   = CASE
             WHEN v_duration IS NOT NULL AND v_duration > 0
             THEN LEAST(GREATEST(vv.watch_seconds, v_seconds)::numeric / v_duration::numeric, 1.0)
             ELSE vv.watch_ratio END,
         -- 재생 위치는 최신 보고를 그대로(뒤로 감고 나갔으면 거기서 이어보는 게 맞다)
         last_position_seconds = v_position,
         -- 'low_ratio' 로 무효였던 건 임계를 넘기면 유효로 승격(계속 봤으므로).
         -- self_view / ip_dup / no_duration 은 승격 대상이 아니다.
         is_valid = CASE
             WHEN vv.is_valid THEN true
             WHEN vv.invalid_reason = 'low_ratio'
              AND v_duration IS NOT NULL AND v_duration > 0
              AND LEAST(GREATEST(vv.watch_seconds, v_seconds)::numeric / v_duration::numeric, 1.0) >= v_min_ratio
               THEN true
             ELSE false END,
         invalid_reason = CASE
             WHEN vv.is_valid THEN vv.invalid_reason
             WHEN vv.invalid_reason = 'low_ratio'
              AND v_duration IS NOT NULL AND v_duration > 0
              AND LEAST(GREATEST(vv.watch_seconds, v_seconds)::numeric / v_duration::numeric, 1.0) >= v_min_ratio
               THEN NULL
             ELSE vv.invalid_reason END
     WHERE vv.id = v_existing.id;

    RETURN v_existing.id;
  END IF;

  -- ── 신규 기록 — 어뷰징 필터(기존 로직 보존) ────────────────────────────────
  -- 1. 셀프 시청 차단
  IF v_viewer_id IS NOT NULL AND v_viewer_id = v_creator_id THEN
    v_is_valid := false;
    v_reason := 'self_view';
  END IF;

  -- 2. 영상 길이 없음 → 비율 계산 불가
  IF v_is_valid AND (v_duration IS NULL OR v_duration <= 0) THEN
    v_is_valid := false;
    v_reason := 'no_duration';
  END IF;

  -- 3. 시청률 체크
  IF v_is_valid AND v_ratio < v_min_ratio THEN
    v_is_valid := false;
    v_reason := 'low_ratio';
  END IF;

  -- 4. IP 중복 차단 (지난 N시간 내 동일 IP + 동일 영상 + is_valid=true 존재 시)
  IF v_is_valid AND v_ip IS NOT NULL THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM public.video_views
    WHERE video_id = p_video_id
      AND ip_address = v_ip
      AND is_valid = true
      AND occurred_at >= now() - (v_dedup_hours || ' hours')::INTERVAL;

    IF v_recent_count > 0 THEN
      v_is_valid := false;
      v_reason := 'ip_dup';
    END IF;
  END IF;

  INSERT INTO public.video_views (
    video_id, creator_id, viewer_user_id, ip_address,
    watch_seconds, video_duration, watch_ratio,
    last_position_seconds, is_valid, invalid_reason
  ) VALUES (
    p_video_id, v_creator_id, v_viewer_id, v_ip,
    v_seconds, v_duration, v_ratio,
    v_position, v_is_valid, v_reason
  )
  RETURNING id INTO v_view_id;

  RETURN v_view_id;
END;
$fn$;

COMMENT ON FUNCTION public.track_video_view IS
  '영상 시청 기록. 시청초를 영상 길이로 상한(정산 위조 차단), 중복창 내 같은 세션은 '
  '행을 갱신해 실제 시청시간을 누적, 재생 위치는 last_position_seconds 에 분리 저장. 2026-07-22';

-- ── 3) 이어보기 지점 조회 ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_watch_position(p_video_id TEXT)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(vv.last_position_seconds, vv.watch_seconds)
  FROM public.video_views vv
  WHERE vv.viewer_user_id = auth.uid()
    AND vv.video_id = p_video_id
  ORDER BY vv.occurred_at DESC
  LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.get_my_watch_position IS
  '이 영상의 내 마지막 재생 지점(초). 없으면 NULL. 이어보기용 — 본인 것만(auth.uid())';

-- ── 4) 권한 — track_video_view 는 비로그인 시청도 집계하므로 anon 유지가 맞다.
--    다만 GRANT 구문 자체가 없던 상태(PUBLIC 기본)를 명시적 부여로 바꾼다.
--    위치 조회는 본인 데이터라 로그인 전용.
REVOKE ALL ON FUNCTION public.track_video_view(TEXT, INTEGER, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_video_view(TEXT, INTEGER, TEXT, INTEGER) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_watch_position(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_watch_position(TEXT) TO authenticated;

COMMIT;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '① 시청초 상한(정산 위조 차단)' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'LEAST\(v_seconds, v_duration\)'
             FROM pg_proc WHERE proname = 'track_video_view')
    THEN '✅ PASS' ELSE '🔴 FAIL — 구독풀 탈취 가능' END AS status
UNION ALL
SELECT '② 서버 헤더 IP 사용(인자 신뢰 안 함)',
  CASE WHEN (SELECT prosrc ~ 'x-forwarded-for' FROM pg_proc WHERE proname = 'track_video_view')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '③ 세션 갱신으로 실제 시청시간 누적',
  CASE WHEN (SELECT prosrc ~ 'GREATEST\(vv.watch_seconds' FROM pg_proc WHERE proname = 'track_video_view')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '④ 오버로드 1개(옛 3-arg 판 부재)',
  CASE WHEN (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = 'track_video_view') = 1
    THEN '✅ PASS' ELSE '🔴 FAIL — 옛 무상한 판 잔존' END
UNION ALL
SELECT '⑤ 이어보기 컬럼·RPC',
  CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='video_views'
                      AND column_name='last_position_seconds')
        AND to_regprocedure('public.get_my_watch_position(text)') IS NOT NULL
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑥ 위치 조회 anon 차단',
  CASE WHEN NOT has_function_privilege('anon', 'public.get_my_watch_position(text)', 'EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
