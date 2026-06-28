-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 광고 사기 방어 — Edge 기반 집계 전환 (2026-06-28, ad-fraud-hardening-plan #2)
--
--   배경: 광고 노출/클릭 집계 RPC(increment_ad_*, record_ad_*)가 클라 직접 호출 +
--         dedup 키가 클라 생성 세션키라, 키를 회전하면 dedup 우회 → 경쟁광고 예산소진·
--         노출/클릭 부풀리기 가능. VAST(track_video_ad_event)는 dedup 자체가 없었음.
--   설계: 집계를 Edge `server`(/ad-event) 뒤로 이전 → 신뢰 IP + 로그인 식별(auth.uid).
--         이 파일은 그 DB 측: ① IP 다양성 레이트리밋 가드 ② 기존 집계 RPC anon 회수
--         (Edge service_role 만 호출) ③ VAST dedup ④ 광고 생성 한도.
--   ⚠️ 프론트(adEvent.ts) + Edge(/ad-event) 와 함께 배포해야 집계가 끊기지 않음.
--      (현재 자체광고 OFF·과금 전이라 적용 중 실손해 0 — 안전하게 전환 가능.)
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① IP 다양성 로그 + 가드 ──────────────────────────────────────────────────
--   같은 IP 가 한 광고에 1시간 동안 만드는 distinct 익명키 수가 상한 초과면 키회전
--   어뷰징으로 보고 차단(false). 로그인('u:')·IP없음은 항상 통과(CGNAT 과소집계 방지).
CREATE TABLE IF NOT EXISTS public.ad_ip_key_log (
  ip         text        NOT NULL,
  ad_id      uuid        NOT NULL,
  viewer_key text        NOT NULL,
  bucket     timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ip, ad_id, viewer_key, bucket)
);
ALTER TABLE public.ad_ip_key_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_ip_key_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.ad_event_guard(p_ad_id uuid, p_viewer_key text, p_ip text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_bucket   timestamptz := date_trunc('hour', now());
  v_max      int := COALESCE(public.get_platform_setting('ad_ip_max_keys_per_hour'), 8)::int;
  v_distinct int;
BEGIN
  -- 익명키('a:') + IP 있을 때만 레이트리밋. 그 외(로그인/키없음/IP없음)는 통과.
  IF p_viewer_key IS NULL OR left(p_viewer_key, 2) <> 'a:' OR COALESCE(btrim(p_ip),'') = '' THEN
    RETURN true;
  END IF;
  INSERT INTO public.ad_ip_key_log (ip, ad_id, viewer_key, bucket)
  VALUES (btrim(p_ip), p_ad_id, p_viewer_key, v_bucket) ON CONFLICT DO NOTHING;
  SELECT count(DISTINCT viewer_key) INTO v_distinct
    FROM public.ad_ip_key_log WHERE ip = btrim(p_ip) AND ad_id = p_ad_id AND bucket = v_bucket;
  RETURN (v_distinct <= v_max);
END;
$fn$;
REVOKE ALL ON FUNCTION public.ad_event_guard(uuid, text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.ad_event_guard(uuid, text, text) TO service_role;

-- ── ② 집계 RPC anon 회수 → Edge(service_role) 전용 ───────────────────────────
--   increment_ad_impressions/clicks, record_ad_impression/record_ad_click 의 모든 오버로드.
--   (클라 직접 호출 경로 제거. Edge /ad-event 가 신뢰 식별키로 service_role 호출.)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('increment_ad_impressions','increment_ad_clicks',
                        'record_ad_impression','record_ad_click')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ── ③ VAST track_video_ad_event — impression dedup + search_path 고정 ─────────
--   서명URL(짧은 exp)을 반복 GET 해도 (광고, 뷰어=uid|IP, 영상, 1시간) 1회만 과금.
--   기존 시그니처/동작 유지 + dedup 추가. (Edge /vast-track 의 exp 는 30분으로 단축.)
CREATE OR REPLACE FUNCTION public.track_video_ad_event(
  p_ad_id uuid,
  p_event_type TEXT,
  p_source_video_id TEXT DEFAULT NULL,
  p_viewer_user_id uuid DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cpm          NUMERIC;
  v_cost_per_imp NUMERIC;
  v_key          TEXT := COALESCE(p_viewer_user_id::text, NULLIF(btrim(p_ip_address), ''));
  v_bucket       timestamptz := date_trunc('hour', now());
  v_dedup_key    TEXT;
BEGIN
  -- raw 이벤트 로그는 항상 저장(통계/감사)
  INSERT INTO public.ad_video_events (ad_id, event_type, source_video_id, viewer_user_id, user_agent, ip_address)
  VALUES (p_ad_id, p_event_type, p_source_video_id, p_viewer_user_id, p_user_agent, p_ip_address);

  IF p_event_type = 'impression' THEN
    -- dedup: 반복 노출(서명URL 재요청) 과금 차단. 키 없으면(IP/uid 둘 다 없음) 과금 유지(레거시).
    IF v_key IS NOT NULL THEN
      v_dedup_key := 'vast:' || v_key || ':' || COALESCE(p_source_video_id, '');
      INSERT INTO public.ad_charge_dedup (ad_id, viewer_key, bucket)
      VALUES (p_ad_id, v_dedup_key, v_bucket) ON CONFLICT DO NOTHING;
      IF NOT FOUND THEN RETURN; END IF;  -- 이미 과금된 조합 → 카운터·과금 skip
    END IF;
    v_cpm := COALESCE(public.get_platform_setting('ad_cpm_krw'), 2000);
    v_cost_per_imp := v_cpm / 1000.0;
    UPDATE public.ads
    SET impressions = impressions + 1, spent_krw = spent_krw + CEIL(v_cost_per_imp)::INTEGER
    WHERE id = p_ad_id;
  ELSIF p_event_type = 'click' THEN
    UPDATE public.ads SET clicks = clicks + 1 WHERE id = p_ad_id;
  END IF;
END;
$$;

-- ── ④ advertiser_create_ad — 생성 한도(스팸/DB 누적 방지) ────────────────────
--   시간당 10건 + 미승인(draft/rejected/pending_review) 누적 30건 상한.
--   (노출/과금은 승인+예산 필요라 직접 피해는 없으나 DB 무한누적·어뷰징 방지.)
CREATE OR REPLACE FUNCTION public.advertiser_create_ad(
  p_title text, p_format text, p_ad_type text, p_link_url text, p_cta_text text DEFAULT '자세히 보기',
  p_image_url text DEFAULT NULL, p_video_url text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL,
  p_advertiser text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_uid uuid := auth.uid(); v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF btrim(COALESCE(p_title,'')) = '' THEN RAISE EXCEPTION '광고명을 입력하세요'; END IF;
  IF btrim(COALESCE(p_link_url,'')) = '' THEN RAISE EXCEPTION '링크 URL을 입력하세요'; END IF;
  -- 생성 한도
  IF (SELECT count(*) FROM public.ads
        WHERE owner_id = v_uid AND created_at > now() - INTERVAL '1 hour') >= 10 THEN
    RAISE EXCEPTION '광고 생성이 너무 잦습니다. 잠시 후 다시 시도하세요';
  END IF;
  IF (SELECT count(*) FROM public.ads
        WHERE owner_id = v_uid AND status IN ('draft','rejected','pending_review')) >= 30 THEN
    RAISE EXCEPTION '미승인 광고가 너무 많습니다. 기존 광고를 정리한 뒤 생성하세요';
  END IF;
  INSERT INTO public.ads (owner_id, status, is_active, title, format, ad_type, link_url, cta_text,
                          image_url, video_url, thumbnail_url, advertiser, budget_krw, spent_krw)
  VALUES (v_uid, 'draft', false, btrim(p_title), p_format, p_ad_type, btrim(p_link_url),
          COALESCE(NULLIF(btrim(p_cta_text),''),'자세히 보기'), p_image_url, p_video_url, p_thumbnail_url,
          COALESCE(NULLIF(btrim(p_advertiser),''), (SELECT display_name FROM public.profiles WHERE id=v_uid)),
          0, 0)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- ── ⑤ IP 로그 정리(7일 경과분) — 기존 cleanup_ad_*_dedup 와 함께 호출 권장 ──────
CREATE OR REPLACE FUNCTION public.cleanup_ad_ip_key_log()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE n integer;
BEGIN
  DELETE FROM public.ad_ip_key_log WHERE bucket < now() - INTERVAL '7 days';
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END;
$fn$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 집계 RPC 가 anon/authenticated 에서 회수됐는지(EXECUTE 0건이어야):
--   SELECT p.proname, r.grantee
--   FROM information_schema.role_routine_grants r
--   JOIN pg_proc p ON p.proname = r.routine_name
--   WHERE r.routine_schema='public' AND r.grantee IN ('anon','authenticated')
--     AND r.routine_name IN ('increment_ad_impressions','increment_ad_clicks',
--       'record_ad_impression','record_ad_click','ad_event_guard');   -- → 0행
--   -- ad_event_guard 동작(익명키 9개째 false):
--   -- SELECT public.ad_event_guard('<ad-uuid>', 'a:test'||g, '1.2.3.4') FROM generate_series(1,10) g;
-- ════════════════════════════════════════════════════════════════════════════
