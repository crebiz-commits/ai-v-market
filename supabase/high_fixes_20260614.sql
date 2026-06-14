-- ════════════════════════════════════════════════════════════════════════════
-- High 수정 일괄 — 전체감사 2026-06-14 (DB 영역)
--   1) 추천 함수 ambiguous 회귀 → #variable_conflict use_column
--   2) 크리에이터 통계 IDOR → 본인/어드민만
--   3) SECURITY DEFINER search_path 일괄 고정 (confirm_payment 등 13개)
--   4) 라이선스 중복구매 방지 → orders 부분 UNIQUE
--   5) 광고 정산/통계 풀스캔 → ad_video_events(source_video_id) 인덱스
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 추천 함수: variable_conflict 해결 + search_path 고정 ──────────────────
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
    ORDER BY score DESC, v.created_at DESC
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
  ORDER BY score DESC NULLS LAST, v.created_at DESC
  LIMIT p_limit;
END;
$fn$;

-- ── 2) 크리에이터 통계 IDOR: 본인/어드민만 ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_view_stats(p_creator_id uuid DEFAULT auth.uid(), p_since timestamp with time zone DEFAULT (now() - '30 days'::interval))
RETURNS TABLE(total_views bigint, valid_views bigint, total_watch_seconds bigint, unique_viewers bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE is_valid)::BIGINT,
    COALESCE(SUM(watch_seconds) FILTER (WHERE is_valid), 0)::BIGINT,
    COUNT(DISTINCT viewer_user_id) FILTER (WHERE is_valid AND viewer_user_id IS NOT NULL)::BIGINT
  FROM public.video_views
  WHERE creator_id = p_creator_id
    AND (p_creator_id = auth.uid() OR public.is_admin())   -- IDOR 차단
    AND occurred_at >= p_since;
$fn$;

CREATE OR REPLACE FUNCTION public.get_creator_ad_stats(p_creator_id uuid DEFAULT auth.uid())
RETURNS TABLE(total_impressions bigint, total_clicks bigint, total_completes bigint, total_skips bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT
    COUNT(*) FILTER (WHERE event_type = 'impression')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'click')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'complete')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'skip')::BIGINT
  FROM public.ad_video_events
  WHERE (p_creator_id = auth.uid() OR public.is_admin())   -- IDOR 차단
    AND source_video_id IN (SELECT id::TEXT FROM public.videos WHERE creator_id = p_creator_id);
$fn$;

CREATE OR REPLACE FUNCTION public.get_creator_ad_stats_by_video(p_creator_id uuid DEFAULT auth.uid())
RETURNS TABLE(video_id text, impressions bigint, clicks bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT
    e.source_video_id::TEXT AS video_id,
    COUNT(*) FILTER (WHERE event_type = 'impression')::BIGINT,
    COUNT(*) FILTER (WHERE event_type = 'click')::BIGINT
  FROM public.ad_video_events e
  WHERE (p_creator_id = auth.uid() OR public.is_admin())   -- IDOR 차단
    AND e.source_video_id IN (SELECT id::TEXT FROM public.videos WHERE creator_id = p_creator_id)
  GROUP BY e.source_video_id;
$fn$;

-- ── 3) SECURITY DEFINER search_path 일괄 고정 (미설정분 전부) ────────────────
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.proconfig, '{}')) c WHERE c LIKE 'search_path=%')
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
  END LOOP;
END $do$;

-- ── 4) 라이선스 중복구매 방지: 완료 주문은 (buyer, video) 1건만 ─────────────
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_buyer_video_completed
  ON public.orders(buyer_id, video_id) WHERE status = 'completed';

-- ── 5) 광고 정산/통계 인덱스: source_video_id 기준 조회 가속 ─────────────────
CREATE INDEX IF NOT EXISTS idx_ad_video_events_source
  ON public.ad_video_events(source_video_id, event_type);
