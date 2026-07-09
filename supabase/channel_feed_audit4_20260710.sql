-- ════════════════════════════════════════════════════════════════════════════
-- 채널 피드 3차 감사 수정 (2026-07-10) — audit3 회귀 회수 + 댓글 모더레이션 통제 보완
--
--   [CRITICAL] audit3 의 tg_bump_video_views 트리거가 기존 trg_sync_video_views_count
--     (video_views_actual_count_sync_20260710.sql)와 중복 → videos.views 이중(+2) 카운트.
--     내 중복 트리거 제거 + canonical sync 트리거 보장 + 실측 재백필로 정정.
--   [HIGH] creator_restore_comment 블록리스트가 report 문자열 2개만 막아 admin_hide_comment
--     ('관리자 강제 숨김' 등)는 여전히 복원 가능 → 화이트리스트로 전환(크리에이터 사유 3개만 허용).
--   [MED] creator_get_filtered_comments 가 admin/신고 숨김도 반환 → 죽은 복원버튼. 크리에이터
--     사유만 반환하도록 좁힘 + search_path 고정.
--   [MED] creator_add_filter_word word_boundary 소급 UPDATE 가 raw 정규식 → 메타문자 단어 크래시.
--     wb_match 로 교체(트리거는 이미 wb_match, 이 함수만 누락됐던 비대칭 수정).
--   [MED/LOW] 댓글관리 RPC 4종 search_path 미고정 + 명시 GRANT 부재 → 보완.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── [CRITICAL] 조회수 이중카운트 회수 — 내 중복 트리거 제거 + canonical 보장 + 재백필 ──
DROP TRIGGER IF EXISTS video_views_bump ON public.video_views;
DROP FUNCTION IF EXISTS public.tg_bump_video_views();

-- canonical sync 트리거 보장(이미 있으면 동일 재정의). INSERT +1 / DELETE -1 / is_valid 토글 ±1.
CREATE OR REPLACE FUNCTION public.tg_sync_video_views_count()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delta int := 0;
  v_id    text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_valid THEN v_delta := 1; END IF;
    v_id := NEW.video_id;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.is_valid THEN v_delta := -1; END IF;
    v_id := OLD.video_id;
  ELSE
    IF COALESCE(OLD.is_valid, false) = COALESCE(NEW.is_valid, false) THEN
      RETURN NEW;
    END IF;
    v_delta := CASE WHEN NEW.is_valid THEN 1 ELSE -1 END;
    v_id := NEW.video_id;
  END IF;

  IF v_delta <> 0 AND v_id IS NOT NULL THEN
    UPDATE public.videos
      SET views = GREATEST(0, (CASE WHEN views ~ '^\d+$' THEN views::bigint ELSE 0 END) + v_delta)::text
      WHERE id = v_id;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_video_views_count ON public.video_views;
CREATE TRIGGER trg_sync_video_views_count
  AFTER INSERT OR DELETE OR UPDATE OF is_valid ON public.video_views
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_video_views_count();

-- 이중카운트로 벌어진 값 정정: videos.views = 유효 조회수 실측(백필 재실행).
UPDATE public.videos v
SET views = COALESCE((
  SELECT COUNT(*) FROM public.video_views vv WHERE vv.video_id = v.id AND vv.is_valid = true
), 0)::text;

-- ── [HIGH] creator_restore_comment — 화이트리스트(크리에이터 사유 3개만 복원) ──
CREATE OR REPLACE FUNCTION public.creator_restore_comment(p_comment_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_creator UUID;
  v_reason  TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;

  SELECT v.creator_id, c.hidden_reason INTO v_creator, v_reason
  FROM public.comments c LEFT JOIN public.videos v ON v.id = c.video_id
  WHERE c.id = p_comment_id;

  IF v_creator IS NULL OR v_creator <> v_uid THEN
    RAISE EXCEPTION '영상 작성자만 댓글을 복원할 수 있습니다';
  END IF;

  -- 화이트리스트: 크리에이터 자신이 숨긴 것만 복원(차단/금칙어/수동숨김). 어드민·신고 숨김은 거부.
  IF v_reason NOT IN ('크리에이터 차단', '크리에이터 금칙어 매칭', '크리에이터 숨김')
     OR v_reason IS NULL THEN
    RAISE EXCEPTION '관리자·신고로 숨겨진 댓글은 복원할 수 없습니다. 고객센터로 문의해 주세요.';
  END IF;

  UPDATE public.comments
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL, is_filtered = false, filter_reason = NULL
  WHERE id = p_comment_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.creator_restore_comment(UUID) TO authenticated;

-- ── [MED] creator_get_filtered_comments — 크리에이터 사유만 반환(죽은 복원버튼 제거) + search_path ──
CREATE OR REPLACE FUNCTION public.creator_get_filtered_comments()
RETURNS TABLE (
  id UUID, video_id TEXT, user_id UUID, author_name TEXT, content TEXT,
  filter_reason TEXT, created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.id, c.video_id, c.user_id, c.author_name, c.content, c.filter_reason, c.created_at
  FROM public.comments c
  INNER JOIN public.videos v ON v.id = c.video_id
  WHERE v.creator_id = auth.uid()
    AND c.is_filtered = true
    AND c.is_hidden = true
    AND c.hidden_reason IN ('크리에이터 차단', '크리에이터 금칙어 매칭', '크리에이터 숨김')
  ORDER BY c.created_at DESC
  LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION public.creator_get_filtered_comments() TO authenticated;

-- ── [MED] creator_add_filter_word — word_boundary 소급 UPDATE 를 wb_match 로(정규식 크래시 차단) ──
CREATE OR REPLACE FUNCTION public.creator_add_filter_word(
  p_word TEXT, p_match_mode TEXT DEFAULT 'contains'
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_id   UUID;
  v_word TEXT := btrim(p_word);
  v_mode TEXT := COALESCE(p_match_mode, 'contains');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF v_word IS NULL OR length(v_word) = 0 THEN RAISE EXCEPTION '금칙어를 입력해주세요'; END IF;
  IF v_mode NOT IN ('contains', 'word_boundary') THEN
    RAISE EXCEPTION '잘못된 매칭 모드입니다 (contains 또는 word_boundary)';
  END IF;

  INSERT INTO public.creator_filter_words (creator_id, word, match_mode)
  VALUES (v_uid, v_word, v_mode)
  ON CONFLICT (creator_id, lower(word)) DO UPDATE SET match_mode = EXCLUDED.match_mode
  RETURNING id INTO v_id;

  IF v_mode = 'contains' THEN
    UPDATE public.comments c
    SET is_hidden = true, hidden_reason = '크리에이터 금칙어 매칭',
        hidden_at = COALESCE(c.hidden_at, now()), is_filtered = true, filter_reason = 'filter_word'
    WHERE c.video_id IN (SELECT id FROM public.videos WHERE creator_id = v_uid)
      AND lower(c.content) LIKE '%' || lower(v_word) || '%'
      AND c.is_hidden = false;
  ELSE
    UPDATE public.comments c
    SET is_hidden = true, hidden_reason = '크리에이터 금칙어 매칭',
        hidden_at = COALESCE(c.hidden_at, now()), is_filtered = true, filter_reason = 'filter_word'
    WHERE c.video_id IN (SELECT id FROM public.videos WHERE creator_id = v_uid)
      AND public.wb_match(c.content, v_word)   -- 안전헬퍼(정규식 메타문자 크래시 방지)
      AND c.is_hidden = false;
  END IF;

  RETURN v_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.creator_add_filter_word(TEXT, TEXT) TO authenticated;

-- ── [MED/LOW] search_path 고정 + 명시 GRANT (remove_filter_word / get_blocked_users / unblock_user) ──
CREATE OR REPLACE FUNCTION public.creator_remove_filter_word(p_word_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  DELETE FROM public.creator_filter_words WHERE id = p_word_id AND creator_id = v_uid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.creator_remove_filter_word(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.creator_get_blocked_users()
RETURNS TABLE (
  blocked_user_id UUID, display_name TEXT, avatar_url TEXT, reason TEXT, blocked_at TIMESTAMPTZ
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT b.blocked_user_id, p.display_name, p.avatar_url, b.reason, b.blocked_at
  FROM public.creator_blocked_users b
  LEFT JOIN public.profiles p ON p.id = b.blocked_user_id
  WHERE b.creator_id = auth.uid()
  ORDER BY b.blocked_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.creator_get_blocked_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.creator_unblock_user(p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  DELETE FROM public.creator_blocked_users
  WHERE creator_id = v_uid AND blocked_user_id = p_target_user_id;
  UPDATE public.comments c
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL, is_filtered = false, filter_reason = NULL
  WHERE c.user_id = p_target_user_id
    AND c.video_id IN (SELECT id FROM public.videos WHERE creator_id = v_uid)
    AND c.filter_reason = 'blocked_user';
END;
$$;
GRANT EXECUTE ON FUNCTION public.creator_unblock_user(UUID) TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   -- 조회수 이중카운트 정정 확인(두 값 동일해야):
--   SELECT (SELECT COUNT(*) FROM public.video_views WHERE is_valid) AS valid_views,
--          (SELECT SUM(CASE WHEN views ~ '^\d+$' THEN views::bigint ELSE 0 END) FROM public.videos) AS sum_views;
--   -- video_views 트리거가 하나만 남았는지:
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.video_views'::regclass AND NOT tgisinternal;
