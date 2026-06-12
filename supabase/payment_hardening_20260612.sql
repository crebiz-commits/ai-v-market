-- ════════════════════════════════════════════════════════════════════════════
-- 결제 보안 강화 (2026-06-12, 출시 전 감사 수정)
--   ① start_payment 서버측 금액 검증 — 클라이언트 위변조(₩4,900→₩100) 차단
--   ② 만료 구독 자동 강등 (premium→free) cron — DB tier 정합성
--   ③ 24시간+ pending 결제 자동 정리 cron — 데이터 누적 방지
-- 적용: Supabase SQL Editor → 새 쿼리 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① start_payment: 금액·대상 서버 검증 ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.start_payment(
  p_payment_type TEXT,
  p_amount INTEGER,
  p_target_id TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_order_id TEXT;
  v_price    INTEGER;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  IF p_payment_type NOT IN ('subscription', 'license', 'ad_budget') THEN
    RAISE EXCEPTION '알 수 없는 결제 종류: %', p_payment_type;
  END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION '결제 금액은 0보다 커야 합니다'; END IF;

  -- 서버측 금액 검증 (클라이언트가 보낸 금액을 신뢰하지 않음) — 위변조 차단
  IF p_payment_type = 'subscription' THEN
    SELECT value::integer INTO v_price FROM public.platform_settings WHERE key = 'subscription_price_krw';
    IF v_price IS NULL OR p_amount <> v_price THEN
      RAISE EXCEPTION '구독 금액이 정책과 일치하지 않습니다 (요청 %, 정책 %)', p_amount, v_price;
    END IF;
  ELSIF p_payment_type = 'license' THEN
    IF p_target_id IS NULL THEN RAISE EXCEPTION '대상 영상이 지정되지 않았습니다'; END IF;
    -- 영상의 실제 가격(standard/commercial/exclusive) 중 하나와 정확히 일치해야 함
    IF NOT EXISTS (
      SELECT 1 FROM public.videos v
      WHERE v.id = p_target_id::uuid
        AND p_amount IN (v.price_standard, v.price_commercial, v.price_exclusive)
    ) THEN
      RAISE EXCEPTION '라이선스 금액이 영상 가격과 일치하지 않습니다';
    END IF;
  END IF;
  -- ad_budget: ads 에 소유자 컬럼 없음(House Ads, 관리자 운영) + 미출시 기능 → amount>0 검증으로 충분

  v_order_id := 'creaite-' || p_payment_type || '-' || gen_random_uuid()::TEXT;
  INSERT INTO public.payments (order_id, user_id, payment_type, target_id, amount, status)
  VALUES (v_order_id, v_user_id, p_payment_type, p_target_id, p_amount, 'pending');
  RETURN v_order_id;
END;
$$;

-- ── ② 만료 구독 자동 강등 ─────────────────────────────────────────────────────
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
  RETURN n;
END; $$;

-- ── ③ 24시간+ pending 결제 자동 실패 처리 ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_stale_payments()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.payments
  SET status = 'failed', failure_reason = '자동 정리: 24시간 내 결제 승인 없음', updated_at = now()
  WHERE status = 'pending' AND created_at < now() - INTERVAL '24 hours';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

-- ── 크론 등록 (pg_cron 이미 활성) ─────────────────────────────────────────────
DO $$ BEGIN PERFORM cron.unschedule('reset-expired-subs');     EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('cleanup-stale-payments'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('reset-expired-subs',     '0 3 * * *',  'SELECT public.reset_expired_subscriptions();');
SELECT cron.schedule('cleanup-stale-payments', '30 2 * * *', 'SELECT public.cleanup_stale_payments();');
