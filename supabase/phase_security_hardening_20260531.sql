-- ════════════════════════════════════════════════════════════════════════════
-- 보안 보강 1차 (2026-05-31) — 다중 점검 발견 C2/H2/H3/H4/H5 + M8
--
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 본 파일 붙여넣기 → Run
--       "Success. No rows returned" 이면 성공. 모두 idempotent.
-- ════════════════════════════════════════════════════════════════════════════

-- ── C2: profiles 민감 컬럼 공개 노출 차단 ────────────────────────────────────
-- profiles SELECT 정책이 USING(true)라 모든 컬럼(email/name/settlement_*/payout_info/
-- birthdate/business_* 등 PII 포함)이 anon/authenticated에 노출됨.
-- 주의: 테이블 단위 GRANT SELECT 가 있으면 컬럼단위 REVOKE 는 무효(테이블 grant가 덮음).
-- → 테이블 SELECT 를 통째로 회수하고, 공개 안전 컬럼만 다시 GRANT 한다.
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, display_name, avatar_url, banner_url, bio, subscription_tier, created_at)
  ON public.profiles TO anon, authenticated;

-- 본인 전체 프로필 조회 (AuthContext). SECURITY DEFINER로 본인 행 전체 반환 → 보호컬럼 우회 없이 본인만.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS public.profiles
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- 본인 정산계좌 조회용 (MyPage 카드/모달). SECURITY DEFINER로 본인 것만 반환.
CREATE OR REPLACE FUNCTION public.get_my_payout_info()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT payout_info FROM public.profiles WHERE id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_payout_info() TO authenticated;

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

-- ── H2: update_video_moderation 권한 축소 ────────────────────────────────────
-- SECURITY DEFINER인데 본문에 권한검증이 없어 authenticated 전체에 열려 있으면
-- 임의 유저가 타인 영상 모더레이션 상태를 위변조 가능. Edge Function은 service_role로
-- 호출하므로 authenticated 권한 회수.
REVOKE EXECUTE ON FUNCTION public.update_video_moderation(TEXT, INTEGER, JSONB, TEXT) FROM authenticated;

-- ── H3: get_my_revenue_history IDOR 차단 ─────────────────────────────────────
-- p_creator_id를 호출자가 임의 지정하면 타인 수익 조회 가능 → 항상 auth.uid()로 고정.
CREATE OR REPLACE FUNCTION public.get_my_revenue_history(
  p_creator_id UUID DEFAULT auth.uid()  -- 호환용. 본문은 auth.uid()만 사용(무시됨)
)
RETURNS TABLE (
  id                   BIGINT,
  period_start         DATE,
  period_end           DATE,
  sale_revenue         INTEGER,
  ad_revenue           INTEGER,
  subscription_revenue INTEGER,
  total_revenue        INTEGER,
  payout_status        TEXT,
  paid_at              TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT
    id, period_start, period_end,
    sale_revenue, ad_revenue, subscription_revenue, total_revenue,
    payout_status, paid_at
  FROM public.revenue_distributions
  WHERE creator_id = auth.uid()   -- IDOR 차단: 파라미터 무시, 항상 본인
  ORDER BY period_start DESC;
$$;

-- ── H4 + M8: 모더레이션 통과 시 is_hidden 해제 + admin_logs 기록 ──────────────
CREATE OR REPLACE FUNCTION public.resolve_moderation_flag(
  p_video_id TEXT,
  p_decision TEXT  -- 'pass' | 'reject'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  IF p_decision NOT IN ('pass', 'reject') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  UPDATE public.videos SET
    moderation_status = CASE p_decision WHEN 'pass' THEN 'passed' ELSE 'rejected' END,
    -- H4: pass 시 is_hidden=false 로 복원(기존엔 reject만 처리해 통과해도 숨김 잔존)
    is_hidden = CASE p_decision WHEN 'reject' THEN TRUE WHEN 'pass' THEN FALSE ELSE is_hidden END
  WHERE id = p_video_id;

  -- M8: 감사 로그 기록 (다른 어드민 변경 RPC와 일관)
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'resolve_moderation', 'video', p_video_id,
    jsonb_build_object('decision', p_decision));
END;
$$;

-- ── H5: 커뮤니티 글 복원 RPC 신설 (어드민 모더레이션 복원이 RLS에 막히던 것) ──
-- comment 복원은 기존 admin_unhide_comment(UUID) 사용. community_post 용은 부재 → 신설.
CREATE OR REPLACE FUNCTION public.admin_unhide_post(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();

  UPDATE public.community_posts
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
  WHERE id = p_post_id;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'unhide_post', 'community_post', p_post_id::TEXT, '{}'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_unhide_post(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--   -- C2: 아래는 권한오류여야 정상 (PostgREST/psql authenticated 롤 기준)
--   --   SELECT payout_info FROM profiles WHERE id <> auth.uid();  → permission denied
--   SELECT public.get_my_payout_info();           -- 본인 계좌 JSONB
--   -- H3: 임의 UUID 넣어도 본인 것만 나와야 함
--   SELECT * FROM public.get_my_revenue_history('00000000-0000-0000-0000-000000000000');
-- ────────────────────────────────────────────────────────────────────────────
