-- ════════════════════════════════════════════════════════════════════════════
-- 👤 마이페이지 구매내역·내 영상 페이지네이션 (2026-07-19) — 3단계
--
--   [문제] 두 목록 다 LIMIT 없이 전량 조회.
--     · 구매내역: orders 전량 (+ videos 조인)
--     · 내 영상: videos 전량 × 각 영상의 orders 전량 조인 → 판매가 쌓이면 페이로드 폭증
--
--   ★ 목록만 자르면 화면 숫자가 조용히 틀어진다 — 합계가 목록 위에 얹혀 있기 때문:
--       MyPage.tsx:1603  purchaseHistory.reduce()  → 총 구매액
--       MyPage.tsx:998-1000 myProducts.reduce()    → 총매출·판매수·좋아요
--       MyPage.tsx:744-752  videoData.forEach()    → 월별 매출 차트
--       MyPage.tsx:735-741  tierMap                → 광고 분배율 가중평균(전 영상 필요)
--     PostgREST 집계함수는 이 프로젝트에서 비활성(`Use of aggregate functions is not allowed`)
--     → 합계·차트·tier맵을 서버 RPC 로 분리하고, 목록만 페이지네이션한다.
--
--   ▣ 보안 — 전부 "내 데이터" 전용. p_user_id 같은 인자를 두지 않고 auth.uid() 내부 사용
--     (IDOR 차단). SECURITY DEFINER 는 RLS 를 우회하므로 기존 RLS 와 동일 범위를 본문에서 재현:
--       orders RLS = USING (auth.uid() = buyer_id OR auth.uid() = seller_id)  ← status 필터 없음
--       → 구매 = buyer_id = auth.uid() / 크리에이터 매출 = seller_id = auth.uid()
--
--   ⚠️ 기존 동작 그대로 유지한 것(이번 변경으로 숫자가 바뀌지 않게):
--     · orders 에 status 필터를 걸지 않는다. 현재 프론트도 안 걸고 있어 취소·실패 주문이
--       구매내역과 "총매출"에 포함된다. **정산(calculate_monthly_revenue)은 status='completed'
--       만 세므로 마이페이지 표시액 > 실제 정산액 일 수 있다.** 이건 이번 작업(페이지네이션)의
--       범위 밖이라 손대지 않았다 — 별건으로 판단 필요(금액 표시가 바뀌는 변경이라 임의 수정 금지).
--
--   변경점: 월별 차트 집계 기준이 브라우저 로컬 타임존 → **KST(Asia/Seoul)**.
--     정산 SSOT(calculate_monthly_revenue·admin_dashboard_kst_20260718)와 경계를 맞춤.
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 트랜잭션 원자화. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) get_my_purchases — 내 구매내역 (페이지) ──
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
AS $$
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
  ORDER BY o.created_at DESC, o.id   -- tiebreaker: 안정 페이지네이션
  LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_purchases(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_purchases(INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_purchases(INTEGER, INTEGER) TO authenticated;

-- ── 2) get_my_purchase_summary — 구매 합계(전체 기준) ──
CREATE OR REPLACE FUNCTION public.get_my_purchase_summary()
RETURNS TABLE (
  purchase_count INTEGER,
  total_amount   BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  RETURN QUERY
  SELECT COUNT(*)::INTEGER, COALESCE(SUM(o.amount), 0)::BIGINT
  FROM public.orders o
  WHERE o.buyer_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_purchase_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_purchase_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_purchase_summary() TO authenticated;

-- ── 3) get_my_creator_products — 내 영상 + 영상별 판매/매출 (페이지) ──
--     기존: videos.select('*, orders(amount, created_at)') 전량 조인 → 영상별 집계를 서버에서.
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
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  RETURN QUERY
  SELECT
    v.id, v.thumbnail, v.title,
    -- videos.likes 는 TEXT 인 환경이 있어 숫자만 추출(프론트 Number(item.likes) 와 동치)
    COALESCE(NULLIF(regexp_replace(COALESCE(v.likes::TEXT, '0'), '[^0-9]', '', 'g'), '')::INTEGER, 0),
    COALESCE(s.cnt, 0)::INTEGER,
    COALESCE(s.sum_amount, 0)::BIGINT,
    v.status
  FROM public.videos v
  LEFT JOIN (
    SELECT o.video_id, COUNT(*) AS cnt, SUM(o.amount) AS sum_amount
    FROM public.orders o
    WHERE o.seller_id = auth.uid()
    GROUP BY o.video_id
  ) s ON s.video_id = v.id
  WHERE v.creator_id = auth.uid()
  ORDER BY v.created_at DESC, v.id   -- tiebreaker: 안정 페이지네이션
  LIMIT p_limit OFFSET p_offset;
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_creator_products(INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_creator_products(INTEGER, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_creator_products(INTEGER, INTEGER) TO authenticated;

-- ── 4) get_my_creator_summary — 합계 + 월별차트 + tier맵 (전체 기준) ──
--     tier 맵은 광고 분배율 가중평균(MyPage:1017)이 **전 영상**을 훑어야 해서 페이지와 무관하게 전량.
--     (id → 'ott'|'cinema'|'home' 뿐이라 payload 는 작다)
CREATE OR REPLACE FUNCTION public.get_my_creator_summary()
RETURNS TABLE (
  video_count    INTEGER,
  total_sales    INTEGER,
  total_revenue  BIGINT,
  total_likes    BIGINT,
  monthly_sales  JSONB,   -- [{"month":"YYYY-MM","sales":n}, ...] 오름차순
  video_tiers    JSONB    -- {"<video_id>":"ott"|"cinema"|"home"}
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
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
  ),
  monthly AS (
    -- KST 경계로 월 집계 (정산 SSOT 와 동일 기준)
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
$$;
REVOKE ALL ON FUNCTION public.get_my_creator_summary() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_creator_summary() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_creator_summary() TO authenticated;

COMMIT;

-- ── 검증 (선택) ──
SELECT 'get_my_purchases 생성' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_my_purchases' AND pronargs=2)
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'get_my_purchase_summary 생성',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_my_purchase_summary')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'get_my_creator_products 생성',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_my_creator_products' AND pronargs=2)
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'get_my_creator_summary 생성',
  CASE WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname='get_my_creator_summary')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '4종 모두 anon 차단(내 데이터 전용)',
  CASE WHEN NOT has_function_privilege('anon','public.get_my_purchases(integer,integer)','EXECUTE')
   AND NOT has_function_privilege('anon','public.get_my_purchase_summary()','EXECUTE')
   AND NOT has_function_privilege('anon','public.get_my_creator_products(integer,integer)','EXECUTE')
   AND NOT has_function_privilege('anon','public.get_my_creator_summary()','EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '인자에 user_id 없음(IDOR 차단)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_proc p
    WHERE p.proname IN ('get_my_purchases','get_my_purchase_summary','get_my_creator_products','get_my_creator_summary')
      AND pg_get_function_arguments(p.oid) ILIKE '%user_id%')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
