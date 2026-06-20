-- ════════════════════════════════════════════════════════════════════════════
-- 홈피드 감사 #5 — ads 민감컬럼 노출 차단 (2026-06-20)
--
--   문제: ads 의 공개 SELECT 정책이 행 단위라, 승인+활성 광고의 "모든 컬럼"
--         (budget_krw / spent_krw / owner_id / review_note 등)이 anon 에 열림.
--   수정: 공개용 안전 컬럼만 노출하는 ads_public 뷰를 만들고(승인·활성·기간 필터 내장),
--         피드는 그 뷰에서 조회(프론트 반영 완료). base ads 의 "공개 SELECT 정책"은 제거 →
--         anon 은 base 테이블을 직접 못 읽음(민감컬럼 차단). 소유자/관리자 정책은 유지.
--
--   영향범위 검증(코드 grep): base ads 직접 SELECT 는 AdminDashboard(관리자 정책)와
--     DiscoveryFeed(→ads_public 로 이전) 둘뿐. 광고주 대시보드·프리롤은 RPC(SECURITY DEFINER)
--     경유라 RLS 우회 → 영향 없음. 소유자 정책("Advertiser can view own ads") 유지로 본인광고 조회 정상.
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. ads_public — 공개 안전 컬럼만 + 승인·활성·노출기간 필터 내장.
--    (security_invoker 미지정 = 뷰 소유자 권한으로 실행 → base RLS 우회하되, 노출은 뷰 정의로 한정)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.ads_public AS
SELECT
  id, title, advertiser, image_url, video_url, thumbnail_url,
  link_url, cta_text, interval_count, ad_type
FROM public.ads
WHERE status = 'approved'
  AND is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >= now());

GRANT SELECT ON public.ads_public TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. base ads 의 공개 SELECT 정책 제거 — anon 의 민감컬럼 직접열람 차단.
--    (소유자/관리자 정책은 유지: 광고주 본인광고·관리자 전체관리 정상)
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Public can view approved active ads" ON public.ads;  -- advertiser_self_service_phase1
DROP POLICY IF EXISTS "Anyone can view active ads"          ON public.ads;  -- ads_table.sql 구버전

-- (유지 확인용 — 아래 정책들은 건드리지 않음)
--   "Advertiser can view own ads"  : USING (owner_id = auth.uid())
--   "Admin full access"            : is_admin 기반 ALL

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 1) 뷰는 안전컬럼만 (budget_krw/spent_krw/owner_id 없어야 함)
--   SELECT * FROM public.ads_public LIMIT 3;
--   -- 2) base ads 공개정책 제거 확인 (Public/Anyone view 정책이 없어야 함)
--   SELECT polname FROM pg_policies WHERE tablename='ads';
--   -- 3) (익명 세션 가정) base ads 직접조회는 0행, ads_public 은 승인광고 노출
-- ════════════════════════════════════════════════════════════════════════════
