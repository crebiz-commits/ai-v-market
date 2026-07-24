-- ════════════════════════════════════════════════════════════════════════════
-- 📊 히어로 광고 전용 집계·과금 (2026-07-24) — 무집계 판매 결함 해소
--
--   [결함] OTT 히어로(hero_display) 광고는 노출/클릭 집계를 일부러 호출 안 했다(프리롤과
--          ad_charge_dedup 슬롯 공유 시 (a)프리롤의 크리에이터 수익 이벤트 억제 (b)오과금
--          회피 목적). 그런데 광고주 셀프서비스(AdCreateModal)에서 hero 를 유료로 등록·충전
--          가능 → spent_krw 가 영원히 0 → ads_public 예산필터(spent < budget) 항상 통과 →
--          **무제한·무과금 노출**(광고주 이득/플랫폼 과소수익). 크리에이터 정산엔 무전이.
--   [해결] 히어로 전용 집계 2종 신설:
--          · 독립 dedup 네임스페이스('hero:'/'heroclick:' 프리픽스) → 프리롤/피드 슬롯 무선점.
--          · 예산광고면 노출당 spent_krw 차감(hero CPM = hero_cpm_krw 설정 있으면 우선,
--            없으면 ad_cpm_krw) → 예산 소진 시 ads_public 필터로 자동 노출중단.
--          · ad_video_events 는 만들지 않음 — 히어로는 특정 크리에이터 영상 위가 아니라 독립
--            슬롯이라 배분 대상 크리에이터가 없음(피드 광고와 동일 성격).
--          · service_role 전용(Edge /ad-event 경유). 식별키 없으면 미집계(fail-safe, #49 정합).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 히어로 노출 집계 + 예산 과금 ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_hero_impression(
  p_ad_id uuid, p_viewer_key text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_key    TEXT := COALESCE(auth.uid()::text, NULLIF(btrim(p_viewer_key), ''));
  v_bucket timestamptz := date_trunc('hour', now());
  v_budget INTEGER;
  v_cpm    NUMERIC;
BEGIN
  -- 식별키 없으면 미집계(fail-open→fail-safe, #49 와 동일 정책)
  IF v_key IS NULL THEN RETURN; END IF;

  -- (광고, 뷰어, 1시간) 1회만 집계 — 히어로 전용 슬롯('hero:' 프리픽스)이라 프리롤/피드의
  --   ad_charge_dedup 슬롯을 선점하지 않는다(크리에이터 수익 이벤트 억제·오과금 회피).
  INSERT INTO public.ad_charge_dedup (ad_id, viewer_key, bucket)
  VALUES (p_ad_id, 'hero:' || v_key, v_bucket) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;   -- 이미 집계됨 → 카운터·과금 skip

  UPDATE public.ads SET impressions = impressions + 1 WHERE id = p_ad_id;

  -- 예산 광고만 과금(자체광고 house=budget NULL 은 무과금). 크리에이터 배분 이벤트 없음.
  SELECT budget_krw INTO v_budget FROM public.ads WHERE id = p_ad_id;
  IF v_budget IS NOT NULL THEN
    v_cpm := COALESCE(public.get_platform_setting('hero_cpm_krw'),
                      public.get_platform_setting('ad_cpm_krw'), 2000);
    UPDATE public.ads SET spent_krw = spent_krw + CEIL(v_cpm / 1000.0)::INTEGER
    WHERE id = p_ad_id;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.record_hero_impression(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_hero_impression(uuid, text) TO service_role;

-- ── 히어로 클릭 집계(통계용, 과금 없음) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_hero_click(
  p_ad_id uuid, p_viewer_key text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_key    TEXT := COALESCE(auth.uid()::text, NULLIF(btrim(p_viewer_key), ''));
  v_bucket timestamptz := date_trunc('hour', now());
BEGIN
  IF v_key IS NULL THEN RETURN; END IF;
  -- 클릭 전용 dedup 네임스페이스. 예산은 노출로만 소진하므로 클릭은 과금 안 함.
  INSERT INTO public.ad_charge_dedup (ad_id, viewer_key, bucket)
  VALUES (p_ad_id, 'heroclick:' || v_key, v_bucket) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.ads SET clicks = clicks + 1 WHERE id = p_ad_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_hero_click(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_hero_click(uuid, text) TO service_role;

-- ── 검증 ──
SELECT '히어로 노출 집계(spent 차감·독립 dedup·service_role)' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'spent_krw' AND prosrc ~ '''hero:'''
             FROM pg_proc WHERE proname='record_hero_impression')
        AND NOT has_function_privilege('anon', 'public.record_hero_impression(uuid, text)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.record_hero_impression(uuid, text)', 'EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '히어로 노출이 ad_video_events 미생성(크리에이터 무전이)',
  CASE WHEN (SELECT prosrc !~ 'ad_video_events' FROM pg_proc WHERE proname='record_hero_impression')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '히어로 클릭 집계(과금 없음)',
  CASE WHEN (SELECT prosrc ~ 'clicks = clicks' AND prosrc !~ 'spent_krw'
             FROM pg_proc WHERE proname='record_hero_click')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
