-- ════════════════════════════════════════════════════════════════════════════
-- 👤 표시 이름 해석 SSOT + 관리자 목록 4종 적용 (2026-07-22)
--
--   [증상] 관리자 → 사용자 관리 목록에서 대부분의 회원이 "이름 없음"으로 표시됨.
--     프로필 사진은 정상이라 "이름만 유독 비는" 형태였다(2026-07-22 발견).
--
--   [원인] 소셜 로그인(구글·카카오) 가입자는 이름이 profiles.display_name 이 아니라
--     auth.users.raw_user_meta_data->>'name' 에 들어온다. 가입 시 아바타는 프로필로
--     복사되지만 이름은 복사되지 않아 display_name 이 비어 있다.
--     그런데 관리자 목록 RPC 들은 p.display_name 만 읽어 전부 NULL → "이름 없음".
--     ※ 채널 페이지(get_creator_profile)는 폴백 체인을 갖고 있어 이름이 정상 표시된다
--       → 같은 사람이 화면마다 다른 이름으로 보이는 상태였다.
--
--   [같은 유형 3번째] 이 프로젝트에서 반복된 결함이다:
--     · 2026-07-21 새 팔로워 알림이 "누군가님이…" (Edge, display_name 만 읽음)
--     · 2026-07-22 관리자 사용자 목록 "이름 없음" (이 파일)
--     → 매번 COALESCE 를 복붙하는 대신 **해석 규칙을 함수 하나로 고정**한다.
--
--   [해결]
--     ① public.resolve_display_name(uuid) 신설 = 표시 이름 해석 SSOT.
--        폴백 순서는 채널 페이지(get_creator_profile, channel_feed_audit_20260709)와 동일:
--          profiles.display_name → auth 메타 name → full_name → NULL
--        ※ 마지막을 'AI Creator' 가 아니라 NULL 로 둔다 — 관리자 화면에서는 "진짜 이름이
--          없음"과 "폴백된 이름"이 구분돼야 하므로, 표시 문구는 UI 가 정한다.
--     ② 관리자 RPC 4종이 이 함수를 쓰도록 교체(아바타도 같은 방식으로 메타 폴백):
--          admin_search_users / admin_get_all_payments
--          admin_get_activity_logs / admin_get_user_detail
--        검색(p_query)도 폴백된 이름으로 매칭 → 소셜 가입자를 이름으로 찾을 수 있다.
--
--   ▣ 본문은 원본 2파일에서 **스크립트로 추출·치환**해 생성했다(수기 전사 없음).
--     치환은 각 1회만 적용됐음을 스크립트가 단언. 그 외 로직(assert_admin 게이트,
--     결정적 정렬 tiebreaker, search_path, 필터)은 100% 원본 그대로다.
--
--   ★ 이 파일이 위 4함수의 새 정본.
--     admin_users_pagination_tiebreaker_20260715.sql (admin_search_users) 와
--     admin_users_siblings_and_detail_20260715.sql (나머지 3종) 의 해당 함수
--     재실행 금지 — 이름 폴백이 사라져 "이름 없음"으로 회귀한다.
--     (두 파일의 정렬 tiebreaker·search_path 수정 자체는 여기 그대로 보존돼 있다)
--
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 0) 표시 이름 해석 SSOT ────────────────────────────────────────────────────
--   auth.users 를 읽어야 하므로 SECURITY DEFINER. 이름이 어디에도 없으면 NULL 반환.
CREATE OR REPLACE FUNCTION public.resolve_display_name(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $rdn$
  SELECT COALESCE(
    NULLIF(pr.display_name, ''),
    NULLIF(u.raw_user_meta_data->>'name', ''),
    NULLIF(u.raw_user_meta_data->>'full_name', '')
  )
  FROM auth.users u
  LEFT JOIN public.profiles pr ON pr.id = u.id
  WHERE u.id = p_user_id;
$rdn$;

-- 직접 호출은 막는다 — 관리자 RPC(SECURITY DEFINER, 소유자 postgres)가 내부에서만 쓴다.
REVOKE ALL ON FUNCTION public.resolve_display_name(UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.resolve_display_name(UUID) IS
  '표시 이름 해석 SSOT — display_name → auth 메타 name → full_name → NULL. 소셜 로그인 가입자는 display_name 이 비어 있어 이 폴백이 필요하다.';

-- ── 1~4) 관리자 RPC 4종 (원본에서 생성, 이름·아바타 폴백만 치환) ──────────────
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
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    p.id,
    u.email::TEXT,
    public.resolve_display_name(p.id),
    COALESCE(NULLIF(p.avatar_url,''), NULLIF(u.raw_user_meta_data->>'avatar_url',''), NULLIF(u.raw_user_meta_data->>'picture','')),
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
       public.resolve_display_name(p.id) ILIKE '%' || p_query || '%' OR
       u.email ILIKE '%' || p_query || '%')
    AND (
      p_filter = 'all'
      OR (p_filter = 'premium'   AND p.subscription_tier = 'premium')
      OR (p_filter = 'suspended' AND p.is_suspended = true)
      OR (p_filter = 'admins'    AND p.is_admin = true)
    )
  ORDER BY p.created_at DESC, p.id DESC   -- 🔑 유니크 2차키 → 결정적 페이지네이션
  LIMIT p_limit OFFSET p_offset;
END;
$$;

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
    public.resolve_display_name(pay.user_id),
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
    public.resolve_display_name(l.admin_id),
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
        'display_name',            public.resolve_display_name(p.id),
        'avatar_url',              COALESCE(NULLIF(p.avatar_url,''), NULLIF(u.raw_user_meta_data->>'avatar_url',''), NULLIF(u.raw_user_meta_data->>'picture','')),
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
      -- 합계·건수 모두 'completed' 기준으로 통일 — "누적 결제 ₩X (N건)" 의 X 와 N 이 같은 집합이라야 함
      -- (실패/취소/환불 건이 건수에만 섞여 우량 사용자로 오판되던 결함, 2026-07-15 재감사)
      'payments_total',   (SELECT COALESCE(SUM(pay.amount), 0) FROM public.payments pay WHERE pay.user_id = p_user_id AND pay.status = 'completed'),
      'payments_count',   (SELECT COUNT(*) FROM public.payments pay WHERE pay.user_id = p_user_id AND pay.status = 'completed')
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

-- ── 권한 재확인(멱등) — CREATE OR REPLACE 는 기존 GRANT 를 보존하나 세트로 명시 ──
REVOKE ALL ON FUNCTION public.admin_search_users(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_users(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '이름 해석 SSOT 존재' AS check_name,
  CASE WHEN to_regprocedure('public.resolve_display_name(uuid)') IS NOT NULL
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT 'RPC 4종이 폴백 함수 사용',
  CASE WHEN (SELECT count(*) FROM pg_proc
             WHERE proname IN ('admin_search_users','admin_get_all_payments',
                               'admin_get_activity_logs','admin_get_user_detail')
               AND prosrc LIKE '%resolve_display_name%') = 4
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '관리자 게이트(assert_admin) 보존',
  CASE WHEN (SELECT bool_and(prosrc LIKE '%assert_admin%') FROM pg_proc
             WHERE proname IN ('admin_search_users','admin_get_all_payments',
                               'admin_get_activity_logs','admin_get_user_detail'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '결정적 정렬 tiebreaker 보존',
  CASE WHEN (SELECT bool_and(prosrc LIKE '%id DESC%') FROM pg_proc
             WHERE proname IN ('admin_search_users','admin_get_all_payments','admin_get_activity_logs'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'resolve_display_name anon/authenticated 비노출',
  CASE WHEN NOT has_function_privilege('anon', 'public.resolve_display_name(uuid)', 'EXECUTE')
        AND NOT has_function_privilege('authenticated', 'public.resolve_display_name(uuid)', 'EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'RETURNS TABLE 모호성 없음(별칭 유지)',
  CASE WHEN (SELECT bool_and(prosrc NOT LIKE '%WHERE lower(email)%') FROM pg_proc
             WHERE proname IN ('admin_search_users','admin_get_all_payments',
                               'admin_get_activity_logs','admin_get_user_detail'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
