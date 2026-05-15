-- ════════════════════════════════════════════════════════════════════════════
-- Phase 23 — 댓글 관리 (핀 / 크리에이터 하트 / 좋아요 / 자동 필터 / 일괄 차단)
-- 적용 일자: 2026-05-15
-- 선행: comments, comment_likes, videos(creator_id), profiles
--
-- 목적:
--   1. 영상 작성자가 댓글에 ❤️ 표시 + 핀 고정 (영상당 1개)
--   2. 좋아요 정상화 (기존 simplified 코드 → comment_likes 테이블 정식 사용)
--   3. 크리에이터별 금칙어 등록 → 매칭되는 신규 댓글 자동 숨김
--   4. 크리에이터별 사용자 일괄 차단 → 차단 사용자가 단 신규 댓글 자동 숨김
--   ※ 자동 필터 매칭 방식: 단순 포함 검사 (대소문자 무관). 글로벌 출시(Phase 35)
--      에서 word_boundary 옵션 추가 예정.
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: comments 테이블 확장
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_pinned       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS pinned_at       TIMESTAMPTZ;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS creator_hearted BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_filtered     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS filter_reason   TEXT;
-- filter_reason: 'blocked_user' / 'filter_word'

CREATE INDEX IF NOT EXISTS idx_comments_video_pinned
  ON public.comments(video_id, is_pinned DESC, created_at DESC)
  WHERE video_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 크리에이터별 사용자 차단 테이블
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_blocked_users (
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT,
  PRIMARY KEY (creator_id, blocked_user_id),
  CONSTRAINT no_self_block CHECK (creator_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_blocked_lookup
  ON public.creator_blocked_users(creator_id, blocked_user_id);

ALTER TABLE public.creator_blocked_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocked_select_own" ON public.creator_blocked_users;
CREATE POLICY "blocked_select_own"
  ON public.creator_blocked_users FOR SELECT
  USING (auth.uid() = creator_id);
-- INSERT/DELETE는 SECURITY DEFINER RPC만

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 크리에이터별 금칙어 테이블
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.creator_filter_words (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  word        TEXT NOT NULL CHECK (char_length(word) BETWEEN 1 AND 100),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 같은 크리에이터가 같은 단어 중복 등록 방지 (대소문자 무관)
CREATE UNIQUE INDEX IF NOT EXISTS uq_filter_words_creator_word
  ON public.creator_filter_words(creator_id, lower(word));

CREATE INDEX IF NOT EXISTS idx_filter_words_creator
  ON public.creator_filter_words(creator_id);

ALTER TABLE public.creator_filter_words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "filter_words_select_own" ON public.creator_filter_words;
CREATE POLICY "filter_words_select_own"
  ON public.creator_filter_words FOR SELECT
  USING (auth.uid() = creator_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 자동 필터 트리거 — 댓글 INSERT 시점
--   - 영상 소유자(creator_id) 기준으로 차단 사용자/금칙어 검사
--   - 매칭 시 is_hidden + is_filtered 자동 설정
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_apply_creator_filter()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_creator_id UUID;
  v_blocked    BOOLEAN;
  v_word_hit   TEXT;
BEGIN
  -- 영상 댓글일 때만 적용 (커뮤니티 글은 작성자가 곧 호스트라 별도)
  IF NEW.video_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT creator_id INTO v_creator_id
  FROM public.videos
  WHERE id = NEW.video_id;

  IF v_creator_id IS NULL OR v_creator_id = NEW.user_id THEN
    -- 영상 작성자 본인의 댓글은 자기 필터에 안 걸림
    RETURN NEW;
  END IF;

  -- (1) 차단 사용자 체크
  SELECT TRUE INTO v_blocked
  FROM public.creator_blocked_users
  WHERE creator_id = v_creator_id AND blocked_user_id = NEW.user_id;

  IF v_blocked THEN
    NEW.is_hidden     := true;
    NEW.hidden_reason := '크리에이터 차단';
    NEW.hidden_at     := now();
    NEW.is_filtered   := true;
    NEW.filter_reason := 'blocked_user';
    RETURN NEW;
  END IF;

  -- (2) 금칙어 체크 (단순 포함, 대소문자 무관)
  SELECT word INTO v_word_hit
  FROM public.creator_filter_words
  WHERE creator_id = v_creator_id
    AND lower(NEW.content) LIKE '%' || lower(word) || '%'
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

DROP TRIGGER IF EXISTS comments_apply_creator_filter ON public.comments;
CREATE TRIGGER comments_apply_creator_filter
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_apply_creator_filter();

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: 핀 고정 RPC — 영상 작성자만, 영상당 1개
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.toggle_pin_comment(p_comment_id UUID)
RETURNS BOOLEAN     -- 결과 핀 상태 (true=고정됨, false=해제됨)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_video_id     TEXT;
  v_creator_id   UUID;
  v_already      BOOLEAN;
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

  IF v_creator_id <> v_uid THEN
    RAISE EXCEPTION '영상 작성자만 핀 고정할 수 있습니다';
  END IF;

  IF v_already THEN
    -- 해제
    UPDATE public.comments SET is_pinned = false, pinned_at = NULL
    WHERE id = p_comment_id;
    RETURN false;
  ELSE
    -- 같은 영상의 기존 핀 해제
    UPDATE public.comments
    SET is_pinned = false, pinned_at = NULL
    WHERE video_id = v_video_id AND is_pinned = true;
    -- 새 핀 설정
    UPDATE public.comments
    SET is_pinned = true, pinned_at = now()
    WHERE id = p_comment_id;
    RETURN true;
  END IF;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: 크리에이터 ❤️ 토글 RPC — 영상 작성자만
-- ────────────────────────────────────────────────────────────────────────────
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

  IF v_creator_id <> v_uid THEN
    RAISE EXCEPTION '영상 작성자만 하트를 줄 수 있습니다';
  END IF;

  UPDATE public.comments SET creator_hearted = NOT v_already
  WHERE id = p_comment_id;

  RETURN NOT v_already;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 7: 좋아요 RPC — 정상화 (comment_likes 활용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.like_comment(p_comment_id UUID)
RETURNS INTEGER  -- 갱신된 likes_count
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_count   INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- 중복 시 무시 (이미 좋아요한 상태면 카운트 변경 없음)
  INSERT INTO public.comment_likes (comment_id, user_id)
  VALUES (p_comment_id, v_uid)
  ON CONFLICT DO NOTHING;

  -- 정합성을 위해 COUNT로 재계산 후 반영
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.comment_likes WHERE comment_id = p_comment_id;

  UPDATE public.comments SET likes_count = v_count WHERE id = p_comment_id;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.unlike_comment(p_comment_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_count  INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  DELETE FROM public.comment_likes
  WHERE comment_id = p_comment_id AND user_id = v_uid;

  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.comment_likes WHERE comment_id = p_comment_id;

  UPDATE public.comments SET likes_count = v_count WHERE id = p_comment_id;
  RETURN v_count;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 8: 사용자가 좋아요한 댓글 ID 조회 (현재 영상 댓글 일괄)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_comment_likes(p_comment_ids UUID[])
RETURNS TABLE (comment_id UUID)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT cl.comment_id
  FROM public.comment_likes cl
  WHERE cl.user_id = auth.uid()
    AND cl.comment_id = ANY(p_comment_ids);
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 9: 차단 사용자 관리 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.creator_block_user(
  p_target_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  IF v_uid = p_target_user_id THEN
    RAISE EXCEPTION '본인을 차단할 수 없습니다';
  END IF;

  INSERT INTO public.creator_blocked_users (creator_id, blocked_user_id, reason)
  VALUES (v_uid, p_target_user_id, p_reason)
  ON CONFLICT DO NOTHING;

  -- 기존에 작성된 차단 사용자의 댓글도 소급 숨김 처리
  UPDATE public.comments c
  SET is_hidden = true,
      hidden_reason = '크리에이터 차단',
      hidden_at = COALESCE(c.hidden_at, now()),
      is_filtered = true,
      filter_reason = 'blocked_user'
  WHERE c.user_id = p_target_user_id
    AND c.video_id IN (SELECT id FROM public.videos WHERE creator_id = v_uid)
    AND c.is_hidden = false;
END;
$$;

CREATE OR REPLACE FUNCTION public.creator_unblock_user(p_target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  DELETE FROM public.creator_blocked_users
  WHERE creator_id = v_uid AND blocked_user_id = p_target_user_id;

  -- 차단으로 숨긴 댓글 복원 (filter_reason='blocked_user'인 것만)
  UPDATE public.comments c
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL,
      is_filtered = false, filter_reason = NULL
  WHERE c.user_id = p_target_user_id
    AND c.video_id IN (SELECT id FROM public.videos WHERE creator_id = v_uid)
    AND c.filter_reason = 'blocked_user';
END;
$$;

CREATE OR REPLACE FUNCTION public.creator_get_blocked_users()
RETURNS TABLE (
  blocked_user_id UUID,
  display_name    TEXT,
  avatar_url      TEXT,
  reason          TEXT,
  blocked_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT b.blocked_user_id, p.display_name, p.avatar_url, b.reason, b.blocked_at
  FROM public.creator_blocked_users b
  LEFT JOIN public.profiles p ON p.id = b.blocked_user_id
  WHERE b.creator_id = auth.uid()
  ORDER BY b.blocked_at DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 10: 금칙어 관리 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.creator_add_filter_word(p_word TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_id   UUID;
  v_word TEXT := btrim(p_word);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  IF v_word IS NULL OR length(v_word) = 0 THEN
    RAISE EXCEPTION '금칙어를 입력해주세요';
  END IF;

  INSERT INTO public.creator_filter_words (creator_id, word)
  VALUES (v_uid, v_word)
  ON CONFLICT (creator_id, lower(word)) DO NOTHING
  RETURNING id INTO v_id;

  -- 이미 있으면 기존 id 반환
  IF v_id IS NULL THEN
    SELECT id INTO v_id
    FROM public.creator_filter_words
    WHERE creator_id = v_uid AND lower(word) = lower(v_word);
  END IF;

  -- 신규 등록 시 기존 댓글에도 소급 적용
  UPDATE public.comments c
  SET is_hidden = true,
      hidden_reason = '크리에이터 금칙어 매칭',
      hidden_at = COALESCE(c.hidden_at, now()),
      is_filtered = true,
      filter_reason = 'filter_word'
  WHERE c.video_id IN (SELECT id FROM public.videos WHERE creator_id = v_uid)
    AND lower(c.content) LIKE '%' || lower(v_word) || '%'
    AND c.is_hidden = false;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.creator_remove_filter_word(p_word_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  DELETE FROM public.creator_filter_words
  WHERE id = p_word_id AND creator_id = v_uid;
  -- 주의: 금칙어 제거 시 기존 숨김 댓글은 자동 복원하지 않음
  -- (다른 금칙어/차단 사유로 숨김됐을 수도 있음 → 어드민/크리에이터가 수동 검토)
END;
$$;

CREATE OR REPLACE FUNCTION public.creator_get_filter_words()
RETURNS TABLE (
  id          UUID,
  word        TEXT,
  created_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, word, created_at
  FROM public.creator_filter_words
  WHERE creator_id = auth.uid()
  ORDER BY created_at DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 11: 크리에이터의 자동 필터된 댓글 검토 RPC
--   (크리에이터가 직접 자동 필터 결과를 검토 → 복원 가능)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.creator_get_filtered_comments()
RETURNS TABLE (
  id            UUID,
  video_id      TEXT,
  user_id       UUID,
  author_name   TEXT,
  content       TEXT,
  filter_reason TEXT,
  created_at    TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT c.id, c.video_id, c.user_id, c.author_name, c.content, c.filter_reason, c.created_at
  FROM public.comments c
  INNER JOIN public.videos v ON v.id = c.video_id
  WHERE v.creator_id = auth.uid()
    AND c.is_filtered = true
    AND c.is_hidden = true
  ORDER BY c.created_at DESC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.creator_restore_comment(p_comment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_video_id  TEXT;
  v_creator   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT c.video_id, v.creator_id INTO v_video_id, v_creator
  FROM public.comments c
  LEFT JOIN public.videos v ON v.id = c.video_id
  WHERE c.id = p_comment_id;

  IF v_creator IS NULL OR v_creator <> v_uid THEN
    RAISE EXCEPTION '영상 작성자만 자동 필터 댓글을 복원할 수 있습니다';
  END IF;

  UPDATE public.comments
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL,
      is_filtered = false, filter_reason = NULL
  WHERE id = p_comment_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리 (참고용 — 실제 PK는 각자 환경에 맞게 교체)
--
--   -- 1. 금칙어 등록
--   SELECT public.creator_add_filter_word('욕설1');
--
--   -- 2. 금칙어 목록 조회
--   SELECT * FROM public.creator_get_filter_words();
--
--   -- 3. 사용자 차단
--   SELECT public.creator_block_user('차단할_사용자_uuid', '스팸 댓글');
--
--   -- 4. 차단 목록
--   SELECT * FROM public.creator_get_blocked_users();
--
--   -- 5. 자동 필터된 댓글 검토
--   SELECT * FROM public.creator_get_filtered_comments();
--
--   -- 6. 핀 고정 (영상 작성자만)
--   SELECT public.toggle_pin_comment('댓글_uuid');
--
--   -- 7. 크리에이터 하트 (영상 작성자만)
--   SELECT public.toggle_creator_heart('댓글_uuid');
--
--   -- 8. 좋아요/취소
--   SELECT public.like_comment('댓글_uuid');
--   SELECT public.unlike_comment('댓글_uuid');
-- ════════════════════════════════════════════════════════════════════════════
