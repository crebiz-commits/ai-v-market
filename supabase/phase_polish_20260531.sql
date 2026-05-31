-- ════════════════════════════════════════════════════════════════════════════
-- 5차 정합·UX 보강 SQL (2026-05-31) — M5
-- 적용: SQL Editor → 새 쿼리 → 붙여넣기 → Run. idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── M5: pin/heart 소유자 검증이 NULL creator_id 영상에서 우회되던 것 차단 ──────
-- `v_creator_id <> v_uid` 는 creator_id 가 NULL 이면 NULL(→거짓 취급)이 되어
-- 임의 로그인 사용자가 핀/하트 가능. `IS DISTINCT FROM` 으로 NULL 도 거부.
CREATE OR REPLACE FUNCTION public.toggle_pin_comment(p_comment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_video_id   TEXT;
  v_creator_id UUID;
  v_already    BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT video_id, is_pinned INTO v_video_id, v_already
  FROM public.comments WHERE id = p_comment_id;

  IF v_video_id IS NULL THEN
    RAISE EXCEPTION '영상 댓글이 아니거나 존재하지 않습니다';
  END IF;

  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = v_video_id;

  IF v_creator_id IS DISTINCT FROM v_uid THEN  -- M5: NULL creator_id 우회 차단
    RAISE EXCEPTION '영상 작성자만 핀 고정할 수 있습니다';
  END IF;

  IF v_already THEN
    UPDATE public.comments SET is_pinned = false, pinned_at = NULL WHERE id = p_comment_id;
    RETURN false;
  ELSE
    UPDATE public.comments SET is_pinned = false, pinned_at = NULL
    WHERE video_id = v_video_id AND is_pinned = true;
    UPDATE public.comments SET is_pinned = true, pinned_at = now() WHERE id = p_comment_id;
    RETURN true;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.toggle_creator_heart(p_comment_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_video_id   TEXT;
  v_creator_id UUID;
  v_already    BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT video_id, creator_hearted INTO v_video_id, v_already
  FROM public.comments WHERE id = p_comment_id;

  IF v_video_id IS NULL THEN
    RAISE EXCEPTION '영상 댓글이 아니거나 존재하지 않습니다';
  END IF;

  SELECT creator_id INTO v_creator_id FROM public.videos WHERE id = v_video_id;

  IF v_creator_id IS DISTINCT FROM v_uid THEN  -- M5: NULL creator_id 우회 차단
    RAISE EXCEPTION '영상 작성자만 하트를 줄 수 있습니다';
  END IF;

  UPDATE public.comments SET creator_hearted = NOT v_already WHERE id = p_comment_id;
  RETURN NOT v_already;
END;
$$;
