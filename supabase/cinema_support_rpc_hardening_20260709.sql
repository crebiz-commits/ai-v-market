-- ════════════════════════════════════════════════════════════════════════════
-- 시네마 보조 RPC 견고화 — 3차 심화감사 SQL 결함 2건 (2026-07-09)
--
--   ① get_age_ratings_for_videos: SECURITY DEFINER 인데 SET search_path 누락
--      (형제 카드 RPC들은 모두 있음 — 이 5번째만 빠짐). role-mutable search_path
--      경고 + 재실행 회귀 위험 → 명시.
--   ② get_popular_creators: ORDER BY 에 고유 tiebreak 없음(follower/views/video_count 만).
--      영상 행 RPC 와 동일한 비결정성 → TopCreatorsRow 가 방문마다 뒤섞임.
--      → 최종키 cs.creator_id 추가로 결정적 순서 고정.
--
--   둘 다 본문은 정본 그대로, 목표부만 수정. CREATE OR REPLACE(반환컬럼 불변)·멱등.
--   적용: Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① get_age_ratings_for_videos: SET search_path 추가 ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_age_ratings_for_videos(
  p_video_ids TEXT[]
)
RETURNS TABLE (
  video_id    TEXT,
  age_rating  TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT v.id::TEXT, COALESCE(v.age_rating, 'all')
  FROM public.videos v
  WHERE v.id::TEXT = ANY(p_video_ids);
$$;
GRANT EXECUTE ON FUNCTION public.get_age_ratings_for_videos(TEXT[]) TO authenticated, anon;

-- ── ② get_popular_creators ── [SSOT 이관: channel_feed_audit_20260709.sql] ─────
--   ⚠️ 이 블록은 제거됨(2026-07-09 재조정). 이유: 같은 날짜 channel_feed_audit_20260709.sql 이
--      get_popular_creators 를 동일 시그니처로 다시 정의하는데 그쪽이 "결정적 tiebreak(creator_id)
--      + 정지 크리에이터(is_suspended) 제외 + 이메일 아이디 PII 폴백 제거"를 모두 담은 정본이다.
--      여기 있던 옛 정의는 tiebreak 만 추가했고 is_suspended 필터가 없고 split_part(email) PII 폴백이
--      남아 있어, 두 파일이 공존하면 파일명 알파벳순 리플레이(channel_feed_audit < cinema_support)에서
--      이 파일이 마지막에 덮어 #3·#5 수정을 조용히 회귀시킨다(정지자 재노출 + 이메일 유출).
--      → get_popular_creators 는 channel_feed_audit_20260709.sql 에서만 정의한다. 여기선 재정의 금지.
--   (§① get_age_ratings_for_videos 는 이 파일 소관 유지.)

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT proname, proconfig FROM pg_proc WHERE proname IN ('get_age_ratings_for_videos','get_popular_creators');
--   -- 기대: 둘 다 proconfig 에 search_path 포함.
--   SELECT creator_id FROM public.get_popular_creators(10);  -- 2회 호출 순서 동일해야 함.
