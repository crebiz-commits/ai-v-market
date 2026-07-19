-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 수익 정책 변경 감사 로그 (2026-07-19) — update_platform_setting → admin_logs 기록
--
--   [결함] 활동 로그 감사에서 확인: update_platform_setting(결제 킬스위치 payments_enabled·
--     구독가·크리에이터 분배율·CPM 등 최고 민감 금전/결제 통제)이 platform_settings 이력
--     스냅샷(effective_to/updated_by)만 남기고 **admin_logs 에는 기록 안 함** → 통합 활동
--     로그(관리자 책임추적 SSOT)에서 정책 변경 이력이 누락됨.
--   [수정] 본문은 정본(update_platform_setting_assert_admin_20260718.sql)과 100% 동일 —
--     옛 값 캡처(v_old) + admin_logs INSERT('update_setting', 옛→새 값)만 추가.
--
--   ★ 이 파일이 update_platform_setting 새 정본. 이전 판(0718 assert_admin) 재실행 금지.
--   적용: Supabase SQL Editor → Run. 멱등.
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
  v_old     NUMERIC;   -- 감사: 변경 전 값
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

  -- 변경 전 값 캡처(감사 로그용)
  SELECT value INTO v_old FROM public.platform_settings
  WHERE key = p_key AND effective_to IS NULL;

  -- 기존 활성 행 마감 후 새 행 추가 (이력 보존)
  UPDATE public.platform_settings
  SET effective_to = now()
  WHERE key = p_key AND effective_to IS NULL;

  INSERT INTO public.platform_settings (key, value, note, updated_by)
  VALUES (p_key, p_value, p_note, v_user_id)
  RETURNING id INTO v_new_id;

  -- 감사: 통합 활동 로그(admin_logs)에 정책 변경 기록 (옛→새 값)
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (v_user_id, 'update_setting', 'platform_setting', p_key,
    jsonb_build_object('key', p_key, 'old_value', v_old, 'new_value', p_value, 'note', p_note));

  RETURN v_new_id;
END;
$$;

-- ── 검증 (선택) ──
SELECT 'update_platform_setting admin_logs 기록' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'admin_logs' AND prosrc ~ 'update_setting'
             FROM pg_proc WHERE proname='update_platform_setting')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
