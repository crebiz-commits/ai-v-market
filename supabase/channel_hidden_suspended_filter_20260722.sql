-- ════════════════════════════════════════════════════════════════════════════
-- 🚫 채널·팔로잉·인기 크리에이터 — 숨김 영상 + 정지 크리에이터 필터 (2026-07-22)
--
--   [결함] creator_followers.sql 헤더는 "is_hidden·is_suspended 누락이 결함"이라
--     적었으나 정작 함수 본문엔 반영이 안 됐다. 실측 확인:
--       · get_creator_videos      : visibility 만 필터 → 모더레이션 숨김(검수미통과·
--                                    신고누적) 영상이 크리에이터 채널에 그대로 노출.
--       · get_my_following_videos : 숨김 노출 + 정지 크리에이터 영상까지 팔로잉 피드 노출.
--       · get_popular_creators    : 정지 크리에이터가 인기 순위·탐색에 노출(홍보 지속).
--
--   [정책 적용 — suspension-enforcement 원칙]
--     정지 = "홍보·수익 노출 제외"이지 본인 접근 차단이 아니다. 그래서:
--       · get_creator_videos(특정 채널 명시 조회) → **is_hidden 만** 추가.
--         is_suspended 는 안 건다(정지 크리에이터 본인이 자기 채널을 봐야 하고,
--         채널은 특정인을 찾아가는 것이라 홍보 서피스가 아님).
--       · get_my_following_videos / get_popular_creators(피드·탐색=홍보 서피스)
--         → is_hidden + is_suspended 둘 다.
--
--   ★ creator_followers.sql 의 이 3함수 새 정본. 그 파일 재실행 금지(필터 소실).
--     get_creator_profile / get_weekly_top_creators 등 나머지는 안 건드림.
--   적용: Supabase SQL Editor → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_creator_videos(p_creator_id UUID, p_limit INT DEFAULT 30)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  thumbnail TEXT,
  creator_id UUID,
  creator_name TEXT,
  duration TEXT,
  duration_seconds INT,
  views TEXT,
  category TEXT,
  ai_tool TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id::TEXT,
    v.title,
    v.thumbnail,
    v.creator_id,
    COALESCE(
      NULLIF(p.display_name, ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(split_part(u.email, '@', 1), ''),
      'AI Creator'
    ) AS creator_name,
    v.duration,
    v.duration_seconds,
    v.views,
    v.category,
    v.ai_tool,
    v.video_url,
    v.created_at
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  LEFT JOIN auth.users u ON u.id = v.creator_id
  WHERE v.creator_id = p_creator_id
    AND (v.visibility = 'public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden, false) = false   -- 모더레이션 숨김 영상 제외(2026-07-22)
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_my_following_videos(p_limit INT DEFAULT 30)
RETURNS TABLE (
  id TEXT,
  title TEXT,
  thumbnail TEXT,
  creator_id UUID,
  creator_name TEXT,
  duration TEXT,
  duration_seconds INT,
  views TEXT,
  category TEXT,
  ai_tool TEXT,
  video_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    v.id::TEXT,
    v.title,
    v.thumbnail,
    v.creator_id,
    COALESCE(
      NULLIF(p.display_name, ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(split_part(u.email, '@', 1), ''),
      'AI Creator'
    ) AS creator_name,
    v.duration,
    v.duration_seconds,
    v.views,
    v.category,
    v.ai_tool,
    v.video_url,
    v.created_at
  FROM public.videos v
  INNER JOIN public.creator_followers cf ON cf.creator_id = v.creator_id
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  LEFT JOIN auth.users u ON u.id = v.creator_id
  WHERE cf.follower_id = auth.uid()
    AND (v.visibility = 'public' OR v.visibility IS NULL)
    AND COALESCE(v.is_hidden, false) = false                 -- 모더레이션 숨김 제외(2026-07-22)
    AND COALESCE(p.is_suspended, false) = false              -- 정지 크리에이터 제외(팔로잉=홍보 서피스)
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$$;

CREATE OR REPLACE FUNCTION public.get_popular_creators(p_limit INT DEFAULT 20)
RETURNS TABLE (
  creator_id UUID,
  creator_name TEXT,
  avatar_url TEXT,
  video_count BIGINT,
  follower_count BIGINT,
  total_views BIGINT,
  recent_thumbnails TEXT[]
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH creator_stats AS (
    SELECT
      v.creator_id,
      COUNT(*) AS video_count,
      -- views 컬럼이 TEXT라 숫자만 합산 (그 외는 0)
      SUM(CASE WHEN v.views ~ '^\d+$' THEN v.views::BIGINT ELSE 0 END) AS total_views
    FROM public.videos v
    LEFT JOIN public.profiles pp ON pp.id = v.creator_id       -- 정지 제외용(2026-07-22, LEFT: profiles 없어도 누락 안 되게)
    WHERE (v.visibility = 'public' OR v.visibility IS NULL)
      AND v.creator_id IS NOT NULL
      AND COALESCE(v.is_hidden, false) = false                -- 숨김 영상은 카운트에서 제외
      AND COALESCE(pp.is_suspended, false) = false            -- 정지 크리에이터는 인기순위 제외
    GROUP BY v.creator_id
  ),
  -- 각 크리에이터의 최근 영상 3개 썸네일을 배열로 묶기
  ranked_videos AS (
    SELECT
      creator_id,
      thumbnail,
      ROW_NUMBER() OVER (PARTITION BY creator_id ORDER BY created_at DESC) AS rn
    FROM public.videos
    WHERE (visibility = 'public' OR visibility IS NULL)
      AND creator_id IS NOT NULL
      AND thumbnail IS NOT NULL
      AND thumbnail <> ''
  ),
  recent_thumbs AS (
    SELECT
      creator_id,
      ARRAY_AGG(thumbnail ORDER BY rn) AS thumbnails
    FROM ranked_videos
    WHERE rn <= 3
    GROUP BY creator_id
  ),
  follower_counts AS (
    SELECT creator_id, COUNT(*) AS follower_count
    FROM public.creator_followers
    GROUP BY creator_id
  )
  SELECT
    cs.creator_id,
    COALESCE(
      NULLIF(p.display_name, ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(split_part(u.email, '@', 1), ''),
      'AI Creator'
    ) AS creator_name,
    COALESCE(
      NULLIF(p.avatar_url, ''),
      NULLIF(u.raw_user_meta_data->>'avatar_url', ''),
      NULLIF(u.raw_user_meta_data->>'picture', '')
    ) AS avatar_url,
    cs.video_count,
    COALESCE(fc.follower_count, 0) AS follower_count,
    cs.total_views,
    COALESCE(rt.thumbnails, ARRAY[]::TEXT[]) AS recent_thumbnails
  FROM creator_stats cs
  LEFT JOIN public.profiles p ON p.id = cs.creator_id
  LEFT JOIN auth.users u ON u.id = cs.creator_id
  LEFT JOIN recent_thumbs rt ON rt.creator_id = cs.creator_id
  LEFT JOIN follower_counts fc ON fc.creator_id = cs.creator_id
  ORDER BY
    COALESCE(fc.follower_count, 0) DESC,
    cs.total_views DESC,
    cs.video_count DESC
  LIMIT p_limit;
$$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '채널 영상목록 숨김 제외(get_creator_videos)' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'is_hidden' FROM pg_proc WHERE proname='get_creator_videos')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '팔로잉 피드 숨김+정지 제외(get_my_following_videos)',
  CASE WHEN (SELECT prosrc ~ 'is_hidden' AND prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_my_following_videos')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '인기 크리에이터 정지 제외(get_popular_creators)',
  CASE WHEN (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_popular_creators')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
