-- 광고주 셀프서비스 Phase 4 — 어드민 심사 큐 RPC (2026-06-14)
CREATE OR REPLACE FUNCTION public.admin_list_pending_ads()
RETURNS TABLE(id uuid, owner_id uuid, owner_name text, title text, advertiser text, format text,
              ad_type text, image_url text, video_url text, thumbnail_url text, link_url text,
              cta_text text, submitted_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT a.id, a.owner_id, p.display_name, a.title, a.advertiser, a.format, a.ad_type,
         a.image_url, a.video_url, a.thumbnail_url, a.link_url, a.cta_text, a.submitted_at, a.created_at
  FROM public.ads a
  LEFT JOIN public.profiles p ON p.id = a.owner_id
  WHERE a.status = 'pending_review'
  ORDER BY a.submitted_at ASC NULLS LAST;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_ads() TO authenticated;
