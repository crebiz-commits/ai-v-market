-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 인기 크리에이터 최근 썸네일 숨김 필터 (2026-07-23 전체감사, 데이터무결성)
--
--   [LOW] get_popular_creators 의 creator_stats(video_count)는 is_hidden=false 로 거르는데,
--         recent_thumbnails 를 만드는 ranked_videos CTE 는 visibility·thumbnail 만 걸고
--         **is_hidden 미필터** → 인기 크리에이터 카드의 "최근 썸네일 3개"에 모더레이션 숨김
--         (신고누적·검수미통과) 영상 썸네일이 노출되고, 같은 카드의 video_count 와 필터 기준이
--         어긋난다. ranked_videos 에 video_count 와 동일한 is_hidden 필터를 추가.
--
--   ※ channel_hidden_suspended_filter_20260722.sql 의 get_popular_creators 전체 복제 +
--     ranked_videos CTE 에 is_hidden 1줄만 추가. 나머지(정지 제외·팔로워/뷰 정렬) 동일.
--     ★ get_popular_creators 새 정본. 그 파일의 get_popular_creators 재실행 금지(필터 소실).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════
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
      SUM(CASE WHEN v.views ~ '^\d+$' THEN v.views::BIGINT ELSE 0 END) AS total_views
    FROM public.videos v
    LEFT JOIN public.profiles pp ON pp.id = v.creator_id
    WHERE (v.visibility = 'public' OR v.visibility IS NULL)
      AND v.creator_id IS NOT NULL
      AND COALESCE(v.is_hidden, false) = false
      AND COALESCE(pp.is_suspended, false) = false
    GROUP BY v.creator_id
  ),
  ranked_videos AS (
    SELECT
      creator_id,
      thumbnail,
      ROW_NUMBER() OVER (PARTITION BY creator_id ORDER BY created_at DESC) AS rn
    FROM public.videos
    WHERE (visibility = 'public' OR visibility IS NULL)
      AND creator_id IS NOT NULL
      AND COALESCE(is_hidden, false) = false          -- 2026-07-23: video_count 와 동일 기준(모더레이션 숨김 썸네일 누수 차단)
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

-- ── 검증 ──
SELECT 'get_popular_creators ranked_videos 숨김필터' AS check_name,
  CASE WHEN (SELECT count(*) FROM regexp_matches(
               (SELECT prosrc FROM pg_proc WHERE proname='get_popular_creators'),
               'is_hidden', 'g')) >= 2   -- creator_stats + ranked_videos 양쪽
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
