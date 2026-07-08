-- ════════════════════════════════════════════════════════════════════════════
-- 드리프트 백필 — admin_grant_premium / admin_crown_creator / profiles.creator_of_month_until
-- 2026-07-08. 라이브 DB에는 이미 존재(2026-07-01 채팅 세션에서 생성됐으나 커밋엔 프론트만 포함).
-- 이 파일은 라이브 DB의 pg_get_functiondef() 덤프(2026-07-08)를 저장소에 보존한 것.
--
-- ⚠️ 지금 라이브에 실행할 필요 없음(이미 동일 정의 존재). 새 DB 복원/포맷 시에만 실행.
-- ✅ admin_crown_creator 시그니처는 라이브 pg_get_function_arguments()로 확인 완료(2026-07-08):
--    "p_email text, p_video_id text DEFAULT NULL::text,
--     p_badge_months integer DEFAULT 1, p_hero_days integer DEFAULT 30" — 아래 정의와 일치.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0) 컬럼: 이달의 크리에이터 뱃지 만료 시각 ──────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creator_of_month_until timestamp with time zone;

-- ── 1) 프리미엄 수동 지급 (어드민 전용) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_grant_premium(p_email text, p_months integer)
RETURNS TABLE(display_name text, email text, subscription_tier text, subscription_expires_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
BEGIN
  -- 관리자만 실행 가능
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다';
  END IF;
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

-- ── 2) 이달의 크리에이터 임명 (뱃지 + 선택적 홈 히어로 고정, 어드민 전용) ──
CREATE OR REPLACE FUNCTION public.admin_crown_creator(p_email text, p_video_id text DEFAULT NULL::text, p_badge_months integer DEFAULT 1, p_hero_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid; v_title text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_uid IS NULL THEN RAISE EXCEPTION '해당 이메일 사용자가 없습니다: %', p_email; END IF;

  -- ① 뱃지
  UPDATE public.profiles
  SET creator_of_month_until = now() + (p_badge_months || ' months')::interval
  WHERE id = v_uid;

  -- ② 홈 히어로 (영상 지정 시): featured + OTT 노출 + 자동재생 클립 지정
  IF p_video_id IS NOT NULL AND btrim(p_video_id) <> '' THEN
    UPDATE public.videos v
    SET featured_hero_until = now() + (p_hero_days || ' days')::interval,
        show_on_ott = true,
        hero_clip_url = COALESCE(v.hero_clip_url, v.video_url)
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

-- ── 3) 권한 게이트 ──────────────────────────────────────────────────────────
-- anon 미노출은 라이브 확인됨(PostgREST OpenAPI에 두 RPC 없음, 2026-07-08).
-- authenticated 실행 가능은 어드민 UI 정상 작동으로 확인(함수 내부 is_admin 게이트가 SSOT).
REVOKE ALL ON FUNCTION public.admin_grant_premium(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_crown_creator(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_premium(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crown_creator(text, text, integer, integer) TO authenticated;
