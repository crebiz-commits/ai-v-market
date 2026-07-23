-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 광고 노출 dedup fail-safe (2026-07-23, U2) — 식별키 없으면 미집계
--
--   결함(LOW·심층방어): record_ad_impression 은 v_key=COALESCE(auth.uid, viewer_key) 가
--     NULL 이면 dedup 을 건너뛰되 **집계·과금은 그대로 수행**했다(fail-open). 현재는
--     함수가 service_role 전용(ad_fraud_hardening_edge_20260628)이고 Edge /ad-event 가
--     viewer_key 를 항상 전송해 실전 노출은 낮으나, 식별 불가한 노출을 세는 것 자체가
--     스팸/이중집계의 여지 → **v_key NULL 이면 미집계(RETURN)** 로 전환(fail-open→fail-safe).
--     under-count 방향이라 크리에이터 과지급·광고주 과금 위험이 없다.
--     동시에 service_role 전용 GRANT 를 재확정(idempotent).
--
--   ※ ad_dedup_house_20260703.sql 전체 복제 + v_key NULL 가드 1개만 추가. 나머지(예산
--     무관 dedup·house 과금 제외·형식별 단가) 100% 동일. ★ 새 정본. 0703 재실행 금지.
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
  -- U2(2026-07-23): 식별키(로그인 uid 또는 viewer_key)가 없으면 dedup 불가 → 미집계.
  --   fail-open(키 없이 무제한 집계)을 fail-safe(미집계)로 전환. Edge 정상 경로는 항상
  --   viewer_key 를 보내므로 실집계 영향 없음.
  IF v_key IS NULL THEN RETURN; END IF;

  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = p_video_id;
  SELECT budget_krw, duration_seconds INTO v_budget, v_duration FROM public.ads WHERE id = p_ad_id;

  -- (광고, 뷰어, 1시간) 1회만 집계 — 예산 유무와 무관하게 dedup.
  --   house 광고(budget NULL)도 여기서 걸러 mount/ended/skip·effect 재발화로 인한
  --   2배 집계를 원천 차단(위조/스팸 차단 + 크리에이터 수익 정합).
  INSERT INTO public.ad_charge_dedup (ad_id, viewer_key, bucket)
  VALUES (p_ad_id, v_key, v_bucket) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;  -- 이미 집계됨 → 이벤트·카운터·과금 모두 skip

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

-- service_role 전용 재확정 (ad_fraud_hardening_edge_20260628 과 동일 — idempotent)
REVOKE EXECUTE ON FUNCTION public.record_ad_impression(uuid, text, text, integer, boolean, boolean, text)
  FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_ad_impression(uuid, text, text, integer, boolean, boolean, text)
  TO service_role;

-- ── 검증 ──
SELECT 'U2: record_ad_impression 식별키 없으면 미집계' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'IF v_key IS NULL THEN RETURN'
             FROM pg_proc WHERE proname='record_ad_impression')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'U2: record_ad_impression anon/authenticated 비노출',
  CASE WHEN NOT has_function_privilege('anon', 'public.record_ad_impression(uuid, text, text, integer, boolean, boolean, text)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.record_ad_impression(uuid, text, text, integer, boolean, boolean, text)', 'EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
