-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 신고 RPC 하드닝 (2026-07-18) — 신고 큐(안전·품질) 감사 후속
--
--   배경: AdminReports(신고 큐) 백엔드 감사에서 2건의 비대칭 발견.
--     B) moderate_report 가 인라인 is_admin 체크만 사용 → 정지된 관리자(is_suspended)도
--        모더레이션 가능. 같은 큐의 조회 함수 get_pending_reports 는 이미 assert_admin
--        (is_admin AND NOT is_suspended)을 쓰는데, 처리 함수만 안 막던 비대칭 → 통일.
--     C) moderate_report / create_report 가 anon/PUBLIC 에서 EXECUTE 미회수(Postgres 기본
--        PUBLIC). 본문 게이트로 방어되나 get_pending_reports 하드닝(REVOKE anon)과 비대칭.
--        방어선 이중화(권한 회수 + 본문 게이트)로 정렬.
--
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등(여러 번 안전).
--   함수 본문은 SSOT(community_reports_hardening_20260707.sql)와 100% 동일 —
--     오직 인라인 is_admin 게이트 4줄만 `PERFORM public.assert_admin();` 로 교체.
--   assert_admin SSOT: admin_audit_hardening_20260714.sql (is_admin AND NOT is_suspended)
-- ════════════════════════════════════════════════════════════════════════════

-- ── B) moderate_report: 인라인 is_admin → assert_admin (정지 관리자 차단) ──
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
  v_admin_id   UUID := auth.uid();
  v_report     public.reports;
  v_new_status TEXT;
BEGIN
  -- 관리자 인가 SSOT — is_admin AND NOT is_suspended 강제(정지된 관리자도 차단).
  PERFORM public.assert_admin();

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

-- ── C) EXECUTE 권한 회수 — anon/PUBLIC 차단, 최소권한 부여 ──
-- moderate_report: 관리자 전용(본문 assert_admin). authenticated 만 부여(anon 완전 차단).
REVOKE ALL ON FUNCTION public.moderate_report(BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_report(BIGINT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.moderate_report(BIGINT, TEXT, TEXT) TO authenticated;

-- create_report: 로그인 사용자 전용(본문 로그인 강제). authenticated 만 부여(anon 차단).
REVOKE ALL ON FUNCTION public.create_report(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_report(TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_report(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── 검증 (선택) — Run 후 결과 확인용 ──
-- 1) moderate_report 가 assert_admin 게이트인가
SELECT 'moderate_report assert_admin 게이트' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'assert_admin' FROM pg_proc WHERE proname='moderate_report')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
-- 2) anon EXECUTE 회수됐는가 (둘 다 false 여야)
SELECT 'moderate_report anon 차단' AS check_name,
  CASE WHEN NOT has_function_privilege('anon',
    'public.moderate_report(bigint,text,text)', 'EXECUTE') THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'create_report anon 차단',
  CASE WHEN NOT has_function_privilege('anon',
    'public.create_report(text,text,text,text)', 'EXECUTE') THEN '✅ PASS' ELSE '🔴 FAIL' END;
