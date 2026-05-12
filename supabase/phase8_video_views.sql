-- ════════════════════════════════════════════════════════════════════════════
-- Phase 8 — Step 2: 시청 기록 + 어뷰징 방지 필터
-- 적용 일자: 2026-05-12
-- 선행: phase8_platform_settings.sql
--
-- 목적:
--   - 영상 시청 시 IP/사용자/시청시간 기록
--   - 어뷰징 필터 자동 적용 (유효/무효 판정)
--     1. 셀프 시청 차단 (creator_id == viewer_id → invalid)
--     2. 시청률 30%+ 만 유효 (platform_settings.valid_view_min_ratio)
--     3. 동일 IP 24시간 1회만 카운트 (platform_settings.ip_dedup_hours)
--   - 정산 RPC가 is_valid = true 기록만 집계
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: video_views 테이블
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.video_views (
  id              BIGSERIAL PRIMARY KEY,
  video_id        TEXT NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  creator_id      UUID,                                 -- videos.creator_id 스냅샷 (집계 가속)
  viewer_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address      TEXT,
  watch_seconds   INTEGER NOT NULL CHECK (watch_seconds >= 0),
  video_duration  INTEGER,                              -- 그 시점 영상 길이 (변경 대비 스냅샷)
  watch_ratio     NUMERIC(5,4),                         -- watch_seconds / video_duration
  is_valid        BOOLEAN NOT NULL,                     -- 어뷰징 필터 통과 여부
  invalid_reason  TEXT,                                 -- self_view / low_ratio / ip_dup / no_duration
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_video_views_video_valid
  ON public.video_views(video_id, occurred_at DESC)
  WHERE is_valid = true;

CREATE INDEX IF NOT EXISTS idx_video_views_creator_period
  ON public.video_views(creator_id, occurred_at DESC)
  WHERE is_valid = true;

CREATE INDEX IF NOT EXISTS idx_video_views_ip_video_time
  ON public.video_views(ip_address, video_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_video_views_viewer
  ON public.video_views(viewer_user_id, occurred_at DESC);

COMMENT ON TABLE public.video_views IS '영상 시청 기록 + 어뷰징 필터 결과. 정산 집계의 근거';
COMMENT ON COLUMN public.video_views.is_valid IS '유효 시청 여부 (어뷰징 필터 통과)';
COMMENT ON COLUMN public.video_views.invalid_reason IS 'self_view(셀프시청), low_ratio(시청률부족), ip_dup(IP중복), no_duration(영상길이없음)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: track_video_view RPC
--   클라이언트가 영상 시청 종료 시 호출 (또는 30%+ 도달 시점)
--   어뷰징 필터를 자동 적용해서 is_valid 판정
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.track_video_view(
  p_video_id TEXT,
  p_watch_seconds INTEGER,
  p_ip TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_viewer_id     UUID := auth.uid();
  v_creator_id    UUID;
  v_duration      INTEGER;
  v_min_ratio     NUMERIC;
  v_dedup_hours   NUMERIC;
  v_ratio         NUMERIC(5,4);
  v_is_valid      BOOLEAN := true;
  v_reason        TEXT := NULL;
  v_recent_count  INTEGER := 0;
  v_view_id       BIGINT;
BEGIN
  -- 영상 정보 조회
  SELECT creator_id, duration_seconds
  INTO v_creator_id, v_duration
  FROM public.videos
  WHERE id = p_video_id;

  IF v_creator_id IS NULL THEN
    RAISE EXCEPTION '영상을 찾을 수 없습니다: %', p_video_id;
  END IF;

  -- 설정값 로드 (platform_settings 참조 — 어드민 조정 가능)
  v_min_ratio := COALESCE(public.get_platform_setting('valid_view_min_ratio'), 0.30);
  v_dedup_hours := COALESCE(public.get_platform_setting('ip_dedup_hours'), 24);

  -- ── 어뷰징 필터 ──

  -- 1. 셀프 시청 차단
  IF v_viewer_id IS NOT NULL AND v_viewer_id = v_creator_id THEN
    v_is_valid := false;
    v_reason := 'self_view';
  END IF;

  -- 2. 영상 길이 없음 → 비율 계산 불가
  IF v_is_valid AND (v_duration IS NULL OR v_duration <= 0) THEN
    v_is_valid := false;
    v_reason := 'no_duration';
  END IF;

  -- 3. 시청률 체크
  IF v_is_valid THEN
    v_ratio := LEAST(p_watch_seconds::numeric / v_duration::numeric, 1.0);
    IF v_ratio < v_min_ratio THEN
      v_is_valid := false;
      v_reason := 'low_ratio';
    END IF;
  END IF;

  -- 4. IP 중복 차단 (지난 N시간 내 동일 IP + 동일 영상 + is_valid=true 존재 시)
  IF v_is_valid AND p_ip IS NOT NULL AND p_ip <> '' THEN
    SELECT COUNT(*) INTO v_recent_count
    FROM public.video_views
    WHERE video_id = p_video_id
      AND ip_address = p_ip
      AND is_valid = true
      AND occurred_at >= now() - (v_dedup_hours || ' hours')::INTERVAL;

    IF v_recent_count > 0 THEN
      v_is_valid := false;
      v_reason := 'ip_dup';
    END IF;
  END IF;

  -- 기록
  INSERT INTO public.video_views (
    video_id, creator_id, viewer_user_id, ip_address,
    watch_seconds, video_duration, watch_ratio,
    is_valid, invalid_reason
  ) VALUES (
    p_video_id, v_creator_id, v_viewer_id, p_ip,
    p_watch_seconds, v_duration, v_ratio,
    v_is_valid, v_reason
  )
  RETURNING id INTO v_view_id;

  -- 누적 카운터 갱신은 별도 트리거 없이 정산 시점에 집계로 처리
  -- (실시간 카운터가 필요하면 videos.view_count 트리거 추가 가능)

  RETURN v_view_id;
END;
$$;

COMMENT ON FUNCTION public.track_video_view IS
  '영상 시청 기록 + 어뷰징 필터 자동 적용. 클라이언트가 시청 종료 시 호출';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 크리에이터 시청 통계 RPC (MyPage 표시용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_creator_view_stats(
  p_creator_id UUID DEFAULT auth.uid(),
  p_since TIMESTAMPTZ DEFAULT (now() - INTERVAL '30 days')
)
RETURNS TABLE (
  total_views    BIGINT,
  valid_views    BIGINT,
  total_watch_seconds BIGINT,
  unique_viewers BIGINT
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE is_valid)::BIGINT,
    COALESCE(SUM(watch_seconds) FILTER (WHERE is_valid), 0)::BIGINT,
    COUNT(DISTINCT viewer_user_id) FILTER (WHERE is_valid AND viewer_user_id IS NOT NULL)::BIGINT
  FROM public.video_views
  WHERE creator_id = p_creator_id
    AND occurred_at >= p_since;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: RLS
--   SELECT: 본인이 시청한 기록만 + 본인 영상의 시청 기록만
--   INSERT: RPC만 (SECURITY DEFINER가 처리)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.video_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "video_views_select_own" ON public.video_views;
CREATE POLICY "video_views_select_own"
  ON public.video_views FOR SELECT
  USING (auth.uid() = viewer_user_id OR auth.uid() = creator_id);

-- INSERT는 track_video_view RPC만 사용

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 시청 기록 테스트 (로그인 상태에서)
--   SELECT public.track_video_view('영상ID', 120, '127.0.0.1');
--
--   -- 본인 영상의 시청 통계 (최근 30일)
--   SELECT * FROM public.get_creator_view_stats();
--
--   -- 어뷰징 분포 확인
--   SELECT invalid_reason, count(*)
--   FROM public.video_views
--   WHERE NOT is_valid
--   GROUP BY invalid_reason;
-- ════════════════════════════════════════════════════════════════════════════
