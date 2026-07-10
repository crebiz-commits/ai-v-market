-- ════════════════════════════════════════════════════════════════════════════
-- 크리에이터 스폰서십(협찬) 검수 기능 (2026-07-11)
--
--   Phase 28 에서 videos.sponsor_brand/logo_url/disclosure/link_url 을 추가했으나
--   검수 상태 컬럼·RPC 가 없어 AdminSponsorships 는 placeholder 였음.
--   → 검수 상태 컬럼 + 재검수 트리거 + 목록/승인·반려 RPC 추가.
--
--   워크플로: 크리에이터가 협찬 표시(sponsor_brand) 등록 → status NULL(미검수) →
--     관리자가 공시 적정성/브랜드 위장/링크 안전성 검토 → 승인(approved) 또는
--     반려(rejected, 크리에이터 알림 + 선택적 숨김). 협찬 정보 수정 시 자동 재검수.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 검수 상태 컬럼
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS sponsor_review_status TEXT
  CHECK (sponsor_review_status IN ('pending', 'approved', 'rejected'));   -- NULL = 미검수(신규)
COMMENT ON COLUMN public.videos.sponsor_review_status IS '협찬 검수 상태. NULL/pending=미검수, approved, rejected.';
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS sponsor_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS sponsor_review_note TEXT;

-- 검수 큐 인덱스 (협찬 영상만)
CREATE INDEX IF NOT EXISTS idx_videos_sponsor_review
  ON public.videos(sponsor_review_status, created_at DESC)
  WHERE sponsor_brand IS NOT NULL;

-- 2) 재검수 트리거 — 크리에이터가 협찬 정보를 바꾸면 검수 상태 리셋(다시 미검수).
--    공시 문구가 바뀌었는데 옛 승인이 남아 있으면 안 되므로(공정거래법 대응).
CREATE OR REPLACE FUNCTION public.tg_reset_sponsor_review()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.sponsor_brand      IS DISTINCT FROM OLD.sponsor_brand
      OR NEW.sponsor_logo_url   IS DISTINCT FROM OLD.sponsor_logo_url
      OR NEW.sponsor_disclosure IS DISTINCT FROM OLD.sponsor_disclosure
      OR NEW.sponsor_link_url   IS DISTINCT FROM OLD.sponsor_link_url) THEN
    NEW.sponsor_review_status := NULL;
    NEW.sponsor_reviewed_at   := NULL;
    NEW.sponsor_review_note   := NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_reset_sponsor_review ON public.videos;
CREATE TRIGGER trg_reset_sponsor_review
  BEFORE UPDATE OF sponsor_brand, sponsor_logo_url, sponsor_disclosure, sponsor_link_url
  ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_reset_sponsor_review();

-- 3) 협찬 영상 목록 (관리자)
CREATE OR REPLACE FUNCTION public.admin_list_sponsored_videos(p_filter TEXT DEFAULT 'pending')
RETURNS TABLE (
  id                    TEXT,
  title                 TEXT,
  thumbnail             TEXT,
  creator_id            UUID,
  creator_name          TEXT,
  sponsor_brand         TEXT,
  sponsor_logo_url      TEXT,
  sponsor_disclosure    TEXT,
  sponsor_link_url      TEXT,
  sponsor_review_status TEXT,
  sponsor_reviewed_at   TIMESTAMPTZ,
  sponsor_review_note   TEXT,
  is_hidden             BOOLEAN,
  created_at            TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    v.id::TEXT, v.title, v.thumbnail, v.creator_id, p.display_name,
    v.sponsor_brand, v.sponsor_logo_url, v.sponsor_disclosure, v.sponsor_link_url,
    v.sponsor_review_status, v.sponsor_reviewed_at, v.sponsor_review_note,
    COALESCE(v.is_hidden, false), v.created_at
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE v.sponsor_brand IS NOT NULL AND btrim(v.sponsor_brand) <> ''
    AND (
      p_filter = 'all'
      OR (p_filter = 'pending'  AND (v.sponsor_review_status IS NULL OR v.sponsor_review_status = 'pending'))
      OR (p_filter = 'approved' AND v.sponsor_review_status = 'approved')
      OR (p_filter = 'rejected' AND v.sponsor_review_status = 'rejected')
    )
  ORDER BY (v.sponsor_review_status IS NULL) DESC, v.created_at DESC;  -- 미검수 먼저
END; $$;

-- 4) 승인/반려 (크리에이터 알림 + 반려 시 선택적 숨김 + 감사 로그)
CREATE OR REPLACE FUNCTION public.admin_review_sponsorship(
  p_video_id       TEXT,
  p_approve        BOOLEAN,
  p_note           TEXT DEFAULT NULL,
  p_hide_on_reject BOOLEAN DEFAULT false
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_creator UUID;
  v_title   TEXT;
  v_brand   TEXT;
  v_hide    BOOLEAN := (NOT p_approve) AND p_hide_on_reject;
BEGIN
  PERFORM public.assert_admin();
  SELECT creator_id, title, sponsor_brand INTO v_creator, v_title, v_brand
  FROM public.videos WHERE id = p_video_id;
  IF v_creator IS NULL THEN
    RAISE EXCEPTION '영상을 찾을 수 없습니다: %', p_video_id;
  END IF;

  UPDATE public.videos
  SET sponsor_review_status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      sponsor_reviewed_at   = now(),
      sponsor_review_note   = p_note,
      is_hidden     = CASE WHEN v_hide THEN true ELSE is_hidden END,
      hidden_reason = CASE WHEN v_hide THEN COALESCE(p_note, '협찬 공시 검수 반려') ELSE hidden_reason END,
      hidden_at     = CASE WHEN v_hide THEN now() ELSE hidden_at END
  WHERE id = p_video_id;

  -- 크리에이터 알림 (link 쿼리스트링 규약)
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    v_creator, 'system',
    CASE WHEN p_approve THEN '협찬 표시 검수 승인 ✅' ELSE '협찬 표시 검수 반려' END,
    CASE WHEN p_approve
         THEN COALESCE(v_title, '영상') || ' — 협찬 표시가 승인되었습니다.'
         ELSE COALESCE(v_title, '영상') || ' — 협찬 표시가 반려되었습니다: '
              || COALESCE(NULLIF(btrim(p_note), ''), '공시 문구를 확인·수정해 주세요.')
              || CASE WHEN v_hide THEN ' (수정 전까지 숨김 처리됨)' ELSE '' END
    END,
    '/?video=' || p_video_id
  );

  -- 감사 로그
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    CASE WHEN p_approve THEN 'sponsor_approve' ELSE 'sponsor_reject' END,
    'video', p_video_id,
    jsonb_build_object('brand', v_brand, 'note', p_note, 'hidden', v_hide)
  );
END; $$;

GRANT EXECUTE ON FUNCTION public.admin_list_sponsored_videos(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_review_sponsorship(TEXT, BOOLEAN, TEXT, BOOLEAN) TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT * FROM public.admin_list_sponsored_videos('all');       -- 협찬 영상 목록
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('admin_list_sponsored_videos','admin_review_sponsorship','tg_reset_sponsor_review');
