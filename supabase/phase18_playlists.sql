-- ════════════════════════════════════════════════════════════════════════════
-- Phase 18 — 플레이리스트 + 나중에 보기
-- 적용 일자: 2026-05-15
--
-- 사용자가 만드는 플레이리스트 (private only, MVP)
-- "나중에 보기"는 is_watch_later=true 플래그가 붙은 특수 플레이리스트
-- (한 사용자당 1개만 존재 — UNIQUE INDEX 강제)
--
-- ⛔ 재실행 금지 — 부분 정본이 됨 (2026-07-22 감사)
--   테이블·인덱스·RLS 정의는 여전히 이 파일이 정본이지만, **9개 RPC 중 8개는 본문이
--   후속 파일로 이관**됐다. 이 파일의 RPC 블록을 (전체든 일부든) 다시 실행하면 회귀한다:
--     · get_playlist_videos      → 피드뷰 재조인 = **시리즈 2화+ 영구 증발** 재발
--                                   (+ resolve_display_name 표시이름 소멸)
--     · get_my_playlists         → 개수·커버가 목록과 다른 기준으로 회귀
--                                   (+ preview_age_rating 소멸 = 19금 커버 무블러)
--     · remove_from_playlist     → 소유자 미검증 UPDATE 재발(타인 행 갱신 가능)
--     · toggle_watch_later       → lazy-create 경쟁 조건 재발
--     · create_playlist / add_to_playlist → 100개·60자·500개 상한 + 노출가능 검증 소멸
--     · update/delete/get_playlist_memberships → SET search_path 조용히 소멸(게이트 #9 WARN)
--   ▣ 게다가 지금은 라이브 get_my_playlists 가 9컬럼이라, 이 파일(8컬럼)은
--     `cannot change return type of existing function` 으로 **RPC 1 에서 중단**된다
--     (뒤쪽 RPC 2~9 에 도달조차 못 함 = "절반만 적용" 상태가 됨).
--
--   현재 RPC 정본 (2026-07-22):
--     get_my_playlists                              → playlist_cover_age_rating_20260722.sql
--     get_playlist_videos / remove_from_playlist / toggle_watch_later
--                                                   → playlist_hardening_20260722.sql
--     create_playlist / set_playlist_order          → playlist_limits_reorder_20260722.sql
--     add_to_playlist / update_playlist / delete_playlist / get_playlist_memberships
--                                                   → playlist_audit2_20260722.sql
--   적용 상태 점검: _verify_playlist_applied_20260722.sql
--
-- 적용(신규 환경 부트스트랩 시에만):
--   Supabase Dashboard → SQL Editor → "+ New query" → 본 파일 전체 붙여넣기 → Run
--   → 그 뒤 반드시 위 후속 파일들을 **hardening → limits_reorder → cover_age → audit2**
--     순서로 이어서 적용할 것(순서 바뀌면 반환타입 충돌로 중간에 깨진다).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 테이블 ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.playlists (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  is_watch_later  BOOLEAN NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- 한 사용자당 Watch Later는 1개만
CREATE UNIQUE INDEX IF NOT EXISTS uq_playlists_watch_later_per_user
  ON public.playlists(user_id) WHERE is_watch_later = true;

CREATE INDEX IF NOT EXISTS idx_playlists_user_created
  ON public.playlists(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.playlist_videos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id  uuid NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
  video_id     TEXT NOT NULL,    -- videos.id (TEXT)
  position     INTEGER NOT NULL DEFAULT 0,
  added_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_playlist_videos_position
  ON public.playlist_videos(playlist_id, position);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own playlists rw" ON public.playlists;
CREATE POLICY "own playlists rw" ON public.playlists FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

ALTER TABLE public.playlist_videos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own playlist videos rw" ON public.playlist_videos;
CREATE POLICY "own playlist videos rw" ON public.playlist_videos FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.playlists p
    WHERE p.id = playlist_videos.playlist_id AND p.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.playlists p
    WHERE p.id = playlist_videos.playlist_id AND p.user_id = auth.uid()
  ));

-- ── RPC 1: 내 플레이리스트 목록 (썸네일·개수 포함) ─────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_playlists()
RETURNS TABLE (
  id              uuid,
  name            TEXT,
  description     TEXT,
  is_watch_later  BOOLEAN,
  created_at      timestamptz,
  updated_at      timestamptz,
  video_count     BIGINT,
  preview_thumbnail TEXT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    p.id, p.name, p.description, p.is_watch_later,
    p.created_at, p.updated_at,
    COALESCE(vc.cnt, 0)::BIGINT AS video_count,
    pv_first.thumbnail AS preview_thumbnail
  FROM public.playlists p
  LEFT JOIN (
    SELECT playlist_id, COUNT(*) AS cnt
    FROM public.playlist_videos
    GROUP BY playlist_id
  ) vc ON vc.playlist_id = p.id
  LEFT JOIN LATERAL (
    SELECT v.thumbnail
    FROM public.playlist_videos pv
    JOIN public.videos v ON v.id = pv.video_id
    WHERE pv.playlist_id = p.id
    ORDER BY pv.position ASC, pv.added_at ASC
    LIMIT 1
  ) pv_first ON true
  WHERE p.user_id = auth.uid()
  ORDER BY p.is_watch_later DESC, p.updated_at DESC;
$$;

-- ── RPC 2: 플레이리스트 영상 목록 ────────────────────────────────────────────
-- 주의: `position` 은 PostgreSQL 예약어(type function name) — RETURNS TABLE 에서
--       그냥 쓰면 syntax error. `pl_position` 으로 별칭 부여.
CREATE OR REPLACE FUNCTION public.get_playlist_videos(
  p_playlist_id uuid
)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, video_url TEXT,
  creator TEXT, creator_id uuid, creator_display_name TEXT, creator_avatar TEXT,
  category TEXT, ai_tool TEXT, duration TEXT, duration_seconds INTEGER,
  views BIGINT, price_standard INTEGER,
  highlight_start REAL, highlight_end REAL,
  pl_position INTEGER, added_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
#variable_conflict use_column
BEGIN
  -- 소유자 검증 (RLS는 SELECT만 — 함수 안에선 직접 체크)
  IF NOT EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = p_playlist_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION '플레이리스트에 접근할 권한이 없습니다';
  END IF;

  RETURN QUERY
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.video_url,
    v.creator, v.creator_id, v.creator_display_name, v.creator_avatar,
    v.category, v.ai_tool, v.duration, v.duration_seconds,
    COALESCE(v.views::BIGINT, 0), COALESCE(v.price_standard, 0),
    v.highlight_start, v.highlight_end,
    pv.position, pv.added_at
  FROM public.playlist_videos pv
  JOIN public.v_available_videos v ON v.id = pv.video_id
  WHERE pv.playlist_id = p_playlist_id
  ORDER BY pv.position ASC, pv.added_at ASC;
END;
$$;

-- ── RPC 3: 플레이리스트 생성 ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_playlist(
  p_name        TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION '플레이리스트 이름을 입력해주세요';
  END IF;

  INSERT INTO public.playlists (user_id, name, description)
  VALUES (v_user, trim(p_name), p_description)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ── RPC 4: 플레이리스트 이름·설명 수정 ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_playlist(
  p_playlist_id uuid,
  p_name        TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.playlists
  SET name = trim(p_name),
      description = p_description,
      updated_at = now()
  WHERE id = p_playlist_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION '플레이리스트를 찾을 수 없거나 권한이 없습니다';
  END IF;
END;
$$;

-- ── RPC 5: 플레이리스트 삭제 (cascade로 영상도 자동 제거) ────────────────────
CREATE OR REPLACE FUNCTION public.delete_playlist(
  p_playlist_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.playlists
  WHERE id = p_playlist_id
    AND user_id = auth.uid()
    AND is_watch_later = false;   -- Watch Later는 삭제 불가
  IF NOT FOUND THEN
    RAISE EXCEPTION '플레이리스트를 삭제할 수 없습니다 (없거나 권한 없음 또는 나중에 보기)';
  END IF;
END;
$$;

-- ── RPC 6: 영상을 플레이리스트에 추가 ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_to_playlist(
  p_playlist_id uuid,
  p_video_id    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_pos INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.playlists
    WHERE id = p_playlist_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION '플레이리스트에 접근할 권한이 없습니다';
  END IF;

  SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_pos
  FROM public.playlist_videos
  WHERE playlist_id = p_playlist_id;

  INSERT INTO public.playlist_videos (playlist_id, video_id, position)
  VALUES (p_playlist_id, p_video_id, v_next_pos)
  ON CONFLICT (playlist_id, video_id) DO NOTHING;

  UPDATE public.playlists SET updated_at = now() WHERE id = p_playlist_id;
END;
$$;

-- ── RPC 7: 영상을 플레이리스트에서 제거 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.remove_from_playlist(
  p_playlist_id uuid,
  p_video_id    TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.playlist_videos
  WHERE playlist_id = p_playlist_id
    AND video_id = p_video_id
    AND EXISTS (
      SELECT 1 FROM public.playlists p
      WHERE p.id = playlist_id AND p.user_id = auth.uid()
    );

  UPDATE public.playlists SET updated_at = now() WHERE id = p_playlist_id;
END;
$$;

-- ── RPC 8: 나중에 보기 토글 (lazy create + 추가/제거) ────────────────────────
-- 반환: 추가됨 → true, 제거됨 → false
CREATE OR REPLACE FUNCTION public.toggle_watch_later(
  p_video_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_pl_id uuid;
  v_exists BOOLEAN;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- Watch Later 플레이리스트 lazy create
  SELECT id INTO v_pl_id
  FROM public.playlists
  WHERE user_id = v_user AND is_watch_later = true;

  IF v_pl_id IS NULL THEN
    INSERT INTO public.playlists (user_id, name, is_watch_later)
    VALUES (v_user, '나중에 보기', true)
    RETURNING id INTO v_pl_id;
  END IF;

  -- 이미 있는지 확인
  SELECT EXISTS (
    SELECT 1 FROM public.playlist_videos
    WHERE playlist_id = v_pl_id AND video_id = p_video_id
  ) INTO v_exists;

  IF v_exists THEN
    DELETE FROM public.playlist_videos
    WHERE playlist_id = v_pl_id AND video_id = p_video_id;
    UPDATE public.playlists SET updated_at = now() WHERE id = v_pl_id;
    RETURN false;
  ELSE
    PERFORM public.add_to_playlist(v_pl_id, p_video_id);
    RETURN true;
  END IF;
END;
$$;

-- ── RPC 9: 특정 영상이 어느 플레이리스트에 포함됐는지 ─────────────────────────
-- AddToPlaylistModal의 체크박스 상태 + 북마크 아이콘 상태에 사용
CREATE OR REPLACE FUNCTION public.get_playlist_memberships(
  p_video_id TEXT
)
RETURNS TABLE (
  playlist_id     uuid,
  name            TEXT,
  is_watch_later  BOOLEAN,
  contains        BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    p.id AS playlist_id,
    p.name,
    p.is_watch_later,
    EXISTS (
      SELECT 1 FROM public.playlist_videos pv
      WHERE pv.playlist_id = p.id AND pv.video_id = p_video_id
    ) AS contains
  FROM public.playlists p
  WHERE p.user_id = auth.uid()
  ORDER BY p.is_watch_later DESC, p.updated_at DESC;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT * FROM public.get_my_playlists();
--   SELECT public.create_playlist('내 즐겨찾기', '좋아하는 영상 모음');
--   SELECT public.toggle_watch_later('어떤_영상_ID');
--   SELECT * FROM public.get_playlist_memberships('어떤_영상_ID');
-- ════════════════════════════════════════════════════════════════════════════
