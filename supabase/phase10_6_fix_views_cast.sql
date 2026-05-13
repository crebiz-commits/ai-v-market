-- ════════════════════════════════════════════════════════════════════════════
-- Phase 10.6 패치 — admin_search_videos views 컬럼 안전 캐스팅
-- 적용 일자: 2026-05-13
--
-- 원인:
--   videos.views 컬럼이 TEXT 또는 빈 문자열을 포함할 수 있어
--   ::BIGINT 캐스팅에서 실패 → RPC 전체 에러 → 빈 결과
--
-- 해결:
--   숫자 패턴 매칭 후 안전하게 캐스팅, 비숫자/NULL은 0
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_search_videos(
  p_query TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              TEXT,
  title           TEXT,
  thumbnail       TEXT,
  creator_id      UUID,
  creator_name    TEXT,
  duration_seconds INTEGER,
  views           BIGINT,
  price           INTEGER,
  is_hidden       BOOLEAN,
  hidden_reason   TEXT,
  hidden_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  pending_reports BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    v.id::TEXT,
    v.title,
    v.thumbnail,
    v.creator_id,
    p.display_name,
    v.duration_seconds,
    -- 안전한 views 캐스팅: 숫자 패턴만 BIGINT, 그 외 0
    CASE
      WHEN v.views IS NULL THEN 0::BIGINT
      WHEN v.views::TEXT ~ '^[0-9]+$' THEN v.views::TEXT::BIGINT
      ELSE 0::BIGINT
    END AS views,
    -- videos에 price 컬럼 없음 → price_standard 사용 (라이선스 기본가)
    COALESCE(v.price_standard, 0)::INTEGER AS price,
    COALESCE(v.is_hidden, false),
    v.hidden_reason,
    v.hidden_at,
    v.created_at,
    (SELECT COUNT(*) FROM public.reports r
       WHERE r.target_type = 'video' AND r.target_id = v.id AND r.status = 'pending')::BIGINT
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE
    (p_query IS NULL OR p_query = '' OR v.title ILIKE '%' || p_query || '%')
    AND (
      p_filter = 'all'
      OR (p_filter = 'visible' AND COALESCE(v.is_hidden, false) = false)
      OR (p_filter = 'hidden'  AND v.is_hidden = true)
    )
  ORDER BY v.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증: 영상이 표시되어야 함
--   SELECT id, title, views, is_hidden FROM public.admin_search_videos(NULL, 'all', 5, 0);
-- ════════════════════════════════════════════════════════════════════════════
