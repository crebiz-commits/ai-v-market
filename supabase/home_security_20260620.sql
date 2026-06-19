-- ════════════════════════════════════════════════════════════════════════════
-- 홈피드 감사 — 보안 수정 (2026-06-20)
--   #3 video_likes RLS 정본화(위조 insert/타인 목록 열람 차단)
--   #1 increment_ad_clicks 클릭사기 dedup(인증/세션키 + 1시간 1회)
--   #7 comments SELECT 숨김 댓글 비노출(작성자/관리자/영상소유자만 열람)
-- 적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등 재실행 안전)
-- 검증: 하단 주석 쿼리
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- #3 video_likes — 스키마/RLS 정본화 (저장소에 없던 정책을 SSOT로 박음)
--   전 클라이언트 코드가 자기 user_id 로만 insert/select/delete 하므로 own-only 로 강제.
--   (테이블이 이미 있으면 CREATE IF NOT EXISTS 는 no-op — 기존 구조 보존)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_likes (
  video_id   text NOT NULL,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (video_id, user_id)
);

ALTER TABLE public.video_likes ENABLE ROW LEVEL SECURITY;

-- 본인 좋아요만 조회/생성/삭제 (카운트 동기화 트리거는 SECURITY DEFINER 라 RLS 우회 — 영향 없음)
DROP POLICY IF EXISTS "video_likes_select" ON public.video_likes;
DROP POLICY IF EXISTS "video_likes_insert" ON public.video_likes;
DROP POLICY IF EXISTS "video_likes_delete" ON public.video_likes;
CREATE POLICY "video_likes_select" ON public.video_likes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "video_likes_insert" ON public.video_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "video_likes_delete" ON public.video_likes
  FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- #1 increment_ad_clicks — 클릭사기 방어 (impressions 와 동일 dedup 패턴)
--   기존 1-파라미터 sql 함수는 무인증·무제한 → 경쟁사 클릭수 임의 조작 가능.
--   (광고, 뷰어, 1시간) 조합당 1회만 카운트. viewer_key = 로그인 uid 또는 클라 세션키.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ad_click_dedup (
  ad_id      uuid        NOT NULL,
  viewer_key text        NOT NULL,
  bucket     timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ad_id, viewer_key, bucket)
);
ALTER TABLE public.ad_click_dedup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ad_click_dedup FROM anon, authenticated;

-- 구버전 1-파라미터 함수 제거(우회 호출 차단) 후 2-파라미터 dedup 버전으로 교체
DROP FUNCTION IF EXISTS public.increment_ad_clicks(uuid);
CREATE OR REPLACE FUNCTION public.increment_ad_clicks(ad_id uuid, p_viewer_key text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_key    text        := COALESCE(auth.uid()::text, NULLIF(btrim(p_viewer_key), ''));
  v_bucket timestamptz := date_trunc('hour', now());
  v_count  boolean     := true;
BEGIN
  IF v_key IS NOT NULL THEN
    INSERT INTO public.ad_click_dedup (ad_id, viewer_key, bucket)
    VALUES (ad_id, v_key, v_bucket)
    ON CONFLICT DO NOTHING;
    IF NOT FOUND THEN v_count := false; END IF;  -- 이미 집계된 조합 → skip
  END IF;
  IF v_count THEN
    UPDATE public.ads SET clicks = clicks + 1 WHERE id = ad_id;
  END IF;
END;
$fn$;

-- dedup 정리(7일 경과분) — 기존 cleanup_ad_charge_dedup 와 함께 호출 권장
CREATE OR REPLACE FUNCTION public.cleanup_ad_click_dedup()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE n integer;
BEGIN
  DELETE FROM public.ad_click_dedup WHERE bucket < now() - INTERVAL '7 days';
  GET DIAGNOSTICS n = ROW_COUNT; RETURN n;
END;
$fn$;

-- ────────────────────────────────────────────────────────────────────────────
-- #7 comments SELECT — 숨김(차단/금칙어) 댓글 본문 비노출
--   기존 USING(true) → 숨김 댓글도 anon 이 본문 열람 가능했음.
--   작성자 본인 / 관리자 / 해당 영상 소유자만 숨김 댓글 열람.
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_hidden boolean DEFAULT false;  -- 방어(이미 있으면 no-op)

DROP POLICY IF EXISTS "comments_select" ON public.comments;
CREATE POLICY "comments_select" ON public.comments
  FOR SELECT USING (
    COALESCE(is_hidden, false) = false
    OR auth.uid() = user_id
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.videos v
      WHERE v.id = comments.video_id AND v.creator_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- #3: 본인 좋아요만 조회되는지 (로그인 토큰 없는 SQL Editor 는 0행이 정상)
--   SELECT * FROM public.video_likes LIMIT 3;
--   SELECT polname, cmd FROM pg_policies WHERE tablename='video_likes';
--   -- #1: 함수 시그니처 확인 (uuid, text 2-파라미터 단일 존재여야 함)
--   SELECT proname, pg_get_function_identity_arguments(oid)
--     FROM pg_proc WHERE proname='increment_ad_clicks';
--   -- #7: 숨김 댓글이 비로그인에 안 보이는지
--   SELECT polname FROM pg_policies WHERE tablename='comments' AND cmd='SELECT';
-- ════════════════════════════════════════════════════════════════════════════
