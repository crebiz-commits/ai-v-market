-- ════════════════════════════════════════════════════════════════════════════
-- 어드민 결제 조회에 환불 사유 노출 (2026-05-31, R1 수정)
--
-- 문제:
--   admin_get_all_payments 가 refund_reason / refund_requested_at 를 반환하지 않아,
--   어드민이 환불 요청 승인 시 사용자가 입력한 환불 사유를 못 봄
--   (승인 프롬프트에 "사용자 사유: (없음)" + AdminPayments 행의 사유 박스 미표시).
--   phase_user_payment_history.sql 이 admin_refund_payment 만 갱신하고 이 조회 RPC는 누락.
--
-- 변경:
--   RETURNS TABLE 에 refund_reason, refund_requested_at 두 컬럼 추가 + SELECT 반영.
--   반환 타입 변경이라 CREATE OR REPLACE 불가 → DROP 후 재생성.
--   (클라이언트 AdminPayments.tsx 는 이미 두 필드를 PaymentRow 에 정의·참조 중)
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
--   → "Success. No rows returned" 이면 성공
-- ════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS public.admin_get_all_payments(TEXT, TEXT, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION public.admin_get_all_payments(
  p_status TEXT DEFAULT 'all',
  p_payment_type TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id                  BIGINT,
  order_id            TEXT,
  user_id             UUID,
  user_name           TEXT,
  user_email          TEXT,
  payment_type        TEXT,
  target_id           TEXT,
  amount              INTEGER,
  method              TEXT,
  status              TEXT,
  approved_at         TIMESTAMPTZ,
  failure_reason      TEXT,
  created_at          TIMESTAMPTZ,
  refund_reason       TEXT,
  refund_requested_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    pay.id,
    pay.order_id,
    pay.user_id,
    p.display_name,
    u.email::TEXT,
    pay.payment_type,
    pay.target_id,
    pay.amount,
    pay.method,
    pay.status,
    pay.approved_at,
    pay.failure_reason,
    pay.created_at,
    pay.refund_reason,
    pay.refund_requested_at
  FROM public.payments pay
  LEFT JOIN public.profiles p ON p.id = pay.user_id
  LEFT JOIN auth.users u ON u.id = pay.user_id
  WHERE
    (p_status = 'all' OR pay.status = p_status)
    AND (p_payment_type = 'all' OR pay.payment_type = p_payment_type)
  ORDER BY pay.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--   SELECT order_id, status, refund_reason, refund_requested_at
--   FROM public.admin_get_all_payments('refund_requested', 'all', 10, 0);
--   → refund_reason 에 사용자 입력 사유가 보이면 성공
-- ────────────────────────────────────────────────────────────────────────────
