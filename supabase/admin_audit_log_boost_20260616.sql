-- ════════════════════════════════════════════════════════════════════════════
-- 어드민 감사로그 보강 (2026-06-16)
--   admin_review_ad(광고 승인/반려)가 admin_logs 를 남기지 않아 감사 추적 불가 →
--   승인/반려 시 admin_logs 기록 추가. (어드민 책임추적성)
-- 적용: SQL Editor → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_review_ad(p_ad_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_owner uuid; v_title text; v_status text;
BEGIN
  PERFORM public.assert_admin();
  SELECT owner_id, title INTO v_owner, v_title FROM public.ads WHERE id = p_ad_id;
  IF NOT FOUND THEN RAISE EXCEPTION '존재하지 않는 광고입니다'; END IF;

  v_status := CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END;
  UPDATE public.ads
  SET status = v_status, review_note = p_note, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = p_ad_id;

  -- 광고주 알림 (벨)
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (v_owner, 'system',
      CASE WHEN p_approve THEN '광고가 승인되었어요 ✅' ELSE '광고가 반려되었어요' END,
      '「' || COALESCE(v_title,'광고') || '」' ||
      CASE WHEN p_approve THEN ' — 예산을 충전하면 노출이 시작됩니다.'
           ELSE ' — 사유: ' || COALESCE(p_note,'정책 미충족') END,
      '/?tab=advertiser');
  END IF;

  -- 감사로그 (어드민 책임추적)
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(),
          CASE WHEN p_approve THEN 'ad_approve' ELSE 'ad_reject' END,
          'ad', p_ad_id::text,
          jsonb_build_object('title', v_title, 'owner', v_owner, 'note', p_note));
END;
$function$;
