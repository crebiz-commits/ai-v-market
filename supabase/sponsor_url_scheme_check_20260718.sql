-- ════════════════════════════════════════════════════════════════════════════
-- 협찬 URL 스킴 CHECK 제약 — 소스 강제(모든 쓰기 경로) (2026-07-18)
--
--   [갭] videos.sponsor_link_url/sponsor_logo_url 이 쓰기 시점 검증이 없어(편집 RPC
--     update_my_video_metadata 는 title/price/age 등만 검증) 크리에이터가 javascript:/data:
--     스킴을 저장 가능. 렌더 양측은 이미 방어(관리자=비정상링크 비활성, 공개=openExternal
--     http(s) 강제)라 실행되진 않으나, "소스에서 막기"가 정석이고 직접 PostgREST UPDATE 등
--     미래 경로/렌더 누락 시 노출 위험. → DB CHECK 로 http(s)-or-빈값만 허용(단일 지점 강제).
--   VideoEditModal 은 클라이언트 검증 메시지도 추가(이 제약과 이중).
--
--   적용: Supabase SQL Editor → Run (멱등). 기존 위반 데이터는 NULL 로 정리 후 제약 추가.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 기존 위반(비 http/https, 빈값 아님) 정리 — 제약 추가가 실패하지 않도록
UPDATE public.videos SET sponsor_link_url = NULL
  WHERE sponsor_link_url IS NOT NULL AND btrim(sponsor_link_url) <> ''
    AND sponsor_link_url !~* '^https?://';
UPDATE public.videos SET sponsor_logo_url = NULL
  WHERE sponsor_logo_url IS NOT NULL AND btrim(sponsor_logo_url) <> ''
    AND sponsor_logo_url !~* '^https?://';

-- 2) CHECK 제약 — NULL/빈값 또는 http(s)로 시작만 허용
ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS sponsor_link_url_scheme;
ALTER TABLE public.videos ADD CONSTRAINT sponsor_link_url_scheme
  CHECK (sponsor_link_url IS NULL OR btrim(sponsor_link_url) = '' OR sponsor_link_url ~* '^https?://');

ALTER TABLE public.videos DROP CONSTRAINT IF EXISTS sponsor_logo_url_scheme;
ALTER TABLE public.videos ADD CONSTRAINT sponsor_logo_url_scheme
  CHECK (sponsor_logo_url IS NULL OR btrim(sponsor_logo_url) = '' OR sponsor_logo_url ~* '^https?://');

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 위반 저장 시도 → 제약 위반 에러:
--   -- UPDATE public.videos SET sponsor_link_url='javascript:alert(1)' WHERE id='<본인영상>';
--   SELECT conname FROM pg_constraint WHERE conname IN ('sponsor_link_url_scheme','sponsor_logo_url_scheme'); -- 2행
-- ════════════════════════════════════════════════════════════════════════════
