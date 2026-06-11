-- ════════════════════════════════════════════════════════════════════════════
-- 자동결제(정기구독) 1단계: DB (2026-06-12)
--   토스 빌링키 기반 정기결제. billing_key 는 카드 청구 토큰(비밀)이라
--   클라이언트가 절대 못 읽게 RLS + REVOKE 로 이중 차단. 안전 컬럼만 RPC 로 노출.
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  billing_key    TEXT NOT NULL,          -- ⚠️ 토스 빌링키 (카드 청구 토큰 — 클라이언트 노출 절대 금지)
  customer_key   TEXT NOT NULL,          -- 토스 customerKey
  card_company   TEXT,                   -- 카드사 (표시용)
  card_last4     TEXT,                   -- 카드 끝 4자리 (표시용)
  auto_renew     BOOLEAN NOT NULL DEFAULT true,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','canceled','failed')),
  amount         INTEGER NOT NULL DEFAULT 4900,
  next_charge_at TIMESTAMPTZ,            -- 다음 자동청구 예정 시각 (= 현재 구독 만료일)
  last_charge_at TIMESTAMPTZ,
  fail_count     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 스케줄러용 부분 인덱스 (청구 대상만)
CREATE INDEX IF NOT EXISTS idx_billing_due
  ON public.billing_subscriptions(next_charge_at)
  WHERE auto_renew = true AND status = 'active';

-- ── 보안: 클라이언트 직접 접근 전면 차단 ──
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
-- RLS 정책을 하나도 안 만들면 authenticated 는 접근 불가 (service_role 만 우회).
-- 추가로 테이블 권한도 회수해 PostgREST 노출까지 차단 (빌링키 유출 방지).
REVOKE ALL ON public.billing_subscriptions FROM anon, authenticated;

-- ── 클라이언트용 안전 조회 RPC (billing_key 제외, 표시용 컬럼만) ──
CREATE OR REPLACE FUNCTION public.get_my_billing()
RETURNS TABLE (
  card_company   TEXT,
  card_last4     TEXT,
  auto_renew     BOOLEAN,
  status         TEXT,
  amount         INTEGER,
  next_charge_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT card_company, card_last4, auto_renew, status, amount, next_charge_at
  FROM public.billing_subscriptions
  WHERE user_id = auth.uid();
$$;
GRANT EXECUTE ON FUNCTION public.get_my_billing() TO authenticated;

-- ── 자동갱신 ON/OFF 토글 (해지/재개) ──
CREATE OR REPLACE FUNCTION public.set_my_auto_renew(p_on BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.billing_subscriptions
  SET auto_renew = p_on, updated_at = now()
  WHERE user_id = auth.uid();
  -- 끄면 다음 결제는 안 하지만 현재 구독은 만료일까지 유지됨.
END; $$;
GRANT EXECUTE ON FUNCTION public.set_my_auto_renew(BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';
