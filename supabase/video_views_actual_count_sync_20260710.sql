-- ════════════════════════════════════════════════════════════════════════════
-- videos.views 실측 동기화 (2026-07-10) — 시드 "0" → video_views 유효 조회수로 통일
--
--   배경: track_video_view(phase8_video_views.sql:58) 는 video_views 에만 기록하고
--         videos.views(TEXT)는 갱신하지 않는다(주석: "정산 시점 집계로 처리"). 그래서
--         전 영상 views="0" → 채널·탐색·per-video 카드가 모두 0, get_weekly_top_creators
--         (video_views 실측)만 실값 → 화면 간 불일치. (2026-07-10 사용자: "실측으로 통일".)
--   해법: videos.views 를 유효 조회수(video_views.is_valid=true) 실측 카운터로 만든다.
--         모든 소비자(per-video 카드 displayViews, get_popular_creators/get_creator_profile 의
--         total_views 합산, get_creator_videos 등)가 이미 videos.views 를 읽으므로
--         **프론트·RPC 변경이 전혀 없다**. 여기서 데이터 소스만 실측으로 바꾼다.
--   안전: 적용 시점 전 영상 views="0"(seed 미채움) 확인 → 백필로 파괴될 값 없음.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 백필 — 각 영상의 유효 조회수로 videos.views 세팅
UPDATE public.videos v
SET views = COALESCE((
  SELECT COUNT(*) FROM public.video_views vv
  WHERE vv.video_id = v.id AND vv.is_valid = true
), 0)::text;

-- 2) 실시간 유지 트리거 — video_views 의 is_valid 변화에 맞춰 videos.views ±1
--    (INSERT 유효 = +1 / DELETE 유효 = -1 / is_valid 토글 = ±1). 음수 방지 GREATEST(0,..).
--    videos.views 가 비수치 텍스트면 0 으로 간주(방어). SECURITY DEFINER 로 RLS 우회 갱신.
CREATE OR REPLACE FUNCTION public.tg_sync_video_views_count()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delta int := 0;
  v_id    text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_valid THEN v_delta := 1; END IF;
    v_id := NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_valid THEN v_delta := -1; END IF;
    v_id := OLD.video_id;
  ELSE  -- UPDATE OF is_valid
    IF COALESCE(OLD.is_valid, false) = COALESCE(NEW.is_valid, false) THEN
      RETURN NEW;   -- is_valid 불변 → 무시
    END IF;
    v_delta := CASE WHEN NEW.is_valid THEN 1 ELSE -1 END;
    v_id := NEW.video_id;
  END IF;

  IF v_delta <> 0 AND v_id IS NOT NULL THEN
    UPDATE public.videos
      SET views = GREATEST(0, (CASE WHEN views ~ '^\d+$' THEN views::bigint ELSE 0 END) + v_delta)::text
      WHERE id = v_id;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_video_views_count ON public.video_views;
CREATE TRIGGER trg_sync_video_views_count
  AFTER INSERT OR DELETE OR UPDATE OF is_valid ON public.video_views
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_video_views_count();

-- 검증:
--   -- 백필 정합: 아래 두 값이 같아야 함
--   SELECT (SELECT COUNT(*) FROM public.video_views WHERE is_valid) AS total_valid_views,
--          (SELECT SUM(CASE WHEN views ~ '^\d+$' THEN views::bigint ELSE 0 END) FROM public.videos) AS sum_video_views;
--   -- 이후 새 유효 조회(track_video_view)마다 videos.views 가 +1 → 카드·채널·탐색·TopCreators 전부 실측 일치.
