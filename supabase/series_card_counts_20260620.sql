-- A: 시네마/OTT 카드 "시리즈 · N화" 배지용 — 영상 id 배열로 시리즈 회차수 일괄 조회
-- 핵심 피드 RPC(get_videos_by_genre 등 5개)를 건드리지 않고, 카드용으로만 별도 조회.
-- useSeriesCounts 훅이 호출. anon + authenticated 모두 허용(공개 피드).
-- 회차수 계산은 상세페이지 get_series_episodes 와 동일 필터(visibility/is_hidden)로 일치시킴.
--
-- 적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등).

CREATE OR REPLACE FUNCTION public.get_series_counts_for_videos(p_video_ids TEXT[])
RETURNS TABLE(video_id TEXT, series_id UUID, episode_count INT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id AS video_id,
    v.series_id,
    (SELECT COUNT(*)::INT
       FROM public.videos v2
      WHERE v2.series_id = v.series_id
        AND COALESCE(v2.visibility, 'public') = 'public'
        AND COALESCE(v2.is_hidden, false) = false) AS episode_count
  FROM public.videos v
  WHERE v.id = ANY(p_video_ids)
    AND v.series_id IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_series_counts_for_videos(TEXT[]) TO anon, authenticated;

-- 검증:
--   SELECT * FROM public.get_series_counts_for_videos(ARRAY['<video_id1>','<video_id2>']);
