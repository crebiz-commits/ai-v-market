-- ════════════════════════════════════════════════════════════════════════════
-- Phase 27 — 이용자 데이터 권리 (계정 삭제 + 데이터 다운로드)
-- 적용 일자: 2026-05-17
-- 선행: profiles, videos, comments, video_likes, video_views, orders, playlists,
--       creator_followers, user_blocks, search_logs, creator_blocked_users
--
-- 목적:
--   1. 회원 탈퇴 요청 (30일 유예 후 영구 삭제) — 개인정보보호법 의무
--   2. 본인 데이터 다운로드 (JSON) — GDPR/개인정보보호법 데이터 이동권
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: profiles 컬럼 추가 — 삭제 요청 시점 + 사유
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

COMMENT ON COLUMN public.profiles.deletion_requested_at IS
  '계정 삭제 요청 시각. NULL 아니면 30일 후 자동 삭제 예정';
COMMENT ON COLUMN public.profiles.deletion_reason IS
  '사용자가 입력한 탈퇴 사유 (선택)';

CREATE INDEX IF NOT EXISTS idx_profiles_deletion_pending
  ON public.profiles(deletion_requested_at)
  WHERE deletion_requested_at IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: 계정 삭제 요청 (30일 유예 시작)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_account_deletion(p_reason TEXT DEFAULT NULL)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_requested_at TIMESTAMPTZ := now();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  UPDATE public.profiles
  SET deletion_requested_at = v_requested_at,
      deletion_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = v_uid;

  RETURN v_requested_at;
END;
$$;

COMMENT ON FUNCTION public.request_account_deletion IS
  '계정 삭제 요청. 30일 후 자동 삭제. 유예 기간 내 cancel_account_deletion으로 취소 가능';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 계정 삭제 취소
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_account_deletion()
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

  UPDATE public.profiles
  SET deletion_requested_at = NULL,
      deletion_reason = NULL
  WHERE id = v_uid;
END;
$$;

COMMENT ON FUNCTION public.cancel_account_deletion IS
  '유예 기간 내 계정 삭제 요청 취소';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 4: 30일 경과 계정 영구 삭제 (어드민 또는 Cron이 호출)
--   - auth.users는 admin client 또는 별도 처리 (RLS 우회 불가)
--   - 여기서는 profiles 및 관련 user data 삭제. auth.users.id는 SET NULL/CASCADE로 처리됨
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purge_pending_deletions(p_days INTEGER DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_is_admin BOOLEAN;
  v_count INTEGER := 0;
  v_threshold TIMESTAMPTZ := now() - (p_days || ' days')::INTERVAL;
BEGIN
  -- 어드민만 호출 가능
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = v_uid;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;

  -- 30일 이상 경과한 삭제 요청자만 (auth.users는 별도 처리 필요)
  -- profiles에서 삭제하면 CASCADE로 연관 테이블도 정리됨
  WITH targets AS (
    SELECT id FROM public.profiles
    WHERE deletion_requested_at IS NOT NULL
      AND deletion_requested_at <= v_threshold
  )
  DELETE FROM public.profiles WHERE id IN (SELECT id FROM targets);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- NOTE: auth.users는 supabase admin API로 별도 삭제 필요.
  --   가장 안전한 방법은 이 함수 호출 후 Edge Function이 admin client로
  --   auth.admin.deleteUser(userId)를 호출하는 것.

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.purge_pending_deletions IS
  '30일+ 경과한 삭제 요청 계정의 profiles 영구 삭제. 어드민/Cron 전용. auth.users는 별도 처리';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 5: 본인 데이터 JSON 다운로드 (GDPR 데이터 이동권)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.export_my_data()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  SELECT jsonb_build_object(
    'exported_at', now(),
    'user_id', v_uid,
    'platform', 'CREAITE',
    'profile',
      -- 개인정보만 내보내고 내부 운영 플래그·타인 민감정보는 제외(키 subtract — 없는 키는 무시되어 안전).
      (SELECT to_jsonb(p) - 'is_admin' - 'suspended_at' - 'suspended_reason'
                         - 'deletion_requested_at' - 'deletion_reason'
                         - 'referred_by' - 'referral_code'
       FROM public.profiles p WHERE p.id = v_uid),
    'videos_uploaded',
      COALESCE((SELECT jsonb_agg(to_jsonb(v)) FROM public.videos v WHERE v.creator_id = v_uid), '[]'::jsonb),
    'comments',
      COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM public.comments c WHERE c.user_id = v_uid), '[]'::jsonb),
    'video_likes',
      COALESCE((SELECT jsonb_agg(to_jsonb(vl)) FROM public.video_likes vl WHERE vl.user_id = v_uid), '[]'::jsonb),
    'watch_history',
      COALESCE((SELECT jsonb_agg(to_jsonb(vv)) FROM public.video_views vv WHERE vv.viewer_user_id = v_uid), '[]'::jsonb),
    'orders_purchased',
      COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o WHERE o.buyer_id = v_uid), '[]'::jsonb),
    'orders_sold',
      COALESCE((SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o WHERE o.seller_id = v_uid), '[]'::jsonb),
    'playlists',
      COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.playlists p WHERE p.user_id = v_uid), '[]'::jsonb),
    'following_creators',
      COALESCE((SELECT jsonb_agg(to_jsonb(cf)) FROM public.creator_followers cf WHERE cf.follower_id = v_uid), '[]'::jsonb),
    'followers',
      COALESCE((SELECT jsonb_agg(to_jsonb(cf)) FROM public.creator_followers cf WHERE cf.creator_id = v_uid), '[]'::jsonb),
    'blocked_users',
      COALESCE((SELECT jsonb_agg(to_jsonb(ub)) FROM public.user_blocks ub WHERE ub.blocker_id = v_uid), '[]'::jsonb),
    'creator_blocked_users',
      COALESCE((SELECT jsonb_agg(to_jsonb(cbu)) FROM public.creator_blocked_users cbu WHERE cbu.creator_id = v_uid), '[]'::jsonb),
    'creator_filter_words',
      COALESCE((SELECT jsonb_agg(to_jsonb(cfw)) FROM public.creator_filter_words cfw WHERE cfw.creator_id = v_uid), '[]'::jsonb),
    'search_history',
      COALESCE((SELECT jsonb_agg(to_jsonb(sl)) FROM public.search_logs sl WHERE sl.user_id = v_uid), '[]'::jsonb),
    'revenue_distributions',
      COALESCE((SELECT jsonb_agg(to_jsonb(rd)) FROM public.revenue_distributions rd WHERE rd.creator_id = v_uid), '[]'::jsonb),
    'reports_filed',
      COALESCE((SELECT jsonb_agg(to_jsonb(r)) FROM public.reports r WHERE r.reporter_id = v_uid), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.export_my_data IS
  '본인의 모든 데이터를 JSON으로 반환 (개인정보보호법 데이터 이동권)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 6: 삭제 상태 조회 (UI 표시용)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_deletion_status()
RETURNS TABLE (
  requested_at  TIMESTAMPTZ,
  scheduled_at  TIMESTAMPTZ,
  days_left     INTEGER,
  reason        TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    p.deletion_requested_at AS requested_at,
    p.deletion_requested_at + INTERVAL '30 days' AS scheduled_at,
    -- 남은 일수는 올림(CEIL)으로 계산 — EXTRACT(DAY ...)는 일 성분만 잘라 하루 적게 표시되던 버그 수정.
    GREATEST(
      0,
      CEIL(EXTRACT(EPOCH FROM (p.deletion_requested_at + INTERVAL '30 days' - now())) / 86400)::INTEGER
    ) AS days_left,
    p.deletion_reason AS reason
  FROM public.profiles p
  WHERE p.id = auth.uid()
    AND p.deletion_requested_at IS NOT NULL;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   -- 1. 삭제 요청
--   SELECT public.request_account_deletion('서비스 미사용');
--
--   -- 2. 상태 확인
--   SELECT * FROM public.get_my_deletion_status();
--
--   -- 3. 취소
--   SELECT public.cancel_account_deletion();
--
--   -- 4. 데이터 다운로드
--   SELECT public.export_my_data();
-- ════════════════════════════════════════════════════════════════════════════
