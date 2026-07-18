-- ════════════════════════════════════════════════════════════════════════════
-- 수익 정책 감사(2차) — 어뷰징 임계값 공개노출 차단 (2026-07-18)
--
--   [결함] platform_settings 테이블 SELECT 정책이 USING(true) = 완전 공개. 또
--     get_active_platform_settings()(SECURITY DEFINER, MyPage/SettingsContext 소비)도
--     전 키를 반환 → 누구나 `.from('platform_settings').select('*')` 또는 RPC 로
--     **안티프라우드 임계값**(valid_view_min_ratio·ip_dedup_hours·new_video_grace_hours·
--     ad_ip_max_keys_per_hour)을 읽어 우회 캘리브레이션 가능(유효시청 farming·IP 분산·
--     신규영상 유예·IP 스로틀 회피). 분배율(creator_share_*)·CPM·정산최소액은 크리에이터
--     수익 표시(MyPage)에 쓰여 공개 유지가 정상 — 임계값 4종만 비관리자에게서 가림.
--   [수정]
--     ① 테이블 RLS: is_admin() 이거나 임계값 4종이 아닌 키만 SELECT 허용(직접쿼리 차단).
--        SettingsContext 는 콘텐츠 정책 키만 읽어 무영향. 관리자는 전 키 가시.
--     ② get_active_platform_settings: 비관리자에게 임계값 4종 제외(RPC 는 DEFINER 라 RLS
--        우회 → 함수 내부에서도 동일 필터). inline search_path 추가(게이트 #9 드리프트 방지).
--
--   ★ get_active_platform_settings 새 정본. phase8_platform_settings.sql 의 해당 함수·
--     테이블 정책 재실행 금지(USING(true)/무필터로 노출 재개통). 게이트 #22 감시.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 테이블 SELECT 정책 — 비관리자는 임계값 4종 비노출 ──────────────────────
DROP POLICY IF EXISTS "platform_settings_select_all"    ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings_select_public" ON public.platform_settings;
CREATE POLICY "platform_settings_select_public"
  ON public.platform_settings FOR SELECT
  USING (
    public.is_admin()
    OR key NOT IN ('valid_view_min_ratio', 'ip_dedup_hours',
                   'new_video_grace_hours', 'ad_ip_max_keys_per_hour')
  );

-- ── ② get_active_platform_settings — 비관리자 임계값 4종 제외 + search_path ──
CREATE OR REPLACE FUNCTION public.get_active_platform_settings()
RETURNS TABLE (
  key TEXT,
  value NUMERIC,
  effective_from TIMESTAMPTZ,
  note TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT key, value, effective_from, note
  FROM public.platform_settings
  WHERE effective_to IS NULL
    AND (public.is_admin()
         OR key NOT IN ('valid_view_min_ratio', 'ip_dedup_hours',
                        'new_video_grace_hours', 'ad_ip_max_keys_per_hour'))
  ORDER BY key;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_platform_settings() TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- (비관리자 세션) 임계값이 안 보여야:
--   SELECT key FROM public.get_active_platform_settings()
--     WHERE key IN ('valid_view_min_ratio','ip_dedup_hours');   -- 0행(관리자는 2행)
--   -- 함수에 필터 존재:
--   SELECT pg_get_functiondef(oid) ILIKE '%valid_view_min_ratio%' AS ok
--     FROM pg_proc WHERE proname='get_active_platform_settings';  -- true
-- ════════════════════════════════════════════════════════════════════════════
