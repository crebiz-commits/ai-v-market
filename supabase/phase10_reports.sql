-- ════════════════════════════════════════════════════════════════════════════
-- Phase 10 — 콘텐츠 신고/모더레이션 시스템
-- 적용 일자: 2026-05-13
-- 선행: profiles, videos, comments, community_posts, platform_settings
--
-- 목적:
--   1. 사용자가 영상/댓글/사용자/커뮤니티 글을 신고할 수 있게 함
--   2. 신고 누적 시 자동 숨김 (어드민 검토 대기)
--   3. 어드민이 신고 큐 처리 (유지/제거/반려)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: 모더레이션용 숨김/정지 컬럼 추가 (기존 테이블 확장)
-- ────────────────────────────────────────────────────────────────────────────

-- 영상 숨김 (어드민 또는 자동)
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE public.videos ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

COMMENT ON COLUMN public.videos.is_hidden IS '신고로 숨김 처리됐는지 (어드민 또는 자동)';
COMMENT ON COLUMN public.videos.hidden_reason IS '숨김 사유 (사용자 표시용)';

-- 댓글 숨김
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

-- 커뮤니티 글 숨김
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS hidden_reason TEXT;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

-- 사용자 정지 (계정 차단)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_reason TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.is_suspended IS '계정 정지 여부 (스토커/사칭/반복 위반 시 어드민이 토글)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: platform_settings에 자동 숨김 임계값 추가
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.platform_settings (key, value, note) VALUES
  ('auto_hide_threshold', 3, '같은 콘텐츠에 신고 N건 누적 시 자동 숨김. 어드민 검토 대기')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: reports 테이블
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id              BIGSERIAL PRIMARY KEY,
  reporter_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 신고 대상
  target_type     TEXT NOT NULL,   -- video / comment / user / community_post
  target_id       TEXT NOT NULL,   -- 대상의 PK (UUID 또는 BIGINT를 TEXT로)

  -- 신고 내용
  reason          TEXT NOT NULL,   -- spam / inappropriate / copyright / violence / harassment / misinformation / other
  description     TEXT,            -- 자유 입력 (선택)

  -- 처리 상태
  status          TEXT NOT NULL DEFAULT 'pending',
  -- pending: 검토 대기 / reviewed_kept: 검토 후 유지 / reviewed_removed: 제거 / dismissed: 악성 신고 반려

  reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at     TIMESTAMPTZ,
  admin_note      TEXT,            -- 어드민 메모 (사용자 비공개)

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT reports_target_type_check
    CHECK (target_type IN ('video', 'comment', 'user', 'community_post')),
  CONSTRAINT reports_reason_check
    CHECK (reason IN ('spam', 'inappropriate', 'copyright', 'violence', 'harassment', 'misinformation', 'other')),
  CONSTRAINT reports_status_check
    CHECK (status IN ('pending', 'reviewed_kept', 'reviewed_removed', 'dismissed'))
);

-- 중복 신고 방지 — 같은 사람이 같은 대상에 대해 1회만
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_dedup
  ON public.reports(reporter_id, target_type, target_id)
  WHERE reporter_id IS NOT NULL;

-- 어드민 큐 조회용
CREATE INDEX IF NOT EXISTS idx_reports_status_created
  ON public.reports(status, created_at DESC);

-- 자동 숨김 집계용 (특정 target에 대한 신고 카운트)
CREATE INDEX IF NOT EXISTS idx_reports_target_pending
  ON public.reports(target_type, target_id)
  WHERE status = 'pending';

COMMENT ON TABLE public.reports IS '콘텐츠/사용자 신고 기록 + 어드민 처리 결과';

-- updated_at 자동 갱신
DROP TRIGGER IF EXISTS reports_set_updated_at ON public.reports;
CREATE TRIGGER reports_set_updated_at
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: create_report RPC — 사용자가 신고
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
    -- 자동 숨김
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
    -- user는 자동 정지하지 않음 (오용 방지) — 어드민 수동 처리
  END IF;

  RETURN v_report_id;
END;
$$;

COMMENT ON FUNCTION public.create_report IS
  '사용자가 영상/댓글/사용자/커뮤니티글 신고. 같은 대상에 신고 누적 시 자동 숨김';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: moderate_report RPC — 어드민이 신고 처리
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.moderate_report(
  p_report_id BIGINT,
  p_action TEXT,         -- 'keep' / 'remove' / 'dismiss'
  p_admin_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin_id  UUID := auth.uid();
  v_is_admin  BOOLEAN;
  v_report    public.reports;
  v_new_status TEXT;
BEGIN
  -- 권한 체크
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_admin_id;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;

  IF p_action NOT IN ('keep', 'remove', 'dismiss') THEN
    RAISE EXCEPTION '잘못된 액션: % (keep/remove/dismiss 중 하나)', p_action;
  END IF;

  -- 신고 행 조회
  SELECT * INTO v_report FROM public.reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 신고: %', p_report_id;
  END IF;

  -- 액션별 처리
  IF p_action = 'keep' THEN
    -- 정상 콘텐츠로 판정 → 같은 대상의 모든 pending 신고를 reviewed_kept로
    v_new_status := 'reviewed_kept';

    -- 만약 자동 숨김됐던 콘텐츠라면 복원
    IF v_report.target_type = 'video' THEN
      UPDATE public.videos SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id = v_report.target_id;
    ELSIF v_report.target_type = 'comment' THEN
      UPDATE public.comments SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id::TEXT = v_report.target_id;
    ELSIF v_report.target_type = 'community_post' THEN
      UPDATE public.community_posts SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
      WHERE id::TEXT = v_report.target_id;
    END IF;

  ELSIF p_action = 'remove' THEN
    -- 위반 콘텐츠 → 숨김 + 같은 대상의 모든 pending 신고를 reviewed_removed로
    v_new_status := 'reviewed_removed';

    IF v_report.target_type = 'video' THEN
      UPDATE public.videos SET is_hidden = true,
        hidden_reason = '커뮤니티 가이드라인 위반으로 숨김 처리', hidden_at = now()
      WHERE id = v_report.target_id;
    ELSIF v_report.target_type = 'comment' THEN
      UPDATE public.comments SET is_hidden = true,
        hidden_reason = '커뮤니티 가이드라인 위반으로 숨김 처리', hidden_at = now()
      WHERE id::TEXT = v_report.target_id;
    ELSIF v_report.target_type = 'community_post' THEN
      UPDATE public.community_posts SET is_hidden = true,
        hidden_reason = '커뮤니티 가이드라인 위반으로 숨김 처리', hidden_at = now()
      WHERE id::TEXT = v_report.target_id;
    ELSIF v_report.target_type = 'user' THEN
      UPDATE public.profiles SET is_suspended = true,
        suspended_reason = '반복된 가이드라인 위반', suspended_at = now()
      WHERE id::TEXT = v_report.target_id;
    END IF;

  ELSE  -- dismiss
    -- 악성 신고 → 단일 신고만 dismissed (다른 신고는 그대로)
    UPDATE public.reports
    SET status = 'dismissed', reviewed_by = v_admin_id, reviewed_at = now(), admin_note = p_admin_note
    WHERE id = p_report_id;
    -- 감사로그 (악성신고 반려, 2026-06-28 B4)
    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (v_admin_id, 'report_dismiss', v_report.target_type, v_report.target_id,
            jsonb_build_object('report_id', p_report_id, 'note', p_admin_note));
    RETURN;
  END IF;

  -- keep/remove 액션: 같은 대상의 모든 pending 신고를 일괄 갱신
  UPDATE public.reports
  SET status = v_new_status, reviewed_by = v_admin_id, reviewed_at = now(), admin_note = p_admin_note
  WHERE target_type = v_report.target_type
    AND target_id = v_report.target_id
    AND status = 'pending';

  -- 감사로그 (신고 처리 — 콘텐츠 숨김/복원·사용자 정지 책임추적, 2026-06-28 B4)
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (v_admin_id,
          CASE WHEN p_action = 'remove' THEN 'report_remove' ELSE 'report_keep' END,
          v_report.target_type, v_report.target_id,
          jsonb_build_object('report_id', p_report_id, 'action', p_action, 'note', p_admin_note));
END;
$$;

COMMENT ON FUNCTION public.moderate_report IS
  '어드민이 신고 처리. keep=유지+복원, remove=숨김처리, dismiss=악성신고 반려';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: 어드민 — 신고 큐 조회 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_pending_reports()
RETURNS TABLE (
  id            BIGINT,
  target_type   TEXT,
  target_id     TEXT,
  reason        TEXT,
  description   TEXT,
  reporter_id   UUID,
  reporter_name TEXT,
  created_at    TIMESTAMPTZ,
  report_count  INTEGER         -- 같은 대상의 pending 신고 총 수
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    r.id, r.target_type, r.target_id, r.reason, r.description,
    r.reporter_id,
    p.display_name AS reporter_name,
    r.created_at,
    (SELECT COUNT(*)::INTEGER
     FROM public.reports r2
     WHERE r2.target_type = r.target_type
       AND r2.target_id = r.target_id
       AND r2.status = 'pending') AS report_count
  FROM public.reports r
  LEFT JOIN public.profiles p ON p.id = r.reporter_id
  WHERE r.status = 'pending'
  ORDER BY r.created_at DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 7: 본인 신고 내역 조회 RPC
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_reports()
RETURNS TABLE (
  id           BIGINT,
  target_type  TEXT,
  target_id    TEXT,
  reason       TEXT,
  status       TEXT,
  created_at   TIMESTAMPTZ,
  reviewed_at  TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT id, target_type, target_id, reason, status, created_at, reviewed_at
  FROM public.reports
  WHERE reporter_id = auth.uid()
  ORDER BY created_at DESC;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 8: RLS
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_select_own_or_admin" ON public.reports;
CREATE POLICY "reports_select_own_or_admin"
  ON public.reports FOR SELECT
  USING (
    auth.uid() = reporter_id
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- INSERT/UPDATE는 SECURITY DEFINER RPC만

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 가짜 신고 생성 (다른 영상)
--   SELECT public.create_report('video', '영상ID', 'spam', '광고성 영상');
--
--   -- 2. 어드민 신고 큐 조회
--   SELECT * FROM public.get_pending_reports();
--
--   -- 3. 어드민 신고 처리 (제거)
--   SELECT public.moderate_report(1, 'remove', '광고성 영상 확인');
--
--   -- 4. 처리된 신고 확인
--   SELECT id, status, reviewed_at FROM public.reports WHERE id = 1;
--
--   -- 5. 자동 숨김 임계값 변경 (어드민)
--   SELECT public.update_platform_setting('auto_hide_threshold', 5, '임계값 상향');
-- ════════════════════════════════════════════════════════════════════════════
