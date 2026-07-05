-- ════════════════════════════════════════════════════════════════════════════
-- 구독 상태 일관성 (2026-07-05) — 결제·구독 감사 P9/P8
--
--   P9(만료 판정 통일): expires_at NULL = 비구독으로 통일(정책 결정). 서버 재생게이트
--     (video-play-token)는 이미 NULL=비활성인데 is_subscriber()/AuthContext 는 NULL=구독자로
--     어긋나 UI 스플릿 발생. is_subscriber() 를 NULL=비활성으로 맞춤(AuthContext/SubscriptionPage
--     는 프론트에서 동일 수정). 영구 무료제공(관리자 컴프)은 NULL 대신 먼 미래 날짜로 명시.
--
--   P8(만료 강등자 billing 위생): reset_expired_subscriptions 가 profiles 만 free 로 내리고
--     billing_subscriptions.status='active' 죽은 row 를 남기던 것 → 해지(auto_renew=false)한
--     만료자의 billing row 도 canceled 로 정리.
--
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- P9: is_subscriber() — 만료일 NULL = 비구독
CREATE OR REPLACE FUNCTION public.is_subscriber(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id
      AND subscription_tier IN ('basic', 'premium')
      AND subscription_expires_at IS NOT NULL         -- P9: NULL = 비구독(서버 게이트와 일치)
      AND subscription_expires_at > now()
  );
$$ LANGUAGE sql STABLE;

-- P8: reset_expired_subscriptions — 강등과 동시에 해지자의 죽은 billing active row 정리
CREATE OR REPLACE FUNCTION public.reset_expired_subscriptions()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.profiles
  SET subscription_tier = 'free', updated_at = now()
  WHERE subscription_tier = 'premium'
    AND subscription_expires_at IS NOT NULL
    AND subscription_expires_at < now();
  GET DIAGNOSTICS n = ROW_COUNT;

  -- P8: 만료 강등된(이제 free) + 자동결제 해지자의 billing row 도 canceled 로 정리(죽은 active 제거)
  UPDATE public.billing_subscriptions b
  SET status = 'canceled', charging_at = NULL, updated_at = now()
  FROM public.profiles p
  WHERE b.user_id = p.id
    AND p.subscription_tier = 'free'
    AND b.status = 'active' AND b.auto_renew = false;

  RETURN n;
END; $$;

-- 크론 전용 유지(P0 REVOKE 보존)
REVOKE EXECUTE ON FUNCTION public.reset_expired_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_expired_subscriptions() TO service_role;

NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════════════════════
-- 참고(P11 정책): 구독료 인상 시 기존 구독자는 "가입가 고정(grandfather)". 이미 현행
--   동작(billing_subscriptions.amount 저장값으로 정기청구)이 이를 만족 → 코드 변경 없음.
--   신규가 적용이 필요해지면 한국 전자상거래법상 사전고지+동의 로직이 별도 필요.
-- 검증:
--   SELECT public.is_subscriber('<유저uuid>');  -- expires NULL 이면 false 여야
-- ════════════════════════════════════════════════════════════════════════════
