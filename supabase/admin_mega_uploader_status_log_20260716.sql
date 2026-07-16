-- ════════════════════════════════════════════════════════════════════════════
-- 메가 업로더 이벤트 감사 — 지급상태 변경 감사로그 RPC + 조회 RPC 하드닝 (2026-07-16)
--
--   [갭1] AdminMegaUploader.tsx 가 upload_milestones.status 를 프론트에서 직접 UPDATE
--     (RLS upload_milestones_admin 허용) → admin_logs 무기록. "지급완료"는 메가커피
--     3만원권 지급 기록 = 금전 이벤트라 "누가 언제 어느 달성자를 지급/취소했는지" 감사
--     추적이 필수(형제 페이지 문의·컬렉션은 이미 로깅). → RPC 전환.
--   [갭2] admin_list_upload_milestones 가 기본 PUBLIC EXECUTE 의존(본문 assert_admin 이
--     최종 게이트라 creator_email PII 유출은 없으나, 하드닝 패턴과 비일관). → 회수.
--
--   보안: SECURITY DEFINER + inline search_path(게이트 #9 무WARN), assert_admin 게이트,
--         PUBLIC/anon REVOKE, authenticated GRANT.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_set_milestone_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid; v_milestone integer;
BEGIN
  PERFORM public.assert_admin();
  IF p_status NOT IN ('pending', 'coupon_sent') THEN
    RAISE EXCEPTION '허용되지 않는 상태입니다: %', p_status;
  END IF;

  UPDATE public.upload_milestones
    SET status = p_status,
        rewarded_at = CASE WHEN p_status = 'coupon_sent' THEN now() ELSE NULL END
    WHERE id = p_id
    RETURNING user_id, milestone INTO v_user, v_milestone;
  IF v_user IS NULL THEN RAISE EXCEPTION '달성 기록을 찾을 수 없습니다'; END IF;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'set_milestone_status', 'upload_milestone', p_id::text,
          jsonb_build_object('status', p_status, 'user_id', v_user::text, 'milestone', v_milestone));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_milestone_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_milestone_status(uuid, text) TO authenticated;

-- 조회 RPC 하드닝 — PUBLIC/anon EXECUTE 회수(assert_admin 은 그대로 최종 게이트)
REVOKE ALL ON FUNCTION public.admin_list_upload_milestones() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_upload_milestones() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   SELECT public.admin_set_milestone_status('<milestone id>', 'coupon_sent');
--   SELECT action, details FROM public.admin_logs
--     WHERE action='set_milestone_status' ORDER BY created_at DESC LIMIT 3;
-- ════════════════════════════════════════════════════════════════════════════
