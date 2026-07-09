-- ════════════════════════════════════════════════════════════════════════════
-- 채널 피드 감사 수정 (2026-07-09) — 이 파일이 채널 RPC 4종 + weekly + 팔로우 RLS 의 SSOT.
--
--   확증 이슈(3중 병렬 감사):
--   1) [HIGH] 이달의 크리에이터 뱃지 죽음 — CreatorChannel 이 profiles.creator_of_month_until 를
--      직접 select 하나 컬럼 GRANT 화이트리스트에 없어 permission denied → 뱃지 영구 미표시.
--      → get_creator_profile(SECURITY DEFINER, 컬럼 GRANT 우회) 반환에 creator_of_month_until 추가.
--   2) [MED] creator_followers SELECT USING(true) → anon 이 팔로우 그래프 전체 열람(소셜 PII).
--      → 본인 팔로잉만 SELECT. (follower_count·am_i_following 은 DEFINER RPC 가 서빙하므로 안전.)
--   3) [MED] get_popular_creators 가 is_suspended 미필터 → 정지 크리에이터가 탐색 인기목록 노출.
--   4) [MED] get_weekly_top_creators 결정적 tiebreak 없음(하드닝이 엉뚱한 함수 고침) → p.id 추가.
--   5) [LOW/PII] creator_name 폴백의 split_part(email,'@',1) → 이메일 아이디가 공개 크리에이터명
--      으로 노출. 4개 RPC 에서 제거(→ 'AI Creator' 폴백).
--
--   ※ total_views(videos.views 시드 합산) vs TopCreators(video_views 실측) 불일치는 시드
--     프레젠테이션 영향이 커 이번엔 보류(제품 판단 필요).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) get_creator_profile — creator_of_month_until 추가 + 이메일폴백 제거 ──
CREATE OR REPLACE FUNCTION public.get_creator_profile(p_creator_id UUID)
RETURNS TABLE (
  creator_id UUID, creator_name TEXT, avatar_url TEXT, banner_url TEXT, bio TEXT,
  video_count BIGINT, follower_count BIGINT, total_views BIGINT, am_i_following BOOLEAN,
  creator_of_month_until TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    p_creator_id AS creator_id,
    COALESCE(NULLIF(p.display_name,''), NULLIF(u.raw_user_meta_data->>'name',''),
             NULLIF(u.raw_user_meta_data->>'full_name',''), 'AI Creator') AS creator_name,
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
            WHERE follower_id = auth.uid() AND creator_id = p_creator_id) AS am_i_following,
    p.creator_of_month_until AS creator_of_month_until
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = p_creator_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_creator_profile(UUID) TO anon, authenticated;

-- ── 2) get_creator_videos — 이메일폴백 제거(그 외 channel_hide_filter 동일) ──
CREATE OR REPLACE FUNCTION public.get_creator_videos(p_creator_id UUID, p_limit INT DEFAULT 30)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, creator_id UUID, creator_name TEXT, duration TEXT,
  duration_seconds INT, views TEXT, category TEXT, ai_tool TEXT, video_url TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.id::TEXT, v.title, v.thumbnail, v.creator_id,
    COALESCE(NULLIF(p.display_name,''), NULLIF(u.raw_user_meta_data->>'name',''),
             NULLIF(u.raw_user_meta_data->>'full_name',''), 'AI Creator') AS creator_name,
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

-- ── 3) get_my_following_videos — 이메일폴백 제거 ──
CREATE OR REPLACE FUNCTION public.get_my_following_videos(p_limit INT DEFAULT 30)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, creator_id UUID, creator_name TEXT, duration TEXT,
  duration_seconds INT, views TEXT, category TEXT, ai_tool TEXT, video_url TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT v.id::TEXT, v.title, v.thumbnail, v.creator_id,
    COALESCE(NULLIF(p.display_name,''), NULLIF(u.raw_user_meta_data->>'name',''),
             NULLIF(u.raw_user_meta_data->>'full_name',''), 'AI Creator') AS creator_name,
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

-- ── 4) get_popular_creators — is_suspended 제외 + 이메일폴백 제거 + 결정적 tiebreak(creator_id) ──
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
             NULLIF(u.raw_user_meta_data->>'full_name',''), 'AI Creator') AS creator_name,
    COALESCE(NULLIF(p.avatar_url,''), NULLIF(u.raw_user_meta_data->>'avatar_url',''),
             NULLIF(u.raw_user_meta_data->>'picture','')) AS avatar_url,
    cs.video_count, COALESCE(fc.follower_count,0) AS follower_count, cs.total_views,
    COALESCE(rt.thumbnails, ARRAY[]::TEXT[]) AS recent_thumbnails
  FROM creator_stats cs
  LEFT JOIN public.profiles p ON p.id = cs.creator_id
  LEFT JOIN auth.users u ON u.id = cs.creator_id
  LEFT JOIN recent_thumbs rt ON rt.creator_id = cs.creator_id
  LEFT JOIN follower_counts fc ON fc.creator_id = cs.creator_id
  WHERE COALESCE(p.is_suspended, false) = false   -- 정지 크리에이터 탐색 제외
  ORDER BY COALESCE(fc.follower_count,0) DESC, cs.total_views DESC, cs.video_count DESC, cs.creator_id
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_popular_creators(INT) TO anon, authenticated;

-- ── 5) get_weekly_top_creators — 결정적 tiebreak(p.id) 추가 (TopCreators 방문마다 순서 튐 해소) ──
--   ※ 나머지 본문은 weekly_top_creators_20260611.sql 정본과 동일. ORDER BY 끝에 p.id 만 추가.
CREATE OR REPLACE FUNCTION public.get_weekly_top_creators(p_limit INTEGER DEFAULT 10, p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  creator_id UUID, creator_name TEXT, avatar_url TEXT,
  follower_count BIGINT, weekly_views BIGINT, total_views BIGINT, video_count BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH base AS (
    SELECT v.id, v.creator_id
    FROM public.videos v
    WHERE (v.visibility='public' OR v.visibility IS NULL)
      AND COALESCE(v.is_hidden,false)=false
      AND v.creator_id IS NOT NULL
  ),
  agg AS (
    SELECT b.creator_id,
      COUNT(vv.id) FILTER (WHERE vv.is_valid AND vv.created_at >= now() - make_interval(days => p_days)) AS weekly_v,
      COUNT(vv.id) FILTER (WHERE vv.is_valid) AS total_v,
      COUNT(DISTINCT b.id) AS vc
    FROM base b
    LEFT JOIN public.video_views vv ON vv.video_id = b.id
    GROUP BY b.creator_id
  ),
  followers AS (
    SELECT creator_id, COUNT(*)::BIGINT AS fc
    FROM public.creator_followers GROUP BY creator_id
  )
  SELECT
    p.id,
    COALESCE(NULLIF(p.display_name, ''), 'AI Creator'),
    p.avatar_url,
    COALESCE(f.fc, 0),
    COALESCE(a.weekly_v, 0),
    COALESCE(a.total_v, 0),
    COALESCE(a.vc, 0)
  FROM public.profiles p
  INNER JOIN agg a ON a.creator_id = p.id
  LEFT JOIN followers f ON f.creator_id = p.id
  WHERE COALESCE(p.is_suspended, false) = false
    AND a.vc > 0
  ORDER BY COALESCE(a.weekly_v, 0) DESC,
           COALESCE(f.fc, 0) DESC,
           COALESCE(a.total_v, 0) DESC,
           p.id
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_weekly_top_creators(INTEGER, INTEGER) TO anon, authenticated;

-- ── 6) creator_followers SELECT RLS 좁히기 — 본인 팔로잉만(소셜 그래프 PII 비노출) ──
DROP POLICY IF EXISTS "creator_followers_select_all" ON public.creator_followers;
DROP POLICY IF EXISTS "creator_followers_select_self" ON public.creator_followers;
CREATE POLICY "creator_followers_select_self" ON public.creator_followers
  FOR SELECT USING (auth.uid() = follower_id);

-- 명시적 테이블 GRANT(기본권한 의존 제거 — 향후 blanket revoke 시에도 팔로우 쓰기 유지).
--   SELECT 는 위 정책이 본인행만 통과. anon 은 uid 없어 0행이라 SELECT 불필요.
GRANT SELECT, INSERT, DELETE ON public.creator_followers TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT creator_of_month_until FROM public.get_creator_profile('<uuid>'::uuid);  -- 왕관 부여 크리에이터면 미래 시각
--   SELECT polname, pg_get_expr(polqual, polrelid) FROM pg_policy
--     WHERE polrelid='public.creator_followers'::regclass AND polcmd='r';  -- USING (auth.uid()=follower_id)
--   -- 정지 크리에이터가 get_popular_creators 결과에서 빠지는지, weekly 순서가 방문마다 고정인지.
