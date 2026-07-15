-- ════════════════════════════════════════════════════════════════════════════
-- 콘텐츠 관리 — 인라인 프리뷰(video_url) + 검색 확장 (2026-07-15)
--
--   admin_search_videos 에:
--     ① video_url 반환 추가 — 관리자가 목록에서 영상을 재생해보고 숨김/삭제 판단
--        (미변환 HLS 는 크롬 네이티브 <video> 미지원이라 프론트가 play_720p.mp4 변환).
--     ② 검색을 제목 → 제목 + 크리에이터명(display_name·videos.creator) + 영상 id(접두)로 확장.
--   2026-07-15 tiebreaker(v.id)·search_path·orders_completed·판매가드 전부 유지.
--   반환 시그니처 변경(video_url 컬럼 추가) → DROP 후 재생성. **이 파일이 admin_search_videos
--   최신 정본** — admin_content_delete_guard_20260715.sql 의 admin_search_videos 재실행 금지.
--   (admin_delete_video 는 여전히 content_delete_guard 정본 — 이 파일은 search 만 재정의.)
--
-- 적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_search_videos(TEXT, TEXT, INTEGER, INTEGER);
CREATE FUNCTION public.admin_search_videos(
  p_query TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              TEXT,
  title           TEXT,
  thumbnail       TEXT,
  video_url       TEXT,      -- 🆕 인라인 프리뷰용(프론트가 play_720p.mp4 로 변환 재생)
  creator_id      UUID,
  creator_name    TEXT,
  duration_seconds INTEGER,
  views           BIGINT,
  price           INTEGER,
  is_hidden       BOOLEAN,
  hidden_reason   TEXT,
  hidden_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  pending_reports BIGINT,
  orders_completed BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    v.id::TEXT,
    v.title,
    v.thumbnail,
    v.video_url,
    v.creator_id,
    p.display_name,
    v.duration_seconds,
    CASE
      WHEN v.views IS NULL THEN 0::BIGINT
      WHEN v.views::TEXT ~ '^[0-9]+$' THEN v.views::TEXT::BIGINT
      ELSE 0::BIGINT
    END AS views,
    COALESCE(v.price_standard, 0)::INTEGER AS price,
    COALESCE(v.is_hidden, false),
    v.hidden_reason,
    v.hidden_at,
    v.created_at,
    (SELECT COUNT(*) FROM public.reports r
       WHERE r.target_type = 'video' AND r.target_id = v.id AND r.status = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM public.orders o
       WHERE o.video_id = v.id AND o.status = 'completed')::BIGINT
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE
    (p_query IS NULL OR p_query = ''
      OR v.title ILIKE '%' || p_query || '%'
      OR p.display_name ILIKE '%' || p_query || '%'   -- 크리에이터명(표시명)
      OR v.creator ILIKE '%' || p_query || '%'        -- 크리에이터명(업로드 원문)
      OR v.id::TEXT ILIKE p_query || '%'              -- 영상 id 접두 검색
    )
    AND (
      p_filter = 'all'
      OR (p_filter = 'visible' AND COALESCE(v.is_hidden, false) = false)
      OR (p_filter = 'hidden'  AND v.is_hidden = true)
    )
  ORDER BY v.created_at DESC, v.id DESC   -- 🔑 유니크 2차키(더보기 중복/누락 방지)
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_videos(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_videos(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   SELECT id, title, video_url, creator_name, orders_completed
--   FROM public.admin_search_videos('골드', 'all', 5, 0);   -- 제목/크리에이터명 매칭
--   SELECT count(*) FROM public.admin_search_videos('<영상id 앞자리>', 'all', 5, 0);  -- id 접두
-- ════════════════════════════════════════════════════════════════════════════
