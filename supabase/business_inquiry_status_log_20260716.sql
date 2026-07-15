-- ════════════════════════════════════════════════════════════════════════════
-- 비즈니스 문의 감사 — 상태변경 감사로그 RPC (2026-07-16)
--
--   [결함/갭] AdminInquiries.tsx 가 business_inquiries.status 를 프론트에서 직접
--     UPDATE(RLS admin UPDATE 허용) → admin_logs 에 기록이 남지 않아 "누가 언제 어떤
--     문의를 어떤 상태로 바꿨는지" 감사추적이 없음. 형제 페이지 고객 문의는
--     admin_set_support_status 로 로깅하는데 비즈니스만 빠져 비일관.
--   [수정] admin_set_inquiry_status(uuid, text) — assert_admin + 상태검증 + UPDATE +
--     admin_logs 기록. 프론트는 직접 UPDATE 대신 이 RPC 호출로 전환.
--     (RLS UPDATE 정책은 폴백으로 유지 — SECURITY DEFINER RPC 가 정규 경로)
--
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_set_inquiry_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_company text; v_category text;
BEGIN
  PERFORM public.assert_admin();
  IF p_status NOT IN ('new', 'reviewing', 'replied', 'closed') THEN
    RAISE EXCEPTION '허용되지 않는 상태입니다: %', p_status;
  END IF;

  UPDATE public.business_inquiries
    SET status = p_status, reviewed_at = now()
    WHERE id = p_id
    RETURNING company_name, category INTO v_company, v_category;
  -- company_name 은 NOT NULL → NULL 이면 해당 문의 없음
  IF v_company IS NULL THEN RAISE EXCEPTION 'inquiry not found'; END IF;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'set_inquiry_status', 'business_inquiry', p_id::text,
          jsonb_build_object('status', p_status, 'company', v_company, 'category', v_category));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_inquiry_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_inquiry_status(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   SELECT public.admin_set_inquiry_status('<문의id>', 'reviewing');
--   → business_inquiries.status 변경 + admin_logs 에 set_inquiry_status 1행
-- ════════════════════════════════════════════════════════════════════════════
