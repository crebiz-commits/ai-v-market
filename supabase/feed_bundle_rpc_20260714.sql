-- ════════════════════════════════════════════════════════════════════════════
-- ⚡ 피드 번들 RPC — 시네마/OTT 초기 로딩 왕복 18회 → 1회 (2026-07-14)
--
--   문제: Cinema.tsx 는 추천1+트렌딩2+신규1+형식3+장르11 = RPC 18회,
--         Ott.tsx 는 트렌딩1+형식3+장르11 = 15회를 병렬 호출.
--         행 수(~200편)보다 **HTTP 왕복(모바일 RTT×PostgREST 오버헤드)** 이 지배적
--         → 첫 진입/새로고침이 수 초씩 걸림.
--   해결: 기존 SSOT 랭킹 함수(get_recommended_videos / get_trending_videos /
--         get_new_releases / get_videos_by_category / get_videos_by_genre —
--         정본 cinema_rpc_hardening_20260708.sql)를 **서버 내부에서 호출**해
--         하나의 jsonb 로 묶어 반환. 랭킹 로직 중복 0 = 드리프트 위험 0.
--         (개별 함수를 수정하면 번들도 자동으로 그 결과를 따름.)
--
--   반환 형태 (키는 PostgREST 개별 RPC 응답과 동일한 행 오브젝트 배열):
--     {
--       "recommended":  [...],          -- p_limit 15 (개인화: auth.uid() 그대로 동작)
--       "trending":     [...],          -- cinema=24h / ott=168h, 10개
--       "new_releases": [...],          -- 14일, 10개
--       "best30":       [...],          -- 720h(30일), 10개
--       "formats":  { "애니메이션": [...], ... },   -- p_categories 순서 무관 키맵
--       "genres":   { "SF": [...], ... }            -- p_genres 키맵
--     }
--
--   장르/형식 목록은 클라이언트(genres.ts SSOT)가 인자로 전달 — SQL에 목록을
--   복제하지 않아 장르 추가 시 프론트만 고치면 됨.
--
--   클라이언트는 이 함수 미적용(PGRST202) 시 기존 병렬 경로로 자동 폴백하므로
--   배포 순서 무관(프론트 먼저 배포돼도 무중단).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_feed_bundle(
  p_tier       text,
  p_genres     text[]  DEFAULT ARRAY[]::text[],
  p_categories text[]  DEFAULT ARRAY[]::text[],
  p_row_limit  integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_hours  integer := CASE WHEN p_tier = 'ott' THEN 168 ELSE 24 END;
  v_limit  integer := LEAST(GREATEST(COALESCE(p_row_limit, 24), 1), 50);
  v        jsonb;
BEGIN
  -- 남용 상한 (anon 노출 함수 — 배열 폭주로 서버 부하 유발 방지)
  IF COALESCE(array_length(p_genres, 1), 0) > 20 THEN
    RAISE EXCEPTION 'too many genres';
  END IF;
  IF COALESCE(array_length(p_categories, 1), 0) > 10 THEN
    RAISE EXCEPTION 'too many categories';
  END IF;

  v := jsonb_build_object(
    -- recommended/new_releases/best30 은 OTT 화면이 소비하지 않음 → p_tier='ott' 일 땐 스킵.
    --   특히 recommended 는 auth.uid() 개인화 plpgsql 로 가장 비싼 쿼리라 OTT 진입마다
    --   계산 후 버려지던 낭비를 제거(2026-07-14). Cinema 는 6개 전부 소비하므로 영향 없음.
    'recommended',
      CASE WHEN p_tier = 'ott' THEN '[]'::jsonb ELSE
      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
       FROM public.get_recommended_videos(p_tier := p_tier, p_limit := 15) t) END,
    'trending',
      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
       FROM public.get_trending_videos(p_tier := p_tier, p_hours := v_hours, p_limit := 10) t),
    'new_releases',
      CASE WHEN p_tier = 'ott' THEN '[]'::jsonb ELSE
      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
       FROM public.get_new_releases(p_tier := p_tier, p_days := 14, p_limit := 10) t) END,
    'best30',
      CASE WHEN p_tier = 'ott' THEN '[]'::jsonb ELSE
      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
       FROM public.get_trending_videos(p_tier := p_tier, p_hours := 720, p_limit := 10) t) END,
    'formats',
      COALESCE((
        SELECT jsonb_object_agg(c.cat, c.vids)
        FROM (
          SELECT cat,
                 (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                  FROM public.get_videos_by_category(p_category := cat, p_tier := p_tier, p_limit := v_limit) t) AS vids
          FROM unnest(p_categories) AS cat
        ) c
      ), '{}'::jsonb),
    'genres',
      COALESCE((
        SELECT jsonb_object_agg(g.gen, g.vids)
        FROM (
          SELECT gen,
                 (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
                  FROM public.get_videos_by_genre(p_genre := gen, p_tier := p_tier, p_limit := v_limit) t) AS vids
          FROM unnest(p_genres) AS gen
        ) g
      ), '{}'::jsonb)
  );

  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_feed_bundle(text, text[], text[], integer) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 1) 번들 1회 호출로 전 섹션이 오는지 (키 6개 + 각 배열):
--   SELECT jsonb_object_keys(public.get_feed_bundle(
--     'cinema',
--     ARRAY['SF','액션','로맨스','공포','판타지','스릴러','드라마','코미디','자연·풍경','추상','기타'],
--     ARRAY['애니메이션','다큐멘터리','뮤직비디오'], 24));
--   -- 2) 개별 SSOT 함수와 결과 동일성 (트렌딩 첫 행 id 비교):
--   SELECT (public.get_feed_bundle('cinema')->'trending'->0->>'id') =
--          (SELECT id FROM public.get_trending_videos('cinema', 24, 1));
-- ════════════════════════════════════════════════════════════════════════════
