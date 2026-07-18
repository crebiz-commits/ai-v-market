-- ════════════════════════════════════════════════════════════════════════════
-- 수익 정책 감사 — update_platform_setting 을 assert_admin 게이트로 (정지관리자 차단) (2026-07-18)
--
--   [결함] update_platform_setting(정본: admin_audit_hardening_20260714.sql ④)이
--     인라인 `SELECT is_admin FROM profiles` 로만 게이트 → is_suspended 를 안 봄.
--     같은 하드닝 파일이 assert_admin 은 "정지된 관리자 차단"으로 강화(⑧)했으나, 정작
--     가장 민감한 금전 통제 — 구독가(subscription_price_krw)·크리에이터 분배율
--     (creator_share_*)·CPM·**결제 킬스위치(payments_enabled)** 변경 — 은 정지된 관리자도
--     여전히 가능. (관리자 A가 오남용→정지돼도 is_admin 플래그가 남아 있으면 정책 조작·
--     결제 강제개통 가능 = 정지의 실효성 구멍.)
--   [수정] 로그인+is_admin 인라인 체크 → PERFORM public.assert_admin() (정지관리자까지 차단).
--     화이트리스트·값검증·이력 스냅샷은 0714 정본과 동일. updated_by 는 auth.uid() 유지.
--
--   ★ 이 파일이 update_platform_setting 새 정본. admin_audit_hardening_20260714.sql 의 ④
--     함수 재실행 금지(인라인 체크로 되돌아가 정지관리자 통제 구멍 재개통). 게이트 #21 감시.
--   보안: SECURITY DEFINER + inline search_path(게이트 #9). 적용: SQL Editor → Run (멱등).
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
  v_new_id  BIGINT;
BEGIN
  PERFORM public.assert_admin();   -- 로그인+관리자+정지관리자 차단(0714 assert_admin ⑧)

  -- key 화이트리스트 (오타로 신규 key 생성 방지)
  IF p_key NOT IN (
    'creator_share_sale',
    'creator_share_ad_home', 'creator_share_ad_cinema', 'creator_share_ad_ott',
    'creator_share_subscription_pool',
    'subscription_price_krw', 'ad_cpm_krw', 'payout_minimum_krw',
    'valid_view_min_ratio', 'ip_dedup_hours', 'new_video_grace_hours',
    'payments_enabled',
    'auto_hide_threshold',
    'min_upload_duration_seconds',
    'cinema_min_duration_seconds',
    'ott_min_duration_seconds',
    'cinema_preview_seconds',
    'min_duration_for_preroll_seconds',
    'min_duration_for_midroll_seconds'
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

  -- KRW 금액 키는 1원 이상의 정수만 (0·소수 → 표시가·청구가 불일치 차단.
  --   payout_minimum_krw 는 0 허용 — "최소액 없음" 운영이 유효)
  IF p_key IN ('subscription_price_krw', 'ad_cpm_krw') AND p_value < 1 THEN
    RAISE EXCEPTION '% 는 1원 이상이어야 합니다 (입력: %)', p_key, p_value;
  END IF;
  IF p_key LIKE '%_krw' AND p_value <> floor(p_value) THEN
    RAISE EXCEPTION '% 는 정수(원 단위)여야 합니다 (입력: %)', p_key, p_value;
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

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT prosrc ~ 'assert_admin' AS gated FROM pg_proc WHERE proname='update_platform_setting'; -- true
-- ════════════════════════════════════════════════════════════════════════════
