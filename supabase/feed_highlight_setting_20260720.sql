-- ════════════════════════════════════════════════════════════════════════════
-- 🎬 홈피드 하이라이트 길이 설정화 (2026-07-20) — 하드코딩 30초 → 관리자 조절
--
--   [배경] 홈피드 카드의 하이라이트 반복 재생 길이가 DiscoveryFeed 코드에 30초로 박혀
--     있어 바꾸려면 코드 수정+재배포가 필요했다. 같은 "🎬 콘텐츠 정책" 그룹의
--     cinema_preview_seconds(비구독자 미리보기)는 이미 관리자에서 조절되는데 이것만 빠져 있었음.
--   [수정] platform_settings 키 feed_highlight_seconds 신설 → 관리자 수익 정책에서 조절.
--     · 영상별 highlight_start/highlight_end 가 지정된 건 그대로 우선 — 이 값은
--       highlight_end 가 없는 영상의 "기본 길이"만 바꾼다.
--     · 상한 60초: 무제한이면 유료 영상이 피드에서 통째로 노출돼 미리보기 게이트가 무의미해짐.
--     · 하한 10초: 너무 짧으면 하이라이트가 깜빡이며 반복돼 시청 경험이 깨짐.
--
--   본문은 정본(platform_setting_audit_log_20260719.sql)에서 스크립트로 생성 —
--   화이트리스트 1줄 + 범위검증 블록만 추가. 감사 로깅(update_setting)은 그대로 유지.
--   ★ 이 파일이 update_platform_setting 새 정본. 0719 판 재실행 금지(새 키가 사라짐).
--   적용: Supabase SQL Editor → Run. 트랜잭션 원자화. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;
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
    'feed_highlight_seconds',
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
  ELSIF p_key = 'feed_highlight_seconds' THEN
    -- 홈피드 하이라이트 반복 길이. 너무 길면 유료 영상이 피드에서 통째로 노출되므로 상한을 둔다.
    IF p_value < 10 OR p_value > 60 THEN
      RAISE EXCEPTION '홈피드 하이라이트 길이는 10~60초여야 합니다 (입력: %)', p_value;
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
-- ── 기본값 시드 (30초 — 기존 하드코딩과 동일하게 시작) ──
INSERT INTO public.platform_settings (key, value, note) VALUES
  ('feed_highlight_seconds', 30, '홈피드 카드 하이라이트 반복 재생 길이(초). 영상별 highlight_end 가 있으면 그쪽 우선')
ON CONFLICT DO NOTHING;

COMMIT;

-- ── 검증 (선택) ──
SELECT '화이트리스트에 feed_highlight_seconds' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'feed_highlight_seconds' FROM pg_proc WHERE proname='update_platform_setting')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '기본값 30초 시드됨',
  CASE WHEN EXISTS (SELECT 1 FROM public.platform_settings
    WHERE key='feed_highlight_seconds' AND effective_to IS NULL) THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '감사 로깅(update_setting) 유지',
  CASE WHEN (SELECT prosrc ~ 'admin_logs' FROM pg_proc WHERE proname='update_platform_setting')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
