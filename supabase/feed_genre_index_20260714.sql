-- ════════════════════════════════════════════════════════════════════════════
-- ⚡ 피드 장르 행 인덱스 — get_videos_by_genre 의 seq scan 제거 (2026-07-14)
--
--   문제: 시네마/OTT 는 로딩당 장르 11종 × tier 2 를 각각 조회(get_videos_by_genre 는
--         `v.genre = p_genre` 필터). category 는 idx_videos_category_visibility 가 있으나
--         **genre 인덱스는 없어** 매 호출이 videos 전체 seq scan → 카탈로그 커질수록 지연.
--   해결: tier 플래그(show_on_cinema/ott)와 genre 복합 부분 인덱스. 피드가 쓰는
--         "노출가능 + 특정 장르" 접근을 인덱스로 커버. 정렬키(created_at DESC)도 포함.
--
-- 적용: Supabase SQL Editor → Run (멱등, CONCURRENTLY 없이 — 소규모 테이블).
-- ════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_videos_genre_cinema
  ON public.videos (genre, created_at DESC)
  WHERE show_on_cinema = true AND COALESCE(is_hidden, false) = false;

CREATE INDEX IF NOT EXISTS idx_videos_genre_ott
  ON public.videos (genre, created_at DESC)
  WHERE show_on_ott = true AND COALESCE(is_hidden, false) = false;

-- 검증:
--   EXPLAIN ANALYZE SELECT * FROM public.get_videos_by_genre('SF', 'cinema', 24);
--   → Index Scan(idx_videos_genre_cinema) 이면 정상(Seq Scan 이면 인덱스 미적용).
