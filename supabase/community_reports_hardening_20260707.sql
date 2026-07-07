-- ════════════════════════════════════════════════════════════════════════════
-- 신고/모더레이션 하드닝 (2026-07-07) — 커뮤니티 감사 C1·M2·M3
--
--   라이브 검증(2026-07-07)으로 확정된 3건을 수정한다. 이 파일이 아래 함수들의
--   최신 정본(SSOT):
--     · get_pending_reports  (기존: phase10_reports.sql) — C1
--     · moderate_report      (기존: phase10_reports.sql) — M2
--     · create_report        (기존: community_security_20260621.sql) — M3
--   재적용 시 반드시 이 파일을 가장 나중에 Run 할 것.
--
--   [C1 CRITICAL] get_pending_reports 에 admin 가드가 전무 → SECURITY DEFINER 가
--     RLS 를 우회하므로 아무 로그인 사용자가 rpc 직접호출로 전체 신고 큐 +
--     신고자 신원(reporter_id/reporter_name) 열람. (auth_can_exec=true,
--     has_admin_guard=false 확인됨)
--     → 본문 assert_admin() 가드 추가. 어드민도 'authenticated' 롤이라 롤단위
--       EXECUTE 회수는 불가 → anon/PUBLIC 만 회수하고 authenticated 는 유지하되
--       본문에서 비어드민 즉시 예외.(다른 admin_* 함수와 동일 패턴, 게이트 #7)
--
--   [M2 MAJOR] moderate_report 의 keep 액션이 원인불문 is_hidden=false 복원 →
--     별개 사유(remove='커뮤니티 가이드라인 위반')로 숨긴 콘텐츠에 새 신고가 붙고
--     그 신고를 keep 하면 remove 숨김이 풀림.
--     → keep 복원을 '신고 누적%' 자동숨김분으로만 범위한정.
--
--   [M3 MAJOR] create_report 가 target_id 실존검증 없음 → 위조/미존재 대상으로
--     큐 오염, 자동숨김 카운트 오염.
--     → 대상 종류별 실존검증 추가. (주: 실존하는 정상콘텐츠에 대한 3계정 Sybil
--       자동숨김은 임계값/계정신뢰도 정책 사안 — 별도 논의. 여기선 무결성만.)
--
--   부수: 세 함수 모두 SET search_path 고정(#9 WARN 해소).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- C1: get_pending_reports — admin 가드 + search_path 고정
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pending_reports()
RETURNS TABLE (
  id            BIGINT,
  target_type   TEXT,
  target_id     TEXT,
  reason        TEXT,
  description   TEXT,
  reporter_id   UUID,
  reporter_name TEXT,
  created_at    TIMESTAMPTZ,
  report_count  INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();   -- 비어드민 즉시 예외(신고자 PII 보호)
  RETURN QUERY
  SELECT
    r.id, r.target_type, r.target_id, r.reason, r.description,
    r.reporter_id,
    p.display_name AS reporter_name,
    r.created_at,
    (SELECT COUNT(*)::INTEGER
     FROM public.reports r2
     WHERE r2.target_type = r.target_type
       AND r2.target_id = r.target_id
       AND r2.status = 'pending') AS report_count
  FROM public.reports r
  LEFT JOIN public.profiles p ON p.id = r.reporter_id
  WHERE r.status = 'pending'
  ORDER BY r.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_pending_reports() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pending_reports() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- M2: moderate_report — keep 복원 범위한정 + search_path 고정
--     (변경점은 keep 분기의 3개 UPDATE 에 hidden_reason LIKE '신고 누적%' 추가뿐,
--      나머지 본문은 기존 정본과 동일)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.moderate_report(
  p_report_id BIGINT,
  p_action TEXT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id  UUID := auth.uid();
  v_is_admin  BOOLEAN;
  v_report    public.reports;
  v_new_status TEXT;
BEGIN
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;

  IF p_action NOT IN ('keep', 'remove', 'dismiss') THEN
    RAISE EXCEPTION '잘못된 액션: % (keep/remove/dismiss 중 하나)', p_action;
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 신고: %', p_report_id;
  END IF;

  IF p_action = 'keep' THEN
    v_new_status := 'reviewed_kept';
    -- M2: '신고 누적 자동 숨김'으로 숨겨진 것만 복원 — remove(가이드라인 위반)로
    --     숨긴 콘텐츠는 건드리지 않는다.
    IF v_report.target_type = 'video' THEN
      UPDATE public.videos SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    ELSIF v_report.target_type = 'comment' THEN
      UPDATE public.comments SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id::TEXT = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    ELSIF v_report.target_type = 'community_post' THEN
      UPDATE public.community_posts SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id::TEXT = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    END IF;

  ELSIF p_action = 'remove' THEN
    v_new_status := 'reviewed_removed';
    IF v_report.target_type = 'video' THEN
      UPDATE public.videos SET is_hidden = true,
        hidden_reason = '커뮤니티 가이드라인 위반으로 숨김 처리', hidden_at = now()
      WHERE id = v_report.target_id;
    ELSIF v_report.target_type = 'comment' THEN
      UPDATE public.comments SET is_hidden = true,
        hidden_reason = '커뮤니티 가이드라인 위반으로 숨김 처리', hidden_at = now()
      WHERE id::TEXT = v_report.target_id;
    ELSIF v_report.target_type = 'community_post' THEN
      UPDATE public.community_posts SET is_hidden = true,
        hidden_reason = '커뮤니티 가이드라인 위반으로 숨김 처리', hidden_at = now()
      WHERE id::TEXT = v_report.target_id;
    ELSIF v_report.target_type = 'user' THEN
      UPDATE public.profiles SET is_suspended = true,
        suspended_reason = '반복된 가이드라인 위반', suspended_at = now()
      WHERE id::TEXT = v_report.target_id;
    END IF;

  ELSE  -- dismiss
    UPDATE public.reports
    SET status = 'dismissed', reviewed_by = v_admin_id, reviewed_at = now(), admin_note = p_admin_note
    WHERE id = p_report_id;
    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (v_admin_id, 'report_dismiss', v_report.target_type, v_report.target_id,
            jsonb_build_object('report_id', p_report_id, 'note', p_admin_note));
    RETURN;
  END IF;

  UPDATE public.reports
  SET status = v_new_status, reviewed_by = v_admin_id, reviewed_at = now(), admin_note = p_admin_note
  WHERE target_type = v_report.target_type
    AND target_id = v_report.target_id
    AND status = 'pending';

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (v_admin_id,
          CASE WHEN p_action = 'remove' THEN 'report_remove' ELSE 'report_keep' END,
          v_report.target_type, v_report.target_id,
          jsonb_build_object('report_id', p_report_id, 'action', p_action, 'note', p_admin_note));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- M3: create_report — 대상 실존검증 추가 (rate-limit 정본 기준 재정의) + search_path
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_report(
  p_target_type TEXT,
  p_target_id TEXT,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reporter_id     UUID := auth.uid();
  v_report_id       BIGINT;
  v_threshold       NUMERIC;
  v_pending_count   INTEGER;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- 도배 방지: 1시간 20건 상한
  IF (SELECT COUNT(*) FROM public.reports
        WHERE reporter_id = v_reporter_id AND created_at > now() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION '신고가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  END IF;

  IF p_target_type NOT IN ('video', 'comment', 'user', 'community_post') THEN
    RAISE EXCEPTION '잘못된 신고 대상 종류: %', p_target_type;
  END IF;

  IF p_reason NOT IN ('spam', 'inappropriate', 'copyright', 'violence', 'harassment', 'misinformation', 'other') THEN
    RAISE EXCEPTION '잘못된 신고 사유: %', p_reason;
  END IF;

  IF p_target_type = 'user' AND p_target_id = v_reporter_id::TEXT THEN
    RAISE EXCEPTION '본인 자신은 신고할 수 없습니다';
  END IF;

  -- M3: 대상 실존검증 — 위조/미존재 target_id 로 큐·자동숨김 카운트 오염 차단
  IF p_target_type = 'video' AND NOT EXISTS (
       SELECT 1 FROM public.videos WHERE id = p_target_id) THEN
    RAISE EXCEPTION '존재하지 않는 신고 대상입니다';
  ELSIF p_target_type = 'comment' AND NOT EXISTS (
       SELECT 1 FROM public.comments WHERE id::TEXT = p_target_id) THEN
    RAISE EXCEPTION '존재하지 않는 신고 대상입니다';
  ELSIF p_target_type = 'community_post' AND NOT EXISTS (
       SELECT 1 FROM public.community_posts WHERE id::TEXT = p_target_id) THEN
    RAISE EXCEPTION '존재하지 않는 신고 대상입니다';
  ELSIF p_target_type = 'user' AND NOT EXISTS (
       SELECT 1 FROM public.profiles WHERE id::TEXT = p_target_id) THEN
    RAISE EXCEPTION '존재하지 않는 신고 대상입니다';
  END IF;

  -- 신고 기록 (중복 시 unique index가 차단)
  INSERT INTO public.reports (reporter_id, target_type, target_id, reason, description)
  VALUES (v_reporter_id, p_target_type, p_target_id, p_reason, p_description)
  RETURNING id INTO v_report_id;

  -- 자동 숨김 처리 (신고 N건 누적 시)
  v_threshold := COALESCE(public.get_platform_setting('auto_hide_threshold'), 3);

  SELECT COUNT(*) INTO v_pending_count
  FROM public.reports
  WHERE target_type = p_target_type AND target_id = p_target_id AND status = 'pending';

  IF v_pending_count >= v_threshold THEN
    IF p_target_type = 'video' THEN
      UPDATE public.videos
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id = p_target_id AND is_hidden = false;
    ELSIF p_target_type = 'comment' THEN
      UPDATE public.comments
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id::TEXT = p_target_id AND is_hidden = false;
    ELSIF p_target_type = 'community_post' THEN
      UPDATE public.community_posts
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id::TEXT = p_target_id AND is_hidden = false;
    END IF;
  END IF;

  RETURN v_report_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(적용 후):
--   SELECT 'C1', has_function_privilege('anon', p.oid,'EXECUTE') AS anon_exec,
--          (p.prosrc ~ 'assert_admin') AS guarded
--     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--     WHERE n.nspname='public' AND p.proname='get_pending_reports';
--     -- 기대: anon_exec=false, guarded=true
--   SELECT 'M2', (prosrc ~ 'hidden_reason LIKE ''신고 누적%''') FROM pg_proc WHERE proname='moderate_report';  -- true
--   SELECT 'M3', (prosrc ~ '존재하지 않는 신고 대상') FROM pg_proc WHERE proname='create_report';               -- true
-- ════════════════════════════════════════════════════════════════════════════
