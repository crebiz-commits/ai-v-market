-- ════════════════════════════════════════════════════════════════════════════
-- 🔔 구독 만료 임박 알림 D-3/D-0 판정 KST 정합 (2026-07-24 전체감사 LOW)
--
--   notify_expiring_subscriptions 가 `subscription_expires_at::date - current_date`
--   (세션=UTC 기준)로 D-3/D-0 을 계산해, KST 새벽 만료 구독은 "오늘 만료"가 하루 어긋났다.
--   실제 강등(reset_expired_subscriptions)은 절대시각 비교(expires_at <= now())라 무관하고,
--   이 함수는 "달력일 인식"만 다루므로 KST 로 통일해도 강등과 불일치 없음
--   (admin_announce_challenge 등 다른 날짜판정과 동일 규칙). 본문·크론·디듀프 전부 동일 +
--   날짜차 계산 2곳만 KST(AT TIME ZONE 'Asia/Seoul')로 교체.
--   ★ notify_expiring_subscriptions 새 정본. subscription_expiry_notify_20260613.sql 재실행 금지.
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════
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
           ((p.subscription_expires_at AT TIME ZONE 'Asia/Seoul')::date
             - (now() AT TIME ZONE 'Asia/Seoul')::date) AS days_left     -- KST 달력일 기준
    FROM public.profiles p
    WHERE p.subscription_tier = 'premium'
      AND p.subscription_expires_at IS NOT NULL
      AND ((p.subscription_expires_at AT TIME ZONE 'Asia/Seoul')::date
            - (now() AT TIME ZONE 'Asia/Seoul')::date) IN (3, 0)          -- KST
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
      v_body  := '프리미엄이 ' || to_char(r.subscription_expires_at AT TIME ZONE 'Asia/Seoul', 'MM월 DD일') || '에 만료돼요. 미리 갱신해 주세요.';
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

-- 크론은 기존 등록(notify-expiring-subs, 0 1 * * *) 유지 — 함수 본문만 교체.

-- ── 검증 ──
SELECT 'notify_expiring_subscriptions KST 날짜판정' AS check_name,
  CASE WHEN (SELECT prosrc ~ 'Asia/Seoul' FROM pg_proc WHERE proname='notify_expiring_subscriptions')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
