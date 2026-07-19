-- ════════════════════════════════════════════════════════════════════════════
-- 💰 마이페이지 주문 상태 필터 (2026-07-19) — 표시액 = 정산액 정합
--
--   [문제] 마이페이지가 orders 에 status 필터를 걸지 않아 결제 실패·취소·환불된 주문까지
--     "총매출"·"총 구매 금액"에 포함됐다. 정산(calculate_monthly_revenue)은 status='completed'
--     만 집계하므로 **화면 표시액 > 실제 정산액** 이 되어 크리에이터 분쟁 소지.
--     구독 가격의 "표시=청구" 원칙과 동일하게 "표시=정산" 으로 맞춘다.
--
--   orders.status 허용값: pending / completed / refunded / failed / cancelled
--     · 환불 시 admin_refund_payment 가 completed → 'refunded' 로 전이시킨다.
--     · 즉 refunded = 돈이 나갔다 돌아온 건 → 매출·지출 어느 쪽에도 잡히면 안 됨.
--
--   ★ 적용 기준을 구매자/크리에이터로 나눈다 (같은 필터를 양쪽에 걸면 안 됨)
--     · 크리에이터 매출(판매수·총매출·영상별매출·월별차트) → completed 만.
--     · 구매자 목록(구매내역)                              → completed + refunded.
--       환불건도 "내 거래 기록"이라 남긴다(전자상거래 거래내역 제공 측면에서도 안전).
--       단 금액 합계(total_amount)와 보유 수(purchase_count)는 completed 만 —
--       환불받은 돈은 지출이 아니고, 환불된 라이선스는 보유가 아니기 때문.
--       pending/failed/cancelled 는 "구매"가 아니라 중단된 시도라 목록에서 제외.
--
--   ▣ 보안 구멍은 아니었음(확인함): 다운로드 게이트 log_download 는 이미 본문에서
--     `o.status = 'completed'` 를 검증한다. 환불건은 서버가 정상 차단하고 있었고,
--     화면에만 다운로드 버튼이 떠서 누르면 "권한 없음" 이 나던 UX 결함.
--
--   ▣ 지금 적용하는 이유: orders 실데이터 0건(결제 게이트 미개통) → 바뀌는 숫자가 없다.
--     실주문이 쌓인 뒤 고치면 크리에이터 화면 매출이 "내려가는" 변경이 되어 설명이 필요해짐.
--
--   본문은 mypage_pagination_20260719.sql 과 동일, WHERE 절의 status 조건만 추가.
--   ★ 이 파일이 4종 새 정본(mypage_pagination_20260719.sql 재실행 금지 = 필터 소실).
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 트랜잭션 원자화. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) get_my_purchases — 구매내역 (completed + refunded, 상태 그대로 반환) ──
CREATE OR REPLACE FUNCTION public.get_my_purchases(
  p_limit  INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  video_id      TEXT,
  title         TEXT,
  thumbnail     TEXT,
  license_type  TEXT,
  amount        INTEGER,
  status        TEXT,
  created_at    TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  RETURN QUERY
  SELECT
    o.id, o.video_id, v.title, v.thumbnail,
    o.license_type, o.amount::INTEGER, o.status, o.created_at
  FROM public.orders o
  LEFT JOIN public.videos v ON v.id = o.video_id
  WHERE o.buyer_id = auth.uid()
    AND o.status IN ('completed', 'refunded')   -- 중단된 시도(pending/failed/cancelled) 제외
  ORDER BY o.created_at DESC, o.id
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;

-- ── 2) get_my_purchase_summary — 보유 수·실지출 (completed 만) ──
--   ⚠️ 이 함수만 반환 컬럼이 늘어난다(refunded_count 추가) → CREATE OR REPLACE 로는 불가.
--      "cannot change return type of existing function (42P13)" 이 나므로 DROP 후 재생성.
--      나머지 3종은 반환 시그니처가 그대로라 REPLACE 로 충분(권한도 보존).
--      DROP 은 권한을 초기화하지만 아래에서 REVOKE/GRANT 를 명시적으로 다시 건다.
DROP FUNCTION IF EXISTS public.get_my_purchase_summary();
CREATE OR REPLACE FUNCTION public.get_my_purchase_summary()
RETURNS TABLE (
  purchase_count INTEGER,
  total_amount   BIGINT,
  refunded_count INTEGER   -- 목록엔 보이지만 위 두 값에선 빠진 건수(설명용)
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE o.status = 'completed')::INTEGER,
    COALESCE(SUM(o.amount) FILTER (WHERE o.status = 'completed'), 0)::BIGINT,
    COUNT(*) FILTER (WHERE o.status = 'refunded')::INTEGER
  FROM public.orders o
  WHERE o.buyer_id = auth.uid();
END;
$fn$;

-- ── 3) get_my_creator_products — 영상별 판매/매출 (completed 만 = 정산 기준) ──
CREATE OR REPLACE FUNCTION public.get_my_creator_products(
  p_limit  INTEGER DEFAULT 30,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id           TEXT,
  thumbnail    TEXT,
  title        TEXT,
  likes        INTEGER,
  sales_count  INTEGER,
  revenue      BIGINT,
  status       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  RETURN QUERY
  SELECT
    v.id, v.thumbnail, v.title,
    COALESCE(NULLIF(regexp_replace(COALESCE(v.likes::TEXT, '0'), '[^0-9]', '', 'g'), '')::INTEGER, 0),
    COALESCE(s.cnt, 0)::INTEGER,
    COALESCE(s.sum_amount, 0)::BIGINT,
    v.status
  FROM public.videos v
  LEFT JOIN (
    SELECT o.video_id, COUNT(*) AS cnt, SUM(o.amount) AS sum_amount
    FROM public.orders o
    WHERE o.seller_id = auth.uid()
      AND o.status = 'completed'   -- 정산(calculate_monthly_revenue)과 동일 기준
    GROUP BY o.video_id
  ) s ON s.video_id = v.id
  WHERE v.creator_id = auth.uid()
  ORDER BY v.created_at DESC, v.id
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;

-- ── 4) get_my_creator_summary — 합계·월별차트·tier맵 (매출은 completed 만) ──
CREATE OR REPLACE FUNCTION public.get_my_creator_summary()
RETURNS TABLE (
  video_count    INTEGER,
  total_sales    INTEGER,
  total_revenue  BIGINT,
  total_likes    BIGINT,
  monthly_sales  JSONB,
  video_tiers    JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  RETURN QUERY
  WITH my_videos AS (
    SELECT v.id, v.show_on_ott, v.show_on_cinema,
           COALESCE(NULLIF(regexp_replace(COALESCE(v.likes::TEXT, '0'), '[^0-9]', '', 'g'), '')::INTEGER, 0) AS likes_n
    FROM public.videos v
    WHERE v.creator_id = v_uid
  ),
  my_orders AS (
    SELECT o.amount, o.created_at
    FROM public.orders o
    WHERE o.seller_id = v_uid
      AND o.status = 'completed'   -- 정산과 동일 기준(환불·실패·취소 제외)
  ),
  monthly AS (
    SELECT to_char(o.created_at AT TIME ZONE 'Asia/Seoul', 'YYYY-MM') AS ym,
           COALESCE(SUM(o.amount), 0)::BIGINT AS sales
    FROM my_orders o
    GROUP BY 1
  )
  SELECT
    (SELECT COUNT(*) FROM my_videos)::INTEGER,
    (SELECT COUNT(*) FROM my_orders)::INTEGER,
    (SELECT COALESCE(SUM(amount), 0) FROM my_orders)::BIGINT,
    (SELECT COALESCE(SUM(likes_n), 0) FROM my_videos)::BIGINT,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object('month', m.ym, 'sales', m.sales) ORDER BY m.ym)
      FROM monthly m
    ), '[]'::JSONB),
    COALESCE((
      SELECT jsonb_object_agg(
               mv.id,
               CASE WHEN mv.show_on_ott THEN 'ott'
                    WHEN mv.show_on_cinema THEN 'cinema'
                    ELSE 'home' END)
      FROM my_videos mv
    ), '{}'::JSONB);
END;
$fn$;

-- 권한 재확인(CREATE OR REPLACE 는 권한을 유지하지만 멱등하게 명시)
REVOKE ALL ON FUNCTION public.get_my_purchases(INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_purchase_summary() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_creator_products(INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_creator_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_purchases(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_purchase_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_creator_products(INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_creator_summary() TO authenticated;

COMMIT;

-- ── 검증 (선택) ──
SELECT '구매내역 = completed + refunded' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'refunded' AND prosrc ~ 'completed'
             FROM pg_proc WHERE proname='get_my_purchases')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '구매 합계 = completed 만(+환불건수 반환)',
  CASE WHEN (SELECT pronargs=0 AND pg_get_function_result(oid) ILIKE '%refunded_count%'
             FROM pg_proc WHERE proname='get_my_purchase_summary')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '영상별 매출 = completed 만',
  CASE WHEN (SELECT prosrc ~ 'completed' FROM pg_proc WHERE proname='get_my_creator_products')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '크리에이터 합계·차트 = completed 만',
  CASE WHEN (SELECT prosrc ~ 'completed' FROM pg_proc WHERE proname='get_my_creator_summary')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '4종 anon 차단 유지',
  CASE WHEN NOT has_function_privilege('anon','public.get_my_purchases(integer,integer)','EXECUTE')
   AND NOT has_function_privilege('anon','public.get_my_purchase_summary()','EXECUTE')
   AND NOT has_function_privilege('anon','public.get_my_creator_products(integer,integer)','EXECUTE')
   AND NOT has_function_privilege('anon','public.get_my_creator_summary()','EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '다운로드 게이트(log_download) completed 검증 유지',
  CASE WHEN (SELECT bool_and(prosrc ~ 'completed') FROM pg_proc WHERE proname='log_download')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
