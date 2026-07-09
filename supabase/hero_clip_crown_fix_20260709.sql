-- ════════════════════════════════════════════════════════════════════════════
-- 히어로 클립 크라운 버그 수정 (2026-07-09)
--
--   문제(업로드피드 4차 감사 F-HIGH-1): admin_crown_creator 가 클립 없는 우승작을 히어로로
--     지정할 때 hero_clip_url = COALESCE(v.hero_clip_url, v.video_url) 로 HLS playlist.m3u8 을
--     넣었다. Ott 는 hero_clip_url 이 있으면 클립(isClip=true)으로 보고 네이티브 <video src=m3u8>
--     로 재생 → 크롬/엣지/파폭/안드로이드(HLS 네이티브 미지원)에서 onError → 게다가 isClip=true 라
--     seek 렌디션 폴백(play_720p.mp4)·preview.webp 둘 다 꺼짐 → 히어로가 정지 썸네일로 먹통.
--     (Safari/iOS 만 정상.) 한국 주력 브라우저 대부분에서 크라운 히어로가 안 나오던 원인.
--
--   수정: ① 함수에서 hero_clip_url 갱신 제거(NULL 유지 → Ott 가 mp4 렌디션 폴백으로 정상 재생).
--         ② 이미 잘못 채워진 기존 데이터(hero_clip_url = video_url)를 NULL 로 되돌림.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

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
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true) THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다';
  END IF;

  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(btrim(p_email));
  IF v_uid IS NULL THEN RAISE EXCEPTION '해당 이메일 사용자가 없습니다: %', p_email; END IF;

  -- ① 뱃지
  UPDATE public.profiles
  SET creator_of_month_until = now() + (p_badge_months || ' months')::interval
  WHERE id = v_uid;

  -- ② 홈 히어로 (영상 지정 시): featured + OTT 노출 (hero_clip_url 은 건드리지 않음 — 위 주석 참조)
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

-- 기존 오염 데이터 복구: COALESCE 로 video_url(=playlist.m3u8)이 클립에 잘못 들어간 행을 NULL 로.
--   (정상 클립은 hero-clips 버킷 URL 이라 절대 video_url 과 같지 않음 → 안전.)
UPDATE public.videos
SET hero_clip_url = NULL
WHERE hero_clip_url IS NOT NULL AND hero_clip_url = video_url;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT id, title, hero_clip_url, video_url FROM public.videos
--   WHERE featured_hero_until > now();
--   -- hero_clip_url 이 video_url(.../playlist.m3u8)과 같은 행이 없어야 함(있으면 위 UPDATE 재확인).
