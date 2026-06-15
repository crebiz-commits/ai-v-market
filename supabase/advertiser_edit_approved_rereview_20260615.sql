-- ════════════════════════════════════════════════════════════════════════════
-- 광고주 광고 수정 정책: 승인된 광고도 수정 허용 + 재심사 (2026-06-15)
--   기존: status IN ('draft','rejected') 만 수정 가능 → 승인된 광고는 오타조차 수정 불가.
--   변경: draft/rejected/pending_review/approved 모두 수정 가능.
--         단, 'approved' 광고를 수정하면 → status='pending_review' 로 자동 전환(재심사).
--         노출 게이트가 status='approved' 라 재심사 동안 노출 중단되고, 재승인 시 자동 재개.
--         (is_active 는 보존 → 재승인되면 광고주가 다시 켤 필요 없음)
--   이유: bait-and-switch(승인용 소재로 통과 후 부적절 소재로 교체) 방지 + 노출 중 소재
--         실시간 변경에 따른 과금·통계 정합성 보호.
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.advertiser_update_ad(
  p_ad_id uuid, p_title text, p_link_url text, p_cta_text text,
  p_image_url text DEFAULT NULL, p_video_url text DEFAULT NULL, p_thumbnail_url text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_status text;
BEGIN
  SELECT status INTO v_status FROM public.ads WHERE id = p_ad_id AND owner_id = v_uid;
  IF v_status IS NULL THEN
    RAISE EXCEPTION '수정할 수 없는 광고입니다 (본인 광고가 아닙니다)';
  END IF;
  IF v_status NOT IN ('draft','rejected','pending_review','approved') THEN
    RAISE EXCEPTION '수정할 수 없는 상태입니다 (%)', v_status;
  END IF;

  UPDATE public.ads SET
    title         = COALESCE(NULLIF(btrim(p_title),''), title),
    link_url      = COALESCE(NULLIF(btrim(p_link_url),''), link_url),
    cta_text      = COALESCE(NULLIF(btrim(p_cta_text),''), cta_text),
    image_url     = COALESCE(NULLIF(btrim(p_image_url),''), image_url),
    video_url     = COALESCE(NULLIF(btrim(p_video_url),''), video_url),
    thumbnail_url = COALESCE(NULLIF(btrim(p_thumbnail_url),''), thumbnail_url),
    -- 승인본 수정 → 재심사 전환 (RHS의 status 는 수정 전 값)
    status        = CASE WHEN status = 'approved' THEN 'pending_review' ELSE status END,
    submitted_at  = CASE WHEN status = 'approved' THEN now()            ELSE submitted_at END,
    review_note   = CASE WHEN status = 'approved' THEN NULL             ELSE review_note END,
    reviewed_by   = CASE WHEN status = 'approved' THEN NULL             ELSE reviewed_by END,
    reviewed_at   = CASE WHEN status = 'approved' THEN NULL             ELSE reviewed_at END,
    updated_at    = now()
  WHERE id = p_ad_id AND owner_id = v_uid;
END;
$function$;
