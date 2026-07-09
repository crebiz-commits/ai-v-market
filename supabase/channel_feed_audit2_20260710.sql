-- ════════════════════════════════════════════════════════════════════════════
-- 채널 피드 2차 감사 수정 (2026-07-10) — 대시보드/커스터마이징/받은댓글 3중 감사
--
--   1) [HIGH] creator_restore_comment 가 어드민/신고 숨김 댓글까지 복원 → 크리에이터가 플랫폼
--      모더레이션 무력화(감사로그 없음). + SECURITY DEFINER 인데 search_path 미고정.
--      → 크리에이터 사유(차단/금칙어)만 복원, 어드민·신고 사유는 거부. search_path 고정.
--   2) [MED/PII] get_creators_info(영상카드 이름 경로)에 split_part(email) 폴백 잔존 → 이메일
--      아이디 공개노출 + 채널RPC('AI Creator')와 불일치. 제거.
--   3) [MED] comments.author_name 이 NOT NULL 인데 답글 insert(ReceivedComments)는 미지정 →
--      실패 위험 + 메인 댓글은 클라가 author_name 임의전송(사칭). BEFORE INSERT 트리거로 서버가
--      프로필 기준 강제(커뮤니티 tg_force_post_author 동일 패턴).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) creator_restore_comment — 어드민/신고 숨김 복원 차단 + search_path 고정 ──
CREATE OR REPLACE FUNCTION public.creator_restore_comment(p_comment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_creator UUID;
  v_reason  TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT v.creator_id, c.hidden_reason INTO v_creator, v_reason
  FROM public.comments c
  LEFT JOIN public.videos v ON v.id = c.video_id
  WHERE c.id = p_comment_id;

  IF v_creator IS NULL OR v_creator <> v_uid THEN
    RAISE EXCEPTION '영상 작성자만 댓글을 복원할 수 있습니다';
  END IF;

  -- 어드민/신고로 숨겨진 댓글은 크리에이터가 복원 불가(플랫폼 모더레이션 무력화 차단).
  --   크리에이터 자신이 숨긴 것(차단/금칙어)만 복원 허용.
  IF v_reason IN ('신고 누적 자동 숨김 (어드민 검토 대기)', '커뮤니티 가이드라인 위반으로 숨김 처리') THEN
    RAISE EXCEPTION '관리자·신고로 숨겨진 댓글은 복원할 수 없습니다. 고객센터로 문의해 주세요.';
  END IF;

  UPDATE public.comments
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL,
      is_filtered = false, filter_reason = NULL
  WHERE id = p_comment_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.creator_restore_comment(UUID) TO authenticated;

-- ── 2) get_creators_info — 이메일 폴백 제거(채널 RPC 와 동일 정책) ──
CREATE OR REPLACE FUNCTION public.get_creators_info(p_creator_ids UUID[])
RETURNS TABLE (
  creator_id UUID,
  creator_name TEXT,
  avatar_url TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id AS creator_id,
    COALESCE(
      NULLIF(p.display_name, ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      'AI Creator'
    ) AS creator_name,
    COALESCE(
      NULLIF(p.avatar_url, ''),
      NULLIF(u.raw_user_meta_data->>'avatar_url', ''),
      NULLIF(u.raw_user_meta_data->>'picture', '')
    ) AS avatar_url
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = ANY(p_creator_ids);
$$;
GRANT EXECUTE ON FUNCTION public.get_creators_info(UUID[]) TO anon, authenticated;

-- ── 3) comments 작성자명 서버 강제 (사칭 차단 + 답글 insert NOT NULL 충족) ──
CREATE OR REPLACE FUNCTION public.tg_force_comment_author()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 작성자명은 클라 입력이 아니라 서버가 프로필 기준으로 강제(임의 author_name 사칭 차단).
  --   답글(ReceivedComments)처럼 author_name 미지정 insert 도 NOT NULL 을 만족시킨다.
  SELECT COALESCE(
           NULLIF(p.display_name, ''),
           NULLIF(u.raw_user_meta_data->>'name', ''),
           NULLIF(u.raw_user_meta_data->>'full_name', ''),
           'AI Creator')
    INTO NEW.author_name
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = NEW.user_id;

  IF NEW.author_name IS NULL OR NEW.author_name = '' THEN
    NEW.author_name := 'AI Creator';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_force_author ON public.comments;
CREATE TRIGGER comments_force_author
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_force_comment_author();

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   -- 어드민 숨김 댓글을 크리에이터가 복원 시도 → 예외여야:
--   SELECT public.creator_restore_comment('<admin_hidden_comment_id>');  -- ERROR
--   -- 답글 insert(author_name 미지정)가 트리거로 채워지는지:
--   INSERT INTO public.comments(user_id, video_id, content) VALUES (auth.uid(), '<vid>', 'test')
--     RETURNING author_name;  -- 프로필 display_name 이어야(클라 미지정에도)
