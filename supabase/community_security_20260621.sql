-- ════════════════════════════════════════════════════════════════════════════
-- 커뮤니티 감사 보안 수정 (2026-06-21) — #2 작성자 위장 / #1 숨김글 노출 / #5 신고 도배
-- 적용: Supabase Dashboard → SQL Editor → Run (멱등 재실행 안전)
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- #2 작성자명/아바타 위장 차단 — author_name/author_avatar 를 서버에서 profiles 로 강제.
--    클라가 insert/update 시 어떤 값을 보내든 트리거가 본인 프로필 값으로 덮어씀.
--    community_posts + collab_posts 동일 적용(둘 다 user_id/author_name/author_avatar 보유).
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_force_post_author()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT; v_avatar TEXT; v_is_admin BOOLEAN;
BEGIN
  SELECT display_name, avatar_url, COALESCE(is_admin, false)
    INTO v_name, v_avatar, v_is_admin
    FROM public.profiles WHERE id = NEW.user_id;
  -- 관리자가 '운영팀 명의로 게시'를 선택한 경우만 공식 운영팀 아이덴티티 허용.
  -- (비관리자는 어떤 값을 보내도 프로필로 강제 → 위장 차단 유지)
  IF v_is_admin AND NEW.author_name = 'CREAITE 운영팀' THEN
    NEW.author_avatar := 'https://www.creaite.net/icon-192.png';       -- 공식 로고 고정
  ELSE
    NEW.author_name   := COALESCE(NULLIF(btrim(v_name), ''), 'CREAITE'); -- 프로필 표시명 강제(없으면 generic)
    NEW.author_avatar := v_avatar;                                       -- 프로필 아바타 강제
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS community_posts_force_author ON public.community_posts;
CREATE TRIGGER community_posts_force_author
  BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_force_post_author();

DROP TRIGGER IF EXISTS collab_posts_force_author ON public.collab_posts;
CREATE TRIGGER collab_posts_force_author
  BEFORE INSERT OR UPDATE ON public.collab_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_force_post_author();

-- ────────────────────────────────────────────────────────────────────────────
-- #1 숨김 게시글 본문 비노출 — comments(#7)와 동일하게 게시글 SELECT 에 숨김 게이트.
--    숨김(신고 누적 자동숨김) 글은 작성자 본인·관리자만 열람.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS posts_select ON public.community_posts;
CREATE POLICY posts_select ON public.community_posts
  FOR SELECT USING (
    COALESCE(is_hidden, false) = false
    OR auth.uid() = user_id
    OR public.is_admin()
  );

-- ────────────────────────────────────────────────────────────────────────────
-- #5 신고 도배 방지 — 사용자별 시간당 신고 상한(20건). create_report 에 rate limit 추가.
--    (기존: 같은 대상 중복은 unique index 로 차단되나, 서로 다른 대상 무한 신고는 가능했음)
--    아래는 기존 함수 본문 + reporter null 체크 직후 rate-limit 블록만 추가한 정본 재정의.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_report(
  p_target_type TEXT,
  p_target_id TEXT,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reporter_id     UUID := auth.uid();
  v_report_id       BIGINT;
  v_threshold       NUMERIC;
  v_pending_count   INTEGER;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- #5 도배 방지: 한 사용자가 1시간에 최대 20건까지만 신고
  IF (SELECT COUNT(*) FROM public.reports
        WHERE reporter_id = v_reporter_id AND created_at > now() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION '신고가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  END IF;

  IF p_target_type NOT IN ('video', 'comment', 'user', 'community_post') THEN
    RAISE EXCEPTION '잘못된 신고 대상 종류: %', p_target_type;
  END IF;

  IF p_reason NOT IN ('spam', 'inappropriate', 'copyright', 'violence', 'harassment', 'misinformation', 'other') THEN
    RAISE EXCEPTION '잘못된 신고 사유: %', p_reason;
  END IF;

  -- 본인 자신을 신고하는 건 차단
  IF p_target_type = 'user' AND p_target_id = v_reporter_id::TEXT THEN
    RAISE EXCEPTION '본인 자신은 신고할 수 없습니다';
  END IF;

  -- 신고 기록 (중복 시 unique index가 차단)
  INSERT INTO public.reports (reporter_id, target_type, target_id, reason, description)
  VALUES (v_reporter_id, p_target_type, p_target_id, p_reason, p_description)
  RETURNING id INTO v_report_id;

  -- 자동 숨김 처리 (신고 N건 누적 시)
  v_threshold := COALESCE(public.get_platform_setting('auto_hide_threshold'), 3);

  SELECT COUNT(*) INTO v_pending_count
  FROM public.reports
  WHERE target_type = p_target_type AND target_id = p_target_id AND status = 'pending';

  IF v_pending_count >= v_threshold THEN
    IF p_target_type = 'video' THEN
      UPDATE public.videos
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id = p_target_id AND is_hidden = false;
    ELSIF p_target_type = 'comment' THEN
      UPDATE public.comments
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id::TEXT = p_target_id AND is_hidden = false;
    ELSIF p_target_type = 'community_post' THEN
      UPDATE public.community_posts
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id::TEXT = p_target_id AND is_hidden = false;
    END IF;
  END IF;

  RETURN v_report_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- #2: 작성자 강제 (다른 author_name 으로 insert 해도 프로필명으로 저장돼야 함)
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.community_posts'::regclass AND NOT tgisinternal;
--   -- #1: 숨김 게시글 정책
--   SELECT policyname, qual FROM pg_policies WHERE tablename='community_posts' AND cmd='SELECT';
--   -- #5: create_report 호출 21번째에 예외
-- ════════════════════════════════════════════════════════════════════════════
