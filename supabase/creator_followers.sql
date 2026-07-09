-- ════════════════════════════════════════════════════════════════════════════
-- 크리에이터 팔로우 + 채널 탭 RPC (Phase 6 — 2026-05-11)
--
-- 🛑 경고(2026-07-09 갱신): 이 파일 전체 재실행 금지.
--   · get_creator_profile / get_creator_videos / get_my_following_videos / get_popular_creators 구버전
--     (banner_url·is_hidden·is_suspended·tiebreak·creator_of_month_until 누락). 정본(SSOT) =
--     channel_feed_audit_20260709.sql. 재실행 시 모더레이션 숨김영상 채널 재노출 + 뱃지 죽음 회귀.
--   · ⚠️ 아래 "creator_followers_select_all"(FOR SELECT USING(true)) RLS 도 구버전 —
--     정본은 channel_feed_audit_20260709.sql 의 select_self(본인 팔로잉만). 재실행하면
--     **팔로우 그래프가 anon 에 전면 노출되는 보안 회귀**. 테이블/인덱스/INSERT·DELETE 정책만 유효.
--
-- 목적:
--   1. creator_followers 테이블 — 팔로워↔크리에이터 관계 저장
--   2. get_my_following_videos() — 채널 탭 "구독" 피드용 영상 목록
--   3. get_popular_creators() — 채널 탭 "탐색" 피드용 인기 크리에이터 목록
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. creator_followers 테이블
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_followers (
  follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creator_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, creator_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> creator_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_followers_follower
  ON public.creator_followers(follower_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creator_followers_creator
  ON public.creator_followers(creator_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RLS — 누구나 조회, 본인 관계만 INSERT/DELETE
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.creator_followers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "creator_followers_select_all" ON public.creator_followers;
CREATE POLICY "creator_followers_select_all" ON public.creator_followers
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "creator_followers_insert_self" ON public.creator_followers;
CREATE POLICY "creator_followers_insert_self" ON public.creator_followers
  FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "creator_followers_delete_self" ON public.creator_followers;
CREATE POLICY "creator_followers_delete_self" ON public.creator_followers
  FOR DELETE USING (auth.uid() = follower_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RPC: 내가 팔로우한 크리에이터들의 최신 영상 (구독 탭)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_my_following_videos(INT);
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
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC: 인기 크리에이터 (탐색 탭) — 영상 1+ 보유, 팔로워수→총조회수 순 정렬
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_popular_creators(INT);
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
    WHERE (v.visibility = 'public' OR v.visibility IS NULL)
      AND v.creator_id IS NOT NULL
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

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC: 크리에이터 프로필 (채널 페이지 헤더용)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_creator_profile(UUID);
CREATE OR REPLACE FUNCTION public.get_creator_profile(p_creator_id UUID)
RETURNS TABLE (
  creator_id UUID,
  creator_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  video_count BIGINT,
  follower_count BIGINT,
  total_views BIGINT,
  am_i_following BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_creator_id AS creator_id,
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
    NULLIF(p.bio, '') AS bio,
    (SELECT COUNT(*) FROM public.videos
       WHERE creator_id = p_creator_id
         AND (visibility = 'public' OR visibility IS NULL)) AS video_count,
    (SELECT COUNT(*) FROM public.creator_followers
       WHERE creator_id = p_creator_id) AS follower_count,
    (SELECT COALESCE(SUM(CASE WHEN views ~ '^\d+$' THEN views::BIGINT ELSE 0 END), 0)
       FROM public.videos
       WHERE creator_id = p_creator_id
         AND (visibility = 'public' OR visibility IS NULL)) AS total_views,
    EXISTS (
      SELECT 1 FROM public.creator_followers
      WHERE follower_id = auth.uid()
        AND creator_id = p_creator_id
    ) AS am_i_following
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = p_creator_id;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC: 크리에이터의 영상 목록 (채널 페이지 그리드용)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_creator_videos(UUID, INT);
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
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$$;

-- 권한
GRANT EXECUTE ON FUNCTION public.get_my_following_videos(INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_popular_creators(INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_profile(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_videos(UUID, INT) TO anon, authenticated;
