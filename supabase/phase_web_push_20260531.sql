-- ════════════════════════════════════════════════════════════════════════════
-- 웹 푸시 구독 저장 (2026-05-31)
--
-- 브라우저/PWA의 Push 구독(endpoint + 키)을 저장. Edge Function(/send-push)이
-- service_role 로 조회해 web-push 발송. should_send_notification('push') 로 사용자
-- 환경설정 존중.
--
-- 적용: SQL Editor → 새 쿼리 → 붙여넣기 → Run. idempotent.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,   -- 기기별 고유 푸시 엔드포인트
  p256dh      text NOT NULL,          -- 구독 공개키
  auth        text NOT NULL,          -- 구독 인증 시크릿
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_sub_select_own" ON public.push_subscriptions;
CREATE POLICY "push_sub_select_own" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
-- INSERT/DELETE 는 아래 SECURITY DEFINER RPC 로만 (Edge 발송은 service_role 로 RLS 우회)

-- ── 구독 저장 (기기 단위 upsert) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_endpoint   TEXT,
  p_p256dh     TEXT,
  p_auth       TEXT,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  INSERT INTO public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  VALUES (auth.uid(), p_endpoint, p_p256dh, p_auth, p_user_agent)
  ON CONFLICT (endpoint) DO UPDATE
    SET user_id = auth.uid(), p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent;
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── 구독 해제 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.push_subscriptions
  WHERE endpoint = p_endpoint AND user_id = auth.uid();
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(TEXT) TO authenticated;
