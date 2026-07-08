-- ════════════════════════════════════════════════════════════════════════════
-- 死코드 정리: 1-인자 increment_ad_impressions(uuid) 오버로드 DROP (2026-07-08)
--
--   배경: increment_ad_impressions 는 현재 3-인자 (ad_id uuid, p_viewer_key text,
--         p_video_id text) 버전이 정본(ad_charge_dedup_phase3_20260614 / ads_gate_dedup_20260708)
--         이며 Edge(/ad-event)가 3개 named 인자로 호출한다. 과거 1-인자 (uuid) 버전이
--         DROP 없이 남아(ads_table / phase8_5_ad_budget_accounting) 오버로드가 공존 —
--         死코드 + 잠재 오버로드 모호성(누군가 1-인자로 호출 시 dedup 없는 옛 본문 실행 위험).
--   조치: 1-인자 버전만 제거(3-인자 정본은 유지). 현재 활성 호출 없음(클라는 Edge 경유) → 안전.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.increment_ad_impressions(uuid);

-- 검증(3-인자 정본만 남아야):
--   SELECT oid::regprocedure FROM pg_proc WHERE proname = 'increment_ad_impressions';
--   -- 기대: increment_ad_impressions(uuid,text,text) 하나만
