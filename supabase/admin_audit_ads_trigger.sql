-- ════════════════════════════════════════════════════════════════════════════
-- 어드민 광고 관리 활동 로그 (2026-05-24)
--
-- 목적:
--   AdminDashboard에서 어드민이 ads 테이블을 직접 INSERT/UPDATE/DELETE 할 때
--   admin_logs 에 자동 기록 (감사 추적용).
--   현재 광고 관리는 RPC 없이 supabase.from("ads").insert/.update/.delete 직접 호출 →
--   admin_logs 기록이 누락되어 있던 갭을 트리거로 보완.
--
-- 동작:
--   - AFTER INSERT/UPDATE/DELETE 트리거 ads 테이블에 등록
--   - 트리거 함수에서 auth.uid() 의 is_admin 체크
--   - 어드민일 때만 admin_logs INSERT
--   - 시스템 RPC(노출/클릭/spent_krw 차감) 호출자는 시청자라서 is_admin=false → skip
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.log_ads_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  -- 시스템 컨텍스트(auth.uid() NULL) 또는 비어드민 변경은 skip
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT is_admin INTO v_is_admin FROM public.profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    -- 시청자가 RPC를 통해 spent_krw/impressions/clicks 차감하는 경우 등
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (
      auth.uid(),
      'create_ad',
      'ad',
      NEW.id::TEXT,
      jsonb_build_object(
        'title',      NEW.title,
        'advertiser', NEW.advertiser,
        'budget_krw', NEW.budget_krw,
        'is_active',  NEW.is_active,
        'starts_at',  NEW.starts_at,
        'ends_at',    NEW.ends_at
      )
    );
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (
      auth.uid(),
      'update_ad',
      'ad',
      NEW.id::TEXT,
      jsonb_build_object(
        'title',           NEW.title,
        'is_active_old',   OLD.is_active,
        'is_active_new',   NEW.is_active,
        'budget_krw_old',  OLD.budget_krw,
        'budget_krw_new',  NEW.budget_krw,
        'starts_at_old',   OLD.starts_at,
        'starts_at_new',   NEW.starts_at,
        'ends_at_old',     OLD.ends_at,
        'ends_at_new',     NEW.ends_at
      )
    );
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (
      auth.uid(),
      'delete_ad',
      'ad',
      OLD.id::TEXT,
      jsonb_build_object(
        'title',       OLD.title,
        'advertiser',  OLD.advertiser,
        'impressions', OLD.impressions,
        'clicks',      OLD.clicks,
        'budget_krw',  OLD.budget_krw,
        'spent_krw',   OLD.spent_krw
      )
    );
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.log_ads_changes() IS
  '어드민이 ads 테이블 INSERT/UPDATE/DELETE 시 admin_logs 자동 기록. 시스템 RPC(노출/클릭/spent_krw 차감)는 비어드민 호출이라 skip';

DROP TRIGGER IF EXISTS trg_log_ads_changes ON public.ads;
CREATE TRIGGER trg_log_ads_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.ads
  FOR EACH ROW
  EXECUTE FUNCTION public.log_ads_changes();

-- ────────────────────────────────────────────────────────────────────────────
-- 검증 쿼리 (실행 후 별도 확인)
--
--   -- 1. 트리거 등록 확인
--   SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_log_ads_changes';
--
--   -- 2. 광고 등록 테스트 후 로그 확인
--   SELECT created_at, action, target_id, details
--   FROM public.admin_logs
--   WHERE action LIKE '%_ad'
--   ORDER BY created_at DESC LIMIT 10;
--
--   -- 3. 시청자가 광고 노출 트리거할 때 로그가 안 남는지 확인
--   --    (record_ad_impression 호출 → admin_logs 변화 없음 확인)
-- ────────────────────────────────────────────────────────────────────────────
