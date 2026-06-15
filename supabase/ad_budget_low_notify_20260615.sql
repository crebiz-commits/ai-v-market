-- ════════════════════════════════════════════════════════════════════════════
-- 광고 예산 부족 알림 (ad_budget_low) — 2026-06-15
--   광고주 셀프서비스(owner_id) 도입으로 수신자가 생겨 구현 가능해짐.
--   예산의 80% 소진 시 광고주에게 1회 벨 알림. 충전(budget 증가) 시 플래그 리셋.
-- 적용: SQL Editor → Run. 멱등 재실행 안전.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.ads ADD COLUMN IF NOT EXISTS budget_low_notified boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.tg_ad_budget_low_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- 예산 충전(증가) 시 알림 플래그 리셋 → 다음 소진 때 다시 알림
  IF COALESCE(NEW.budget_krw,0) > COALESCE(OLD.budget_krw,0) THEN
    NEW.budget_low_notified := false;
  END IF;

  -- 광고주 광고 + 예산 80% 도달 + 아직 알림 안 함 → 1회 알림
  IF NEW.owner_id IS NOT NULL
     AND COALESCE(NEW.budget_krw,0) > 0
     AND NEW.spent_krw >= NEW.budget_krw * 0.8
     AND NOT NEW.budget_low_notified THEN
    NEW.budget_low_notified := true;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.owner_id, 'system', '광고 예산이 곧 소진돼요 ⚡',
      '「' || COALESCE(NEW.title,'광고') || '」 예산의 약 ' ||
      round(NEW.spent_krw::numeric / NULLIF(NEW.budget_krw,0) * 100) || '% 가 소진됐어요. 충전하면 노출이 계속됩니다.',
      '/?tab=advertiser');
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ads_budget_low_notify ON public.ads;
CREATE TRIGGER ads_budget_low_notify
  BEFORE UPDATE OF spent_krw, budget_krw ON public.ads
  FOR EACH ROW EXECUTE FUNCTION public.tg_ad_budget_low_notify();
