-- ════════════════════════════════════════════════════════════════════════════
-- 🗄️ 데이터 무결성·성능 (2026-07-23 전체감사) — 핫패스 인덱스 2 + video_likes FK
--
--   [MED] videos.creator_id 인덱스 부재 → 채널 진입·인기 크리에이터 집계·내 영상·정산
--         activity/sales CTE 가 videos 순차 스캔(카탈로그 증가에 선형 악화).
--   [MED] video_likes.user_id 인덱스 부재 → PK 선두가 video_id 라 LikesContext 세션
--         초기화(WHERE user_id=?)마다 video_likes 전체 풀스캔(플랫폼 전체 좋아요 수 비례).
--   [LOW] video_likes.video_id → videos FK 부재 → 영상 하드삭제 시 좋아요 고아행 잔존
--         (형제 자식들 orders/comments/video_views/collection_videos 는 CASCADE 인데 예외).
--
--   전부 순수 추가/정리라 무중단. 데이터 적을 때 선반영(트래픽 전).
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ① videos.creator_id (필터+정렬+GROUP BY 동시 커버)
CREATE INDEX IF NOT EXISTS idx_videos_creator_created
  ON public.videos(creator_id, created_at DESC);

-- ② video_likes.user_id (본인 좋아요 조회)
CREATE INDEX IF NOT EXISTS idx_video_likes_user
  ON public.video_likes(user_id);

-- ③ video_likes.video_id → videos FK (고아 정리 후 CASCADE 추가)
DELETE FROM public.video_likes vl
WHERE NOT EXISTS (SELECT 1 FROM public.videos v WHERE v.id = vl.video_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'video_likes_video_fk'
  ) THEN
    ALTER TABLE public.video_likes
      ADD CONSTRAINT video_likes_video_fk
      FOREIGN KEY (video_id) REFERENCES public.videos(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ── 검증 ──
SELECT '① idx_videos_creator_created' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_videos_creator_created')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '② idx_video_likes_user',
  CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_video_likes_user')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '③ video_likes_video_fk (CASCADE)',
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname='video_likes_video_fk')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
