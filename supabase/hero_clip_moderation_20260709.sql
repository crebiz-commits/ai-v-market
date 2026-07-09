-- ════════════════════════════════════════════════════════════════════════════
-- 히어로 클립 프레임 검수 (방식 C — Bunny 프레임 재활용) (2026-07-09)
--
--   배경: 히어로 미리보기 클립(hero_clip)이 Bunny/Vision 검수를 안 거쳐, admin featured
--         히어로에서 미검수 콘텐츠가 자동재생될 수 있었다(4차 감사 HIGH-1).
--   조치: 클립도 본편처럼 Bunny 에 올려(create-upload+TUS) 인코딩 → Bunny 실제 썸네일을
--         기존 Vision 파이프라인(scoreBunnyThumbnail)으로 검수 → passed 일 때만 재생.
--
--   컬럼:
--     · hero_clip_id     : 클립의 Bunny GUID (검수·재생 렌디션 파생의 기준)
--     · hero_clip_status : none(클립없음)/pending(검수중)/passed(통과·재생허용)/rejected(차단)
--   재생 게이트: Ott 는 hero_clip_status='passed' 인 클립만 재생(그 외엔 본편 파생 폴백).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS hero_clip_id text;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS hero_clip_status text NOT NULL DEFAULT 'none'
  CHECK (hero_clip_status IN ('none', 'pending', 'passed', 'rejected'));

COMMENT ON COLUMN public.videos.hero_clip_id IS '히어로 클립의 Bunny GUID (검수·재생 렌디션 파생 기준)';
COMMENT ON COLUMN public.videos.hero_clip_status IS '히어로 클립 검수: none/pending/passed(재생허용)/rejected';

-- ── 클립 검수 결과 반영 (service_role 전용) ──────────────────────────────────
--   clip_id(Bunny GUID)로 부모 영상을 찾아 hero_clip_status 전이. pending 에서만(오너 재검수 회피 차단).
--   클립은 짧고 홈 히어로에 자동재생되므로 본편(≥90)보다 엄격: score ≥70 → rejected, <70 → passed,
--   분석실패 → pending 유지(재시도, 재생차단 = fail-closed).
CREATE OR REPLACE FUNCTION public.apply_hero_clip_moderation(
  p_clip_id    text,
  p_score      integer,
  p_categories jsonb,
  p_error      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_error IS NOT NULL OR p_score IS NULL THEN
    v_status := 'pending';    -- 재시도, 재생 차단(passed 아님)
  ELSIF p_score >= 70 THEN
    v_status := 'rejected';
  ELSE
    v_status := 'passed';
  END IF;

  UPDATE public.videos
  SET hero_clip_status = v_status
  WHERE hero_clip_id = p_clip_id AND hero_clip_status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.apply_hero_clip_moderation(text, integer, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_hero_clip_moderation(text, integer, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_hero_clip_moderation(text, integer, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_hero_clip_moderation(text, integer, jsonb, text) TO service_role;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='videos' AND column_name IN ('hero_clip_id','hero_clip_status');  -- 2행
--   SELECT proname FROM pg_proc WHERE proname='apply_hero_clip_moderation';              -- 1행
