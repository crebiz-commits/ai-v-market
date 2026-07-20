-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 신규 영상 광고 제외 기간을 설정값으로 (2026-07-20) — 죽어 있던 설정 살리기
--
--   [결함] 관리자 수익 정책의 "신규 영상 광고 제외 기간(48시간)" 은 편집·저장·감사로그까지
--     되는데 **실제 동작에 전혀 반영되지 않았다**. classify_video_placement 트리거가
--     interval '48 hours' 로 하드코딩돼 있고, get_platform_setting('new_video_grace_hours')
--     호출은 저장소 전체에 0곳이었다. → 24시간으로 바꿔도 계속 48시간 적용(관리자 인식과 실제 불일치).
--   [수정] 같은 함수가 이미 쓰는 패턴(cinema_min/ott_min)과 동일하게 설정을 읽는다.
--     폴백 48h 유지 → 설정이 없거나 조회 실패해도 기존 동작 그대로(안전).
--
--   ★ 라이브 동일성 확증 후 작성 (_diag_classify_video_placement_20260720.sql 결과):
--     stripped_len=1450, md5=3f2dac7e1dc25c987f540e2dbba51731 → 저장소와 완전 일치
--     overloads=1, trigger_count=1(videos 에 연결됨), has_48h=true, reads_grace=false
--     → 되돌림 위험 0. 본문은 원본에서 스크립트 생성(수기 전사 없음).
--
--   ▣ 소급 영향 없음: 트리거는 ad_eligibility_at IS NULL 일 때만 세팅 → 기존 영상 값 불변,
--     신규 업로드부터 적용. 과거 정산 소급 변경 없음.
--   ★ 이 파일이 classify_video_placement 새 정본. phase1_video_placement/content_policy_v2/
--     cinema_rpc_hardening_20260708 의 이 함수 재실행 금지(하드코딩으로 회귀).
--   적용: Supabase SQL Editor → Run. 멱등. (CREATE OR REPLACE 는 트리거 연결 유지)
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.classify_video_placement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parsed         INTEGER;
  v_cinema_min   INTEGER;
  v_ott_min      INTEGER;
  v_grace_hours  INTEGER;
BEGIN
  v_cinema_min := COALESCE(public.get_platform_setting('cinema_min_duration_seconds')::INTEGER, 60);
  v_ott_min    := COALESCE(public.get_platform_setting('ott_min_duration_seconds')::INTEGER, 600);
  -- 신규 영상 광고 제외 기간(시간) — 관리자 수익 정책에서 조절. 폴백 48h(기존 하드코딩과 동일)
  v_grace_hours := COALESCE(public.get_platform_setting('new_video_grace_hours')::INTEGER, 48);

  -- duration_seconds 자동 파싱:
  --   · duration_seconds 가 비었을 때(INSERT 기본), OR
  --   · UPDATE 로 duration 텍스트가 실제로 바뀌었을 때(옛 tier 고착 방지) 재파싱.
  --   (텍스트 변화 없이 duration_seconds 만 직접 수정한 경우는 그 값을 존중 → 재파싱 안 함)
  IF NEW.duration IS NOT NULL AND (
       NEW.duration_seconds IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.duration IS DISTINCT FROM OLD.duration)
     ) THEN
    NEW.duration_seconds :=
      CASE
        WHEN NEW.duration ~ '^\d+:\d+:\d+$' THEN
          (split_part(NEW.duration, ':', 1)::int * 3600) +
          (split_part(NEW.duration, ':', 2)::int * 60) +
          (split_part(NEW.duration, ':', 3)::int)
        WHEN NEW.duration ~ '^\d+:\d+$' THEN
          (split_part(NEW.duration, ':', 1)::int * 60) +
          (split_part(NEW.duration, ':', 2)::int)
        WHEN NEW.duration ~ '^\d+$' THEN
          NEW.duration::int
        ELSE 0
      END;
  END IF;

  parsed := COALESCE(NEW.duration_seconds, 0);

  NEW.show_on_home := true;
  NEW.show_on_cinema := parsed >= v_cinema_min;
  NEW.show_on_ott := parsed >= v_ott_min;

  IF NEW.ad_eligibility_at IS NULL THEN
    NEW.ad_eligibility_at := COALESCE(NEW.created_at, now()) + make_interval(hours => v_grace_hours);
  END IF;

  RETURN NEW;
END;
$$;

-- ── 검증 (선택) ──
SELECT '설정값 읽기 반영(new_video_grace_hours)' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'new_video_grace_hours' FROM pg_proc WHERE proname='classify_video_placement')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '48시간 하드코딩 제거',
  CASE WHEN (SELECT prosrc !~ 'interval ''48 hours''' FROM pg_proc WHERE proname='classify_video_placement')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '티어 판정 로직 보존(cinema/ott min)',
  CASE WHEN (SELECT prosrc ~ 'cinema_min_duration_seconds' AND prosrc ~ 'ott_min_duration_seconds'
             FROM pg_proc WHERE proname='classify_video_placement')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'videos 트리거 연결 유지',
  CASE WHEN (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE n.nspname='public' AND c.relname='videos'
      AND p.proname='classify_video_placement' AND NOT t.tgisinternal) > 0
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
