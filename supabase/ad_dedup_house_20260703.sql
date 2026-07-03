-- ════════════════════════════════════════════════════════════════════════════
-- 광고 노출 dedup 을 예산가드 밖으로 이동 (2026-07-03) — 광고 감사 A2 백엔드/방어
--
--   문제: record_ad_impression 의 (광고,뷰어,1시간) dedup 이 `IF v_budget IS NOT NULL`
--         안에 있어, house 광고(budget_krw IS NULL = 현재 자체광고 인벤토리)는 dedup 을
--         건너뛴다. 프론트가 한 재생에서 노출을 2번 기록하면(mount + ended/skip, 또는
--         오버레이 effect 재발화 m6) 그대로 2배 집계 → 크리에이터 광고수익 2배 과지급.
--
--   해결: dedup(집계 1회 보장)을 예산 유무와 무관하게 항상 적용.
--         과금(spent_krw)만 예산 광고에 한정. 프론트 A2 수정과 함께 이중 방어.
--
--   주의: 이제 house 광고도 (광고,뷰어,시간) 1회만 집계 = "시간당 유니크 노출".
--         동일 뷰어의 같은 시간 재시청은 1회로 합산(정상적 노출 정의).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id uuid, p_video_id text, p_format text,
  p_position_seconds integer DEFAULT NULL, p_completed boolean DEFAULT false,
  p_skipped boolean DEFAULT false, p_viewer_key text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_creator_id UUID;
  v_budget     INTEGER;
  v_duration   INTEGER;
  v_cpm        NUMERIC;
  v_charge     INTEGER;
  v_ref_sec    NUMERIC := 10.0;  -- 기준 노출시간(초): 이 시간이 기준단가에 해당
  v_key        TEXT := COALESCE(auth.uid()::text, NULLIF(btrim(p_viewer_key), ''));
  v_bucket     timestamptz := date_trunc('hour', now());
BEGIN
  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = p_video_id;
  SELECT budget_krw, duration_seconds INTO v_budget, v_duration FROM public.ads WHERE id = p_ad_id;

  -- (광고, 뷰어, 1시간) 1회만 집계 — 예산 유무와 무관하게 dedup.
  --   house 광고(budget NULL)도 여기서 걸러 mount/ended/skip·effect 재발화로 인한
  --   2배 집계를 원천 차단(위조/스팸 차단 + 크리에이터 수익 정합).
  IF v_key IS NOT NULL THEN
    INSERT INTO public.ad_charge_dedup (ad_id, viewer_key, bucket)
    VALUES (p_ad_id, v_key, v_bucket) ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN RETURN; END IF;  -- 이미 집계됨 → 이벤트·카운터·과금 모두 skip
  END IF;

  -- 형식별 노출 상세 (운영 통계)
  INSERT INTO public.ad_impressions (ad_id, video_id, creator_id, viewer_id, format, position_seconds, completed, skipped)
  VALUES (p_ad_id, p_video_id, v_creator_id, auth.uid(), p_format, p_position_seconds, p_completed, p_skipped);

  -- 수익 분배용 이벤트 (calculate_monthly_revenue → 영상 크리에이터 분배)
  INSERT INTO public.ad_video_events (ad_id, event_type, source_video_id, viewer_user_id, occurred_at)
  VALUES (p_ad_id, 'impression', p_video_id, auth.uid(), now());

  -- 누적 노출
  UPDATE public.ads SET impressions = impressions + 1 WHERE id = p_ad_id;

  -- 예산 광고 과금 (house 광고는 과금 없음)
  IF v_budget IS NOT NULL THEN
    v_cpm := COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000);
    IF p_format = 'overlay' THEN
      -- 오버레이: 노출시간 비례 (기준 10초 = 기준단가). 최소 ₩1.
      v_charge := GREATEST(1, CEIL( (v_cpm / 1000.0) * (COALESCE(v_duration, 10) / v_ref_sec) )::INTEGER);
    ELSE
      v_charge := CEIL(v_cpm / 1000.0)::INTEGER;
    END IF;
    UPDATE public.ads SET spent_krw = spent_krw + v_charge WHERE id = p_ad_id;
  END IF;
END;
$function$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(house 광고 2배집계 방지 확인):
--   SELECT set_config('request.jwt.claim.sub',
--     (SELECT id::text FROM auth.users WHERE email='crebizlogistics@gmail.com'), true);
--   -- budget_krw IS NULL 인 preroll 광고 1개 선택
--   SELECT id FROM public.ads WHERE ad_type='video_preroll' AND budget_krw IS NULL LIMIT 1;  -- :ad
--   -- 같은 뷰어·같은 시간에 2회 호출:
--   SELECT public.record_ad_impression(':ad','<vid>','preroll',NULL,false,false,'u:<uid>');
--   SELECT public.record_ad_impression(':ad','<vid>','preroll',10,true,false,'u:<uid>');
--   SELECT count(*) FROM public.ad_video_events WHERE ad_id=':ad' AND event_type='impression';
--   -- 기대: +1 (기존엔 +2). 두 번째 호출은 dedup 으로 skip.
-- ════════════════════════════════════════════════════════════════════════════
