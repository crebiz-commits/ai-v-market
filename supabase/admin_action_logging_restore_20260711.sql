-- ════════════════════════════════════════════════════════════════════════════
-- 관리자 액션 감사로깅 복원 (2026-07-11)
--
--   문제: 라이브 DB의 admin_suspend_user·admin_hide_video 등 6개 관리자 액션 함수가
--         phase10_6(무로깅) 버전으로 적용돼 있어, 정지/권한변경/영상숨김·삭제가
--         admin_logs(활동 로그)에 기록되지 않음(_verify_admin_audit #3·#4 = false).
--   왜 phase10_7 전체를 못 돌리나: phase10_7 안의 옛 admin_refund_payment(RETURNS VOID)가
--         현재 라이브 정본(refund_settlement_reversal_20260703.sql, 반환타입 다름)과 충돌 →
--         "cannot change return type" 로 전체 트랜잭션 롤백.
--   해결: 로깅 6개 함수만 여기서 CREATE OR REPLACE(반환타입 동일 VOID → 충돌 없음).
--         admin_refund_payment 는 건드리지 않음(이미 정본). SET search_path 로 하드닝 유지.
--   적용: Supabase SQL Editor → Run (멱등). 이후 _verify_admin_audit_20260711.sql 재실행 → 6행 true.
-- ════════════════════════════════════════════════════════════════════════════

-- 사용자 정지 (로깅)
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
  p_user_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION '본인은 정지할 수 없습니다';
  END IF;
  UPDATE public.profiles
  SET is_suspended = true,
      suspended_reason = COALESCE(p_reason, '관리자 정지'),
      suspended_at = now(),
      updated_at = now()
  WHERE id = p_user_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'suspend_user', 'user', p_user_id::TEXT,
    jsonb_build_object('reason', p_reason));
END;
$$;

-- 사용자 정지 해제 (로깅)
CREATE OR REPLACE FUNCTION public.admin_unsuspend_user(p_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.profiles
  SET is_suspended = false, suspended_reason = NULL, suspended_at = NULL, updated_at = now()
  WHERE id = p_user_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'unsuspend_user', 'user', p_user_id::TEXT, '{}'::jsonb);
END;
$$;

-- 영상 숨김 (로깅)
CREATE OR REPLACE FUNCTION public.admin_hide_video(
  p_video_id TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.videos
  SET is_hidden = true,
      hidden_reason = COALESCE(p_reason, '관리자 강제 숨김'),
      hidden_at = now()
  WHERE id = p_video_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'hide_video', 'video', p_video_id,
    jsonb_build_object('reason', p_reason));
END;
$$;

-- 영상 복원 (로깅)
CREATE OR REPLACE FUNCTION public.admin_unhide_video(p_video_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.videos
  SET is_hidden = false, hidden_reason = NULL, hidden_at = NULL
  WHERE id = p_video_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'unhide_video', 'video', p_video_id, '{}'::jsonb);
END;
$$;

-- 영상 삭제 (로깅)
CREATE OR REPLACE FUNCTION public.admin_delete_video(p_video_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_title TEXT;
BEGIN
  PERFORM public.assert_admin();
  SELECT title INTO v_title FROM public.videos WHERE id = p_video_id;
  DELETE FROM public.videos WHERE id = p_video_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'delete_video', 'video', p_video_id,
    jsonb_build_object('title', v_title));
END;
$$;

-- 어드민 권한 변경 (로깅)
CREATE OR REPLACE FUNCTION public.admin_set_admin_role(
  p_user_id UUID,
  p_is_admin BOOLEAN
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  IF p_user_id = auth.uid() AND p_is_admin = false THEN
    RAISE EXCEPTION '본인의 어드민 권한은 회수할 수 없습니다 (다른 어드민이 처리 필요)';
  END IF;
  UPDATE public.profiles
  SET is_admin = p_is_admin, updated_at = now()
  WHERE id = p_user_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'set_admin_role', 'user', p_user_id::TEXT,
    jsonb_build_object('is_admin', p_is_admin));
END;
$$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   SELECT proname, pg_get_functiondef(oid) ILIKE '%admin_logs%' AS logs
--     FROM pg_proc
--     WHERE proname IN ('admin_suspend_user','admin_unsuspend_user','admin_hide_video',
--                       'admin_unhide_video','admin_delete_video','admin_set_admin_role');
--   -- 6행 모두 logs=true 여야 함. 이후 _verify_admin_audit_20260711.sql 재실행.
