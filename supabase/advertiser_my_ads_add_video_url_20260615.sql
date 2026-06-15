-- ════════════════════════════════════════════════════════════════════════════
-- advertiser_my_ads() — video_url 반환 추가
--   영상 광고(프리롤·영상 피드) 편집 시 기존 영상 URL을 모달로 왕복시키기 위함.
--   (반환에 없으면 편집창에서 영상이 비어 보여 재업로드 강요 → 메타데이터만 수정 불가)
-- ════════════════════════════════════════════════════════════════════════════
-- RETURNS 시그니처(컬럼 추가) 변경이라 DROP 후 재생성 필요.
DROP FUNCTION IF EXISTS public.advertiser_my_ads();
CREATE OR REPLACE FUNCTION public.advertiser_my_ads()
RETURNS TABLE(id uuid, title text, format text, ad_type text, status text, is_active boolean,
              image_url text, video_url text, thumbnail_url text, link_url text, cta_text text,
              budget_krw integer, spent_krw integer, impressions bigint, clicks bigint,
              review_note text, created_at timestamptz, submitted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT id, title, format, ad_type, status, is_active, image_url, video_url, thumbnail_url, link_url, cta_text,
         budget_krw, spent_krw, impressions, clicks, review_note, created_at, submitted_at
  FROM public.ads
  WHERE owner_id = auth.uid()
  ORDER BY created_at DESC;
$fn$;
