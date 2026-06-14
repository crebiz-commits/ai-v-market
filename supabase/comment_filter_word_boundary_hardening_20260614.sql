-- ════════════════════════════════════════════════════════════════════════════
-- 댓글 금칙어 word_boundary 하드닝 — 2026-06-14
--   문제: word_boundary 매칭이 금칙어를 정규식에 그대로 삽입 → 금칙어에 정규식
--         메타문자( ( ) [ ] * + ? . | { } \ ^ $ )가 있으면 "invalid regular
--         expression" 오류로 해당 영상 댓글 INSERT 가 통째로 실패.
--   수정: word_boundary 매칭을 안전 헬퍼(wb_match)로 분리. 정규식 오류 시
--         substring(LIKE)으로 자동 폴백 → 댓글 등록이 절대 안 깨짐.
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════

-- 안전한 단어경계 매칭: 정규식 실패 시 substring 폴백
CREATE OR REPLACE FUNCTION public.wb_match(p_text text, p_word text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  RETURN p_text ~* ('\m' || p_word || '\M');
EXCEPTION WHEN OTHERS THEN
  -- 금칙어에 정규식 메타문자가 있어 매칭이 실패하면 단순 포함으로 폴백
  RETURN lower(p_text) LIKE '%' || lower(p_word) || '%';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.tg_apply_creator_filter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_creator_id UUID;
  v_blocked    BOOLEAN;
  v_word_hit   TEXT;
BEGIN
  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = NEW.video_id;
  IF v_creator_id IS NULL THEN RETURN NEW; END IF;

  -- (1) 차단 사용자
  SELECT EXISTS(
    SELECT 1 FROM public.creator_blocked_users
    WHERE creator_id = v_creator_id AND blocked_user_id = NEW.user_id
  ) INTO v_blocked;
  IF v_blocked THEN
    NEW.is_hidden := true; NEW.hidden_reason := '크리에이터 차단'; NEW.hidden_at := now();
    NEW.is_filtered := true; NEW.filter_reason := 'blocked_user';
    RETURN NEW;
  END IF;

  -- (2) 금칙어 — match_mode 별 분기 (word_boundary 는 안전 헬퍼 사용)
  SELECT word INTO v_word_hit
  FROM public.creator_filter_words
  WHERE creator_id = v_creator_id
    AND (
      (match_mode = 'contains'      AND lower(NEW.content) LIKE '%' || lower(word) || '%')
      OR
      (match_mode = 'word_boundary' AND public.wb_match(NEW.content, word))
    )
  LIMIT 1;

  IF v_word_hit IS NOT NULL THEN
    NEW.is_hidden := true; NEW.hidden_reason := '크리에이터 금칙어 매칭'; NEW.hidden_at := now();
    NEW.is_filtered := true; NEW.filter_reason := 'filter_word';
  END IF;

  RETURN NEW;
END;
$fn$;
