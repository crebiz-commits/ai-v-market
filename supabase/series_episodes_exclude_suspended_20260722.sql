-- ════════════════════════════════════════════════════════════════════════════
-- 🚫 시리즈 에피소드 목록에서 정지 크리에이터 제외 (2026-07-22) — 업로드 2차 감사
--
--   [결함] feed_exclude_suspended / feed_home_exclude_suspended 로 피드는 막았으나,
--     get_series_episodes 는 v_available_videos 를 안 타고 public.videos 를 직접
--     조회하며 is_hidden 만 필터한다 → **시리즈 상세의 에피소드 목록에 정지
--     크리에이터의 화들이 그대로 노출**된다. 피드에선 사라졌는데 시리즈 안에선
--     보이는 불일치.
--
--   [조치] profiles 조인 + is_suspended = false 추가. 재생 권한이 아니라 "목록 노출"만
--     막는 것이라 구매자 접근권(play-token·orders)과는 무관하다.
--
--   ★ 이 파일이 get_series_episodes 의 새 정본. series_20260619.sql 재실행 금지.
--     본문은 원문 그대로 + 조인/필터 2줄만 추가(정렬·컬럼 100% 보존).
--   적용: Supabase SQL Editor → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

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
  LEFT JOIN public.profiles p ON p.id = v.creator_id   -- 정지 크리에이터 제외용(2026-07-22)
  WHERE v.series_id = p_series_id
    AND COALESCE(v.visibility,'public') = 'public'
    AND COALESCE(v.is_hidden,false) = false
    AND COALESCE(p.is_suspended, false) = false          -- 정지 크리에이터 에피소드 숨김
  ORDER BY COALESCE(v.season_number,1), v.episode_number NULLS LAST, v.created_at;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;   -- 게이트 #9(hijack 방어) — CREATE OR REPLACE 로 스윕(0707) 고정이 풀리지 않게 명시
REVOKE ALL ON FUNCTION public.get_series_episodes(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_series_episodes(UUID) TO anon, authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '시리즈 에피소드 정지 크리에이터 제외' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_series_episodes')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
-- ════════════════════════════════════════════════════════════════════════════
