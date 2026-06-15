-- ════════════════════════════════════════════════════════════════════════════
-- 오버레이 광고 노출시간 비례 과금 (2026-06-15)
--   정책: 오버레이 배너는 노출시간(duration_seconds)에 비례해 과금.
--         기준 10초 = 기준단가(CEIL(cpm/1000)=₩2). 20초=₩4, 30초=₩6.
--         duration 미설정(NULL)은 10초로 간주(기준단가).
--   그 외 형식(preroll/feed/midroll/postroll/bumper)은 노출 회당 정액 유지.
--   ※ 같은 광고가 홈 피드 카드(feed_display)로 나오는 경우는 feed 경로
--     (increment_ad_impressions)라 시간 개념이 없어 정액 그대로.
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
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

  -- 예산 광고: (광고, 뷰어, 1시간) 1회만 집계·과금 → 위조/스팸 차단 + 과금 정합
  IF v_budget IS NOT NULL AND v_key IS NOT NULL THEN
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

  -- 예산 광고 과금
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
