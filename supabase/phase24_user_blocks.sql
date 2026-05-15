-- ════════════════════════════════════════════════════════════════════════════
-- Phase 24 — 사용자 전역 차단
-- 적용 일자: 2026-05-16
-- 선행: profiles
--
-- 목적:
--   사용자가 다른 사용자를 "차단"하면 그 사용자의 영상/댓글/커뮤니티 글이
--   차단한 본인 화면에서만 안 보이도록.
--
-- Phase 23 creator_blocked_users와 차이:
--   - Phase 23: 영상 작성자가 자기 영상 댓글에만 적용 (DB 트리거로 is_hidden)
--   - Phase 24: 시청자가 본인 화면에서만 차단 (클라이언트 필터, DB는 차단 목록만 보관)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: user_blocks 테이블
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_blocks (
  blocker_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_user_id),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_user_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- 본인 차단 목록만 본인이 조회 (RPC도 SECURITY DEFINER로 우회 가능)
DROP POLICY IF EXISTS "user_blocks_select_own" ON public.user_blocks;
CREATE POLICY "user_blocks_select_own"
  ON public.user_blocks FOR SELECT
  USING (auth.uid() = blocker_id);
-- INSERT/DELETE는 RPC만

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 차단 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.block_user(p_target_user_id UUID)
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
  IF v_uid = p_target_user_id THEN
    RAISE EXCEPTION '본인을 차단할 수 없습니다';
  END IF;

  INSERT INTO public.user_blocks (blocker_id, blocked_user_id)
  VALUES (v_uid, p_target_user_id)
  ON CONFLICT DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.unblock_user(p_target_user_id UUID)
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

  DELETE FROM public.user_blocks
  WHERE blocker_id = v_uid AND blocked_user_id = p_target_user_id;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 본인의 차단 목록 조회 (UI 표시용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_blocked_users()
RETURNS TABLE (
  blocked_user_id UUID,
  display_name    TEXT,
  avatar_url      TEXT,
  blocked_at      TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT b.blocked_user_id, p.display_name, p.avatar_url, b.blocked_at
  FROM public.user_blocks b
  LEFT JOIN public.profiles p ON p.id = b.blocked_user_id
  WHERE b.blocker_id = auth.uid()
  ORDER BY b.blocked_at DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 본인의 차단 사용자 ID 배열 (클라이언트 필터링용 — 자주 호출)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_blocked_user_ids()
RETURNS UUID[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE(array_agg(blocked_user_id), ARRAY[]::UUID[])
  FROM public.user_blocks
  WHERE blocker_id = auth.uid();
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 차단
--   SELECT public.block_user('차단할_사용자_uuid');
--
--   -- 2. 본인 차단 목록
--   SELECT * FROM public.get_my_blocked_users();
--   SELECT public.get_my_blocked_user_ids();
--
--   -- 3. 차단 해제
--   SELECT public.unblock_user('차단할_사용자_uuid');
-- ════════════════════════════════════════════════════════════════════════════
