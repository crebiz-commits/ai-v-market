-- ════════════════════════════════════════════════════════════════════════════
-- set_my_auto_renew — 실패 구독 재개 회복 (2026-07-10)
--
--   버그: 3회 청구 실패로 status='failed' 가 된 구독을 사용자가 "재개"(set_my_auto_renew(true))
--         해도 기존 함수는 auto_renew 만 켜고 status 는 그대로 두었다. 스케줄러(billing_claim_due /
--         idx_billing_due)는 `auto_renew=true AND status='active'` 만 청구 대상으로 잡으므로,
--         status='failed' 인 채로는 크론이 영영 재청구하지 않는다(재개가 무효 = 사용자는 재개했다고
--         믿지만 결제가 재개되지 않음). SubscriptionPage 도 hasAutoBilling=false 라 "만료일"만 표시.
--   수정: 재개(p_on=true) 시 현재(구 값) status='failed' 이면 status='active' + fail_count=0 으로 되살려
--         다음 스케줄 실행에서 재청구되게 한다. (끄기/이미 active/canceled 는 그대로.)
--         한 UPDATE 문의 SET RHS 는 모두 갱신 전(OLD) 행 값을 참조하므로 두 CASE 가 동일한 구 status 를 본다.
--   적용: Supabase SQL Editor → Run (멱등). ※ 현재 payments_enabled=0 이라 라이브 영향 없음(결제 켤 때 대비).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.set_my_auto_renew(p_on BOOLEAN)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.billing_subscriptions
  SET auto_renew = p_on,
      -- 재개 시 실패로 멈춘 구독을 되살림 → 스케줄러(auto_renew AND status='active')가 재청구.
      status     = CASE WHEN p_on AND status = 'failed' THEN 'active' ELSE status END,
      fail_count = CASE WHEN p_on AND status = 'failed' THEN 0      ELSE fail_count END,
      updated_at = now()
  WHERE user_id = auth.uid();
  -- 끄면(p_on=false) 다음 결제만 중단, 현재 구독은 만료일까지 유지(status 불변).
END; $$;
GRANT EXECUTE ON FUNCTION public.set_my_auto_renew(BOOLEAN) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- 검증:
--   -- 실패 구독 재개 후 청구 대상이 되는지(테스트 계정):
--   -- UPDATE billing_subscriptions SET status='failed', auto_renew=false WHERE user_id='<uid>';
--   -- SELECT set_my_auto_renew(true);  (해당 유저 세션)
--   -- SELECT status, auto_renew, fail_count FROM billing_subscriptions WHERE user_id='<uid>';  -- active/true/0
