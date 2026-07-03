-- ════════════════════════════════════════════════════════════════════════════
-- 관리자 OTT 히어로 지정 (2026-07-03)
--
-- 목적: OTT 히어로 섹션 최우선 노출을 어드민이 영상별로 지정/해제.
--       Ott.tsx 는 videos.featured_hero_until(미래) 영상을 히어로 최우선으로 읽지만,
--       이 컬럼을 설정하는 UI/기능이 없어 수동 SQL 로만 가능했음(레일만 있고 스위치 없음).
--
-- 구성: admin_set_video_hero(지정/해제) + admin_list_hero_video_ids(현재 목록).
--       admin_search_videos 는 건드리지 않고 별도 조회로 상태 표시(드리프트 회피).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 컬럼 보강 (없으면 생성 — 멱등)
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS featured_hero_until timestamptz;

-- ── 지정/해제: p_days>0 이면 now()+일수, p_days<=0/NULL 이면 해제(NULL) ──
CREATE OR REPLACE FUNCTION public.admin_set_video_hero(
  p_video_id TEXT,
  p_days     INTEGER DEFAULT 30
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_until TIMESTAMPTZ;
BEGIN
  PERFORM public.assert_admin();

  IF NOT EXISTS (SELECT 1 FROM public.videos WHERE id = p_video_id) THEN
    RAISE EXCEPTION '영상을 찾을 수 없습니다 (id: %)', p_video_id;
  END IF;

  IF p_days IS NULL OR p_days <= 0 THEN
    v_until := NULL;                                   -- 해제
  ELSE
    v_until := now() + make_interval(days => p_days);  -- 지정
  END IF;

  UPDATE public.videos SET featured_hero_until = v_until WHERE id = p_video_id;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'set_video_hero', 'video', p_video_id,
          jsonb_build_object('days', p_days, 'until', v_until));

  RETURN v_until;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_video_hero(TEXT, INTEGER) TO authenticated;

-- ── 현재 히어로 지정 영상 목록 (관리자 UI 배지 표시용) ──
CREATE OR REPLACE FUNCTION public.admin_list_hero_video_ids()
RETURNS TABLE (video_id TEXT, featured_hero_until TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
    SELECT v.id, v.featured_hero_until
    FROM public.videos v
    WHERE v.featured_hero_until > now()
    ORDER BY v.featured_hero_until DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_hero_video_ids() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 (관리자 세션):
--   SELECT public.admin_set_video_hero('<영상id>', 30);   -- 30일 지정 → until 반환
--   SELECT * FROM public.admin_list_hero_video_ids();       -- 목록에 나타나야
--   SELECT public.admin_set_video_hero('<영상id>', 0);      -- 해제 → NULL 반환
-- ════════════════════════════════════════════════════════════════════════════
