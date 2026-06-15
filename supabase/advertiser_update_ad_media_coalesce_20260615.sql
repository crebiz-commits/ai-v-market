-- 광고주 광고 수정 — 미디어 필드는 새로 제공했을 때만 갱신(빈값이면 기존 유지) (2026-06-15)
-- 영상 광고 메타데이터만 수정할 때 영상이 지워지지 않도록.
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
    image_url = COALESCE(NULLIF(btrim(p_image_url),''), image_url),
    video_url = COALESCE(NULLIF(btrim(p_video_url),''), video_url),
    thumbnail_url = COALESCE(NULLIF(btrim(p_thumbnail_url),''), thumbnail_url),
    updated_at = now()
  WHERE id = p_ad_id AND owner_id = v_uid AND status IN ('draft','rejected');
  IF NOT FOUND THEN RAISE EXCEPTION '수정할 수 없는 광고입니다 (본인·초안/반려 상태만 수정 가능)'; END IF;
END;
$fn$;
