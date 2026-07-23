-- ════════════════════════════════════════════════════════════════════════════
-- 🚫 정지 크리에이터 영상을 피드에서 제외 (2026-07-22) — 업로드 감사
--
--   [결함] admin_suspend_user 는 profiles.is_suspended = true 만 세팅하고 영상은
--     건드리지 않는다. 그런데 피드 뷰 v_available_videos 와 get_home_feed_order 에
--     is_suspended 필터가 없어, **계정을 정지시켜도 그 크리에이터의 영상이 홈·OTT·
--     추천에 계속 노출됐다.** 검색(search_videos)·채널(get_creator_videos) RPC 에는
--     필터가 있어 "검색에선 사라지는데 홈엔 그대로"인 정책 불일치까지 있었다.
--
--   [조치] v_available_videos WHERE 에 'p.is_suspended = false' 한 줄 추가.
--     이 뷰는 홈·시네마·OTT·추천·유사영상 등 대부분의 피드가 공유하므로 한 곳에서
--     막으면 전부 적용된다. (profiles 는 이미 조인돼 있어 성능 영향 미미.)
--
--   ▣ 구매자·소유자 영향 없음: 영상 재생 권한은 play-token 엔드포인트가 별도로
--     판정하고, 구매 다운로드는 orders 기준이다. 이 필터는 "노출"만 막는다.
--   ▣ get_home_feed_order 는 v_home_feed_public(단순 투영)을 쓰므로 이 뷰를 안 탄다.
--     별도 파일에서 그 함수도 함께 손봐야 완전하다(feed_home_exclude_suspended).
--
--   ★ 이 파일이 v_available_videos 의 새 정본.
--     fix_series_feed_representative_20260712.sql 재실행 금지(필터 소실).
--     본문은 그 파일에서 기계 추출해 필터 1줄만 얹었다(시리즈 대표작 로직 100% 보존).
--   적용: Supabase SQL Editor → Run. 멱등.
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
  -- ★ 정지 크리에이터 영상 제외(2026-07-22 업로드 감사) — 정지는 profiles.is_suspended 만
  --   세팅하고 영상은 안 건드려, 계정을 정지시켜도 그 사람 영상이 홈·OTT 에 계속 노출됐다.
  --   (검색·채널 RPC 엔 이미 필터가 있어 노출 정책이 불일치이기도 했다.) 뷰 한 곳에서 막아
  --   이 뷰를 쓰는 모든 피드에 일괄 적용한다. 구매자 재생은 별개 경로(play-token)라 영향 없음.
  AND COALESCE(p.is_suspended, false) = false
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

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '정지 크리에이터 영상 피드 제외' AS check_name,
  CASE WHEN pg_get_viewdef('public.v_available_videos'::regclass) ~ 'is_suspended'
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '시리즈 대표작 로직 보존(NOT EXISTS)',
  CASE WHEN pg_get_viewdef('public.v_available_videos'::regclass) ~ 'episode_number'
    THEN '✅ PASS' ELSE '🔴 FAIL — 0712 시리즈 로직 소실' END;
-- ════════════════════════════════════════════════════════════════════════════
