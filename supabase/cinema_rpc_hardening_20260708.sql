-- ════════════════════════════════════════════════════════════════════════════
-- 시네마피드 RPC 견고화 — 2차 심화감사 SQL 결함 3건 수정 (2026-07-08)
--
--   ① 트렌딩 중복 시청 부풀림: get_trending_videos 가 raw view 행 수(COUNT(vv.id))로
--      순위를 매겨, is_valid(IP 24h dedup)를 통과한 뒤에도 장기 윈도우(예 720h=30일)에서
--      같은 시청자가 여러 24h 구간에 걸쳐 중복 카운트됨.
--      → user 있으면 viewer_user_id, 없으면 ip_address(익명 보존) 기준 DISTINCT 로 dedup.
--        (단순 DISTINCT viewer_user_id 는 익명(NULL) 시청을 전부 누락시켜 악화 → 채택 안 함)
--   ② 카드 순서 불안정: 행 RPC 들이 created_at DESC 단일 정렬이라 동시각 대량적재분(180+편)이
--      방문마다 뒤섞임 → 2차 정렬키 v.id 추가로 결정적 순서 고정.
--   ③ 길이 텍스트 수정 시 tier 재분류 누락: classify_video_placement 가 duration_seconds 가
--      이미 있으면 duration 텍스트 파싱을 건너뛰어, 텍스트만 재편집하면 show_on_cinema/ott 가
--      옛 초에서 계산됨 → UPDATE 로 duration 텍스트가 바뀌면 재파싱하도록 수정.
--
--   부수 견고화: SQL 함수들(trending/new/category/genre)에 SET search_path 명시(정본 결여분 보정).
--   전부 CREATE OR REPLACE(시그니처·반환컬럼 불변) → 멱등, 의존성 안전.
--   적용: Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① + ② get_trending_videos: 시청자 dedup + 결정적 정렬 + search_path ──────────
CREATE OR REPLACE FUNCTION public.get_trending_videos(
  p_tier TEXT DEFAULT 'all',
  p_hours INTEGER DEFAULT 24,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, genre TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ, recent_views BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at,
    -- 시청자 단위 dedup: 로그인=user, 익명=IP, 둘 다 없으면 행 자체(원본과 동일 최소보장)
    COUNT(DISTINCT COALESCE(vv.viewer_user_id::TEXT, vv.ip_address, vv.id::TEXT))::BIGINT AS recent_views
  FROM public.v_available_videos v
  LEFT JOIN public.video_views vv
    ON vv.video_id = v.id
    AND vv.is_valid = true
    AND vv.occurred_at >= now() - (p_hours || ' hours')::INTERVAL
  WHERE
    (p_tier = 'all' OR
     (p_tier = 'cinema' AND v.show_on_cinema = true) OR
     (p_tier = 'ott' AND v.show_on_ott = true))
  GROUP BY v.id, v.title, v.thumbnail, v.video_url, v.creator, v.creator_id,
           v.creator_display_name, v.creator_avatar, v.category, v.genre, v.ai_tool,
           v.duration, v.duration_seconds, v.views, v.likes, v.price_standard,
           v.highlight_start, v.highlight_end, v.created_at
  HAVING COUNT(vv.id) > 0
  ORDER BY recent_views DESC, v.created_at DESC, v.id
  LIMIT p_limit;
$$;

-- ── ② get_new_releases: 결정적 정렬 + search_path ──────────────────────────────
CREATE OR REPLACE FUNCTION public.get_new_releases(
  p_tier TEXT DEFAULT 'all',
  p_days INTEGER DEFAULT 14,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, genre TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at
  FROM public.v_available_videos v
  WHERE
    v.created_at >= now() - (p_days || ' days')::INTERVAL
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY v.created_at DESC, v.id
  LIMIT p_limit;
$$;

-- ── ② get_videos_by_category: 결정적 정렬 + search_path ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_videos_by_category(
  p_category TEXT,
  p_tier TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id UUID, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, genre TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, likes INTEGER, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at
  FROM public.v_available_videos v
  WHERE
    v.category = p_category
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY v.created_at DESC, v.id
  LIMIT p_limit;
$$;

-- ── ② get_videos_by_genre: 결정적 정렬 + search_path (GRANT 유지) ───────────────
CREATE OR REPLACE FUNCTION public.get_videos_by_genre(p_genre text, p_tier text DEFAULT 'all'::text, p_limit integer DEFAULT 10)
RETURNS TABLE(id text, title text, thumbnail text, video_url text, creator text, creator_id uuid, creator_display_name text, creator_avatar text, category text, genre text, ai_tool text, duration text, duration_seconds integer, views bigint, likes integer, price_standard integer, highlight_start real, highlight_end real, created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end, v.created_at
  FROM public.v_available_videos v
  WHERE v.genre = p_genre
    AND (p_tier = 'all' OR (p_tier = 'cinema' AND v.show_on_cinema = true) OR (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY v.created_at DESC, v.id
  LIMIT p_limit;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_videos_by_genre(text, text, integer) TO anon, authenticated;

-- ── ② get_recommended_videos: 두 분기 모두 결정적 정렬(v.id) 추가 ───────────────
--   (본문은 high_fixes_20260614.sql 정본 그대로, ORDER BY 만 v.id 2차키 추가)
CREATE OR REPLACE FUNCTION public.get_recommended_videos(p_tier text DEFAULT 'all'::text, p_limit integer DEFAULT 20)
RETURNS TABLE(id text, title text, thumbnail text, video_url text, creator text, creator_id uuid,
              creator_display_name text, creator_avatar text, category text, genre text, ai_tool text,
              duration text, duration_seconds integer, views bigint, likes integer, price_standard integer,
              highlight_start real, highlight_end real, created_at timestamp with time zone, score numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
#variable_conflict use_column
DECLARE
  v_user_id UUID := auth.uid();
  v_has_history BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.video_likes WHERE user_id = v_user_id
    UNION ALL
    SELECT 1 FROM public.video_views WHERE viewer_user_id = v_user_id AND is_valid = true
    LIMIT 1
  ) INTO v_has_history;

  IF v_user_id IS NULL OR NOT v_has_history THEN
    RETURN QUERY
    SELECT
      v.id::TEXT, v.title, v.thumbnail, v.video_url,
      v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
      v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
      COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
      v.highlight_start, v.highlight_end,
      v.created_at,
      (COALESCE(v.likes, 0) * 1.0 +
        (SELECT COUNT(*) FROM public.video_views vv
         WHERE vv.video_id = v.id AND vv.is_valid = true
           AND vv.occurred_at >= now() - INTERVAL '24 hours') * 2.0
      )::NUMERIC AS score
    FROM public.v_available_videos v
    WHERE
      (p_tier = 'all' OR
       (p_tier = 'cinema' AND v.show_on_cinema = true) OR
       (p_tier = 'ott' AND v.show_on_ott = true))
    ORDER BY score DESC, v.created_at DESC, v.id
    LIMIT p_limit;
    RETURN;
  END IF;

  RETURN QUERY
  WITH user_categories AS (
    SELECT v.category, 2 AS weight
    FROM public.video_likes l JOIN public.videos v ON v.id = l.video_id
    WHERE l.user_id = v_user_id AND v.category IS NOT NULL
    UNION ALL
    SELECT v.category, 1 AS weight
    FROM public.video_views vv JOIN public.videos v ON v.id = vv.video_id
    WHERE vv.viewer_user_id = v_user_id AND vv.is_valid = true AND v.category IS NOT NULL
  ),
  category_scores AS (
    SELECT category, SUM(weight)::NUMERIC AS total_score FROM user_categories GROUP BY category
  ),
  user_genres AS (
    SELECT v.genre, 2 AS weight
    FROM public.video_likes l JOIN public.videos v ON v.id = l.video_id
    WHERE l.user_id = v_user_id AND v.genre IS NOT NULL
    UNION ALL
    SELECT v.genre, 1 AS weight
    FROM public.video_views vv JOIN public.videos v ON v.id = vv.video_id
    WHERE vv.viewer_user_id = v_user_id AND vv.is_valid = true AND v.genre IS NOT NULL
  ),
  genre_scores AS (
    SELECT genre, SUM(weight)::NUMERIC AS total_score FROM user_genres GROUP BY genre
  ),
  watched_ids AS (
    SELECT DISTINCT video_id FROM public.video_views
    WHERE viewer_user_id = v_user_id AND is_valid = true
  )
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.genre, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.likes, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    v.created_at,
    COALESCE(cs.total_score, 0) + COALESCE(gs.total_score, 0) + COALESCE(v.likes, 0) * 0.1 AS score
  FROM public.v_available_videos v
  LEFT JOIN category_scores cs ON cs.category = v.category
  LEFT JOIN genre_scores gs ON gs.genre = v.genre
  WHERE
    v.creator_id IS DISTINCT FROM v_user_id
    AND v.id NOT IN (SELECT video_id FROM watched_ids)
    AND (p_tier = 'all' OR
         (p_tier = 'cinema' AND v.show_on_cinema = true) OR
         (p_tier = 'ott' AND v.show_on_ott = true))
  ORDER BY score DESC NULLS LAST, v.created_at DESC, v.id
  LIMIT p_limit;
END;
$fn$;

-- ── ③ classify_video_placement: 길이 텍스트 수정 시 재파싱 ──────────────────────
--   (content_policy_v2.sql 정본 그대로 + 파싱 조건에 "UPDATE 로 duration 텍스트 변경" 추가)
CREATE OR REPLACE FUNCTION public.classify_video_placement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parsed         INTEGER;
  v_cinema_min   INTEGER;
  v_ott_min      INTEGER;
BEGIN
  v_cinema_min := COALESCE(public.get_platform_setting('cinema_min_duration_seconds')::INTEGER, 60);
  v_ott_min    := COALESCE(public.get_platform_setting('ott_min_duration_seconds')::INTEGER, 600);

  -- duration_seconds 자동 파싱:
  --   · duration_seconds 가 비었을 때(INSERT 기본), OR
  --   · UPDATE 로 duration 텍스트가 실제로 바뀌었을 때(옛 tier 고착 방지) 재파싱.
  --   (텍스트 변화 없이 duration_seconds 만 직접 수정한 경우는 그 값을 존중 → 재파싱 안 함)
  IF NEW.duration IS NOT NULL AND (
       NEW.duration_seconds IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.duration IS DISTINCT FROM OLD.duration)
     ) THEN
    NEW.duration_seconds :=
      CASE
        WHEN NEW.duration ~ '^\d+:\d+:\d+$' THEN
          (split_part(NEW.duration, ':', 1)::int * 3600) +
          (split_part(NEW.duration, ':', 2)::int * 60) +
          (split_part(NEW.duration, ':', 3)::int)
        WHEN NEW.duration ~ '^\d+:\d+$' THEN
          (split_part(NEW.duration, ':', 1)::int * 60) +
          (split_part(NEW.duration, ':', 2)::int)
        WHEN NEW.duration ~ '^\d+$' THEN
          NEW.duration::int
        ELSE 0
      END;
  END IF;

  parsed := COALESCE(NEW.duration_seconds, 0);

  NEW.show_on_home := true;
  NEW.show_on_cinema := parsed >= v_cinema_min;
  NEW.show_on_ott := parsed >= v_ott_min;

  IF NEW.ad_eligibility_at IS NULL THEN
    NEW.ad_eligibility_at := COALESCE(NEW.created_at, now()) + interval '48 hours';
  END IF;

  RETURN NEW;
END;
$$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   1) 함수 재정의 확인(반환컬럼 불변): 각 RPC 1행씩 호출해 에러 없이 반환되면 OK
--      SELECT id, title FROM public.get_trending_videos('cinema', 720, 3);
--      SELECT id, title FROM public.get_videos_by_genre('액션', 'cinema', 3);
--   2) 정렬 결정성: 동일 호출 2번의 id 순서가 같아야 함.
--   3) classify: 텍스트만 재수정 시 tier 갱신
--      UPDATE public.videos SET duration = '10:00' WHERE id = '<짧은영상 id>';
--      SELECT duration, duration_seconds, show_on_cinema, show_on_ott FROM public.videos WHERE id='<id>';
--      -- 기대: duration_seconds=600, show_on_cinema=true, show_on_ott=true
