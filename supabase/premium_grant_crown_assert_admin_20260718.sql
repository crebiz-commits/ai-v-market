-- ════════════════════════════════════════════════════════════════════════════
-- 프리미엄 지급·크라운 정지관리자 차단 — 인라인 is_admin → assert_admin (2026-07-18)
--
--   [배경] 프리미엄 지급 페이지 감사. admin_grant_premium / admin_crown_creator 가
--     `SELECT 1 FROM profiles WHERE id=auth.uid() AND is_admin=true` 인라인 체크만 써
--     is_suspended 를 안 봄 → "정지된 관리자"도:
--       · admin_grant_premium: 프리미엄 무제한 수동 지급(자기 계정 포함 = 무상 프리미엄·정산오염)
--       · admin_crown_creator: 이달의 크리에이터 뱃지·OTT 홈 히어로(featured_hero_until·show_on_ott) 조작
--     #21(update_platform_setting)·#23(calculate_monthly_revenue)과 동일 정지관리자 클래스.
--   [사각지대] 게이트 #7 은 이름이 admin_* 라 스캔하나 본문에 'is_admin' 문자열이 있으면
--     "게이트됨"으로 통과 → 거짓 PASS. 인라인 is_admin ≠ assert_admin(정지 미차단). 게이트 #25 신설.
--   [조치] 두 함수의 인라인 is_admin IF-블록을 PERFORM public.assert_admin() 으로 교체.
--     그 외 본문(구독연장 GREATEST·admin_logs 감사기록·이메일 조회·히어로 로직)은 100% 보존.
--     admin_crown_creator 는 hero_clip_crown_fix_20260709.sql(hero_clip_url 미변경) 정본 기반.
--   적용: Supabase SQL Editor → Run (멱등). 이후 보안 게이트 Run → #25 + 25/25 PASS 확인.
--
--   ★ 이 파일이 두 함수의 새 정본. backfill_admin_crown_premium_20260708.sql ①②,
--     hero_clip_crown_fix_20260709.sql 의 함수 재실행 금지(인라인 is_admin 으로 되돌아감).
--     단 hero_clip_crown_fix 의 데이터복구 UPDATE(hero_clip_url=NULL)는 별개로 유효.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 프리미엄 수동 지급 (정지관리자 차단) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_grant_premium(p_email text, p_months integer)
RETURNS TABLE(display_name text, email text, subscription_tier text, subscription_expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
BEGIN
  PERFORM public.assert_admin();   -- 정지관리자 차단(인라인 is_admin → assert_admin, 2026-07-18)
  IF p_months IS NULL OR p_months < 1 OR p_months > 60 THEN
    RAISE EXCEPTION '개월수는 1~60 사이여야 합니다';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_uid IS NULL THEN
    RETURN;  -- 사용자 없음 → 빈 결과 (UI가 "찾을 수 없음" 처리)
  END IF;

  UPDATE public.profiles p
  SET subscription_tier       = 'premium',
      subscription_started_at = COALESCE(p.subscription_started_at, now()),
      subscription_expires_at = GREATEST(COALESCE(p.subscription_expires_at, now()), now())
                                + (p_months || ' months')::interval
  WHERE p.id = v_uid;

  -- 감사 로그
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'grant_premium', 'user', v_uid::text,
          jsonb_build_object('email', p_email, 'months', p_months));

  RETURN QUERY
  SELECT pr.display_name, u.email::text, pr.subscription_tier, pr.subscription_expires_at
  FROM public.profiles pr JOIN auth.users u ON u.id = pr.id
  WHERE pr.id = v_uid;
END;
$function$;

-- ── 2) 이달의 크리에이터 임명 (정지관리자 차단, hero_clip_url 미변경 정본) ──
CREATE OR REPLACE FUNCTION public.admin_crown_creator(
  p_email text, p_video_id text DEFAULT NULL::text,
  p_badge_months integer DEFAULT 1, p_hero_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid; v_title text;
BEGIN
  PERFORM public.assert_admin();   -- 정지관리자 차단(인라인 is_admin → assert_admin, 2026-07-18)

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_uid IS NULL THEN RAISE EXCEPTION '해당 이메일 사용자가 없습니다: %', p_email; END IF;

  -- ① 뱃지
  UPDATE public.profiles
  SET creator_of_month_until = now() + (p_badge_months || ' months')::interval
  WHERE id = v_uid;

  -- ② 홈 히어로 (영상 지정 시): featured + OTT 노출 (hero_clip_url 은 건드리지 않음 —
  --   hero_clip_crown_fix_20260709.sql 참조: m3u8 를 클립으로 오인해 크롬/안드로이드 히어로 먹통 방지)
  IF p_video_id IS NOT NULL AND btrim(p_video_id) <> '' THEN
    UPDATE public.videos v
    SET featured_hero_until = now() + (p_hero_days || ' days')::interval,
        show_on_ott = true
    WHERE v.id = p_video_id
    RETURNING v.title INTO v_title;
    IF v_title IS NULL THEN RAISE EXCEPTION '영상을 찾을 수 없습니다: %', p_video_id; END IF;
  END IF;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'crown_creator', 'user', v_uid::text,
          jsonb_build_object('email', p_email, 'video_id', p_video_id, 'badge_months', p_badge_months, 'hero_days', p_hero_days));

  RETURN jsonb_build_object('user_id', v_uid, 'video_title', v_title,
    'badge_until', (SELECT creator_of_month_until FROM public.profiles WHERE id = v_uid));
END;
$function$;

-- ── 3) 권한 게이트(심층방어, 멱등) — REVOKE FROM PUBLIC,anon + GRANT authenticated ──
--   내부 assert_admin 이 SSOT. 아래는 anon 이 호출조차 못하게 하는 추가 방어(세트로 실행).
REVOKE ALL ON FUNCTION public.admin_grant_premium(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_crown_creator(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crown_creator(text, text, integer, integer) TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT proname, prosrc ~ 'assert_admin' AS gated FROM pg_proc
--   WHERE proname IN ('admin_grant_premium','admin_crown_creator');
--     → 둘 다 gated=true 여야 정상. 이후 _verify_security_invariants Run → #25 PASS.
-- ════════════════════════════════════════════════════════════════════════════
