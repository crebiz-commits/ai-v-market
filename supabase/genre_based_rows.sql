-- ════════════════════════════════════════════════════════════════════════════
-- 시네마·OTT 행을 "장르(genre)" 기준으로 통일 (업로드 폼 장르 목록과 동일)
--
--  - get_videos_by_genre: 장르별 영상 조회 (get_videos_by_category 의 genre 버전)
--  - 업로드 장르 목록(SF·액션·로맨스·공포·판타지·스릴러·드라마·코미디·자연풍경·추상·기타)이
--    그대로 시네마/OTT 행이 됨. 클라이언트 단일 출처: src/app/data/genres.ts (GENRES)
--  - 시드 데이터 정리: genre 필드에 잘못 들어간 값(업로드 장르 목록에 없는 것) 재태깅
--    · 애니메이션 → 코미디 (옛 PD 만화 다수)
--    · 다큐멘터리 / 음악 → 기타
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_videos_by_genre(p_genre text, p_tier text DEFAULT 'all'::text, p_limit integer DEFAULT 10)
RETURNS TABLE(id text, title text, thumbnail text, video_url text, creator text, creator_id uuid, creator_display_name text, creator_avatar text, category text, genre text, ai_tool text, duration text, duration_seconds integer, views bigint, likes integer, price_standard integer, highlight_start real, highlight_end real, created_at timestamp with time zone)
LANGUAGE sql STABLE SECURITY DEFINER
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
  ORDER BY v.created_at DESC
  LIMIT p_limit;
$fn$;
GRANT EXECUTE ON FUNCTION public.get_videos_by_genre(text, text, integer) TO anon, authenticated;

-- 시드 데이터 장르 정리 (업로드 장르 목록에 없는 값 → 유효 장르로)
UPDATE public.videos SET genre = '코미디' WHERE genre = '애니메이션';
UPDATE public.videos SET genre = '기타'   WHERE genre IN ('다큐멘터리', '음악');
