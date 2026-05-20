-- ════════════════════════════════════════════════════════════════════════════
-- Phase 26 보강 — 카드용 age_rating 일괄 조회
--
-- 배경:
--   Cinema/Ott/SearchPage 카드에 19+ 배지·잠금을 표시하려면 영상 id로
--   age_rating을 알아야 함. 추천 RPC 6개의 RETURNS TABLE를 모두 고치는 대신
--   카드 단계에서 영상 id 배열로 한 번만 호출하는 가벼운 lookup RPC를 둠.
--
-- 보안:
--   age_rating은 카드에 노출되는 공개 정보(배지). 비로그인 사용자도 조회 가능.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_age_ratings_for_videos(
  p_video_ids TEXT[]
)
RETURNS TABLE (
  video_id    TEXT,
  age_rating  TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT v.id::TEXT, COALESCE(v.age_rating, 'all')
  FROM public.videos v
  WHERE v.id::TEXT = ANY(p_video_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_age_ratings_for_videos(TEXT[]) TO authenticated, anon;

COMMENT ON FUNCTION public.get_age_ratings_for_videos IS
  'Phase 26 보강 — 영상 id 배열로 age_rating 일괄 조회. 카드 19+ 배지·잠금 표시용.';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--   SELECT * FROM public.get_age_ratings_for_videos(
--     ARRAY(SELECT id::TEXT FROM public.videos LIMIT 5)
--   );
-- ────────────────────────────────────────────────────────────────────────────
