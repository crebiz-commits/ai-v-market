-- ════════════════════════════════════════════════════════════════════════════
-- Phase 35 보강 (2026-05-18) — 댓글 자동 필터 match_mode 컬럼 추가
--
-- 배경:
--   Phase 23 (댓글 관리) 출시 시 자동 필터는 (A) 단순 포함만 지원.
--   글로벌 다국어 출시 단계에 (B) 단어 경계 매칭(word_boundary) 옵션 추가.
--
-- 매칭 모드:
--   - contains       : 부분 문자열 포함 (Phase 23 기본값, ilike '%word%')
--                      한국어/일본어/중국어처럼 띄어쓰기 없는 언어에 적합
--   - word_boundary  : 단어 경계 매칭 (regex \m...\M)
--                      영어/스페인어처럼 띄어쓰기 기반 언어에 적합
--                      "ass" 가 "class" 안에서 매칭 안 됨
--
-- 적용:
--   creator_filter_words.match_mode (default 'contains')
--   tg_apply_creator_filter 트리거 함수: mode 분기 처리
--   creator_add_filter_word 시 mode 인자 추가 (기본 contains)
--   creator_get_filter_words 시 mode 반환
--   creator_update_filter_word_mode RPC 신설
-- ════════════════════════════════════════════════════════════════════════════

-- Step 1: 컬럼 추가
ALTER TABLE public.creator_filter_words
  ADD COLUMN IF NOT EXISTS match_mode TEXT NOT NULL DEFAULT 'contains'
    CHECK (match_mode IN ('contains', 'word_boundary'));

-- Step 2: 트리거 함수 갱신 (match_mode 분기)
CREATE OR REPLACE FUNCTION public.tg_apply_creator_filter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_id UUID;
  v_blocked    BOOLEAN;
  v_word_hit   TEXT;
BEGIN
  -- 영상 작성자 확인
  SELECT creator_id INTO v_creator_id
  FROM public.videos
  WHERE id = NEW.video_id;

  IF v_creator_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- (1) 차단된 사용자 체크
  SELECT EXISTS(
    SELECT 1 FROM public.creator_blocked_users
    WHERE creator_id = v_creator_id AND blocked_user_id = NEW.user_id
  ) INTO v_blocked;

  IF v_blocked THEN
    NEW.is_hidden     := true;
    NEW.hidden_reason := '크리에이터 차단';
    NEW.hidden_at     := now();
    NEW.is_filtered   := true;
    NEW.filter_reason := 'blocked_user';
    RETURN NEW;
  END IF;

  -- (2) 금칙어 체크 — match_mode 별 분기
  SELECT word INTO v_word_hit
  FROM public.creator_filter_words
  WHERE creator_id = v_creator_id
    AND (
      (match_mode = 'contains'      AND lower(NEW.content) LIKE '%' || lower(word) || '%')
      OR
      (match_mode = 'word_boundary' AND NEW.content ~* ('\m' || word || '\M'))
    )
  LIMIT 1;

  IF v_word_hit IS NOT NULL THEN
    NEW.is_hidden     := true;
    NEW.hidden_reason := '크리에이터 금칙어 매칭';
    NEW.hidden_at     := now();
    NEW.is_filtered   := true;
    NEW.filter_reason := 'filter_word';
  END IF;

  RETURN NEW;
END;
$$;

-- Step 3: creator_add_filter_word — p_match_mode 인자 추가
DROP FUNCTION IF EXISTS public.creator_add_filter_word(TEXT);

CREATE OR REPLACE FUNCTION public.creator_add_filter_word(
  p_word TEXT,
  p_match_mode TEXT DEFAULT 'contains'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_id   UUID;
  v_word TEXT := btrim(p_word);
  v_mode TEXT := COALESCE(p_match_mode, 'contains');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  IF v_word IS NULL OR length(v_word) = 0 THEN
    RAISE EXCEPTION '금칙어를 입력해주세요';
  END IF;
  IF v_mode NOT IN ('contains', 'word_boundary') THEN
    RAISE EXCEPTION '잘못된 매칭 모드입니다 (contains 또는 word_boundary)';
  END IF;

  INSERT INTO public.creator_filter_words (creator_id, word, match_mode)
  VALUES (v_uid, v_word, v_mode)
  ON CONFLICT (creator_id, lower(word)) DO UPDATE
    SET match_mode = EXCLUDED.match_mode
  RETURNING id INTO v_id;

  -- 신규/변경 등록 시 기존 댓글에도 소급 적용 (모드 기준)
  IF v_mode = 'contains' THEN
    UPDATE public.comments c
    SET is_hidden = true,
        hidden_reason = '크리에이터 금칙어 매칭',
        hidden_at = COALESCE(c.hidden_at, now()),
        is_filtered = true,
        filter_reason = 'filter_word'
    WHERE c.video_id IN (SELECT id FROM public.videos WHERE creator_id = v_uid)
      AND lower(c.content) LIKE '%' || lower(v_word) || '%'
      AND c.is_hidden = false;
  ELSE -- word_boundary
    UPDATE public.comments c
    SET is_hidden = true,
        hidden_reason = '크리에이터 금칙어 매칭',
        hidden_at = COALESCE(c.hidden_at, now()),
        is_filtered = true,
        filter_reason = 'filter_word'
    WHERE c.video_id IN (SELECT id FROM public.videos WHERE creator_id = v_uid)
      AND c.content ~* ('\m' || v_word || '\M')
      AND c.is_hidden = false;
  END IF;

  RETURN v_id;
END;
$$;

-- Step 4: creator_get_filter_words — match_mode 반환
DROP FUNCTION IF EXISTS public.creator_get_filter_words();

CREATE OR REPLACE FUNCTION public.creator_get_filter_words()
RETURNS TABLE (
  id          UUID,
  word        TEXT,
  match_mode  TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id, word, match_mode, created_at
  FROM public.creator_filter_words
  WHERE creator_id = auth.uid()
  ORDER BY created_at DESC;
$$;

-- Step 5: 매칭 모드 변경 RPC 신설
CREATE OR REPLACE FUNCTION public.creator_update_filter_word_mode(
  p_word_id UUID,
  p_match_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  IF p_match_mode NOT IN ('contains', 'word_boundary') THEN
    RAISE EXCEPTION '잘못된 매칭 모드입니다';
  END IF;

  UPDATE public.creator_filter_words
  SET match_mode = p_match_mode
  WHERE id = p_word_id AND creator_id = v_uid;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 예제
--   SELECT public.creator_add_filter_word('욕설1', 'contains');
--   SELECT public.creator_add_filter_word('ass', 'word_boundary');  -- "class" 미매칭
--   SELECT * FROM public.creator_get_filter_words();
--   SELECT public.creator_update_filter_word_mode('<uuid>', 'word_boundary');
-- ────────────────────────────────────────────────────────────────────────────
