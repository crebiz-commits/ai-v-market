-- ════════════════════════════════════════════════════════════════════════════
-- Phase 23.1 — video_likes ↔ videos.likes 카운트 자동 동기화
-- 적용 일자: 2026-05-15
-- 선행: video_likes, videos
--
-- 문제:
--   좋아요는 video_likes 테이블에 행으로만 저장되고 있고,
--   videos.likes 컬럼은 갱신되지 않아 화면에 항상 0으로 표시됨.
--
-- 해결:
--   1. 트리거: video_likes INSERT/DELETE → videos.likes 자동 +1/-1
--   2. 백필: 현재 video_likes의 실제 카운트로 videos.likes 일괄 동기화
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: 트리거 함수
-- ────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER 필수: videos UPDATE는 영상 작성자만 가능한 RLS가 걸려 있으므로,
-- 좋아요를 누른 다른 사용자의 권한으로 실행되면 silently fail (영향 행 0)함.
CREATE OR REPLACE FUNCTION public.tg_sync_video_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.videos
    SET likes = COALESCE(likes, 0) + 1
    WHERE id = NEW.video_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.videos
    SET likes = GREATEST(COALESCE(likes, 0) - 1, 0)
    WHERE id = OLD.video_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.tg_sync_video_likes_count IS
  'video_likes INSERT/DELETE 시 videos.likes 자동 갱신';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 트리거 설치
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS video_likes_sync_count ON public.video_likes;
CREATE TRIGGER video_likes_sync_count
  AFTER INSERT OR DELETE ON public.video_likes
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_video_likes_count();

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 백필 — 모든 영상의 likes 컬럼을 video_likes 실제 카운트로 동기화
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.videos v
SET likes = COALESCE(
  (SELECT COUNT(*)::INTEGER FROM public.video_likes WHERE video_id = v.id),
  0
);

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 백필 결과 확인 (likes > 0인 영상이 있어야 함)
--   SELECT id, title, likes FROM public.videos
--   WHERE likes > 0 ORDER BY likes DESC LIMIT 10;
--
--   -- 2. 실제 video_likes 카운트와 일치하는지 검증
--   SELECT v.id, v.title, v.likes AS column_likes,
--          COUNT(vl.video_id) AS actual_likes
--   FROM public.videos v
--   LEFT JOIN public.video_likes vl ON vl.video_id = v.id
--   GROUP BY v.id, v.title, v.likes
--   HAVING v.likes <> COUNT(vl.video_id);
--   -- ↑ 결과 0행이 정상 (모두 일치)
-- ════════════════════════════════════════════════════════════════════════════
