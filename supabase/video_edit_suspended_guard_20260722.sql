-- ════════════════════════════════════════════════════════════════════════════
-- 🚫 정지 계정의 영상 편집 차단 (2026-07-22) — 업로드 감사
--
--   [결함] update_my_video_metadata 에 is_suspended 검사가 없어, **정지된 크리에이터가
--     라이브 영상의 제목·설명·가격·연령등급·협찬표기를 계속 수정할 수 있었다.**
--     정지는 "쓰기 금지"여야 하는데 읽기만 막히고 쓰기가 열려 있던 셈.
--     RLS 로는 못 막는다 — 이 함수가 SECURITY DEFINER 라 RLS 를 우회한다.
--
--   [범위] 같은 감사에서 Edge 쪽 3곳(save-metadata·thumbnail·status)도 함께 막았다.
--     create-upload·transcribe 에는 원래 있었고, 이 4곳만 빠져 있었다.
--
--   ★ 이 파일이 update_my_video_metadata 의 새 정본.
--     video_edit_remoderation_20260711.sql 재실행 금지(가드 소실).
--     본문은 그 파일에서 **기계적으로 추출**해 가드 5줄만 얹었다(파라미터 30개 초과라
--     손으로 옮기면 누락이 확실하므로 스크립트로 생성).
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

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
  p_price_standard    INTEGER DEFAULT NULL,
  -- Phase 35 — 하이라이트 구간 (초, REAL). NULL=변경없음
  p_highlight_start   REAL    DEFAULT NULL,
  p_highlight_end     REAL    DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_owner UUID;
  v_content_changed BOOLEAN := false;   -- 재검수 트리거: 제목/설명/썸네일/태그 실변경 여부
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

  -- ★ 정지 계정 차단(2026-07-22 업로드 감사) — 정지된 크리에이터가 라이브 영상의
  --   제목·설명·가격·연령등급을 계속 고칠 수 있었다. 정지는 "쓰기 금지"여야 한다.
  --   RLS 로는 못 막는다: 이 함수가 SECURITY DEFINER 라 RLS 를 우회하기 때문.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND is_suspended = true) THEN
    RAISE EXCEPTION '정지된 계정은 영상을 수정할 수 없습니다. 고객센터로 문의해 주세요.';
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

  -- Phase 35 — 하이라이트 구간 검증 (둘 다 주어질 때만; 시작<끝, 음수 불가)
  IF p_highlight_start IS NOT NULL AND p_highlight_start < 0 THEN
    RAISE EXCEPTION '하이라이트 시작은 0 이상이어야 합니다';
  END IF;
  IF p_highlight_start IS NOT NULL AND p_highlight_end IS NOT NULL
     AND p_highlight_end <= p_highlight_start THEN
    RAISE EXCEPTION '하이라이트 끝은 시작보다 커야 합니다';
  END IF;

  -- 재검수 판정: 공개 노출되는 콘텐츠(제목·설명·썸네일·태그)가 실제로 바뀌었는가.
  --   전달값이 있고(NULL 아님) 기존값과 다를 때만 true. (클라가 기존값 그대로 재전송하면 false)
  SELECT
       (p_title       IS NOT NULL AND p_title       IS DISTINCT FROM v.title)
    OR (p_description IS NOT NULL AND p_description IS DISTINCT FROM v.description)
    OR (p_thumbnail   IS NOT NULL AND p_thumbnail   IS DISTINCT FROM v.thumbnail)
    OR (p_tags        IS NOT NULL AND p_tags        IS DISTINCT FROM v.tags)
  INTO v_content_changed
  FROM public.videos v
  WHERE v.id = p_video_id;

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
    price_exclusive  = COALESCE(p_price_standard, price_exclusive),
    -- Phase 35 하이라이트 구간
    highlight_start  = COALESCE(p_highlight_start, highlight_start),
    highlight_end    = COALESCE(p_highlight_end, highlight_end),
    -- 편집 재검수(2026-07-11): 콘텐츠 필드 실변경 시 재심사 전까지 숨김(fail-closed)
    moderation_status = CASE WHEN v_content_changed THEN 'pending' ELSE moderation_status END,
    is_hidden         = CASE WHEN v_content_changed THEN true      ELSE is_hidden END
  WHERE id = p_video_id;
END;
$$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '정지계정 영상편집 차단' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname = 'update_my_video_metadata')
    THEN '✅ PASS' ELSE '🔴 FAIL — 정지 크리에이터가 라이브 영상 수정 가능' END AS status
UNION ALL
SELECT '기존 로직 보존(재검수 트리거)',
  CASE WHEN (SELECT prosrc ~ 'moderation_status' FROM pg_proc WHERE proname = 'update_my_video_metadata')
    THEN '✅ PASS' ELSE '🔴 FAIL — 0711 재검수 로직이 사라짐' END
UNION ALL
SELECT '기존 로직 보존(가격 편집)',
  CASE WHEN (SELECT prosrc ~ 'p_price_standard' FROM pg_proc WHERE proname = 'update_my_video_metadata')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
