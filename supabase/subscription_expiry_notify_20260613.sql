-- ════════════════════════════════════════════════════════════════════════════
-- 구독 만료 임박 알림 (2026-06-13, 감사 R4① 잔여 보완)
--   자동결제(빌링키)는 billing-run 이 만료 1일 전 자동 청구하므로 대상 아님.
--   문제는 "자동갱신을 안 하는" 프리미엄 사용자:
--     ① 단건 결제자(빌링 구독 row 없음)
--     ② 자동갱신 OFF (set_my_auto_renew(false))
--     ③ 카드 3회 실패로 자동결제 중단(status='failed', auto_renew=false)
--   → 이들은 만료 임박 알림 없이 reset_expired_subscriptions(03:00) 에 조용히 강등됨.
--   이 크론이 D-3 / 당일(D-0) 인앱 알림을 보내 수동 갱신을 유도한다.
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ── 만료 임박 알림 발송 (D-3 / 당일) ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_expiring_subscriptions()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  n     integer := 0;
  r     RECORD;
  v_title text;
  v_body  text;
BEGIN
  FOR r IN
    SELECT p.id,
           p.subscription_expires_at,
           (p.subscription_expires_at::date - current_date) AS days_left
    FROM public.profiles p
    WHERE p.subscription_tier = 'premium'
      AND p.subscription_expires_at IS NOT NULL
      -- D-3(3일 후 만료) 또는 당일(오늘 만료)만
      AND (p.subscription_expires_at::date - current_date) IN (3, 0)
      -- 자동결제가 정상 예약된 사용자는 제외 (billing-run 이 만료 1일 전 자동 청구)
      AND NOT EXISTS (
        SELECT 1 FROM public.billing_subscriptions b
        WHERE b.user_id = p.id
          AND b.auto_renew = true
          AND b.status = 'active'
      )
  LOOP
    IF r.days_left = 0 THEN
      v_title := '오늘 구독이 만료돼요';
      v_body  := '프리미엄이 오늘 만료됩니다. 지금 갱신하면 광고 없이 계속 즐길 수 있어요.';
    ELSE
      v_title := '구독 만료 3일 전';
      v_body  := '프리미엄이 ' || to_char(r.subscription_expires_at, 'MM월 DD일') || '에 만료돼요. 미리 갱신해 주세요.';
    END IF;

    -- 중복 방지: 같은 알림을 최근 20시간 내 이미 보냈으면 skip (크론 재실행·경계 반올림 대비)
    IF NOT EXISTS (
      SELECT 1 FROM public.notifications nt
      WHERE nt.user_id = r.id
        AND nt.title = v_title
        AND nt.created_at > now() - INTERVAL '20 hours'
    ) THEN
      INSERT INTO public.notifications (user_id, type, title, body, link)
      VALUES (r.id, 'system', v_title, v_body, '/?tab=subscription');
      n := n + 1;
    END IF;
  END LOOP;

  RETURN n;
END; $$;

-- ── 크론 등록 (pg_cron 이미 활성) ─────────────────────────────────────────────
--   01:00 UTC(10:00 KST) — billing-run(02:00)·reset-expired(03:00) 보다 먼저 실행해
--   강등 전에 알림이 나가도록 함.
DO $$ BEGIN PERFORM cron.unschedule('notify-expiring-subs'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('notify-expiring-subs', '0 1 * * *', 'SELECT public.notify_expiring_subscriptions();');

-- 확인: SELECT jobname, schedule, active FROM cron.job WHERE jobname='notify-expiring-subs';
-- 수동 테스트: SELECT public.notify_expiring_subscriptions();