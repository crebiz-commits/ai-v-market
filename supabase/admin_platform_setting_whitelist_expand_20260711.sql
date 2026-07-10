-- ════════════════════════════════════════════════════════════════════════════
-- update_platform_setting 화이트리스트 확장 (2026-07-11)
--
--   문제: AdminRevenuePolicy 는 get_active_platform_settings() 가 반환하는 모든 행에
--         편집(연필) 버튼을 렌더하는데, update_platform_setting 의 key 화이트리스트가
--         phase8_platform_settings.sql(2026-05-12) 단일 정의로 고정돼 이후 추가된 키가
--         빠져 있어, 아래 8개 키를 UI에서 저장하면 "알 수 없는 설정 키"로 실패했다.
--         → 결제 킬스위치(payments_enabled)·콘텐츠 정책·자동숨김 임계값을 관리자 화면에서
--           바꿀 수 없었음(SQL 직접 수정 필요).
--   해결: 화이트리스트에 8개 키 추가 + 값 타입 검증(payments_enabled=0/1, 초·시간·개수는 정수).
--         시그니처 동일 → CREATE OR REPLACE 안전. 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.update_platform_setting(
  p_key TEXT,
  p_value NUMERIC,
  p_note TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_new_id BIGINT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_user_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;

  -- key 화이트리스트 (오타로 신규 key 생성 방지)
  --   ★ 2026-07-11 확장: 콘텐츠 정책(길이 임계값)·자동숨김·결제 킬스위치 편집 허용
  IF p_key NOT IN (
    'creator_share_sale',
    'creator_share_ad_home', 'creator_share_ad_cinema', 'creator_share_ad_ott',
    'creator_share_subscription_pool',
    'subscription_price_krw', 'ad_cpm_krw', 'payout_minimum_krw',
    'valid_view_min_ratio', 'ip_dedup_hours', 'new_video_grace_hours',
    -- 신규 허용 키
    'payments_enabled',                       -- 결제 킬스위치 (0=OFF, 1=ON)
    'auto_hide_threshold',                     -- 신고 자동숨김 임계 건수
    'min_upload_duration_seconds',             -- 업로드 최소 길이
    'cinema_min_duration_seconds',             -- 시네마 노출 최소 길이
    'ott_min_duration_seconds',                -- OTT 노출 최소 길이
    'cinema_preview_seconds',                  -- 시네마 미리보기 컷오프
    'min_duration_for_preroll_seconds',        -- pre-roll 최소 영상 길이
    'min_duration_for_midroll_seconds'         -- mid-roll 최소 영상 길이
  ) THEN
    RAISE EXCEPTION '알 수 없는 설정 키: %', p_key;
  END IF;

  -- 값 검증
  IF p_key LIKE 'creator_share_%' OR p_key = 'valid_view_min_ratio' THEN
    IF p_value < 0 OR p_value > 1 THEN
      RAISE EXCEPTION '비율은 0~1 사이여야 합니다 (입력: %)', p_value;
    END IF;
  ELSIF p_key = 'payments_enabled' THEN
    IF p_value NOT IN (0, 1) THEN
      RAISE EXCEPTION 'payments_enabled 는 0(비활성) 또는 1(활성)만 허용합니다 (입력: %)', p_value;
    END IF;
  ELSIF p_value < 0 THEN
    RAISE EXCEPTION '금액/시간/개수는 음수일 수 없습니다 (입력: %)', p_value;
  END IF;

  -- 초·시간·개수·플래그 키는 정수만 (소수 방지)
  IF (p_key LIKE '%_seconds'
      OR p_key IN ('ip_dedup_hours', 'new_video_grace_hours', 'auto_hide_threshold', 'payments_enabled'))
     AND p_value <> floor(p_value) THEN
    RAISE EXCEPTION '% 는 정수여야 합니다 (입력: %)', p_key, p_value;
  END IF;

  -- 기존 활성 행 마감 후 새 행 추가 (이력 보존)
  UPDATE public.platform_settings
  SET effective_to = now()
  WHERE key = p_key AND effective_to IS NULL;

  INSERT INTO public.platform_settings (key, value, note, updated_by)
  VALUES (p_key, p_value, p_note, v_user_id)
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

COMMENT ON FUNCTION public.update_platform_setting IS
  '어드민이 설정값 변경. 기존 활성 행 마감 + 새 행 추가(이력 보존). 화이트리스트 키만 허용(2026-07-11 콘텐츠정책·결제킬스위치 포함).';

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT pg_get_functiondef(oid) ILIKE '%payments_enabled%' AS ok
--     FROM pg_proc WHERE proname = 'update_platform_setting';   -- true 여야 함
