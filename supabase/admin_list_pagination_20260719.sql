-- ════════════════════════════════════════════════════════════════════════════
-- 🗂️ 관리자 목록 RPC 6종 페이지네이션 (2026-07-19) — 3단계 마무리
--
--   6종 전부 LIMIT 없이 전량 반환 → 관리자 화면이 끝없이 스크롤됨.
--   p_limit/p_offset 추가 + 안정 정렬 tiebreaker + 화면 합계용 집계 컬럼.
--
--   ★ 라이브 본문 확인 후 작성 (저장소 본문으로 맹목 덮어쓰기 아님)
--     _diag_admin_list_rpcs_20260719.sql 실행 결과 — 6종 모두 줄바꿈제거 md5 가
--     아래 정본과 일치, has_assert_admin=true, sec_definer=true, overloads=1:
--       get_revenue_distributions_by_period 672 30827788… ← fix_revenue_period_guard_20260625
--       admin_list_clawbacks                421 2e06daa6… ← settlement_clawbacks_20260711
--       admin_list_pending_ads              390 41463722… ← advertiser_self_service_phase4_…_20260614
--       admin_list_sponsored_videos         846 926d80cd… ← admin_sponsorship_review_20260711
--       admin_list_upload_milestones        704 2d607722… ← admin_mega_uploader_vet_20260717
--       get_platform_setting_history        348 020390d8… ← reaudit_hardening_20260625
--     → 되돌림 위험 0. 조회 로직·반환 컬럼은 100% 보존하고 페이지네이션만 얹었다.
--     ★ 이 파일이 6종 새 정본. 위 원본 파일들의 해당 함수 재실행 금지(페이지네이션이 사라짐).
--
--   ▣ 화면 숫자가 틀어지지 않게 함께 넣은 것 — 합계가 목록 위에 얹혀 있기 때문:
--       AdminRevenueSettlement:262-264  rows.filter().reduce() → 상태별 정산 합계
--       AdminMegaUploader:79-80         items.filter()         → 대기 건수 + 탭 필터
--       AdminAdReview:58                ads.length             → "N건 대기"
--       AdminSponsorships / AdminRevenuePolicy → 페이저용 총건수
--     각 함수에 total_count(윈도우 COUNT(*) OVER()) 를 추가. 윈도우는 LIMIT 적용 **전**
--     결과집합에서 계산되므로 페이지를 잘라도 전체 건수가 정확하다.
--     · 정산: 상태별 합계 3종도 윈도우 FILTER 로 함께 반환(기간 전체 기준).
--     · 마일스톤: 탭 필터를 서버로 옮기고(p_status), '대기' 배지는 필터와 무관해야 하므로
--       윈도우가 아닌 별도 서브쿼리로 전체 pending 을 센다.
--
--   ▣ 시그니처 변경 = DROP 후 재생성 → **권한이 초기화된다.**
--     아래 3개는 본문 없이 GRANT/REVOKE 만 하던 하드닝 파일이라 여기서 반드시 복원:
--       admin_ad_review_hardening_20260717.sql       → admin_list_pending_ads
--       fix_video_guard_sponsor_20260718.sql         → admin_list_sponsored_videos
--       admin_mega_uploader_status_log_20260716.sql  → admin_list_upload_milestones
--     6종 모두 REVOKE PUBLIC/anon + GRANT authenticated 로 통일(본문 assert_admin 과 이중 방어).
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 트랜잭션 원자화. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) get_revenue_distributions_by_period — 정산 분배 (크리에이터 수 × 월로 증가) ──
DROP FUNCTION IF EXISTS public.get_revenue_distributions_by_period(INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.get_revenue_distributions_by_period(
  p_year   INTEGER,
  p_month  INTEGER,
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id bigint, creator_id uuid, creator_name text, sale_revenue integer, ad_revenue integer,
  subscription_revenue integer, total_revenue integer, payout_status text,
  paid_at timestamp with time zone, tax_withholding integer, net_amount integer,
  tax_type_snapshot text, payout_bank text, payout_account text, payout_holder text,
  -- 화면 합계용(기간 전체 기준, LIMIT 무관)
  total_count bigint, sum_pending bigint, sum_deferred bigint, sum_paid bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  PERFORM public.assert_admin();   -- 관리자만 (전 크리에이터 계좌번호 노출 방지)
  RETURN QUERY
  SELECT rd.id, rd.creator_id, p.display_name,
         rd.sale_revenue, rd.ad_revenue, rd.subscription_revenue, rd.total_revenue,
         rd.payout_status, rd.paid_at,
         rd.tax_withholding, rd.net_amount, rd.tax_type_snapshot,
         p.payout_info->>'bank_name'      AS payout_bank,
         p.payout_info->>'account_number' AS payout_account,
         p.payout_info->>'account_holder' AS payout_holder,
         COUNT(*) OVER ()::BIGINT,
         COALESCE(SUM(rd.total_revenue) FILTER (WHERE rd.payout_status = 'pending')  OVER (), 0)::BIGINT,
         COALESCE(SUM(rd.total_revenue) FILTER (WHERE rd.payout_status = 'deferred') OVER (), 0)::BIGINT,
         COALESCE(SUM(rd.total_revenue) FILTER (WHERE rd.payout_status = 'paid')     OVER (), 0)::BIGINT
  FROM public.revenue_distributions rd
  LEFT JOIN public.profiles p ON p.id = rd.creator_id
  WHERE rd.period_start = make_date(p_year, p_month, 1)
  ORDER BY rd.total_revenue DESC, rd.id   -- tiebreaker: 동액 다수 시 페이지 경계 안정
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_revenue_distributions_by_period(INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_revenue_distributions_by_period(INTEGER, INTEGER, INTEGER, INTEGER) TO authenticated;

-- ── 2) admin_list_clawbacks — 클로백(회수) 대기 ──
DROP FUNCTION IF EXISTS public.admin_list_clawbacks(TEXT);
CREATE OR REPLACE FUNCTION public.admin_list_clawbacks(
  p_status TEXT    DEFAULT 'pending',
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id BIGINT, creator_id UUID, creator_name TEXT, period_start DATE,
  amount INTEGER, source_type TEXT, source_ref TEXT, reason TEXT,
  status TEXT, note TEXT, created_at TIMESTAMPTZ, resolved_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT c.id, c.creator_id, p.display_name, c.period_start,
         c.amount, c.source_type, c.source_ref, c.reason,
         c.status, c.note, c.created_at, c.resolved_at,
         COUNT(*) OVER ()::BIGINT
  FROM public.settlement_clawbacks c
  LEFT JOIN public.profiles p ON p.id = c.creator_id
  WHERE (p_status = 'all' OR c.status = p_status)
  ORDER BY (c.status = 'pending') DESC, c.created_at DESC, c.id   -- tiebreaker
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_list_clawbacks(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_clawbacks(TEXT, INTEGER, INTEGER) TO authenticated;

-- ── 3) admin_list_pending_ads — 광고 승인 대기 ──
--     (권한 하드닝 출처: admin_ad_review_hardening_20260717.sql — DROP 로 초기화되므로 여기서 복원)
DROP FUNCTION IF EXISTS public.admin_list_pending_ads();
CREATE OR REPLACE FUNCTION public.admin_list_pending_ads(
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE(
  id uuid, owner_id uuid, owner_name text, title text, advertiser text, format text,
  ad_type text, image_url text, video_url text, thumbnail_url text, link_url text,
  cta_text text, submitted_at timestamptz, created_at timestamptz,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT a.id, a.owner_id, p.display_name, a.title, a.advertiser, a.format, a.ad_type,
         a.image_url, a.video_url, a.thumbnail_url, a.link_url, a.cta_text, a.submitted_at, a.created_at,
         COUNT(*) OVER ()::BIGINT
  FROM public.ads a
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  WHERE a.status = 'pending_review'
  ORDER BY a.submitted_at ASC NULLS LAST, a.id   -- tiebreaker
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_list_pending_ads(INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_ads(INTEGER, INTEGER) TO authenticated;

-- ── 4) admin_list_sponsored_videos — 협찬 표시 심사 ──
--     (권한 하드닝 출처: fix_video_guard_sponsor_20260718.sql — 여기서 복원)
DROP FUNCTION IF EXISTS public.admin_list_sponsored_videos(TEXT);
CREATE OR REPLACE FUNCTION public.admin_list_sponsored_videos(
  p_filter TEXT    DEFAULT 'pending',
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                    TEXT,
  title                 TEXT,
  thumbnail             TEXT,
  creator_id            UUID,
  creator_name          TEXT,
  sponsor_brand         TEXT,
  sponsor_logo_url      TEXT,
  sponsor_disclosure    TEXT,
  sponsor_link_url      TEXT,
  sponsor_review_status TEXT,
  sponsor_reviewed_at   TIMESTAMPTZ,
  sponsor_review_note   TEXT,
  is_hidden             BOOLEAN,
  created_at            TIMESTAMPTZ,
  total_count           BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.creator_id, p.display_name,
    v.sponsor_brand, v.sponsor_logo_url, v.sponsor_disclosure, v.sponsor_link_url,
    v.sponsor_review_status, v.sponsor_reviewed_at, v.sponsor_review_note,
    COALESCE(v.is_hidden, false), v.created_at,
    COUNT(*) OVER ()::BIGINT
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE v.sponsor_brand IS NOT NULL AND btrim(v.sponsor_brand) <> ''
    AND (
      p_filter = 'all'
      OR (p_filter = 'pending'  AND (v.sponsor_review_status IS NULL OR v.sponsor_review_status = 'pending'))
      OR (p_filter = 'approved' AND v.sponsor_review_status = 'approved')
      OR (p_filter = 'rejected' AND v.sponsor_review_status = 'rejected')
    )
  ORDER BY (v.sponsor_review_status IS NULL) DESC, v.created_at DESC, v.id   -- 미검수 우선 + tiebreaker
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_list_sponsored_videos(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_sponsored_videos(TEXT, INTEGER, INTEGER) TO authenticated;

-- ── 5) admin_list_upload_milestones — 업로드 마일스톤(쿠폰 지급) ──
--     탭 필터가 클라이언트였음(AdminMegaUploader:80) → p_status 로 서버 이동.
--     '대기' 배지는 필터와 무관한 전체 기준이라 윈도우가 아닌 별도 서브쿼리로 집계.
--     (권한 하드닝 출처: admin_mega_uploader_status_log_20260716.sql — 여기서 복원)
DROP FUNCTION IF EXISTS public.admin_list_upload_milestones();
CREATE OR REPLACE FUNCTION public.admin_list_upload_milestones(
  p_status TEXT    DEFAULT 'all',
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id uuid, user_id uuid, milestone int, video_count int, status text,
  note text, created_at timestamptz, rewarded_at timestamptz,
  creator_name text, creator_email text, current_visible int,
  -- total_count = 현재 필터 기준(페이저용). pending_total·all_total = 필터 무관 전체(탭 배지용)
  total_count bigint, pending_total bigint, all_total bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  -- auth.users.email 은 varchar 라 text 캐스팅(RETURNS TABLE 시그니처 일치)
  SELECT m.id, m.user_id, m.milestone, m.video_count, m.status::text,
         m.note, m.created_at, m.rewarded_at,
         COALESCE(NULLIF(p.display_name, ''), split_part(u.email::text, '@', 1), '크리에이터')::text,
         u.email::text,
         (SELECT COUNT(*)::int FROM public.videos v
            WHERE v.creator_id = m.user_id
              AND COALESCE(v.is_hidden, false) = false) AS current_visible,
         COUNT(*) OVER ()::BIGINT,
         (SELECT COUNT(*) FROM public.upload_milestones m2 WHERE m2.status = 'pending')::BIGINT,
         (SELECT COUNT(*) FROM public.upload_milestones m3)::BIGINT
  FROM public.upload_milestones m
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE (p_status = 'all' OR m.status = p_status)
  ORDER BY (m.status = 'pending') DESC, m.created_at DESC, m.id   -- tiebreaker
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_list_upload_milestones(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_upload_milestones(TEXT, INTEGER, INTEGER) TO authenticated;

-- ── 6) get_platform_setting_history — 정책 변경 이력(append-only 로 영구 누적) ──
DROP FUNCTION IF EXISTS public.get_platform_setting_history(TEXT);
CREATE OR REPLACE FUNCTION public.get_platform_setting_history(
  p_key    TEXT    DEFAULT NULL,
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id BIGINT, key TEXT, value NUMERIC, effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ, note TEXT, updated_by UUID, updater_name TEXT,
  total_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp
AS $fn$
#variable_conflict use_column
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT s.id, s.key, s.value, s.effective_from, s.effective_to, s.note, s.updated_by, p.display_name,
         COUNT(*) OVER ()::BIGINT
  FROM public.platform_settings s
  LEFT JOIN public.profiles p ON p.id = s.updated_by
  WHERE p_key IS NULL OR s.key = p_key
  ORDER BY s.key, s.effective_from DESC, s.id   -- tiebreaker
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_platform_setting_history(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_setting_history(TEXT, INTEGER, INTEGER) TO authenticated;

COMMIT;

-- ── 검증 (선택) ──
SELECT '① get_revenue_distributions_by_period 4-arg' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_revenue_distributions_by_period' AND pronargs=4)
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL SELECT '② admin_list_clawbacks 3-arg',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_list_clawbacks' AND pronargs=3) THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL SELECT '③ admin_list_pending_ads 2-arg',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_list_pending_ads' AND pronargs=2) THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL SELECT '④ admin_list_sponsored_videos 3-arg',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_list_sponsored_videos' AND pronargs=3) THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL SELECT '⑤ admin_list_upload_milestones 3-arg',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='admin_list_upload_milestones' AND pronargs=3) THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL SELECT '⑥ get_platform_setting_history 3-arg',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_platform_setting_history' AND pronargs=3) THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL SELECT '구 시그니처 6종 모두 제거(오버로드 모호성 방지)',
  CASE WHEN (SELECT count(*) FROM pg_proc WHERE
      (proname='get_revenue_distributions_by_period' AND pronargs=2)
   OR (proname='admin_list_clawbacks'                AND pronargs=1)
   OR (proname='admin_list_pending_ads'              AND pronargs=0)
   OR (proname='admin_list_sponsored_videos'         AND pronargs=1)
   OR (proname='admin_list_upload_milestones'        AND pronargs=0)
   OR (proname='get_platform_setting_history'        AND pronargs=1)) = 0
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL SELECT '6종 assert_admin 게이트 유지',
  CASE WHEN (SELECT bool_and(prosrc ~ 'assert_admin') FROM pg_proc WHERE proname IN
      ('get_revenue_distributions_by_period','admin_list_clawbacks','admin_list_pending_ads',
       'admin_list_sponsored_videos','admin_list_upload_milestones','get_platform_setting_history'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL SELECT '6종 anon 차단(하드닝 복원 확인)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('get_revenue_distributions_by_period','admin_list_clawbacks','admin_list_pending_ads',
       'admin_list_sponsored_videos','admin_list_upload_milestones','get_platform_setting_history')
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL SELECT '6종 authenticated 실행 가능(관리자 화면 동작)',
  CASE WHEN (
    SELECT bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('get_revenue_distributions_by_period','admin_list_clawbacks','admin_list_pending_ads',
       'admin_list_sponsored_videos','admin_list_upload_milestones','get_platform_setting_history'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
