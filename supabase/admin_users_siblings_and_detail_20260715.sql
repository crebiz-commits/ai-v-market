-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 관리자 목록 형제 RPC tiebreaker + 사용자 상세 RPC 신규 (2026-07-15)
--
--   [A] 형제 목록 RPC 3종 결정적 정렬(tiebreaker) — admin_search_users(07-15) 와
--       동일 결함(단일 timestamp DESC → OFFSET "더 보기" 중복/누락) 일괄 해소.
--       ★ 아래 3함수의 새 정본(SSOT) = 이 파일. 각 옛 파일 재실행 금지:
--         · admin_search_videos      ← phase10_6_fix_views_cast.sql
--         · admin_get_all_payments   ← phase_admin_payments_refund_reason.sql
--         · admin_get_activity_logs  ← phase10_7_broadcast_and_logs.sql
--       변경점: ORDER BY 에 유니크 2차키(id) 추가 + SECURITY DEFINER 인라인
--       search_path 고정(#9). 반환 시그니처 불변 → CREATE OR REPLACE(DROP 불필요).
--
--   [B] admin_get_user_detail(uuid) — 사용자 관리 "상세" 스펙 신규 구현.
--       카드 클릭 시 단일 JSONB(프로필·집계·최근영상5·최근결제5) 반환. 어드민 전용.
--       PII(payout_info 은행계좌·birthdate)는 원문 미노출 — has_payout_info 불리언만.
--
--   적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- [A-1] admin_search_videos — v.id 2차키 + search_path
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_search_videos(
  p_query TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',
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
SET search_path = public, pg_temp
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
    CASE
      WHEN v.views IS NULL THEN 0::BIGINT
      WHEN v.views::TEXT ~ '^[0-9]+$' THEN v.views::TEXT::BIGINT
      ELSE 0::BIGINT
    END AS views,
    COALESCE(v.price_standard, 0)::INTEGER AS price,
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
  ORDER BY v.created_at DESC, v.id DESC   -- 🔑 유니크 2차키
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- [A-2] admin_get_all_payments — pay.id 2차키 + search_path
-- ─────────────────────────────────────────────────────────────────────────────
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
SET search_path = public, pg_temp
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
  ORDER BY pay.created_at DESC, pay.id DESC   -- 🔑 유니크 2차키
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- [A-3] admin_get_activity_logs — l.id 2차키 + search_path
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_activity_logs(
  p_admin_id UUID DEFAULT NULL,
  p_action TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id           BIGINT,
  admin_id     UUID,
  admin_name   TEXT,
  admin_email  TEXT,
  action       TEXT,
  target_type  TEXT,
  target_id    TEXT,
  details      JSONB,
  created_at   TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    l.id,
    l.admin_id,
    p.display_name,
    u.email::TEXT,
    l.action,
    l.target_type,
    l.target_id,
    l.details,
    l.created_at
  FROM public.admin_logs l
  LEFT JOIN public.profiles p ON p.id = l.admin_id
  LEFT JOIN auth.users u ON u.id = l.admin_id
  WHERE
    (p_admin_id IS NULL OR l.admin_id = p_admin_id)
    AND (p_action IS NULL OR l.action = p_action)
  ORDER BY l.created_at DESC, l.id DESC   -- 🔑 유니크 2차키
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- [B] admin_get_user_detail(uuid) — 사용자 상세 (어드민 전용)
--   반환: { profile, stats, recent_videos[5], recent_payments[5] } 단일 JSONB
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_get_user_detail(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSONB;
BEGIN
  PERFORM public.assert_admin();
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION '존재하지 않는 사용자입니다 (id: %)', p_user_id;
  END IF;

  SELECT jsonb_build_object(
    'profile', (
      SELECT jsonb_build_object(
        'id',                      p.id,
        'email',                   u.email,
        'display_name',            p.display_name,
        'avatar_url',              p.avatar_url,
        'bio',                     p.bio,
        'subscription_tier',       p.subscription_tier,
        'subscription_started_at', p.subscription_started_at,
        'subscription_expires_at', p.subscription_expires_at,
        'is_admin',                COALESCE(p.is_admin, false),
        'is_suspended',            COALESCE(p.is_suspended, false),
        'suspended_reason',        p.suspended_reason,
        'suspended_at',            p.suspended_at,
        'tax_type',                p.tax_type,
        'business_number',         p.business_number,
        'business_name',           p.business_name,
        'has_payout_info',         (p.payout_info IS NOT NULL),
        'referral_code',           p.referral_code,
        'referral_count',          p.referral_count,
        'deletion_requested_at',   p.deletion_requested_at,
        'created_at',              p.created_at,
        'updated_at',              p.updated_at
      )
      FROM public.profiles p
      LEFT JOIN auth.users u ON u.id = p.id
      WHERE p.id = p_user_id
    ),
    'stats', jsonb_build_object(
      'videos_total',     (SELECT COUNT(*) FROM public.videos v WHERE v.creator_id = p_user_id),
      'videos_hidden',    (SELECT COUNT(*) FROM public.videos v WHERE v.creator_id = p_user_id AND v.is_hidden = true),
      'comments',         (SELECT COUNT(*) FROM public.comments c WHERE c.user_id = p_user_id),
      'posts',            (SELECT COUNT(*) FROM public.community_posts cp WHERE cp.user_id = p_user_id),
      'followers',        (SELECT COUNT(*) FROM public.creator_followers cf WHERE cf.creator_id = p_user_id),
      'following',        (SELECT COUNT(*) FROM public.creator_followers cf WHERE cf.follower_id = p_user_id),
      'orders_completed', (SELECT COUNT(*) FROM public.orders o WHERE o.buyer_id = p_user_id AND o.status = 'completed'),
      'payments_total',   (SELECT COALESCE(SUM(pay.amount), 0) FROM public.payments pay WHERE pay.user_id = p_user_id AND pay.status = 'completed'),
      'payments_count',   (SELECT COUNT(*) FROM public.payments pay WHERE pay.user_id = p_user_id)
    ),
    'recent_videos', COALESCE((
      SELECT jsonb_agg(x) FROM (
        SELECT v.id::TEXT AS id, v.title, v.thumbnail,
               COALESCE(v.is_hidden, false) AS is_hidden, v.visibility, v.created_at
        FROM public.videos v
        WHERE v.creator_id = p_user_id
        ORDER BY v.created_at DESC, v.id DESC
        LIMIT 5
      ) x
    ), '[]'::jsonb),
    'recent_payments', COALESCE((
      SELECT jsonb_agg(y) FROM (
        SELECT pay.id, pay.order_id, pay.payment_type, pay.amount, pay.status, pay.created_at
        FROM public.payments pay
        WHERE pay.user_id = p_user_id
        ORDER BY pay.created_at DESC, pay.id DESC
        LIMIT 5
      ) y
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 관리자 콘솔 전용 — anon 실행 회수(본문 assert_admin 최종 게이트)
REVOKE ALL ON FUNCTION public.admin_get_user_detail(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_user_detail(UUID) TO authenticated;

COMMENT ON FUNCTION public.admin_get_user_detail(UUID) IS
  '사용자 상세(어드민 전용) — 프로필·집계·최근영상/결제 단일 JSONB. payout_info 원문 미노출.';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- [A] 페이지 경계 중복 0 (영상/결제/로그 각각):
--   WITH a AS (SELECT id FROM public.admin_search_videos(NULL,'all',50,0)),
--        b AS (SELECT id FROM public.admin_search_videos(NULL,'all',50,50))
--   SELECT count(*) FROM a JOIN b USING (id);   -- 기대 0
--
--   -- [B] 상세 조회(관리자 세션, 임의 uid):
--   SELECT public.admin_get_user_detail('00000000-0000-0000-0000-000000000000');
--
--   -- search_path 인라인 고정 확인(4함수 전부 proconfig 에 search_path=...):
--   SELECT proname, proconfig FROM pg_proc
--    WHERE proname IN ('admin_search_videos','admin_get_all_payments',
--                      'admin_get_activity_logs','admin_get_user_detail');
-- ════════════════════════════════════════════════════════════════════════════
