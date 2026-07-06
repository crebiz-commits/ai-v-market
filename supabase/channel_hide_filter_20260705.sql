-- ════════════════════════════════════════════════════════════════════════════
-- 크리에이터 채널/탐색 RPC 에 모더레이션 숨김(is_hidden) 필터 추가 (2026-07-05) — CH1
--
--   문제: 모든 피드 RPC 는 visibility 뿐 아니라 is_hidden(모더레이션 소프트 숨김)도 필터하는데,
--         채널·탐색용 RPC 4개(get_creator_profile / get_creator_videos / get_my_following_videos /
--         get_popular_creators)는 visibility 만 필터해 **관리자가 숨긴 영상이 크리에이터 채널·
--         탐색에 그대로 노출**되고 조회수/영상수 카운트·썸네일까지 부풀린다(anon 접근).
--   수정: 네 함수의 videos 접근 WHERE 에 AND COALESCE(is_hidden,false)=false 추가.
--         (get_creator_profile 은 banner_url 포함 phase6_5 라이브본 기준으로 재정의)
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) get_creator_profile — video_count / total_views 에 is_hidden 제외
CREATE OR REPLACE FUNCTION public.get_creator_profile(p_creator_id UUID)
RETURNS TABLE (
  creator_id UUID, creator_name TEXT, avatar_url TEXT, banner_url TEXT, bio TEXT,
  video_count BIGINT, follower_count BIGINT, total_views BIGINT, am_i_following BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p_creator_id AS creator_id,
    COALESCE(NULLIF(p.display_name,''), NULLIF(u.raw_user_meta_data->>'name',''),
             NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(split_part(u.email,'@',1),''),
             'AI Creator') AS creator_name,
    COALESCE(NULLIF(p.avatar_url,''), NULLIF(u.raw_user_meta_data->>'avatar_url',''),
             NULLIF(u.raw_user_meta_data->>'picture','')) AS avatar_url,
    NULLIF(p.banner_url,'') AS banner_url,
    NULLIF(p.bio,'') AS bio,
    (SELECT COUNT(*) FROM public.videos
       WHERE creator_id = p_creator_id
         AND (visibility='public' OR visibility IS NULL)
         AND COALESCE(is_hidden,false)=false) AS video_count,
    (SELECT COUNT(*) FROM public.creator_followers WHERE creator_id = p_creator_id) AS follower_count,
    (SELECT COALESCE(SUM(CASE WHEN views ~ '^\d+$' THEN views::BIGINT ELSE 0 END),0)
       FROM public.videos
       WHERE creator_id = p_creator_id
         AND (visibility='public' OR visibility IS NULL)
         AND COALESCE(is_hidden,false)=false) AS total_views,
    EXISTS (SELECT 1 FROM public.creator_followers
            WHERE follower_id = auth.uid() AND creator_id = p_creator_id) AS am_i_following
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = p_creator_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_creator_profile(UUID) TO anon, authenticated;

-- 2) get_creator_videos — 숨김 영상 제외
CREATE OR REPLACE FUNCTION public.get_creator_videos(p_creator_id UUID, p_limit INT DEFAULT 30)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, creator_id UUID, creator_name TEXT, duration TEXT,
  duration_seconds INT, views TEXT, category TEXT, ai_tool TEXT, video_url TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.id::TEXT, v.title, v.thumbnail, v.creator_id,
    COALESCE(NULLIF(p.display_name,''), NULLIF(u.raw_user_meta_data->>'name',''),
             NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(split_part(u.email,'@',1),''),
             'AI Creator') AS creator_name,
    v.duration, v.duration_seconds, v.views, v.category, v.ai_tool, v.video_url, v.created_at
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  LEFT JOIN auth.users u ON u.id = v.creator_id
  WHERE v.creator_id = p_creator_id
    AND (v.visibility='public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden,false)=false
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_creator_videos(UUID, INT) TO anon, authenticated;

-- 3) get_my_following_videos — 숨김 영상 제외
CREATE OR REPLACE FUNCTION public.get_my_following_videos(p_limit INT DEFAULT 30)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, creator_id UUID, creator_name TEXT, duration TEXT,
  duration_seconds INT, views TEXT, category TEXT, ai_tool TEXT, video_url TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.id::TEXT, v.title, v.thumbnail, v.creator_id,
    COALESCE(NULLIF(p.display_name,''), NULLIF(u.raw_user_meta_data->>'name',''),
             NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(split_part(u.email,'@',1),''),
             'AI Creator') AS creator_name,
    v.duration, v.duration_seconds, v.views, v.category, v.ai_tool, v.video_url, v.created_at
  FROM public.videos v
  INNER JOIN public.creator_followers cf ON cf.creator_id = v.creator_id
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  LEFT JOIN auth.users u ON u.id = v.creator_id
  WHERE cf.follower_id = auth.uid()
    AND (v.visibility='public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden,false)=false
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_following_videos(INT) TO anon, authenticated;

-- 4) get_popular_creators — 숨김 영상이 카운트/썸네일에 안 들어가게
CREATE OR REPLACE FUNCTION public.get_popular_creators(p_limit INT DEFAULT 20)
RETURNS TABLE (
  creator_id UUID, creator_name TEXT, avatar_url TEXT, video_count BIGINT,
  follower_count BIGINT, total_views BIGINT, recent_thumbnails TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH creator_stats AS (
    SELECT v.creator_id, COUNT(*) AS video_count,
      SUM(CASE WHEN v.views ~ '^\d+$' THEN v.views::BIGINT ELSE 0 END) AS total_views
    FROM public.videos v
    WHERE (v.visibility='public' OR v.visibility IS NULL)
      AND COALESCE(v.is_hidden,false)=false
      AND v.creator_id IS NOT NULL
    GROUP BY v.creator_id
  ),
  ranked_videos AS (
    SELECT creator_id, thumbnail,
      ROW_NUMBER() OVER (PARTITION BY creator_id ORDER BY created_at DESC) AS rn
    FROM public.videos
    WHERE (visibility='public' OR visibility IS NULL)
      AND COALESCE(is_hidden,false)=false
      AND creator_id IS NOT NULL AND thumbnail IS NOT NULL AND thumbnail <> ''
  ),
  recent_thumbs AS (
    SELECT creator_id, ARRAY_AGG(thumbnail ORDER BY rn) AS thumbnails
    FROM ranked_videos WHERE rn <= 3 GROUP BY creator_id
  ),
  follower_counts AS (
    SELECT creator_id, COUNT(*) AS follower_count FROM public.creator_followers GROUP BY creator_id
  )
  SELECT cs.creator_id,
    COALESCE(NULLIF(p.display_name,''), NULLIF(u.raw_user_meta_data->>'name',''),
             NULLIF(u.raw_user_meta_data->>'full_name',''), NULLIF(split_part(u.email,'@',1),''),
             'AI Creator') AS creator_name,
    COALESCE(NULLIF(p.avatar_url,''), NULLIF(u.raw_user_meta_data->>'avatar_url',''),
             NULLIF(u.raw_user_meta_data->>'picture','')) AS avatar_url,
    cs.video_count, COALESCE(fc.follower_count,0) AS follower_count, cs.total_views,
    COALESCE(rt.thumbnails, ARRAY[]::TEXT[]) AS recent_thumbnails
  FROM creator_stats cs
  LEFT JOIN public.profiles p ON p.id = cs.creator_id
  LEFT JOIN auth.users u ON u.id = cs.creator_id
  LEFT JOIN recent_thumbs rt ON rt.creator_id = cs.creator_id
  LEFT JOIN follower_counts fc ON fc.creator_id = cs.creator_id
  ORDER BY COALESCE(fc.follower_count,0) DESC, cs.total_views DESC, cs.video_count DESC
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_popular_creators(INT) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증: 크리에이터의 공개 영상 하나를 is_hidden=true 로 만든 뒤 채널에서 사라지는지
--   SELECT id FROM public.get_creator_videos('<creator_uuid>'::uuid, 30);  -- 숨김영상 미포함이어야
--   SELECT video_count, total_views FROM public.get_creator_profile('<creator_uuid>'::uuid);
-- ════════════════════════════════════════════════════════════════════════════
