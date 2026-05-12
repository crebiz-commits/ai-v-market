-- ════════════════════════════════════════════════════════════════════════════
-- Phase 8 — Step 1: 수익 정책 설정 테이블 (어드민 조정 가능, 이력 보존)
-- 적용 일자: 2026-05-12
--
-- 목적:
--   크리에이터에게 돌아가는 모든 분배율/단가/허들을 어드민에서 언제든 변경하고,
--   과거 정산 시점의 비율을 그대로 보존하기 위한 단일 설정 테이블.
--
-- 핵심 설계:
--   - 비율/단가를 코드/RPC에 하드코딩하지 않고 platform_settings에 저장
--   - 변경 시 기존 행 effective_to = now(), 새 행 INSERT (이력 보존)
--   - 정산 시점의 비율을 revenue_distributions.applied_rates JSONB에 스냅샷
--   - 분쟁 발생 시 "그 달은 이 비율이었다" 100% 추적 가능
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: platform_settings 테이블 (이력 보존형)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_settings (
  id              BIGSERIAL PRIMARY KEY,
  key             TEXT NOT NULL,
  value           NUMERIC NOT NULL,
  effective_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to    TIMESTAMPTZ,        -- NULL = 현재 활성
  note            TEXT,               -- 변경 사유 / 메모
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 동일 key는 한 시점에 하나만 active (effective_to IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_platform_settings_active_unique
  ON public.platform_settings(key)
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_settings_key_period
  ON public.platform_settings(key, effective_from DESC);

COMMENT ON TABLE public.platform_settings IS
  '수익 정책 설정 (분배율/단가/허들). 어드민이 변경 가능, 이력 보존. 같은 key의 활성 행(effective_to IS NULL)은 항상 1개.';
COMMENT ON COLUMN public.platform_settings.key IS
  'creator_share_sale, creator_share_ad_home/cinema/ott, creator_share_subscription_pool, subscription_price_krw, ad_cpm_krw, payout_minimum_krw, valid_view_min_ratio, ip_dedup_hours, new_video_grace_hours';
COMMENT ON COLUMN public.platform_settings.value IS
  '비율(0~1) 또는 금액(KRW) 또는 시간(시간 단위). key에 따라 의미가 다름';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 초기 정책값 (정책 메모리 2026-05-12 기준)
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value, note) VALUES
  ('creator_share_sale',               0.800, '판매 라이선스 크리에이터 분배 (플랫폼 20%)'),
  ('creator_share_ad_home',            0.500, '홈 0~3분 광고 크리에이터 분배'),
  ('creator_share_ad_cinema',          0.550, '시네마 3분+ 광고 크리에이터 분배'),
  ('creator_share_ad_ott',             0.600, 'OTT 10분+ 광고 크리에이터 분배'),
  ('creator_share_subscription_pool',  0.500, '구독료 풀 크리에이터 분배 (2026-05-12 70%→50% 1차 조정)'),
  ('subscription_price_krw',           4900,  '월 구독료 (2026-05-12 ₩2,900→₩4,900 1차 조정)'),
  ('ad_cpm_krw',                       2000,  '광고 1,000회 노출당 매출 (잠정)'),
  ('payout_minimum_krw',               10000, '월 정산 최소액. 미만 시 다음 달로 이월'),
  ('valid_view_min_ratio',             0.300, '유효 시청 최소 비율 (영상 길이 대비)'),
  ('ip_dedup_hours',                   24,    '동일 IP 시청 중복 차단 시간'),
  ('new_video_grace_hours',            48,    '신규 영상 광고 수익 카운트 제외 기간')
ON CONFLICT DO NOTHING;
-- ON CONFLICT는 unique index 때문에 실제로는 모든 (key, effective_to=NULL) 충돌 방지

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 현재 활성 설정 조회 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_setting(p_key TEXT)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT value
  FROM public.platform_settings
  WHERE key = p_key AND effective_to IS NULL
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_platform_setting IS
  '특정 key의 현재 활성 설정값 조회. 누구나 호출 가능 (정책은 공개 정보).';

-- 전체 활성 설정 조회 (어드민/MyPage에서 표 형태로 표시)
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
AS $$
  SELECT key, value, effective_from, note
  FROM public.platform_settings
  WHERE effective_to IS NULL
  ORDER BY key;
$$;

-- 특정 시점의 설정값 조회 (정산 시 사용 — "이 달의 비율은 뭐였나?")
CREATE OR REPLACE FUNCTION public.get_platform_setting_at(
  p_key TEXT,
  p_at TIMESTAMPTZ
)
RETURNS NUMERIC
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT value
  FROM public.platform_settings
  WHERE key = p_key
    AND effective_from <= p_at
    AND (effective_to IS NULL OR effective_to > p_at)
  ORDER BY effective_from DESC
  LIMIT 1;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 어드민 전용 — 설정 변경 RPC (이력 보존)
--   동작: 기존 활성 행을 effective_to = now()로 마감, 새 행 INSERT
--   권한: is_admin = true인 프로필만 (profiles.is_admin 컬럼 있어야 함)
-- ────────────────────────────────────────────────────────────────────────────
-- profiles에 is_admin 컬럼이 없으면 추가
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN public.profiles.is_admin IS '어드민 권한 (수익 정책 변경, 정산 실행 등)';

-- 초기 어드민 설정 (이메일 기반) — AdminDashboard.tsx의 ADMIN_EMAILS와 동기화
-- 추가/제거 시 AdminDashboard.tsx의 ADMIN_EMAILS 배열도 함께 갱신
UPDATE public.profiles
SET is_admin = true
WHERE id IN (
  SELECT id FROM auth.users WHERE email IN (
    'crebizlogistics@gmail.com'
  )
);

CREATE OR REPLACE FUNCTION public.update_platform_setting(
  p_key TEXT,
  p_value NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_new_id BIGINT;
BEGIN
  -- 권한 체크
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;

  -- key 유효성 (오타로 신규 key 생성 방지)
  IF p_key NOT IN (
    'creator_share_sale',
    'creator_share_ad_home', 'creator_share_ad_cinema', 'creator_share_ad_ott',
    'creator_share_subscription_pool',
    'subscription_price_krw', 'ad_cpm_krw', 'payout_minimum_krw',
    'valid_view_min_ratio', 'ip_dedup_hours', 'new_video_grace_hours'
  ) THEN
    RAISE EXCEPTION '알 수 없는 설정 키: %', p_key;
  END IF;

  -- 비율 타입은 0~1 범위 체크
  IF p_key LIKE 'creator_share_%' OR p_key = 'valid_view_min_ratio' THEN
    IF p_value < 0 OR p_value > 1 THEN
      RAISE EXCEPTION '비율은 0~1 사이여야 합니다 (입력: %)', p_value;
    END IF;
  ELSIF p_value < 0 THEN
    RAISE EXCEPTION '금액/시간은 음수일 수 없습니다 (입력: %)', p_value;
  END IF;

  -- 기존 활성 행 마감
  UPDATE public.platform_settings
  SET effective_to = now()
  WHERE key = p_key AND effective_to IS NULL;

  -- 새 행 추가
  INSERT INTO public.platform_settings (key, value, note, updated_by)
  VALUES (p_key, p_value, p_note, v_user_id)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.update_platform_setting IS
  '어드민이 설정값 변경. 기존 활성 행을 마감하고 새 행 추가 (이력 보존).';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: 설정 변경 이력 조회 RPC (어드민 UI)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_platform_setting_history(
  p_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  key TEXT,
  value NUMERIC,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  note TEXT,
  updated_by UUID,
  updater_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    s.id, s.key, s.value, s.effective_from, s.effective_to, s.note,
    s.updated_by, p.display_name
  FROM public.platform_settings s
  LEFT JOIN public.profiles p ON p.id = s.updated_by
  WHERE p_key IS NULL OR s.key = p_key
  ORDER BY s.key, s.effective_from DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: RLS
--   SELECT: 누구나 (정책은 공개)
--   INSERT/UPDATE/DELETE: 클라이언트 직접 차단 (RPC 통해서만)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform_settings_select_all" ON public.platform_settings;
CREATE POLICY "platform_settings_select_all"
  ON public.platform_settings FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE는 SECURITY DEFINER RPC만 사용 (정책 없으면 차단됨)

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 현재 활성 정책 보기
--   SELECT * FROM public.get_active_platform_settings();
--
--   -- 특정 값 조회
--   SELECT public.get_platform_setting('creator_share_sale');
--
--   -- (어드민 계정에서) 광고 OTT 분배 60% → 65%로 변경
--   SELECT public.update_platform_setting('creator_share_ad_ott', 0.65, '2026-Q3 정책 조정');
--
--   -- 이력 보기
--   SELECT * FROM public.get_platform_setting_history('creator_share_ad_ott');
-- ════════════════════════════════════════════════════════════════════════════
