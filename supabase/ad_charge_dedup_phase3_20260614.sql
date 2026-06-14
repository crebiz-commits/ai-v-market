-- ════════════════════════════════════════════════════════════════════════════
-- 광고예산 위조/스팸 차단 — dedup (광고주 셀프서비스 Phase 3) — 2026-06-14
--   문제: increment_ad_impressions(ad_id) 가 클라이언트 직접 호출 + 무인증 차감
--         → 반복 호출로 경쟁 광고 예산 고갈/자기 노출 부풀리기 가능 (감사 High).
--   수정: (광고, 뷰어, 1시간) 조합당 1회만 과금. viewer_key = 로그인 uid 또는
--         클라이언트 세션키(localStorage). 같은 조합 재호출은 dedup 으로 skip.
--   ※ 영상광고(track_video_ad_event)는 Edge(service_role) 경유라 별개 — 후속 보강.
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ad_charge_dedup (
  ad_id      uuid        NOT NULL,
  viewer_key text        NOT NULL,
  bucket     timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_id, viewer_key, bucket)
);
-- 클라이언트 직접 접근 차단(SECURITY DEFINER 함수만 기록). RLS on + 정책 없음.
ALTER TABLE public.ad_charge_dedup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_charge_dedup FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.increment_ad_impressions(
  ad_id uuid, p_viewer_key text DEFAULT NULL, p_video_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_cpm    NUMERIC;
  v_key    TEXT := COALESCE(auth.uid()::text, NULLIF(btrim(p_viewer_key), ''));
  v_bucket timestamptz := date_trunc('hour', now());
  v_charge BOOLEAN := true;
BEGIN
  -- dedup: (광고, 뷰어, 1시간) 1회만 과금. 키 없으면(레거시) 과금 유지.
  IF v_key IS NOT NULL THEN
    INSERT INTO public.ad_charge_dedup (ad_id, viewer_key, bucket)
    VALUES (ad_id, v_key, v_bucket)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN v_charge := false; END IF;  -- 이미 과금된 조합 → skip
  END IF;

  IF v_charge THEN
    v_cpm := COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000);
    UPDATE public.ads
    SET impressions = impressions + 1,
        spent_krw   = spent_krw + CEIL(v_cpm / 1000.0)::INTEGER
    WHERE id = ad_id;
  END IF;
END;
$fn$;

-- dedup 테이블 정리(7일 경과분) — 기존 정리 크론과 함께 호출되도록 함수만 제공
CREATE OR REPLACE FUNCTION public.cleanup_ad_charge_dedup()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE n integer;
BEGIN
  DELETE FROM public.ad_charge_dedup WHERE bucket < now() - INTERVAL '7 days';
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END;
$fn$;
