-- ════════════════════════════════════════════════════════════════════════════
-- Phase 34 — 영상 편집 모달에 "판매 가격" 수정 추가 (2026-07-03)
--
-- 목적: 업로드 후에도 크리에이터가 본인 영상의 판매가(All-in-One 단일가)를 수정 가능.
--       (기존 update_my_video_metadata 에 가격 파라미터가 없어 업로드 때만 설정 가능했음)
--
-- 변경: update_my_video_metadata RPC 에 p_price_standard(INTEGER) 1개 추가.
--       price_standard/commercial/exclusive 3컬럼을 동일값으로 갱신
--       (save-metadata 와 동일 규칙 — commercial/exclusive 는 standard 미러, NOT NULL 안전).
--       NULL 전달 = 변경 없음(COALESCE). 0 = 무료(라이선스 미판매).
--
-- 실행: Supabase Dashboard → SQL Editor → 본 파일 전체 복붙 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- 기존 update_my_video_metadata 모든 시그니처 일괄 삭제
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'update_my_video_metadata'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.update_my_video_metadata(
  p_video_id          TEXT,
  p_thumbnail         TEXT    DEFAULT NULL,
  p_chapters          JSONB   DEFAULT NULL,
  p_subtitle_url      TEXT    DEFAULT NULL,
  p_clear_subtitle    BOOLEAN DEFAULT false,
  p_age_rating        TEXT    DEFAULT NULL,
  -- 기본 정보
  p_title             TEXT    DEFAULT NULL,
  p_description       TEXT    DEFAULT NULL,
  p_category          TEXT    DEFAULT NULL,
  p_genre             TEXT    DEFAULT NULL,
  -- 시네마 메타데이터
  p_director          TEXT    DEFAULT NULL,
  p_writer            TEXT    DEFAULT NULL,
  p_composer          TEXT    DEFAULT NULL,
  p_cast_credits      TEXT    DEFAULT NULL,
  p_production_year   INTEGER DEFAULT NULL,
  p_language          TEXT    DEFAULT NULL,
  p_subtitle_language TEXT    DEFAULT NULL,
  -- AI 제작 정보
  p_ai_tool           TEXT    DEFAULT NULL,
  p_ai_model_version  TEXT    DEFAULT NULL,
  p_prompt            TEXT    DEFAULT NULL,
  p_seed              TEXT    DEFAULT NULL,
  p_resolution        TEXT    DEFAULT NULL,
  -- 태그 (배열)
  p_tags              TEXT[]  DEFAULT NULL,
  -- 협찬
  p_sponsor_brand     TEXT    DEFAULT NULL,
  p_sponsor_logo_url  TEXT    DEFAULT NULL,
  p_sponsor_disclosure TEXT   DEFAULT NULL,
  p_sponsor_link_url  TEXT    DEFAULT NULL,
  -- 협찬 일괄 제거 플래그 (NULL 전달과 구분)
  p_clear_sponsor     BOOLEAN DEFAULT false,
  -- Phase 34 — 판매 가격 (All-in-One 단일가). NULL=변경없음, 0=무료
  p_price_standard    INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owner UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT creator_id INTO v_owner FROM public.videos WHERE id = p_video_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION '영상을 찾을 수 없습니다';
  END IF;
  IF v_owner <> v_uid THEN
    RAISE EXCEPTION '본인 영상만 편집할 수 있습니다';
  END IF;

  IF p_age_rating IS NOT NULL AND p_age_rating NOT IN ('all', '13', '15', '19') THEN
    RAISE EXCEPTION '잘못된 연령 등급: %', p_age_rating;
  END IF;

  IF p_production_year IS NOT NULL AND (p_production_year < 1900 OR p_production_year > 2100) THEN
    RAISE EXCEPTION '제작 연도는 1900~2100 사이여야 합니다';
  END IF;

  IF p_title IS NOT NULL AND length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION '제목은 비울 수 없습니다';
  END IF;

  IF p_price_standard IS NOT NULL AND p_price_standard < 0 THEN
    RAISE EXCEPTION '가격은 0 이상이어야 합니다';
  END IF;

  UPDATE public.videos
  SET
    -- Phase 22 기존
    thumbnail    = COALESCE(p_thumbnail, thumbnail),
    chapters     = COALESCE(p_chapters, chapters),
    subtitle_url = CASE
      WHEN p_clear_subtitle THEN NULL
      WHEN p_subtitle_url IS NOT NULL THEN p_subtitle_url
      ELSE subtitle_url
    END,
    age_rating   = COALESCE(p_age_rating, age_rating),
    -- Phase 33 기본
    title        = COALESCE(p_title, title),
    description  = COALESCE(p_description, description),
    category     = COALESCE(p_category, category),
    genre        = COALESCE(p_genre, genre),
    -- Phase 33 시네마
    director     = COALESCE(p_director, director),
    writer       = COALESCE(p_writer, writer),
    composer     = COALESCE(p_composer, composer),
    cast_credits = COALESCE(p_cast_credits, cast_credits),
    production_year = COALESCE(p_production_year, production_year),
    language     = COALESCE(p_language, language),
    subtitle_language = COALESCE(p_subtitle_language, subtitle_language),
    -- Phase 33 AI
    ai_tool          = COALESCE(p_ai_tool, ai_tool),
    ai_model_version = COALESCE(p_ai_model_version, ai_model_version),
    prompt           = COALESCE(p_prompt, prompt),
    seed             = COALESCE(p_seed, seed),
    resolution       = COALESCE(p_resolution, resolution),
    -- Phase 33 태그
    tags             = COALESCE(p_tags, tags),
    -- Phase 33 협찬 (clear 플래그가 우선)
    sponsor_brand    = CASE WHEN p_clear_sponsor THEN NULL ELSE COALESCE(p_sponsor_brand, sponsor_brand) END,
    sponsor_logo_url = CASE WHEN p_clear_sponsor THEN NULL ELSE COALESCE(p_sponsor_logo_url, sponsor_logo_url) END,
    sponsor_disclosure = CASE WHEN p_clear_sponsor THEN NULL ELSE COALESCE(p_sponsor_disclosure, sponsor_disclosure) END,
    sponsor_link_url = CASE WHEN p_clear_sponsor THEN NULL ELSE COALESCE(p_sponsor_link_url, sponsor_link_url) END,
    -- Phase 34 가격 (standard 미러 → commercial/exclusive 동일값 유지)
    price_standard   = COALESCE(p_price_standard, price_standard),
    price_commercial = COALESCE(p_price_standard, price_commercial),
    price_exclusive  = COALESCE(p_price_standard, price_exclusive)
  WHERE id = p_video_id;
END;
$$;

COMMENT ON FUNCTION public.update_my_video_metadata IS
  '본인 영상의 메타데이터 일괄 갱신 (Phase 22 + 26 + 33 + 34[가격] 확장).';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 (예시 — 실제 영상 ID로 대체)
-- ────────────────────────────────────────────────────────────────────────────
-- SELECT public.update_my_video_metadata(
--   p_video_id := '영상-UUID',
--   p_price_standard := 9900
-- );
