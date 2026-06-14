-- ════════════════════════════════════════════════════════════════════════════
-- 광고주 셀프서비스 Phase 1 — 백엔드 기반 (2026-06-14)
--   설계: docs/advertiser-self-service-design.md
--   확정: 오픈가입+광고별심사 / 승인후충전 / 광고수익 크리에이터 분배(현행유지)
--   범위: 데이터모델(owner_id·status) + RLS + 서빙필터(승인된 광고만) + RPC.
--   ⚠️ House Ads(기존)는 status 기본 'approved' 로 무중단 유지.
--   ⚠️ 셀프서비스 광고가 실제 노출되려면 광고예산 dedup(서버측 차감)이 선행돼야 함
--      → Phase 3(과금) 전까지 셀프서비스 광고는 어드민 승인을 보류해 노출 차단.
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 스키마: 소유권 + 상태 ─────────────────────────────────────────────────
ALTER TABLE public.ads
  ADD COLUMN IF NOT EXISTS owner_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('draft','pending_review','approved','rejected','paused')),
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_ads_owner  ON public.ads(owner_id);
CREATE INDEX IF NOT EXISTS idx_ads_review ON public.ads(status) WHERE status = 'pending_review';

-- ── 2) RLS: 공개=승인+활성, 소유자=본인 전체, 어드민=전체. 쓰기는 RPC 전용 ──
DROP POLICY IF EXISTS "Anyone can view active ads" ON public.ads;
CREATE POLICY "Public can view approved active ads"
  ON public.ads FOR SELECT
  USING (
    status = 'approved' AND is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >= now())
  );

DROP POLICY IF EXISTS "Advertiser can view own ads" ON public.ads;
CREATE POLICY "Advertiser can view own ads"
  ON public.ads FOR SELECT
  USING (owner_id = auth.uid());
-- "Admin full access" 정책은 기존 그대로 유지(전체 CRUD).
-- 광고주 INSERT/UPDATE 직접 정책은 두지 않음 → 모든 쓰기는 아래 SECURITY DEFINER RPC 경유.

-- ── 3) 서빙 필터: 승인된 광고만 노출 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_ad_for_video(p_video_id text, p_format text)
RETURNS TABLE(ad_id uuid, title text, advertiser text, image_url text, video_url text,
              thumbnail_url text, link_url text, cta_text text, duration_seconds integer,
              skip_after_seconds integer, trigger_position_pct integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_duration_sec INTEGER; v_category TEXT; v_min_preroll INTEGER; v_min_midroll INTEGER;
BEGIN
  SELECT v.duration_seconds, v.category INTO v_duration_sec, v_category
  FROM public.videos v WHERE v.id = p_video_id;
  IF v_duration_sec IS NULL THEN RETURN; END IF;

  v_min_preroll := COALESCE(public.get_platform_setting('min_duration_for_preroll_seconds')::INTEGER, 60);
  v_min_midroll := COALESCE(public.get_platform_setting('min_duration_for_midroll_seconds')::INTEGER, 600);
  IF p_format IN ('preroll','overlay','postroll','bumper') AND v_duration_sec < v_min_preroll THEN RETURN; END IF;
  IF p_format = 'midroll' AND v_duration_sec < v_min_midroll THEN RETURN; END IF;

  RETURN QUERY
  SELECT a.id, a.title, a.advertiser, a.image_url, a.video_url, a.thumbnail_url,
         a.link_url, a.cta_text, a.duration_seconds, a.skip_after_seconds, a.trigger_position_pct
  FROM public.ads a
  WHERE a.status = 'approved'        -- 셀프서비스: 승인된 광고만
    AND a.is_active = true
    AND a.format = p_format
    AND (a.starts_at IS NULL OR a.starts_at <= now())
    AND (a.ends_at IS NULL OR a.ends_at >= now())
    AND (a.budget_krw IS NULL OR a.spent_krw < a.budget_krw)
    AND (a.min_video_duration_sec IS NULL OR v_duration_sec >= a.min_video_duration_sec)
    AND (a.target_categories IS NULL OR array_length(a.target_categories,1) IS NULL
         OR v_category = ANY(a.target_categories))
  ORDER BY random() LIMIT 1;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.pick_random_video_preroll(p_source_video_id text DEFAULT NULL::text)
RETURNS SETOF public.ads
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT * FROM public.ads
  WHERE ad_type = 'video_preroll'
    AND status = 'approved'         -- 셀프서비스: 승인된 광고만
    AND is_active = true
    AND video_url IS NOT NULL AND video_url <> ''
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
    AND (budget_krw IS NULL OR spent_krw < budget_krw)
  ORDER BY random() * weight DESC LIMIT 1;
END;
$fn$;

-- ── 4) 광고주 RPC (본인 광고 CRUD + 제출/일시중지) ──────────────────────────
-- 광고 생성(draft)
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

-- 광고 수정 (draft/rejected 상태에서만 내용 수정)
CREATE OR REPLACE FUNCTION public.advertiser_update_ad(
  p_ad_id uuid, p_title text, p_link_url text, p_cta_text text,
  p_image_url text DEFAULT NULL, p_video_url text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  UPDATE public.ads SET
    title = COALESCE(NULLIF(btrim(p_title),''), title),
    link_url = COALESCE(NULLIF(btrim(p_link_url),''), link_url),
    cta_text = COALESCE(NULLIF(btrim(p_cta_text),''), cta_text),
    image_url = p_image_url, video_url = p_video_url, thumbnail_url = p_thumbnail_url,
    updated_at = now()
  WHERE id = p_ad_id AND owner_id = v_uid AND status IN ('draft','rejected');
  IF NOT FOUND THEN RAISE EXCEPTION '수정할 수 없는 광고입니다 (본인·초안/반려 상태만 수정 가능)'; END IF;
END;
$fn$;

-- 심사 제출 (draft/rejected → pending_review)
CREATE OR REPLACE FUNCTION public.advertiser_submit_ad(p_ad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  UPDATE public.ads
  SET status = 'pending_review', submitted_at = now(), review_note = NULL, updated_at = now()
  WHERE id = p_ad_id AND owner_id = v_uid AND status IN ('draft','rejected');
  IF NOT FOUND THEN RAISE EXCEPTION '제출할 수 없는 광고입니다'; END IF;
END;
$fn$;

-- 일시중지/재개 (승인된 광고만)
CREATE OR REPLACE FUNCTION public.advertiser_set_active(p_ad_id uuid, p_on boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  UPDATE public.ads SET is_active = p_on, updated_at = now()
  WHERE id = p_ad_id AND owner_id = v_uid AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION '변경할 수 없는 광고입니다 (승인된 본인 광고만)'; END IF;
END;
$fn$;

-- 내 광고 목록 + 성과
CREATE OR REPLACE FUNCTION public.advertiser_my_ads()
RETURNS TABLE(id uuid, title text, format text, ad_type text, status text, is_active boolean,
              image_url text, thumbnail_url text, link_url text, cta_text text,
              budget_krw integer, spent_krw integer, impressions bigint, clicks bigint,
              review_note text, created_at timestamptz, submitted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT id, title, format, ad_type, status, is_active, image_url, thumbnail_url, link_url, cta_text,
         budget_krw, spent_krw, impressions, clicks, review_note, created_at, submitted_at
  FROM public.ads
  WHERE owner_id = auth.uid()
  ORDER BY created_at DESC;
$fn$;

-- ── 5) 어드민 심사 RPC ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_review_ad(p_ad_id uuid, p_approve boolean, p_note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE v_owner uuid; v_title text; v_status text;
BEGIN
  PERFORM public.assert_admin();
  SELECT owner_id, title INTO v_owner, v_title FROM public.ads WHERE id = p_ad_id;
  IF NOT FOUND THEN RAISE EXCEPTION '존재하지 않는 광고입니다'; END IF;

  v_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
  UPDATE public.ads
  SET status = v_status, review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_ad_id;

  -- 광고주 알림 (벨)
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_owner, 'system',
      CASE WHEN p_approve THEN '광고가 승인되었어요 ✅' ELSE '광고가 반려되었어요' END,
      '「' || COALESCE(v_title,'광고') || '」' ||
      CASE WHEN p_approve THEN ' — 예산을 충전하면 노출이 시작됩니다.'
           ELSE ' — 사유: ' || COALESCE(p_note,'정책 미충족') END,
      '/?tab=advertiser');
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.advertiser_create_ad(text,text,text,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advertiser_update_ad(uuid,text,text,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advertiser_submit_ad(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advertiser_set_active(uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.advertiser_my_ads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_ad(uuid,boolean,text) TO authenticated;
