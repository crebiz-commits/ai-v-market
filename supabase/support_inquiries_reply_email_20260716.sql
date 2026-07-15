-- ════════════════════════════════════════════════════════════════════════════
-- 고객 문의 감사 — 답변 이메일 + 상태변경 감사로그 (2026-07-16)
--
--   [A] email_support_reply 컬럼 — 답변 시 고객에게 이메일도 발송(인앱만으론 사이트에
--       다시 안 들어오는 고객이 결제/환불 답변을 영영 못 봄). should_send 는 email 컬럼이
--       없으면 fail-closed(미발송)라, 발송되려면 컬럼(기본 true=발송)이 필요.
--       ⚠️ 인앱 알림은 admin_reply_support_inquiry RPC 가 이미 넣음 → Edge 는 이 타입의
--          인앱 삽입을 스킵(index.ts SKIP_EDGE_INAPP). 이메일만 Edge 담당.
--
--   [B] admin_set_support_status(uuid, text) — 상태(접수/답변완료/종료) 변경을 RPC 로
--       (기존 프론트 직접 UPDATE 는 admin_logs 미기록 → 감사추적 공백). update + 로깅.
--
--   적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── [A] 답변 이메일 opt-out 컬럼 (기본 발송) ─────────────────────────────────
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_support_reply BOOLEAN NOT NULL DEFAULT true;

-- ── [B] 상태 변경 RPC (관리자 전용 + 감사로그) ───────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_support_status(p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_subject text;
BEGIN
  PERFORM public.assert_admin();
  IF p_status NOT IN ('open', 'answered', 'closed') THEN
    RAISE EXCEPTION '허용되지 않는 상태입니다: %', p_status;
  END IF;

  UPDATE public.support_inquiries
    SET status = p_status, updated_at = now()
    WHERE id = p_id
    RETURNING subject INTO v_subject;
  IF v_subject IS NULL THEN RAISE EXCEPTION 'inquiry not found'; END IF;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'set_support_status', 'support_inquiry', p_id::text,
          jsonb_build_object('status', p_status, 'subject', v_subject));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_support_status(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- [A] 컬럼 존재(기본 true):
--   SELECT column_name, column_default FROM information_schema.columns
--   WHERE table_name='notification_preferences' AND column_name='email_support_reply';
--   -- [B] 관리자 세션: SELECT public.admin_set_support_status('<문의id>', 'closed');
--   --     → admin_logs 에 set_support_status 1행
-- ════════════════════════════════════════════════════════════════════════════
