-- ════════════════════════════════════════════════════════════════════════════
-- 영상별 유효 조회수 (크리에이터) — 2026-07-03
--
-- 왜: videos.views(TEXT) 컬럼은 track_video_view 가 갱신하지 않아 항상 시드값(0).
--     실제 조회수는 video_views(is_valid=true) 이벤트 수. 등록 상품/대시보드가
--     동일한 "유효 조회수"를 쓰도록 영상별 카운트를 제공.
-- 보안: auth.uid() 본인 영상만. SECURITY DEFINER + authenticated GRANT.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_creator_video_view_counts()
RETURNS TABLE (video_id TEXT, valid_views BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT vv.video_id, COUNT(*)::BIGINT
  FROM public.video_views vv
  WHERE vv.creator_id = auth.uid()
    AND vv.is_valid = true
  GROUP BY vv.video_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_video_view_counts() TO authenticated;

-- 검증:
--   SELECT set_config('request.jwt.claim.sub', (SELECT id::text FROM auth.users WHERE email='crebizlogistics@gmail.com'), true);
--   SELECT * FROM public.get_creator_video_view_counts();
