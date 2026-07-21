-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 크리에이터 광고통계 = 정산 기준 일치 (2026-07-21) — 표시 > 실제지급 해소
--
--   [결함] 마이페이지 판매 탭의 광고 수익 미리보기(노출·클릭·CTR·예상수익)가
--     정산 엔진과 **다른 기준으로 집계**해 크리에이터에게 실제보다 큰 금액을 보여줬다.
--
--       · 정산(calculate_monthly_revenue, F1 2026-07-11 'ad_impression_basis=paid_only'):
--           JOIN ads ad ON ad.id = e.ad_id
--           WHERE ad.budget_krw IS NOT NULL                       ← 유료광고만
--             AND e.occurred_at >= COALESCE(v.ad_eligibility_at, ...)  ← 적격시점 이후만
--       · 미리보기(get_creator_ad_stats, high_fixes_20260614 판):
--           ads 조인 자체가 없음 → **자체광고(house, budget_krw IS NULL) 포함 전량 집계**,
--           적격시점 게이트도 없음.
--
--     이 플랫폼은 자체광고(예: 자사/제휴 배너)를 실제로 운영하므로, 크리에이터 영상에
--     자체광고가 붙을 때마다 미리보기 수익만 부풀고 정산은 그만큼 안 나온다
--     → "표시된 예상수익이 실제로 안 들어온다"는 신뢰·CS 문제(구독 표시가=청구가와 같은 클래스).
--
--   [조치] 두 통계 함수에 정산 엔진과 **동일한 필터**를 적용:
--     ① ads 조인 + budget_krw IS NOT NULL (유료광고만)
--     ② occurred_at >= COALESCE(v.ad_eligibility_at, '1900-01-01') (적격시점 이후만)
--     IDOR 가드 `(p_creator_id = auth.uid() OR public.is_admin())` 는 그대로 유지
--     (보안 게이트 #13 이 prosrc 에 is_admin 존재를 확인하므로 제거 금지).
--
--   ★ 두 함수의 새 정본. high_fixes_20260614.sql / creator_ad_stats.sql 재실행 금지
--     (필터 없는 옛 판으로 되돌아가 다시 부풀려짐).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ① 크리에이터 전체 광고 통계 (판매 탭 상단 카드)
CREATE OR REPLACE FUNCTION public.get_creator_ad_stats(p_creator_id uuid DEFAULT auth.uid())
RETURNS TABLE(total_impressions bigint, total_clicks bigint, total_completes bigint, total_skips bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT
    COUNT(*) FILTER (WHERE e.event_type = 'impression')::BIGINT,
    COUNT(*) FILTER (WHERE e.event_type = 'click')::BIGINT,
    COUNT(*) FILTER (WHERE e.event_type = 'complete')::BIGINT,
    COUNT(*) FILTER (WHERE e.event_type = 'skip')::BIGINT
  FROM public.ad_video_events e
  JOIN public.videos v  ON v.id  = e.source_video_id
  JOIN public.ads    ad ON ad.id = e.ad_id
  WHERE (p_creator_id = auth.uid() OR public.is_admin())        -- IDOR 차단(게이트 #13)
    AND v.creator_id = p_creator_id
    AND ad.budget_krw IS NOT NULL                               -- 정산 기준: 유료광고만
    AND e.occurred_at >= COALESCE(v.ad_eligibility_at, '1900-01-01'::TIMESTAMPTZ);
$fn$;

-- ② 영상별 광고 통계 (등록 상품 행 + tier 가중 예상수익 계산)
CREATE OR REPLACE FUNCTION public.get_creator_ad_stats_by_video(p_creator_id uuid DEFAULT auth.uid())
RETURNS TABLE(video_id text, impressions bigint, clicks bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT
    e.source_video_id::TEXT AS video_id,
    COUNT(*) FILTER (WHERE e.event_type = 'impression')::BIGINT,
    COUNT(*) FILTER (WHERE e.event_type = 'click')::BIGINT
  FROM public.ad_video_events e
  JOIN public.videos v  ON v.id  = e.source_video_id
  JOIN public.ads    ad ON ad.id = e.ad_id
  WHERE (p_creator_id = auth.uid() OR public.is_admin())        -- IDOR 차단(게이트 #13)
    AND v.creator_id = p_creator_id
    AND ad.budget_krw IS NOT NULL                               -- 정산 기준: 유료광고만
    AND e.occurred_at >= COALESCE(v.ad_eligibility_at, '1900-01-01'::TIMESTAMPTZ)
  GROUP BY e.source_video_id;
$fn$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '유료광고 기준(budget_krw) 적용' AS check_name,
  CASE WHEN (SELECT bool_and(prosrc ~ 'budget_krw') FROM pg_proc
             WHERE proname IN ('get_creator_ad_stats','get_creator_ad_stats_by_video'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '적격시점 게이트(ad_eligibility_at) 적용',
  CASE WHEN (SELECT bool_and(prosrc ~ 'ad_eligibility_at') FROM pg_proc
             WHERE proname IN ('get_creator_ad_stats','get_creator_ad_stats_by_video'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'IDOR 가드(is_admin) 유지 — 게이트 #13',
  CASE WHEN (SELECT bool_and(prosrc ~ 'is_admin') FROM pg_proc
             WHERE proname IN ('get_creator_ad_stats','get_creator_ad_stats_by_video'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
