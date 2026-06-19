-- ════════════════════════════════════════════════════════════════════════════
-- 시리즈(연속물) 기능 — 넷플릭스식 시즌/에피소드 (2026-06-19)
--
-- 목적: 영상을 "시리즈"로 묶어 회차(시즌·에피소드) 단위로 시청.
--   - series 테이블(크리에이터 소유, 공개) + videos 에 에피소드 연결 컬럼.
--   - 업로드/수정 시 시리즈 지정, 상세페이지에서 회차 목록·다음화.
--
-- 적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등).
-- 검증: 하단 주석 쿼리.
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. series 테이블 (크리에이터 소유, 공개 읽기)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.series (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT,
  cover_thumbnail TEXT,                 -- 시리즈 대표 썸네일(없으면 1화 썸네일 사용)
  tier            TEXT DEFAULT 'cinema',-- 시리즈 카드 노출 티어 (home/cinema/ott)
  genre           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_series_creator ON public.series(creator_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 2. videos 에 에피소드 연결 컬럼 (멱등)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS series_id      UUID REFERENCES public.series(id) ON DELETE SET NULL;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS season_number  INT DEFAULT 1;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS episode_number INT;
CREATE INDEX IF NOT EXISTS idx_videos_series ON public.videos(series_id, season_number, episode_number);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS — series: 공개 읽기, 본인만 생성/수정/삭제
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "series public read"   ON public.series;
DROP POLICY IF EXISTS "series owner insert"  ON public.series;
DROP POLICY IF EXISTS "series owner update"  ON public.series;
DROP POLICY IF EXISTS "series owner delete"  ON public.series;
CREATE POLICY "series public read"  ON public.series FOR SELECT USING (true);
CREATE POLICY "series owner insert" ON public.series FOR INSERT WITH CHECK (creator_id = auth.uid());
CREATE POLICY "series owner update" ON public.series FOR UPDATE USING (creator_id = auth.uid());
CREATE POLICY "series owner delete" ON public.series FOR DELETE USING (creator_id = auth.uid());

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RPC: 시리즈 생성 (업로드 중 새 시리즈)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_series(
  p_title TEXT, p_description TEXT DEFAULT NULL, p_tier TEXT DEFAULT 'cinema', p_genre TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  IF auth.uid() IS NULL OR p_title IS NULL OR length(trim(p_title)) = 0 THEN RETURN NULL; END IF;
  INSERT INTO public.series (creator_id, title, description, tier, genre)
  VALUES (auth.uid(), trim(p_title), p_description, COALESCE(p_tier,'cinema'), p_genre)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.create_series(TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_series(TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. RPC: 내 시리즈 목록 (업로드/수정 드롭다운용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_series()
RETURNS TABLE(id UUID, title TEXT, episode_count BIGINT) AS $$
  SELECT s.id, s.title, COUNT(v.id)
  FROM public.series s
  LEFT JOIN public.videos v ON v.series_id = s.id
  WHERE s.creator_id = auth.uid()
  GROUP BY s.id, s.title, s.created_at
  ORDER BY s.created_at DESC;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.get_my_series() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_series() TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 6. RPC: 시리즈 에피소드 목록 (상세페이지용, 공개=anon 포함)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_series_episodes(p_series_id UUID)
RETURNS TABLE(
  id TEXT, title TEXT, description TEXT, thumbnail TEXT,
  duration TEXT, duration_seconds INT, season_number INT, episode_number INT, views BIGINT,
  series_title TEXT
) AS $$
  SELECT v.id, v.title, v.description, v.thumbnail,
         v.duration, v.duration_seconds,
         COALESCE(v.season_number,1), v.episode_number,
         COALESCE(NULLIF(v.views,'')::BIGINT, 0),
         s.title
  FROM public.videos v
  JOIN public.series s ON s.id = v.series_id
  WHERE v.series_id = p_series_id
    AND COALESCE(v.visibility,'public') = 'public'
    AND COALESCE(v.is_hidden,false) = false
  ORDER BY COALESCE(v.season_number,1), v.episode_number NULLS LAST, v.created_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.get_series_episodes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_series_episodes(UUID) TO authenticated, anon;

-- ────────────────────────────────────────────────────────────────────────────
-- 7. RPC: 영상에 시리즈/회차 지정 (본인 영상만). 업로드 후 또는 수정 시 호출.
--    p_series_id = NULL 이면 시리즈 연결 해제. 엣지함수/큰 RPC 안 건드리고 이걸로 처리.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_video_series(
  p_video_id TEXT, p_series_id UUID, p_season_number INT DEFAULT 1, p_episode_number INT DEFAULT NULL
) RETURNS BOOLEAN AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;
  -- 시리즈 지정 시: 본인 소유 시리즈여야 함 (NULL=해제는 통과)
  IF p_series_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.series WHERE id = p_series_id AND creator_id = auth.uid()
  ) THEN
    RETURN FALSE;
  END IF;
  UPDATE public.videos
    SET series_id      = p_series_id,
        season_number  = COALESCE(p_season_number, 1),
        episode_number = p_episode_number
  WHERE id = p_video_id AND creator_id = auth.uid();
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.set_video_series(TEXT,UUID,INT,INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_video_series(TEXT,UUID,INT,INT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT public.create_series('테스트 시리즈','설명','cinema','sf');   -- 시리즈 생성(로그인 필요) → UUID 반환
--   SELECT * FROM public.get_my_series();                                 -- 내 시리즈 목록
--   -- videos 에 연결:  UPDATE videos SET series_id='<uuid>', episode_number=1 WHERE id='<video_id>';
--   SELECT * FROM public.get_series_episodes('<uuid>');                    -- 회차 목록
--   SELECT column_name FROM information_schema.columns WHERE table_name='videos' AND column_name IN ('series_id','season_number','episode_number');
-- ════════════════════════════════════════════════════════════════════════════
