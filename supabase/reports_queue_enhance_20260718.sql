-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 신고 큐 2차 심층 감사 보강 (2026-07-18) — 콘텐츠 가시성·상태 정합성·기밀성
--
--   reports_rpc_lockdown_20260718.sql(assert_admin + anon REVOKE) 이후 적대적 재감사에서
--   발견한 실질 결함을 해소한다. 이 파일은 자기완결(가드·search_path·grant 모두 포함) —
--   단독 Run 으로 최종 상태 도달. 멱등.
--
--   [H1] 관리자가 신고 대상 실제 내용을 못 봄(특히 comment는 딥링크도 없어 맹검 모더레이션).
--        → get_pending_reports 가 대상 콘텐츠 스니펫(target_preview) + 삭제여부(target_deleted)
--          + 댓글 부모(comment_video_id/comment_post_id, 딥링크용)를 함께 반환.
--   [M2] 대상 하드삭제 시 고아 신고가 큐에 영구 잔존·판단 불가 → target_deleted 로 표시.
--   [M1] 반려(dismiss)가 자동숨김을 복원 안 해 정상 콘텐츠가 흔적 없이 영구 숨김될 수 있음
--        → dismiss 후 남은 pending 이 임계값 미만이면 '신고 누적' 자동숨김분 복원.
--   [M3] 유지(keep)가 정지 사용자(is_suspended)를 해제 안 함 → keep 에 user 분기 추가
--        (자동설정 사유 '반복된 가이드라인 위반' 인 경우만 해제; 타 사유 정지는 보존).
--   [L4] 동시성 — 이미 처리된 신고 재처리 시 감사로그·메일 중복 → 진입 시 status='pending' 가드.
--   [M4] admin_note(비공개 메모)가 reports SELECT RLS(own OR admin)로 신고자에게 노출
--        → reports 직접 SELECT 를 anon/authenticated 에서 회수(관리자 조회는 DEFINER RPC 경유).
--
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- 원자화: get_pending_reports 는 반환 시그니처 변경(컬럼 추가) 때문에 DROP 후 재생성 →
--   중간 실패로 함수가 사라져 큐가 깨지는 걸 막기 위해 전체 DDL 을 트랜잭션으로 감쌈.
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_pending_reports — 대상 콘텐츠 preview + 삭제여부 + 댓글 부모 반환 (H1, M2)
--   반환 컬럼 추가: target_preview, target_deleted, comment_video_id, comment_post_id
--   (기존 9컬럼은 순서·타입 그대로 → 프론트 하위호환)
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_pending_reports();
CREATE OR REPLACE FUNCTION public.get_pending_reports()
RETURNS TABLE (
  id               BIGINT,
  target_type      TEXT,
  target_id        TEXT,
  reason           TEXT,
  description      TEXT,
  reporter_id      UUID,
  reporter_name    TEXT,
  created_at       TIMESTAMPTZ,
  report_count     INTEGER,
  target_preview   TEXT,
  target_deleted   BOOLEAN,
  comment_video_id TEXT,
  comment_post_id  TEXT
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
       AND r2.status = 'pending') AS report_count,
    -- 대상 콘텐츠 스니펫(최대 200자) — 관리자가 무엇을 판정하는지 보이게
    LEFT(CASE r.target_type
      WHEN 'video'          THEN (SELECT v.title        FROM public.videos v          WHERE v.id::TEXT  = r.target_id)
      WHEN 'comment'        THEN (SELECT c.content      FROM public.comments c        WHERE c.id::TEXT  = r.target_id)
      WHEN 'community_post' THEN (SELECT cp.title       FROM public.community_posts cp WHERE cp.id::TEXT = r.target_id)
      WHEN 'user'           THEN (SELECT pr.display_name FROM public.profiles pr       WHERE pr.id::TEXT = r.target_id)
    END, 200) AS target_preview,
    -- 대상 실존 여부(고아 신고 표시용)
    CASE r.target_type
      WHEN 'video'          THEN NOT EXISTS (SELECT 1 FROM public.videos v          WHERE v.id::TEXT  = r.target_id)
      WHEN 'comment'        THEN NOT EXISTS (SELECT 1 FROM public.comments c        WHERE c.id::TEXT  = r.target_id)
      WHEN 'community_post' THEN NOT EXISTS (SELECT 1 FROM public.community_posts cp WHERE cp.id::TEXT = r.target_id)
      WHEN 'user'           THEN NOT EXISTS (SELECT 1 FROM public.profiles pr       WHERE pr.id::TEXT = r.target_id)
      ELSE false
    END AS target_deleted,
    -- 댓글 부모(딥링크 생성용) — 댓글이 아니면 NULL
    (SELECT c.video_id FROM public.comments c WHERE c.id::TEXT = r.target_id) AS comment_video_id,
    (SELECT c.post_id  FROM public.comments c WHERE c.id::TEXT = r.target_id) AS comment_post_id
  FROM public.reports r
  LEFT JOIN public.profiles p ON p.id = r.reporter_id
  WHERE r.status = 'pending'
  ORDER BY r.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_pending_reports() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_reports() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_reports() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- moderate_report — 상태가드(L4) + dismiss 자동숨김 복원(M1) + keep 정지해제(M3)
--   본문은 SSOT(reports_rpc_lockdown_20260718.sql)와 동일, 위 3점만 추가.
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
  v_admin_id   UUID := auth.uid();
  v_report     public.reports;
  v_new_status TEXT;
  v_pending    INTEGER;     -- M1: 반려 후 남은 pending
  v_threshold  NUMERIC;     -- M1: 자동숨김 임계값
BEGIN
  PERFORM public.assert_admin();   -- is_admin AND NOT is_suspended (정지 관리자 차단)

  IF p_action NOT IN ('keep', 'remove', 'dismiss') THEN
    RAISE EXCEPTION '잘못된 액션: % (keep/remove/dismiss 중 하나)', p_action;
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 신고: %', p_report_id;
  END IF;

  -- L4: 이미 처리된 신고 재처리 차단(동시성 — 중복 감사로그/메일 방지)
  IF v_report.status <> 'pending' THEN
    RAISE EXCEPTION '이미 처리된 신고입니다 (상태: %)', v_report.status;
  END IF;

  IF p_action = 'keep' THEN
    v_new_status := 'reviewed_kept';
    -- M2 스코프: '신고 누적 자동 숨김'으로 숨겨진 것만 복원.
    IF v_report.target_type = 'video' THEN
      UPDATE public.videos SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    ELSIF v_report.target_type = 'comment' THEN
      UPDATE public.comments SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id::TEXT = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    ELSIF v_report.target_type = 'community_post' THEN
      UPDATE public.community_posts SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id::TEXT = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    ELSIF v_report.target_type = 'user' THEN
      -- M3: '유지=신고 기각'인데 정지된 사용자를 안 풀던 버그. 자동설정 사유 정지만 해제.
      UPDATE public.profiles SET is_suspended = false, suspended_reason = NULL, suspended_at = NULL
      WHERE id::TEXT = v_report.target_id AND suspended_reason = '반복된 가이드라인 위반';
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

  ELSE  -- dismiss (단건만 무효)
    UPDATE public.reports
    SET status = 'dismissed', reviewed_by = v_admin_id, reviewed_at = now(), admin_note = p_admin_note
    WHERE id = p_report_id;

    -- M1: 반려로 남은 pending 이 임계값 미만이 되면 '신고 누적' 자동숨김분 복원
    --     (악성 신고로 인한 정상 콘텐츠의 흔적 없는 영구 숨김 방지)
    SELECT COUNT(*) INTO v_pending FROM public.reports
    WHERE target_type = v_report.target_type AND target_id = v_report.target_id AND status = 'pending';
    v_threshold := COALESCE(public.get_platform_setting('auto_hide_threshold'), 3);
    IF v_pending < v_threshold THEN
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
    END IF;

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
REVOKE ALL ON FUNCTION public.moderate_report(BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.moderate_report(BIGINT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.moderate_report(BIGINT, TEXT, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- M4: reports 직접 SELECT 회수 — admin_note(비공개 메모) 신고자 유출 차단
--   조회는 관리자 get_pending_reports(DEFINER) / 신고자 get_my_reports(DEFINER, admin_note 제외)
--   로만. 프론트는 reports 를 직접 읽지 않음(전부 RPC 경유) → 안전.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE SELECT ON public.reports FROM anon;
REVOKE SELECT ON public.reports FROM authenticated;

COMMIT;

-- ── 검증 (선택) ──
-- 1) get_pending_reports 새 컬럼 반환 확인
SELECT 'get_pending_reports target_preview 컬럼' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.routines r
    JOIN information_schema.parameters pa ON pa.specific_name = r.specific_name
    WHERE r.routine_name = 'get_pending_reports' AND pa.parameter_name = 'target_preview'
  ) THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
-- 2) moderate_report 상태가드/복원 로직 반영 확인
SELECT 'moderate_report 상태가드' AS check_name,
  CASE WHEN (SELECT prosrc ~ '이미 처리된 신고' FROM pg_proc WHERE proname='moderate_report')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
-- 3) reports 직접 SELECT 회수 확인(둘 다 false 여야)
SELECT 'reports authenticated SELECT 차단' AS check_name,
  CASE WHEN NOT has_table_privilege('authenticated', 'public.reports', 'SELECT')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
