-- ════════════════════════════════════════════════════════════════════════════
-- 🐛 admin_grant_premium 실행 불가 수정 — column reference "email" is ambiguous (2026-07-21)
--
--   [증상] 관리자 → 💰 수익화 → 프리미엄 지급 에서 지급 누르면 항상 실패:
--     `column reference "email" is ambiguous`  (지급이 전혀 안 됨)
--
--   [원인] admin_grant_premium 은 `RETURNS TABLE(display_name text, email text, ...)` 이다.
--     RETURNS TABLE 의 컬럼명은 **함수 본문 전체에서 OUT 파라미터(변수)로 살아 있다.**
--     그래서 본문의
--         SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(btrim(p_email));
--     에서 `email` 이 auth.users.email(컬럼) 인지 OUT 파라미터 email 인지 결정 불가 →
--     plpgsql 기본 variable_conflict=error 라 런타임 예외. **호출 즉시 무조건 실패.**
--
--   [수정] 테이블 별칭을 붙여 컬럼임을 명시: `FROM auth.users u ... lower(u.email)`.
--     그 외 본문(assert_admin 게이트·개월수 검증·GREATEST 구독연장·admin_logs·반환)은 100% 보존.
--
--   ▣ 왜 여태 안 걸렸나: premium_grant_crown_assert_admin_20260718.sql 의 검증이
--     `prosrc ~ 'assert_admin'`(문자열 존재 확인)뿐이라 **실제 호출을 안 해봤다.**
--     정의만 보는 검증은 이런 런타임 결함을 못 잡는다.
--   ▣ admin_crown_creator 도 같은 `lower(email)` 줄이 있으나 `RETURNS jsonb` 라
--     동명 OUT 파라미터가 없어 **모호하지 않다(정상 동작)**. 그래도 같은 함정을 남기지 않도록
--     함께 별칭을 붙인다(동작 변화 없음, 방어적 수정).
--
--   ★ 이 파일이 두 함수의 새 정본. premium_grant_crown_assert_admin_20260718.sql /
--     backfill_admin_crown_premium_20260708.sql / hero_clip_crown_fix_20260709.sql 의
--     **이 두 함수** 재실행 금지(모호성 버그로 회귀).
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 프리미엄 수동 지급 (모호성 수정) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_grant_premium(p_email text, p_months integer)
RETURNS TABLE(display_name text, email text, subscription_tier text, subscription_expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
BEGIN
  PERFORM public.assert_admin();   -- 정지관리자 차단(2026-07-18)
  IF p_months IS NULL OR p_months < 1 OR p_months > 60 THEN
    RAISE EXCEPTION '개월수는 1~60 사이여야 합니다';
  END IF;

  -- ★ 수정: 별칭 u 로 컬럼임을 명시. 별칭 없으면 RETURNS TABLE 의 OUT 파라미터 email 과 충돌.
  SELECT u.id INTO v_uid FROM auth.users u WHERE lower(u.email) = lower(btrim(p_email));
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

-- ── 2) 이달의 크리에이터 임명 (모호성은 없었으나 동일 함정 예방용 별칭) ──────
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
  PERFORM public.assert_admin();   -- 정지관리자 차단(2026-07-18)

  SELECT u.id INTO v_uid FROM auth.users u WHERE lower(u.email) = lower(btrim(p_email));
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

-- ── 3) 권한 게이트(심층방어, 멱등) — CREATE OR REPLACE 는 GRANT 를 보존하나 세트로 재실행 ──
REVOKE ALL ON FUNCTION public.admin_grant_premium(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_crown_creator(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crown_creator(text, text, integer, integer) TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '모호성 제거(별칭 u.email 사용)' AS check_name,
  CASE WHEN (SELECT bool_and(prosrc LIKE '%lower(u.email)%') FROM pg_proc
             WHERE proname IN ('admin_grant_premium','admin_crown_creator'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '무별칭 lower(email) 잔존 없음',
  CASE WHEN (SELECT bool_and(prosrc NOT LIKE '%WHERE lower(email)%') FROM pg_proc
             WHERE proname IN ('admin_grant_premium','admin_crown_creator'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '정지관리자 게이트(assert_admin) 유지',
  CASE WHEN (SELECT bool_and(prosrc LIKE '%assert_admin%') FROM pg_proc
             WHERE proname IN ('admin_grant_premium','admin_crown_creator'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '구독 연장 GREATEST 로직 보존',
  CASE WHEN (SELECT prosrc LIKE '%GREATEST(COALESCE(p.subscription_expires_at%'
             FROM pg_proc WHERE proname = 'admin_grant_premium')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'anon EXECUTE 차단',
  CASE WHEN NOT has_function_privilege('anon', 'public.admin_grant_premium(text, integer)', 'EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
