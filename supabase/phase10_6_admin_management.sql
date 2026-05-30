-- ════════════════════════════════════════════════════════════════════════════
-- Phase 10.6 — 어드민 핵심 관리 기능 (사용자/콘텐츠/숨김/결제)
-- 적용 일자: 2026-05-13
--
-- 목적:
--   1. 사용자 관리: 검색/상세/정지/권한
--   2. 콘텐츠 관리: 영상 검색/강제 숨김
--   3. 숨김 콘텐츠 관리: 자동 숨김된 영상 복원/삭제
--   4. 결제/환불: 전체 결제 조회 + 환불 처리 (권한 회수 포함)
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 공통 헬퍼: 어드민 권한 체크 (반복 사용 함수)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assert_admin()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;
  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION '어드민 권한이 필요합니다';
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- A. 사용자 관리
-- ════════════════════════════════════════════════════════════════════════════

-- 사용자 검색/목록 (어드민)
CREATE OR REPLACE FUNCTION public.admin_search_users(
  p_query TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',   -- 'all' / 'premium' / 'suspended' / 'admins'
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                   UUID,
  email                TEXT,
  display_name         TEXT,
  avatar_url           TEXT,
  subscription_tier    TEXT,
  is_admin             BOOLEAN,
  is_suspended         BOOLEAN,
  suspended_reason     TEXT,
  created_at           TIMESTAMPTZ,
  video_count          BIGINT,
  total_payments       BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    p.id,
    u.email::TEXT,
    p.display_name,
    p.avatar_url,
    p.subscription_tier,
    COALESCE(p.is_admin, false),
    COALESCE(p.is_suspended, false),
    p.suspended_reason,
    p.created_at,
    (SELECT COUNT(*) FROM public.videos v WHERE v.creator_id = p.id)::BIGINT,
    (SELECT COALESCE(SUM(pay.amount), 0)
       FROM public.payments pay
       WHERE pay.user_id = p.id AND pay.status = 'completed')::BIGINT
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE
    (p_query IS NULL OR p_query = '' OR
       p.display_name ILIKE '%' || p_query || '%' OR
       u.email ILIKE '%' || p_query || '%')
    AND (
      p_filter = 'all'
      OR (p_filter = 'premium'   AND p.subscription_tier = 'premium')
      OR (p_filter = 'suspended' AND p.is_suspended = true)
      OR (p_filter = 'admins'    AND p.is_admin = true)
    )
  ORDER BY p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 사용자 정지/해제
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION '본인은 정지할 수 없습니다';
  END IF;
  UPDATE public.profiles
  SET is_suspended = true,
      suspended_reason = COALESCE(p_reason, '관리자 정지'),
      suspended_at = now(),
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.profiles
  SET is_suspended = false, suspended_reason = NULL, suspended_at = NULL, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- 어드민 권한 부여/회수
CREATE OR REPLACE FUNCTION public.admin_set_admin_role(
  p_user_id UUID,
  p_is_admin BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  IF p_user_id = auth.uid() AND p_is_admin = false THEN
    RAISE EXCEPTION '본인의 어드민 권한은 회수할 수 없습니다 (다른 어드민이 처리 필요)';
  END IF;
  UPDATE public.profiles
  SET is_admin = p_is_admin, updated_at = now()
  WHERE id = p_user_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- B. 콘텐츠 관리 (영상)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_search_videos(
  p_query TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',   -- 'all' / 'visible' / 'hidden'
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              TEXT,
  title           TEXT,
  thumbnail       TEXT,
  creator_id      UUID,
  creator_name    TEXT,
  duration_seconds INTEGER,
  views           BIGINT,
  price           INTEGER,
  is_hidden       BOOLEAN,
  hidden_reason   TEXT,
  hidden_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  pending_reports BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    v.id::TEXT,
    v.title,
    v.thumbnail,
    v.creator_id,
    p.display_name,
    v.duration_seconds,
    COALESCE(v.views::BIGINT, 0),
    COALESCE(v.price, 0),
    COALESCE(v.is_hidden, false),
    v.hidden_reason,
    v.hidden_at,
    v.created_at,
    (SELECT COUNT(*) FROM public.reports r
       WHERE r.target_type = 'video' AND r.target_id = v.id AND r.status = 'pending')::BIGINT
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE
    (p_query IS NULL OR p_query = '' OR v.title ILIKE '%' || p_query || '%')
    AND (
      p_filter = 'all'
      OR (p_filter = 'visible' AND COALESCE(v.is_hidden, false) = false)
      OR (p_filter = 'hidden'  AND v.is_hidden = true)
    )
  ORDER BY v.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 영상 강제 숨김/복원
CREATE OR REPLACE FUNCTION public.admin_hide_video(
  p_video_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.videos
  SET is_hidden = true,
      hidden_reason = COALESCE(p_reason, '관리자 강제 숨김'),
      hidden_at = now()
  WHERE id = p_video_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unhide_video(p_video_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.videos
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
  WHERE id = p_video_id;
END;
$$;

-- 영상 영구 삭제 (관련 신고/주문은 CASCADE 또는 SET NULL)
CREATE OR REPLACE FUNCTION public.admin_delete_video(p_video_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.assert_admin();
  DELETE FROM public.videos WHERE id = p_video_id;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- C. 숨김 콘텐츠 관리 (자동/수동 숨김 처리된 모든 콘텐츠)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_get_hidden_content(
  p_target_type TEXT DEFAULT 'all'   -- 'all' / 'video' / 'comment' / 'community_post' / 'user'
)
RETURNS TABLE (
  target_type    TEXT,
  target_id      TEXT,
  title          TEXT,
  thumbnail      TEXT,
  reason         TEXT,
  hidden_at      TIMESTAMPTZ,
  creator_name   TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  -- 숨김 영상
  SELECT
    'video'::TEXT,
    v.id::TEXT,
    v.title,
    v.thumbnail,
    v.hidden_reason,
    v.hidden_at,
    p.display_name
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE v.is_hidden = true AND (p_target_type = 'all' OR p_target_type = 'video')
  UNION ALL
  -- 숨김 댓글
  SELECT
    'comment'::TEXT,
    c.id::TEXT,
    LEFT(c.content, 50)::TEXT AS title,
    NULL::TEXT,
    c.hidden_reason,
    c.hidden_at,
    p.display_name
  FROM public.comments c
  LEFT JOIN public.profiles p ON p.id = c.user_id
  WHERE c.is_hidden = true AND (p_target_type = 'all' OR p_target_type = 'comment')
  UNION ALL
  -- 숨김 커뮤니티 글
  SELECT
    'community_post'::TEXT,
    cp.id::TEXT,
    cp.title,
    NULL::TEXT,
    cp.hidden_reason,
    cp.hidden_at,
    p.display_name
  FROM public.community_posts cp
  LEFT JOIN public.profiles p ON p.id = cp.user_id
  WHERE cp.is_hidden = true AND (p_target_type = 'all' OR p_target_type = 'community_post')
  UNION ALL
  -- 정지 사용자
  SELECT
    'user'::TEXT,
    p.id::TEXT,
    p.display_name AS title,
    p.avatar_url,
    p.suspended_reason,
    p.suspended_at,
    NULL::TEXT
  FROM public.profiles p
  WHERE p.is_suspended = true AND (p_target_type = 'all' OR p_target_type = 'user')
  ORDER BY hidden_at DESC NULLS LAST;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- D. 결제/환불 관리
-- ════════════════════════════════════════════════════════════════════════════

-- 반환 컬럼 변경(refund_reason/refund_requested_at 추가)으로 DROP 후 재생성 필요
DROP FUNCTION IF EXISTS public.admin_get_all_payments(TEXT, TEXT, INTEGER, INTEGER);
CREATE OR REPLACE FUNCTION public.admin_get_all_payments(
  p_status TEXT DEFAULT 'all',
  p_payment_type TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                  BIGINT,
  order_id            TEXT,
  user_id             UUID,
  user_name           TEXT,
  user_email          TEXT,
  payment_type        TEXT,
  target_id           TEXT,
  amount              INTEGER,
  method              TEXT,
  status              TEXT,
  approved_at         TIMESTAMPTZ,
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ,
  refund_reason       TEXT,
  refund_requested_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    pay.id,
    pay.order_id,
    pay.user_id,
    p.display_name,
    u.email::TEXT,
    pay.payment_type,
    pay.target_id,
    pay.amount,
    pay.method,
    pay.status,
    pay.approved_at,
    pay.failure_reason,
    pay.created_at,
    pay.refund_reason,
    pay.refund_requested_at
  FROM public.payments pay
  LEFT JOIN public.profiles p ON p.id = pay.user_id
  LEFT JOIN auth.users u ON u.id = pay.user_id
  WHERE
    (p_status = 'all' OR pay.status = p_status)
    AND (p_payment_type = 'all' OR pay.payment_type = p_payment_type)
  ORDER BY pay.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 환불 처리 (수동) — payments.status = 'refunded' + 권한 회수
-- 실제 토스 API 환불 호출은 별도 Edge Function이 처리 (이 RPC는 DB 갱신만)
CREATE OR REPLACE FUNCTION public.admin_refund_payment(
  p_payment_id BIGINT,
  p_admin_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_payment public.payments;
BEGIN
  PERFORM public.assert_admin();

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '존재하지 않는 결제: %', p_payment_id;
  END IF;

  IF v_payment.status <> 'completed' THEN
    RAISE EXCEPTION '환불 가능한 상태가 아닙니다 (현재: %)', v_payment.status;
  END IF;

  -- payments 상태 갱신
  UPDATE public.payments
  SET status = 'refunded',
      failure_reason = COALESCE(p_admin_note, '관리자 환불'),
      updated_at = now()
  WHERE id = p_payment_id;

  -- 권한 회수
  IF v_payment.payment_type = 'subscription' THEN
    -- 구독 즉시 만료 (premium → free)
    UPDATE public.profiles
    SET subscription_tier = 'free',
        subscription_expires_at = NULL,
        updated_at = now()
    WHERE id = v_payment.user_id;

  ELSIF v_payment.payment_type = 'license' THEN
    -- 라이선스 주문 취소
    UPDATE public.orders
    SET status = 'refunded', updated_at = now()
    WHERE buyer_id = v_payment.user_id
      AND video_id = v_payment.target_id
      AND payment_id = v_payment.payment_key;

  ELSIF v_payment.payment_type = 'ad_budget' THEN
    -- 광고 예산 차감
    UPDATE public.ads
    SET budget_krw = GREATEST(COALESCE(budget_krw, 0) - v_payment.amount, 0),
        updated_at = now()
    WHERE id = v_payment.target_id::UUID;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.admin_refund_payment IS
  '관리자 환불 처리: payments.status=refunded + 권한 회수 (구독/라이선스/광고예산). 토스 API 환불은 별도 처리 필요';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   SELECT * FROM public.admin_search_users(NULL, 'all', 10, 0);
--   SELECT * FROM public.admin_search_videos(NULL, 'all', 10, 0);
--   SELECT * FROM public.admin_get_hidden_content('all');
--   SELECT * FROM public.admin_get_all_payments('all', 'all', 10, 0);
-- ════════════════════════════════════════════════════════════════════════════
