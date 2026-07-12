-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 시리즈 피드 대표작 로직 수정 — "1화만" → "첫 노출가능 에피소드" (2026-07-12)
--
--   버그(일반): 피드는 시리즈를 `series_id IS NULL OR episode_number=1` 로 묶어 "1화만"
--         카드로 노출. 1화가 숨김(is_hidden=true)이면 — 재검수 대기, 편집 재검수(제목/썸네일
--         변경 시 자동 pending+hidden), 관리자 숨김, 신고누적, 또는 실수 재업로드 등 —
--         대표작이 사라져 **시리즈 카드 전체가 피드에서 증발**. 2·3화가 멀쩡해도 안 뜸.
--         (골드베인 사례: 어제 1화 숨김/삭제 → 오늘 2화가 안 뜸.)
--
--   해결: 대표작 = "그 시리즈에서 노출가능한(숨김X·공개) 에피소드 중 가장 앞 화".
--         1화가 숨겨지면 2화가 자동 대표작이 되어 시리즈가 계속 노출됨.
--         v_available_videos(시네마·OTT·검색·장르 공용 뷰)의 필터만 교체 → 한 곳에서 해결.
--         (홈피드 get_home_feed 는 자체 필터라 별도 수정 — 아래 ②.)
--
--   ※ series_feed_grouping_20260619.sql 의 v_available_videos 정본 복제 + 필터 1개만 교체.
--     ★ 이 파일이 v_available_videos 새 정본. 옛 정의 재실행 금지(1화-only 회귀).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.v_available_videos AS
SELECT
  v.id,
  v.title,
  v.thumbnail,
  v.video_url,
  v.creator,
  v.creator_id,
  v.category,
  v.tags,
  v.ai_tool,
  v.duration,
  v.duration_seconds,
  v.views,
  v.likes,
  v.price_standard,
  v.show_on_home,
  v.show_on_cinema,
  v.show_on_ott,
  v.highlight_start,
  v.highlight_end,
  v.created_at,
  p.display_name AS creator_display_name,
  p.avatar_url AS creator_avatar,
  v.genre,
  v.series_id,
  v.episode_number,
  (SELECT COUNT(*) FROM public.videos v2 WHERE v2.series_id = v.series_id)::int AS series_episode_count
FROM public.videos v
LEFT JOIN public.profiles p ON p.id = v.creator_id
WHERE
  COALESCE(v.visibility, 'public') = 'public'
  AND COALESCE(v.is_hidden, false) = false
  -- 시리즈 대표작 = "노출가능 에피소드 중 가장 앞 화"(1화가 숨김이면 다음 화가 대표작).
  --   기존 `episode_number=1` 은 1화 숨김 시 시리즈 전체 증발 → NOT EXISTS 로 교체.
  AND (
    v.series_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.videos v3
      WHERE v3.series_id = v.series_id
        AND COALESCE(v3.is_hidden, false) = false
        AND COALESCE(v3.visibility, 'public') = 'public'
        AND COALESCE(v3.episode_number, 1) < COALESCE(v.episode_number, 1)
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 시리즈 1화 숨김 상태에서도 그 시리즈가 뷰에 뜨는지(2화가 대표작):
--   SELECT id, title, series_id, episode_number FROM public.v_available_videos
--   WHERE series_id IS NOT NULL ORDER BY series_id, episode_number;
--   -- 각 series_id 당 1행(가장 앞 노출화)만 나오면 정상.
-- ════════════════════════════════════════════════════════════════════════════
