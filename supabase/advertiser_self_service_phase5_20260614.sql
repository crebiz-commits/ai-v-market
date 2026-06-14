-- ════════════════════════════════════════════════════════════════════════════
-- 광고주 셀프서비스 Phase 5 — 예산광고 과금 정합 + 일자별 성과 (2026-06-14)
--   문제: 오버레이/영상 광고의 record_ad_impression 이 spent_krw 를 차감하지 않아
--         예산 광고(광고주 광고)가 노출돼도 예산이 안 깎여 무한 노출됨.
--   수정: budget_krw 가 설정된 광고는 (광고,뷰어,1시간) 1회만 집계·CPM 과금(dedup).
--         budget_krw NULL(무료 House Ads)은 기존 그대로 — 매 노출 집계, 과금 없음.
--   + advertiser_ad_daily_stats: 본인 광고 일자별 노출/클릭(ad_video_events).
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_ad_impression(
  p_ad_id uuid, p_video_id text, p_format text,
  p_position_seconds integer DEFAULT NULL, p_completed boolean DEFAULT false,
  p_skipped boolean DEFAULT false, p_viewer_key text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_creator_id UUID;
  v_budget     INTEGER;
  v_cpm        NUMERIC;
  v_key        TEXT := COALESCE(auth.uid()::text, NULLIF(btrim(p_viewer_key), ''));
  v_bucket     timestamptz := date_trunc('hour', now());
BEGIN
  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = p_video_id;
  SELECT budget_krw INTO v_budget FROM public.ads WHERE id = p_ad_id;

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

  -- 예산 광고 CPM 과금
  IF v_budget IS NOT NULL THEN
    v_cpm := COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000);
    UPDATE public.ads SET spent_krw = spent_krw + CEIL(v_cpm / 1000.0)::INTEGER WHERE id = p_ad_id;
  END IF;
END;
$fn$;

-- 본인 광고 일자별 성과
CREATE OR REPLACE FUNCTION public.advertiser_ad_daily_stats(p_ad_id uuid, p_days integer DEFAULT 14)
RETURNS TABLE(day date, impressions bigint, clicks bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.ads WHERE id = p_ad_id AND (owner_id = auth.uid() OR public.is_admin())) THEN
    RAISE EXCEPTION '권한이 없습니다';
  END IF;
  RETURN QUERY
  SELECT e.occurred_at::date AS day,
         count(*) FILTER (WHERE e.event_type = 'impression')::bigint,
         count(*) FILTER (WHERE e.event_type = 'click')::bigint
  FROM public.ad_video_events e
  WHERE e.ad_id = p_ad_id
    AND e.occurred_at >= now() - (p_days || ' days')::interval
  GROUP BY 1 ORDER BY 1;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.advertiser_ad_daily_stats(uuid, integer) TO authenticated;
