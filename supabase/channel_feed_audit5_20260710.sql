-- ════════════════════════════════════════════════════════════════════════════
-- 채널 피드 최종(4차) 감사 수정 (2026-07-10)
--
--   [MED] creator_block_user 만 search_path 미고정(형제 5종은 audit4 에서 고침) — 비대칭 보완.
--         이 함수는 comments 에 파괴적 소급 UPDATE(is_hidden 강제)를 하므로 하드닝 일관성 필요.
--   [MED] get_creator_dashboard_summary.total_views 만 스코프가 달라(visibility/is_hidden 미필터)
--         공개 3종(get_creator_profile/get_popular_creators/get_weekly_top_creators)과 어긋남.
--         → 공개·비숨김 영상으로 스코프 통일(숨김/비공개 영상 조회수 제외) = 4화면 일치.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── creator_block_user — search_path 고정 + 명시 GRANT (형제 함수와 대칭) ──
CREATE OR REPLACE FUNCTION public.creator_block_user(
  p_target_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF v_uid = p_target_user_id THEN RAISE EXCEPTION '본인을 차단할 수 없습니다'; END IF;

  INSERT INTO public.creator_blocked_users (creator_id, blocked_user_id, reason)
  VALUES (v_uid, p_target_user_id, p_reason)
  ON CONFLICT DO NOTHING;

  UPDATE public.comments c
  SET is_hidden = true, hidden_reason = '크리에이터 차단',
      hidden_at = COALESCE(c.hidden_at, now()), is_filtered = true, filter_reason = 'blocked_user'
  WHERE c.user_id = p_target_user_id
    AND c.video_id IN (SELECT id FROM public.videos WHERE creator_id = v_uid)
    AND c.is_hidden = false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.creator_block_user(UUID, TEXT) TO authenticated;

-- ── get_creator_dashboard_summary — total_views 를 공개·비숨김 영상으로 스코프(공개 3종과 일치) ──
CREATE OR REPLACE FUNCTION public.get_creator_dashboard_summary()
RETURNS TABLE (
  total_revenue        BIGINT,
  total_views          BIGINT,
  total_likes          BIGINT,
  rpm                  NUMERIC,
  pending_payout       BIGINT,
  next_settlement_date DATE
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_total_rev   BIGINT := 0;
  v_total_views BIGINT := 0;
  v_total_likes BIGINT := 0;
  v_rpm         NUMERIC := 0;
  v_pending     BIGINT := 0;
  v_recent_rev  BIGINT := 0;
  v_recent_views BIGINT := 0;
  v_next_month  DATE := (date_trunc('month', now() AT TIME ZONE 'Asia/Seoul') + INTERVAL '1 month')::DATE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_rev
  FROM public.orders WHERE seller_id = v_uid AND status = 'completed';

  -- 공개·비숨김 영상의 유효 조회수만(get_creator_profile 등 공개 지표와 동일 스코프 → 화면 간 일치)
  SELECT COUNT(*) INTO v_total_views
  FROM public.video_views vv
  INNER JOIN public.videos v ON v.id = vv.video_id
  WHERE vv.creator_id = v_uid AND vv.is_valid = true
    AND (v.visibility = 'public' OR v.visibility IS NULL) AND COALESCE(v.is_hidden, false) = false;

  SELECT COUNT(*) INTO v_total_likes
  FROM public.video_likes vl
  INNER JOIN public.videos v ON v.id = vl.video_id
  WHERE v.creator_id = v_uid;

  SELECT COALESCE(SUM(amount), 0) INTO v_recent_rev
  FROM public.orders WHERE seller_id = v_uid AND status = 'completed'
    AND created_at >= now() - INTERVAL '30 days';

  SELECT COUNT(*) INTO v_recent_views
  FROM public.video_views WHERE creator_id = v_uid AND is_valid = true
    AND occurred_at >= now() - INTERVAL '30 days';

  IF v_recent_views > 0 THEN
    v_rpm := ROUND((v_recent_rev::NUMERIC / v_recent_views) * 1000, 2);
  END IF;

  SELECT COALESCE(SUM(rd.total_revenue), 0) INTO v_pending
  FROM public.revenue_distributions rd
  WHERE rd.creator_id = v_uid AND rd.payout_status = 'pending';

  RETURN QUERY SELECT v_total_rev, v_total_views, v_total_likes, v_rpm, v_pending, v_next_month;
END;
$$;
REVOKE ALL ON FUNCTION public.get_creator_dashboard_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_creator_dashboard_summary() TO authenticated;

-- ── get_creator_received_comments — hidden_reason 반환 추가 ──
--   받은댓글 UI(ReceivedCommentsSection)가 hidden_reason 으로 "크리에이터 복원 가능 여부"를 판별
--   (canCreatorRestore)하는데 RPC 가 이 컬럼을 안 줘서 기존 숨김 댓글의 복원버튼이 영영 안 뜨던 회귀.
--   반환 컬럼 추가 → 반환타입 변경이라 DROP 선행.
DROP FUNCTION IF EXISTS public.get_creator_received_comments(INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.get_creator_received_comments(
  p_limit INTEGER DEFAULT 20, p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID, video_id TEXT, video_title TEXT, parent_id UUID, content TEXT,
  author_name TEXT, author_avatar TEXT, author_user_id UUID, is_hidden BOOLEAN,
  hidden_reason TEXT, created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public STABLE
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  RETURN QUERY
  SELECT
    c.id, c.video_id, v.title, c.parent_id, c.content,
    c.author_name, p.avatar_url, c.user_id,
    COALESCE(c.is_hidden, false), c.hidden_reason, c.created_at
  FROM public.comments c
  JOIN public.videos v   ON v.id = c.video_id
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE v.creator_id = v_uid AND c.user_id <> v_uid
  ORDER BY c.created_at DESC
  LIMIT GREATEST(p_limit, 1) OFFSET GREATEST(p_offset, 0);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_creator_received_comments(INTEGER, INTEGER) TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   -- creator_block_user search_path 고정 확인:
--   SELECT proname, proconfig FROM pg_proc WHERE proname='creator_block_user';  -- {search_path=public}
--   -- 총조회수 일치(공개 영상만 있으면 채널=대시보드): 로그인 세션에서 대시보드 vs 채널 total_views 비교.
