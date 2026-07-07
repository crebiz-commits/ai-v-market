-- ════════════════════════════════════════════════════════════════════════════
-- U-M2 원자적 레이트리밋 카운터 (2026-07-07)
--
--   문제: Edge 의 create-upload / generate-promo 레이트리밋이 KV get→set(읽고-쓰기)
--         비원자적이라 동시요청 시 둘 다 한도 미만으로 읽고 통과 → 한도 초과 가능
--         (빈 Bunny 영상 대량생성·Anthropic 과호출 어뷰징 경로).
--   수정: 단일 INSERT ... ON CONFLICT DO UPDATE 로 원자적 증가 + 윈도우 리셋.
--         Edge 는 service_role 로 rl_hit() 호출, false 면 429.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key          TEXT PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count        INT NOT NULL DEFAULT 0
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;  -- 정책 없음 = 클라 직접접근 0(서비스롤만 DEFINER 경유)

-- 원자적 히트: p_key 카운터를 1 증가시키고 현재 카운트가 한도 이내면 true(허용).
--   윈도우(p_window_sec) 만료 시 카운트 리셋. 단일 문이라 경합에도 정확.
CREATE OR REPLACE FUNCTION public.rl_hit(p_key TEXT, p_limit INT, p_window_sec INT)
RETURNS BOOLEAN            -- true = 허용, false = 한도초과
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.rate_limits AS rl (key, window_start, count)
  VALUES (p_key, now(), 1)
  ON CONFLICT (key) DO UPDATE SET
    window_start = CASE WHEN rl.window_start < now() - make_interval(secs => p_window_sec)
                        THEN now() ELSE rl.window_start END,
    count        = CASE WHEN rl.window_start < now() - make_interval(secs => p_window_sec)
                        THEN 1    ELSE rl.count + 1 END
  RETURNING rl.count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.rl_hit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rl_hit(TEXT, INT, INT) TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT public.rl_hit('t:demo', 3, 3600);  -- true (1)
--   SELECT public.rl_hit('t:demo', 3, 3600);  -- true (2)
--   SELECT public.rl_hit('t:demo', 3, 3600);  -- true (3)
--   SELECT public.rl_hit('t:demo', 3, 3600);  -- false (4, 초과)
--   DELETE FROM public.rate_limits WHERE key='t:demo';
-- ════════════════════════════════════════════════════════════════════════════
