-- ════════════════════════════════════════════════════════════════════════════
-- 🚩 신고 큐 페이지네이션 (2026-07-19) — 1단계 / 데이터 유실 대응
--
--   get_pending_reports 가 LIMIT 없이 pending 신고 전량을 반환 → 신고가 쌓이면
--   관리자 화면이 전량 렌더(무한 스크롤). p_limit/p_offset 추가.
--
--   ★ 핵심 설계 — "행"이 아니라 "그룹(대상)" 단위로 페이지를 나눈다.
--     프론트(AdminReports)는 같은 대상(target_type:target_id)의 신고를 한 카드로 묶고,
--     처리 시 그 그룹의 모든 신고자에게 결과를 통지한다. 행 단위로 LIMIT 을 걸면
--     한 그룹이 페이지 경계에서 쪼개져
--       ① 대표 신고(group 마지막 = 최초 신고)가 뒤 페이지로 밀려 라벨이 틀어지고
--       ② 다른 페이지에 있는 신고자가 결과 통지에서 누락된다.
--     → 그룹을 먼저 LIMIT/OFFSET 으로 고른 뒤, 고른 그룹의 행은 전부 반환한다.
--
--   · 정렬: 그룹은 최신 신고순(latest DESC), 그룹 내부는 기존과 동일하게 created_at DESC
--     (프론트가 group[length-1] 을 '최초 신고' 대표로 씀 — 이 순서 유지가 계약).
--     동률 시 페이지 경계가 흔들리므로 tiebreaker(target_type, target_id) 추가.
--   · 유형 필터도 서버로 이동(p_target_type) — 페이지네이션 후 클라이언트 필터를 하면
--     "이 페이지에 영상 신고 2건"처럼 보여 필터가 무의미해짐.
--   · 유형별 개수는 전체 기준이어야 하므로 별도 count RPC 신설(get_pending_report_counts).
--   · 인자 추가 = 시그니처 변경. 무인자 호출과 모호해지므로 DROP 후 재생성.
--     신 인자 전부 DEFAULT 라 기존 무인자 호출도 그대로 동작.
--   · 본문(반환 13컬럼)은 reports_queue_enhance_20260718 과 동일 — 페이지네이션만 추가.
--     ★ 이 파일이 get_pending_reports 새 정본.
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 트랜잭션 원자화. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) get_pending_reports — 그룹 단위 p_limit/p_offset + 서버측 유형 필터 ──
DROP FUNCTION IF EXISTS public.get_pending_reports();
CREATE OR REPLACE FUNCTION public.get_pending_reports(
  p_target_type TEXT    DEFAULT NULL,   -- NULL/'all' = 전체, 'video'/'comment'/'user'/'community_post'
  p_limit       INTEGER DEFAULT 30,     -- 그룹(대상) 개수 기준
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
  v_type TEXT := NULLIF(NULLIF(p_target_type, 'all'), '');   -- 'all'/'' → NULL(전체)
BEGIN
  PERFORM public.assert_admin();   -- 비어드민 즉시 예외(신고자 PII 보호)
  RETURN QUERY
  WITH page_groups AS (
    -- 페이지에 포함할 "대상" 만 먼저 확정 (행이 아니라 그룹을 자른다)
    SELECT r.target_type AS g_type, r.target_id AS g_id, MAX(r.created_at) AS g_latest
    FROM public.reports r
    WHERE r.status = 'pending'
      AND (v_type IS NULL OR r.target_type = v_type)
    GROUP BY r.target_type, r.target_id
    ORDER BY MAX(r.created_at) DESC, r.target_type, r.target_id   -- tiebreaker: 안정 페이지네이션
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
    -- 대상 콘텐츠 스니펫(최대 200자) — 관리자가 무엇을 판정하는지 보이게
    LEFT(CASE r.target_type
      WHEN 'video'          THEN (SELECT v.title         FROM public.videos v           WHERE v.id::TEXT  = r.target_id)
      WHEN 'comment'        THEN (SELECT c.content       FROM public.comments c         WHERE c.id::TEXT  = r.target_id)
      WHEN 'community_post' THEN (SELECT cp.title        FROM public.community_posts cp WHERE cp.id::TEXT = r.target_id)
      WHEN 'user'           THEN (SELECT pr.display_name FROM public.profiles pr        WHERE pr.id::TEXT = r.target_id)
    END, 200) AS target_preview,
    -- 대상 실존 여부(고아 신고 표시용)
    CASE r.target_type
      WHEN 'video'          THEN NOT EXISTS (SELECT 1 FROM public.videos v           WHERE v.id::TEXT  = r.target_id)
      WHEN 'comment'        THEN NOT EXISTS (SELECT 1 FROM public.comments c         WHERE c.id::TEXT  = r.target_id)
      WHEN 'community_post' THEN NOT EXISTS (SELECT 1 FROM public.community_posts cp WHERE cp.id::TEXT = r.target_id)
      WHEN 'user'           THEN NOT EXISTS (SELECT 1 FROM public.profiles pr        WHERE pr.id::TEXT = r.target_id)
      ELSE false
    END AS target_deleted,
    -- 댓글 부모(딥링크 생성용) — 댓글이 아니면 NULL
    (SELECT c.video_id FROM public.comments c WHERE c.id::TEXT = r.target_id) AS comment_video_id,
    (SELECT c.post_id  FROM public.comments c WHERE c.id::TEXT = r.target_id) AS comment_post_id
  FROM public.reports r
  JOIN page_groups g ON g.g_type = r.target_type AND g.g_id = r.target_id
  LEFT JOIN public.profiles p ON p.id = r.reporter_id
  WHERE r.status = 'pending'
  -- 그룹은 최신순, 그룹 내부는 created_at DESC (프론트의 '최초 신고=마지막 원소' 계약 유지)
  ORDER BY g.g_latest DESC, r.target_type, r.target_id, r.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.get_pending_reports(TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_reports(TEXT, INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_reports(TEXT, INTEGER, INTEGER) TO authenticated;

-- ── 2) get_pending_report_counts — 유형별 "그룹" 개수(전체 기준) ──
--     페이지네이션 후엔 클라이언트가 전체 개수를 셀 수 없음 → 필터 배지용 count 를 서버에서.
CREATE OR REPLACE FUNCTION public.get_pending_report_counts()
RETURNS TABLE (
  target_type TEXT,
  group_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT t.target_type, COUNT(*)::BIGINT AS group_count
  FROM (
    SELECT r.target_type, r.target_id
    FROM public.reports r
    WHERE r.status = 'pending'
    GROUP BY r.target_type, r.target_id
  ) t
  GROUP BY t.target_type;
END;
$$;
REVOKE ALL ON FUNCTION public.get_pending_report_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_pending_report_counts() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_pending_report_counts() TO authenticated;

COMMIT;

-- ── 검증 (선택) ──
SELECT 'get_pending_reports 페이지네이션(3-arg)' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_pending_reports' AND pronargs=3)
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '구 무인자 get_pending_reports 제거(오버로드 모호성 방지)',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_pending_reports' AND pronargs=0)
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'get_pending_report_counts 생성',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_pending_report_counts')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'get_pending_reports anon 차단',
  CASE WHEN NOT has_function_privilege('anon',
    'public.get_pending_reports(text,integer,integer)', 'EXECUTE') THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'get_pending_report_counts anon 차단',
  CASE WHEN NOT has_function_privilege('anon',
    'public.get_pending_report_counts()', 'EXECUTE') THEN '✅ PASS' ELSE '🔴 FAIL' END;
