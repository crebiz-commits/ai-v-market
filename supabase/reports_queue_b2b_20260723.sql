-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 신고 큐에 b2b_post 분기 보강 (2026-07-23 전체감사, 커뮤니티 모더레이션)  [정정판 v2]
--
--   [중] b2b_partnership_board_20260723 은 create_report 에만 b2b_post 분기(임계 자동숨김)를
--        넣었고, moderate_report(관리자 수동 keep/remove)·get_pending_reports(큐 preview/삭제
--        여부)에는 b2b_post 분기가 없었다. b2b_posts.is_hidden 은 컬럼잠금이라 관리자가 신고를
--        'remove' 처리해도 report status 만 바뀌고 **글은 안 숨겨졌고**, 큐엔 내용(title)도
--        안 떠 판단 불가였다(자동숨김↔수동모더레이션 비대칭).
--
--   ★ v2 정정: get_pending_reports 정본은 **3-arg 페이지네이션판**(reports_queue_pagination_
--     20260719.sql, 프론트 AdminReports 가 호출). v1 이 실수로 옛 0-arg 판을 되살려 b2b 를
--     거기 넣었으나 그건 미사용 → 이 v2 는 **3-arg 정본에 b2b_post 를 추가**한다(0-arg 은 안 만듦).
--     moderate_report(BIGINT,TEXT,TEXT)는 단일 시그니처라 그대로 + b2b 분기.
--     반환 시그니처·페이지네이션·그룹정렬 전부 정본과 동일 유지. DEFINER 라 b2b is_hidden
--     컬럼잠금 무관 갱신. ★두 함수 새 정본. reports_queue_pagination_20260719·
--     reports_queue_enhance_20260718 의 두 함수 재실행 금지(b2b 분기 소실).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── get_pending_reports (3-arg 페이지네이션 정본 + preview/deleted 에 b2b_post) ──
CREATE OR REPLACE FUNCTION public.get_pending_reports(
  p_target_type TEXT    DEFAULT NULL,
  p_limit       INTEGER DEFAULT 30,
  p_offset      INTEGER DEFAULT 0
)
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
DECLARE
  v_type TEXT := NULLIF(NULLIF(p_target_type, 'all'), '');
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  WITH page_groups AS (
    SELECT r.target_type AS g_type, r.target_id AS g_id, MAX(r.created_at) AS g_latest
    FROM public.reports r
    WHERE r.status = 'pending'
      AND (v_type IS NULL OR r.target_type = v_type)
    GROUP BY r.target_type, r.target_id
    ORDER BY MAX(r.created_at) DESC, r.target_type, r.target_id
    LIMIT p_limit OFFSET p_offset
  )
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
    LEFT(CASE r.target_type
      WHEN 'video'          THEN (SELECT v.title         FROM public.videos v           WHERE v.id::TEXT  = r.target_id)
      WHEN 'comment'        THEN (SELECT c.content       FROM public.comments c         WHERE c.id::TEXT  = r.target_id)
      WHEN 'community_post' THEN (SELECT cp.title        FROM public.community_posts cp WHERE cp.id::TEXT = r.target_id)
      WHEN 'b2b_post'       THEN (SELECT b.title         FROM public.b2b_posts b        WHERE b.id::TEXT  = r.target_id)
      WHEN 'user'           THEN (SELECT pr.display_name FROM public.profiles pr        WHERE pr.id::TEXT = r.target_id)
    END, 200) AS target_preview,
    CASE r.target_type
      WHEN 'video'          THEN NOT EXISTS (SELECT 1 FROM public.videos v           WHERE v.id::TEXT  = r.target_id)
      WHEN 'comment'        THEN NOT EXISTS (SELECT 1 FROM public.comments c         WHERE c.id::TEXT  = r.target_id)
      WHEN 'community_post' THEN NOT EXISTS (SELECT 1 FROM public.community_posts cp WHERE cp.id::TEXT = r.target_id)
      WHEN 'b2b_post'       THEN NOT EXISTS (SELECT 1 FROM public.b2b_posts b        WHERE b.id::TEXT  = r.target_id)
      WHEN 'user'           THEN NOT EXISTS (SELECT 1 FROM public.profiles pr        WHERE pr.id::TEXT = r.target_id)
      ELSE false
    END AS target_deleted,
    (SELECT c.video_id FROM public.comments c WHERE c.id::TEXT = r.target_id) AS comment_video_id,
    (SELECT c.post_id  FROM public.comments c WHERE c.id::TEXT = r.target_id) AS comment_post_id
  FROM public.reports r
  JOIN page_groups g ON g.g_type = r.target_type AND g.g_id = r.target_id
  LEFT JOIN public.profiles p ON p.id = r.reporter_id
  WHERE r.status = 'pending'
  ORDER BY g.g_latest DESC, r.target_type, r.target_id, r.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_pending_reports(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_reports(TEXT, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_reports(TEXT, INTEGER, INTEGER) TO authenticated;

-- ── moderate_report (keep/remove/dismiss 에 b2b_post 분기 추가) ────────────────
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
  v_pending    INTEGER;
  v_threshold  NUMERIC;
BEGIN
  PERFORM public.assert_admin();

  IF p_action NOT IN ('keep', 'remove', 'dismiss') THEN
    RAISE EXCEPTION '잘못된 액션: % (keep/remove/dismiss 중 하나)', p_action;
  END IF;

  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 신고: %', p_report_id;
  END IF;

  IF v_report.status <> 'pending' THEN
    RAISE EXCEPTION '이미 처리된 신고입니다 (상태: %)', v_report.status;
  END IF;

  IF p_action = 'keep' THEN
    v_new_status := 'reviewed_kept';
    IF v_report.target_type = 'video' THEN
      UPDATE public.videos SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    ELSIF v_report.target_type = 'comment' THEN
      UPDATE public.comments SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id::TEXT = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    ELSIF v_report.target_type = 'community_post' THEN
      UPDATE public.community_posts SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id::TEXT = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    ELSIF v_report.target_type = 'b2b_post' THEN
      UPDATE public.b2b_posts SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id::TEXT = v_report.target_id AND hidden_reason LIKE '신고 누적%';
    ELSIF v_report.target_type = 'user' THEN
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
    ELSIF v_report.target_type = 'b2b_post' THEN
      UPDATE public.b2b_posts SET is_hidden = true,
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
      ELSIF v_report.target_type = 'b2b_post' THEN
        UPDATE public.b2b_posts SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
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

-- ── 검증 (오버로드 안전 — 시그니처 특정) ──
SELECT 'get_pending_reports(3-arg) b2b_post 분기' AS check_name,
  CASE WHEN pg_get_functiondef(to_regprocedure('public.get_pending_reports(text,integer,integer)')) ~ 'b2b_post'
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '구 0-arg get_pending_reports 미부활(오버로드 모호성 방지)',
  CASE WHEN to_regprocedure('public.get_pending_reports()') IS NULL
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'moderate_report b2b_post keep/remove/dismiss 분기',
  CASE WHEN (SELECT count(*) FROM regexp_matches(
               pg_get_functiondef(to_regprocedure('public.moderate_report(bigint,text,text)')), 'b2b_post', 'g')) >= 3
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
