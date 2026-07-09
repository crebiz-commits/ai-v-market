-- ════════════════════════════════════════════════════════════════════════════
-- 업로드 모더레이션 파이프라인 — 통과 전 숨김(hide-until-passed) (2026-07-09)
--
--   목적(3차 업로드 감사 HIGH 대응):
--     · 신규 업로드는 is_hidden=true(검수 대기)로 시작 → 피드 미노출(피드는 is_hidden 필터).
--     · Bunny 인코딩 완료 웹훅(서버)이 실제 영상 썸네일을 Vision 검수 → 통과 시에만 공개.
--     · 이 RPC 는 pending 상태에서만 전이 → 오너가 flag/reject 영상을 재검수로 되돌리는 회피 차단.
--
--   전이 규칙(pending → ):
--     score <70  → passed   + is_hidden=false (공개)
--     score 70-89→ flagged  + is_hidden=true  (관리자 검토 전까지 숨김 — 현행보다 안전)
--     score ≥90  → rejected + is_hidden=true
--     error/NULL → pending  + is_hidden=true  (재시도, fail-closed 로 숨김 유지)
--
--   ※ 기존 update_video_moderation(관리자 수동/구경로)·resolve_moderation_flag 는 그대로.
--     이미 판정난 영상은 이 RPC 로 안 바뀜(관리자 경로로만 변경).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.apply_moderation_result(
  p_video_id  TEXT,
  p_score     INTEGER,
  p_categories JSONB,
  p_error     TEXT DEFAULT NULL
)
RETURNS public.videos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current TEXT;
  v_status  TEXT;
  v_hidden  BOOLEAN;
  v_row     public.videos;
BEGIN
  SELECT moderation_status INTO v_current FROM public.videos WHERE id = p_video_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 이미 판정난 영상(passed/flagged/rejected)은 이 자동 경로로 안 바꿈 —
  -- 오너가 재검수로 flagged/rejected 를 passed 로 되돌리는 회피 차단(관리자만 override).
  IF v_current IS DISTINCT FROM 'pending' THEN
    SELECT * INTO v_row FROM public.videos WHERE id = p_video_id;
    RETURN v_row;
  END IF;

  IF p_error IS NOT NULL OR p_score IS NULL THEN
    v_status := 'pending';  v_hidden := TRUE;   -- 분석 실패 → 재시도, 숨김 유지(fail-closed)
  ELSIF p_score >= 90 THEN
    v_status := 'rejected'; v_hidden := TRUE;
  ELSIF p_score >= 70 THEN
    v_status := 'flagged';  v_hidden := TRUE;   -- 검토 전까지 숨김
  ELSE
    v_status := 'passed';   v_hidden := FALSE;  -- 통과 → 공개
  END IF;

  UPDATE public.videos SET
    moderation_status     = v_status,
    moderation_score      = p_score,
    moderation_categories = p_categories,
    moderation_checked_at = now(),
    moderation_error      = p_error,
    is_hidden             = v_hidden
  WHERE id = p_video_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

-- ⚠️ 권한 잠금 (CRITICAL) — SECURITY DEFINER 함수는 CREATE 시 EXECUTE 가 PUBLIC(anon 포함)에
--   기본 부여됨. 본문에 호출자 신원검증이 없어(pending 여부만 확인) 잠그지 않으면 anon 이
--   PostgREST 로 직접 호출해 ① 자기 영상 self-approve(검수우회) ② 남의/기존 영상 강제
--   rejected+숨김(대량검열) 가능. 전신 update_video_moderation 과 동일하게 service_role 만 허용.
REVOKE ALL ON FUNCTION public.apply_moderation_result(TEXT, INTEGER, JSONB, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_moderation_result(TEXT, INTEGER, JSONB, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.apply_moderation_result(TEXT, INTEGER, JSONB, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_moderation_result(TEXT, INTEGER, JSONB, TEXT) TO service_role;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT proname FROM pg_proc WHERE proname = 'apply_moderation_result';  -- 1행
--   -- pending 영상에 통과(예: score 10) 적용 시 is_hidden=false, status='passed' 로 바뀌는지.
