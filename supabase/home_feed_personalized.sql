-- ════════════════════════════════════════════════════════════════════════════
-- 홈 피드 개인화 추천 RPC: get_home_feed(p_limit, p_offset)
--
-- 홈 피드는 "모든 영상의 하이라이트 코너" — 모든 show_on_home 영상이 포함되고
-- 우선순위(순서)만 사용자별로 달라진다. 무한 스크롤 페이징(OFFSET/LIMIT)과 호환.
--
--   - 로그인 + 이력 있음: 카테고리/장르 취향(좋아요 가중 3 / 시청 1)
--                        + 좋아요·팔로우한 크리에이터 가중 + 인기 베이스라인.
--                        이미 본 영상은 제외가 아니라 후순위로 내림.
--   - 비로그인 / 이력 없음: 인기(좋아요 + 최근 7일 유효조회수×2) + 최신순.
--
-- 페이지 안정성: 동일 데이터에서 ORDER BY가 결정적(타이브레이커 v.created_at, v.id)
--               이라 OFFSET/LIMIT 페이지 간 중복/누락이 없다.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_home_feed(p_limit integer DEFAULT 12, p_offset integer DEFAULT 0)
RETURNS SETOF public.videos
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user_id uuid := auth.uid();
  v_has_history boolean := false;
BEGIN
  IF v_user_id IS NOT NULL THEN
    SELECT (EXISTS (SELECT 1 FROM public.video_likes WHERE user_id = v_user_id)
         OR EXISTS (SELECT 1 FROM public.video_views WHERE viewer_user_id = v_user_id AND is_valid = true))
    INTO v_has_history;
  END IF;

  IF v_user_id IS NULL OR NOT v_has_history THEN
    -- 비로그인/이력 없음: 인기(좋아요 + 최근 7일 조회) + 최신순 (모든 show_on_home 영상)
    RETURN QUERY
    SELECT v.*
    FROM public.videos v
    WHERE v.show_on_home = true
      AND (v.visibility = 'public' OR v.visibility IS NULL)
      AND COALESCE(v.is_hidden, false) = false
    ORDER BY (
      COALESCE(v.likes, 0) * 1.0
      + (SELECT COUNT(*) FROM public.video_views vv
         WHERE vv.video_id = v.id AND vv.is_valid = true
           AND vv.occurred_at >= now() - INTERVAL '7 days') * 2.0
    ) DESC, v.created_at DESC, v.id
    LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  -- 로그인 + 이력: 취향 가중 + 인기 베이스라인, 시청영상은 후순위(제외 아님)
  RETURN QUERY
  WITH cat_pref AS (
    SELECT category, SUM(w)::numeric AS s FROM (
      SELECT v.category, 3 AS w FROM public.video_likes l JOIN public.videos v ON v.id = l.video_id
        WHERE l.user_id = v_user_id AND v.category IS NOT NULL
      UNION ALL
      SELECT v.category, 1 AS w FROM public.video_views vv JOIN public.videos v ON v.id = vv.video_id
        WHERE vv.viewer_user_id = v_user_id AND vv.is_valid = true AND v.category IS NOT NULL
    ) t GROUP BY category
  ),
  genre_pref AS (
    SELECT genre, SUM(w)::numeric AS s FROM (
      SELECT v.genre, 3 AS w FROM public.video_likes l JOIN public.videos v ON v.id = l.video_id
        WHERE l.user_id = v_user_id AND v.genre IS NOT NULL
      UNION ALL
      SELECT v.genre, 1 AS w FROM public.video_views vv JOIN public.videos v ON v.id = vv.video_id
        WHERE vv.viewer_user_id = v_user_id AND vv.is_valid = true AND v.genre IS NOT NULL
    ) t GROUP BY genre
  ),
  creator_pref AS (
    SELECT creator_id, SUM(w)::numeric AS s FROM (
      SELECT v.creator_id, 3 AS w FROM public.video_likes l JOIN public.videos v ON v.id = l.video_id
        WHERE l.user_id = v_user_id AND v.creator_id IS NOT NULL
      UNION ALL
      SELECT cf.creator_id, 5 AS w FROM public.creator_followers cf
        WHERE cf.follower_id = v_user_id AND cf.creator_id IS NOT NULL
    ) t GROUP BY creator_id
  ),
  viewed AS (
    SELECT DISTINCT video_id FROM public.video_views
    WHERE viewer_user_id = v_user_id AND is_valid = true
  )
  SELECT v.*
  FROM public.videos v
  LEFT JOIN cat_pref cp ON cp.category = v.category
  LEFT JOIN genre_pref gp ON gp.genre = v.genre
  LEFT JOIN creator_pref crp ON crp.creator_id = v.creator_id
  LEFT JOIN viewed vw ON vw.video_id = v.id
  WHERE v.show_on_home = true
    AND (v.visibility = 'public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden, false) = false
  ORDER BY (
    COALESCE(cp.s, 0) * 1.0
    + COALESCE(gp.s, 0) * 1.0
    + COALESCE(crp.s, 0) * 1.0
    + COALESCE(v.likes, 0) * 0.05
    - (CASE WHEN vw.video_id IS NOT NULL THEN 4 ELSE 0 END)
  ) DESC, v.created_at DESC, v.id
  LIMIT p_limit OFFSET p_offset;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_home_feed(integer, integer) TO anon, authenticated;
