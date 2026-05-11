-- ════════════════════════════════════════════════════════════════════════════
-- Phase 6.5 — 채널 보완 (2026-05-12)
--
-- 추가 작업:
--   1. profiles.banner_url 컬럼 (채널 페이지 헤더 배너 이미지)
--   2. get_creator_profile RPC에 banner_url 반환 추가
--   3. get_my_following_videos / get_creator_videos RPC에 creator_id로
--      이미 충분, 추가 변경 없음 (영상 카드 → 채널 진입은 클라이언트에서)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. profiles에 banner_url 컬럼 추가
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banner_url TEXT;

-- 1.5. profiles INSERT 정책 추가
-- (MyPage 프로필 편집의 upsert가 작동하도록 — 트리거가 못 만든 row 대응)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. get_creator_profile에 banner_url 반환 추가 (시그니처 변경 → DROP 필수)
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_creator_profile(UUID);
CREATE OR REPLACE FUNCTION public.get_creator_profile(p_creator_id UUID)
RETURNS TABLE (
  creator_id UUID,
  creator_name TEXT,
  avatar_url TEXT,
  banner_url TEXT,
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
    NULLIF(p.banner_url, '') AS banner_url,
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

GRANT EXECUTE ON FUNCTION public.get_creator_profile(UUID) TO anon, authenticated;
