-- ════════════════════════════════════════════════════════════════════════════
-- 시리즈 회차 무결성 (2026-07-05) — CH-M1
--
--   문제: (series_id, 시즌, 화) 유니크 제약 없음 + set_video_series 가 음수/0/중복 화 허용.
--         같은 시리즈에 화1 두 개 또는 화 미지정(NULL→피드에서 1화로 간주) 다수면 피드
--         "시리즈=카드1" dedup 이 깨져 카드가 여러 개 뜬다.
--   수정: ① 부분 유니크 인덱스(series_id, season, episode). ② set_video_series 가 시즌/화
--         유효성 검사 + 화 미지정 시 다음 화 자동배정(NULL 겹침 방지) + 중복 차단 +
--         해제 시 회차정보도 정리(m5).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_video_series(
  p_video_id TEXT, p_series_id UUID, p_season_number INT DEFAULT 1, p_episode_number INT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp   -- #9: search_path hijack 방어 핀
AS $$
DECLARE
  v_season INT := COALESCE(NULLIF(p_season_number, 0), 1);
  v_ep INT := p_episode_number;
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;

  IF p_series_id IS NOT NULL THEN
    -- 본인 소유 시리즈여야 함
    IF NOT EXISTS (SELECT 1 FROM public.series WHERE id = p_series_id AND creator_id = auth.uid()) THEN
      RETURN FALSE;
    END IF;
    -- CH-M1: 시즌/화 유효성 (음수/0 거부)
    IF v_season <= 0 THEN RETURN FALSE; END IF;
    IF v_ep IS NOT NULL AND v_ep <= 0 THEN RETURN FALSE; END IF;
    -- 화 미지정이면 다음 화 자동배정(NULL 다수가 모두 1화로 겹쳐 피드 중복되는 것 방지)
    IF v_ep IS NULL THEN
      SELECT COALESCE(MAX(episode_number), 0) + 1 INTO v_ep
      FROM public.videos
      WHERE series_id = p_series_id AND COALESCE(season_number, 1) = v_season;
    END IF;
    -- 중복 화 차단(유니크 인덱스와 이중방어 — 명확한 FALSE 반환으로 클라가 표면화)
    IF EXISTS (
      SELECT 1 FROM public.videos
      WHERE series_id = p_series_id AND COALESCE(season_number, 1) = v_season
        AND episode_number = v_ep AND id <> p_video_id
    ) THEN
      RETURN FALSE;
    END IF;
  ELSE
    -- 해제: 회차 정보도 함께 정리(m5)
    v_season := NULL;
    v_ep := NULL;
  END IF;

  UPDATE public.videos
    SET series_id = p_series_id, season_number = v_season, episode_number = v_ep
  WHERE id = p_video_id AND creator_id = auth.uid();
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.set_video_series(TEXT,UUID,INT,INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_video_series(TEXT,UUID,INT,INT) TO authenticated;

-- 부분 유니크 인덱스 (기존 중복 데이터가 있으면 생성 실패 → NOTICE 후 계속. 중복 정리 후 재실행)
DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_videos_series_episode
    ON public.videos (series_id, season_number, episode_number)
    WHERE series_id IS NOT NULL AND episode_number IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '유니크 인덱스 생성 보류(기존 중복 회차 데이터 가능): %  → 중복 정리 후 재실행', SQLERRM;
END $$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT public.set_video_series('<내영상A>', '<내시리즈>', 1, 1);   -- true
--   SELECT public.set_video_series('<내영상B>', '<내시리즈>', 1, 1);   -- false(중복 화)
--   SELECT public.set_video_series('<내영상C>', '<내시리즈>', 1, -5);  -- false(음수)
--   SELECT public.set_video_series('<내영상D>', '<내시리즈>', 1, NULL); -- true, 자동 다음 화
--   -- 기존 중복 회차 확인(인덱스 실패 시):
--   SELECT series_id, season_number, episode_number, count(*)
--   FROM public.videos WHERE series_id IS NOT NULL AND episode_number IS NOT NULL
--   GROUP BY 1,2,3 HAVING count(*) > 1;
-- ════════════════════════════════════════════════════════════════════════════
