-- ════════════════════════════════════════════════════════════════════════════
-- 광고 시스템 출시 전 보강 (2026-07-08) — 감사 #3/#4/#7
--
--   #3 [예산 게이트 부재 — 잠재 발화]
--      · ads_public 뷰에 예산 소진 필터가 없어, HOME_FEED_SELF_ADS=true 로 켜는 순간
--        예산이 소진된 피드 광고도 계속 노출됨.
--      · increment_ad_impressions(피드 노출 과금)가 budget_krw NULL(house) 여부도,
--        예산 잔액도 확인하지 않고 무조건 spent_krw 가산 → 예산 무한 초과 과금 +
--        house 광고에 의미 없는 spent 누적. (영상 경로 record_ad_impression 은
--        `IF v_budget IS NOT NULL` 처리 완료 — 피드 경로만 누락)
--
--   #4 [record_ad_click dedup 전무]
--      영상면(오버레이/프리롤/미드롤/포스트롤) 클릭 경로에 dedup·viewer_key 가 없어
--      같은 뷰어의 반복 클릭이 clicks 를 무한 인플레이션(CTR 왜곡·통계 오염).
--      피드 클릭(increment_ad_clicks)은 이미 (광고,뷰어,1시간) dedup 있음 — 동일 패턴 적용.
--      ★ 시그니처가 바뀌므로(파라미터 추가) 옛 3-인자 버전을 DROP 해야 PostgREST
--        오버로드 모호성(PGRST203)이 안 생김.
--
--   #7 [dedup 정리 크론 미등록]
--      cleanup_ad_charge_dedup / cleanup_ad_click_dedup / cleanup_ad_ip_key_log 함수는
--      있는데 pg_cron 등록이 없어 테이블이 무한 성장 → 일일 정리 잡 등록.
--
-- 적용: Supabase SQL Editor → Run (멱등).
--       Edge(/ad-event 의 record_ad_click 에 p_viewer_key 전달)는 별도 배포:
--       npx supabase functions deploy server --no-verify-jwt
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- #3-a. ads_public 뷰 — 예산 소진 광고 제외 (ads_public_view_20260620 정본 + 필터 1줄)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.ads_public AS
SELECT
  id, title, advertiser, image_url, video_url, thumbnail_url,
  link_url, cta_text, interval_count, ad_type
FROM public.ads
WHERE status = 'approved'
  AND is_active = true
  AND (starts_at IS NULL OR starts_at <= now())
  AND (ends_at   IS NULL OR ends_at   >= now())
  -- #3(2026-07-08): 예산 소진 광고 제외 (house 광고 budget NULL 은 항상 노출)
  AND (budget_krw IS NULL OR spent_krw < budget_krw);

GRANT SELECT ON public.ads_public TO anon, authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- #3-b. increment_ad_impressions — house 광고 무과금 + 예산 광고만 spent 가산
--       (ad_charge_dedup_phase3_20260614 정본 + record_ad_impression 과 동일 패턴)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_ad_impressions(
  ad_id uuid, p_viewer_key text DEFAULT NULL, p_video_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_cpm    NUMERIC;
  v_budget INTEGER;
  v_key    TEXT := COALESCE(auth.uid()::text, NULLIF(btrim(p_viewer_key), ''));
  v_bucket timestamptz := date_trunc('hour', now());
BEGIN
  -- dedup: (광고, 뷰어, 1시간) 1회만 집계. 키 없으면(레거시) 집계 유지.
  IF v_key IS NOT NULL THEN
    INSERT INTO public.ad_charge_dedup (ad_id, viewer_key, bucket)
    VALUES (ad_id, v_key, v_bucket)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;  -- 이미 집계된 조합 → skip
  END IF;

  SELECT budget_krw INTO v_budget FROM public.ads WHERE id = ad_id;

  -- 노출 카운트는 항상 +1
  UPDATE public.ads SET impressions = impressions + 1 WHERE id = ad_id;

  -- #3(2026-07-08): 과금(spent_krw)은 예산 광고에 한정 — house(budget NULL) 무과금.
  --   record_ad_impression(영상 경로)과 동일 패턴. 예산 소진 후 노출은 뷰 필터가 차단.
  IF v_budget IS NOT NULL THEN
    v_cpm := COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000);
    UPDATE public.ads
    SET spent_krw = spent_krw + CEIL(v_cpm / 1000.0)::INTEGER
    WHERE id = ad_id;
  END IF;
END;
$fn$;

-- ────────────────────────────────────────────────────────────────────────────
-- #4. record_ad_click — (광고,뷰어,1시간) dedup + viewer_key 파라미터 추가
--     (phase28_ad_revenue_distribution_fix 정본 + increment_ad_clicks 와 동일 dedup)
-- ────────────────────────────────────────────────────────────────────────────
-- 시그니처 변경 → 옛 3-인자 버전 제거 (오버로드 모호성 PGRST203 방지)
DROP FUNCTION IF EXISTS public.record_ad_click(uuid, text, text);

CREATE OR REPLACE FUNCTION public.record_ad_click(
  p_ad_id UUID,
  p_video_id TEXT,
  p_format TEXT,
  p_viewer_key TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_key    TEXT := COALESCE(auth.uid()::text, NULLIF(btrim(p_viewer_key), ''));
  v_bucket timestamptz := date_trunc('hour', now());
BEGIN
  -- #4(2026-07-08): (광고, 뷰어, 1시간) 1회만 집계 — 반복 클릭 인플레이션 차단.
  --   피드 클릭(increment_ad_clicks/ad_click_dedup)과 동일 패턴·동일 테이블.
  IF v_key IS NOT NULL THEN
    INSERT INTO public.ad_click_dedup (ad_id, viewer_key, bucket)
    VALUES (p_ad_id, v_key, v_bucket)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;  -- 이미 집계된 조합 → skip
  END IF;

  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = p_video_id;

  INSERT INTO public.ad_clicks (
    ad_id, video_id, creator_id, viewer_id, format
  ) VALUES (
    p_ad_id, p_video_id, v_creator_id, auth.uid(), p_format
  );

  -- ad_video_events 에도 'click' 기록 (일관성, 통계용)
  INSERT INTO public.ad_video_events (
    ad_id, event_type, source_video_id, viewer_user_id, occurred_at
  ) VALUES (
    p_ad_id, 'click', p_video_id, auth.uid(), now()
  );

  UPDATE public.ads SET clicks = clicks + 1 WHERE id = p_ad_id;
END;
$$;

COMMENT ON FUNCTION public.record_ad_click IS
  '영상 광고 클릭 기록 (Phase 28 + #4 dedup 2026-07-08). ad_clicks + ad_video_events 양쪽 INSERT, (광고,뷰어,1시간) 1회';

-- 재생성된 함수의 실행 권한 재고정 — ad_fraud_hardening_edge_20260628 과 동일:
-- 클라 직접호출 차단(Edge service_role 전용). CREATE 로 되살아난 PUBLIC EXECUTE 회수.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('increment_ad_impressions','record_ad_click')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- #7. dedup/로그 테이블 일일 정리 크론 등록 (멱등: 있으면 해제 후 재등록)
-- ────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-ad-charge-dedup');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-ad-click-dedup');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$
BEGIN
  PERFORM cron.unschedule('cleanup-ad-ip-key-log');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('cleanup-ad-charge-dedup', '10 3 * * *', 'SELECT public.cleanup_ad_charge_dedup();');
SELECT cron.schedule('cleanup-ad-click-dedup',  '15 3 * * *', 'SELECT public.cleanup_ad_click_dedup();');
SELECT cron.schedule('cleanup-ad-ip-key-log',   '20 3 * * *', 'SELECT public.cleanup_ad_ip_key_log();');

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 1) 예산 소진 광고가 뷰에서 빠지는지 (spent >= budget 인 행 0)
--   SELECT count(*) FROM public.ads a JOIN public.ads_public p ON p.id = a.id
--   WHERE a.budget_krw IS NOT NULL AND a.spent_krw >= a.budget_krw;   -- 기대: 0
--
--   -- 2) record_ad_click 오버로드 1개뿐인지 (PGRST203 방지)
--   SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
--   WHERE n.nspname='public' AND p.proname='record_ad_click';         -- 기대: 1행(4-인자)
--
--   -- 3) 크론 등록 확인
--   SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'cleanup-ad-%';  -- 기대: 3행
-- ════════════════════════════════════════════════════════════════════════════
