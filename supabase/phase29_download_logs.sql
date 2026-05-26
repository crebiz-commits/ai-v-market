-- ════════════════════════════════════════════════════════════════════════════
-- Phase 29 — 라이선스 영상 다운로드 로그 + 권한 검증 RPC
-- 적용 일자: 2026-05-26
--
-- 목적:
--   라이선스 구매자가 영상 다운로드 시 누가/언제/어떤 브라우저로 다운받았는지
--   기록. 분쟁 발생 시 추적 근거 (저작권 위반·무단 공유 등).
--
-- 흐름:
--   1. 사용자가 MyPage → 구매 내역 → 다운로드 버튼 클릭
--   2. log_download(p_order_id) RPC 호출
--      - 권한 검증: 본인의 completed 주문인지
--      - download_logs 테이블에 INSERT
--      - video_id + 현재까지 다운로드 횟수 반환
--   3. 클라이언트가 반환된 video_id 로 Bunny mp4 URL 생성 후 다운로드 트리거
--
-- 보안 모델 (베타 MVP):
--   - 권한 검증은 SECURITY DEFINER RPC 에서 (orders.buyer_id = auth.uid())
--   - Bunny mp4 URL 자체는 public (Bunny Token Auth 는 출시 직전 적용 — pending 메모리)
--   - GUID 36자 영상 ID 라 URL 추측 어려움
--   - 다운로드 로그로 분쟁 시 추적 가능
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 이 파일 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1: download_logs 테이블
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.download_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  video_id      text NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_agent    text,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_download_logs_user_downloaded
  ON public.download_logs(user_id, downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_download_logs_video
  ON public.download_logs(video_id, downloaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_download_logs_order
  ON public.download_logs(order_id);

COMMENT ON TABLE public.download_logs IS
  '라이선스 구매자의 영상 다운로드 추적 로그 (분쟁 대비, 무단 공유 추적 근거)';

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2: RLS — 본인 다운로드 로그만 조회 가능. INSERT 는 SECURITY DEFINER RPC 만
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.download_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "download_logs_select_own" ON public.download_logs;
CREATE POLICY "download_logs_select_own"
  ON public.download_logs FOR SELECT
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- Step 3: 다운로드 권한 검증 + 로그 RPC
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.log_download(uuid, text);
CREATE OR REPLACE FUNCTION public.log_download(
  p_order_id uuid,
  p_user_agent text DEFAULT NULL
)
RETURNS TABLE (
  video_id text,
  download_count integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_video_id  text;
  v_count     integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- 권한 검증: 본인의 completed 주문인지
  SELECT o.video_id INTO v_video_id
  FROM public.orders o
  WHERE o.id = p_order_id
    AND o.buyer_id = v_user_id
    AND o.status = 'completed';

  IF v_video_id IS NULL THEN
    RAISE EXCEPTION '다운로드 권한이 없습니다 (주문이 없거나 결제 미완료)';
  END IF;

  -- 다운로드 로그 INSERT
  INSERT INTO public.download_logs (order_id, video_id, user_id, user_agent)
  VALUES (p_order_id, v_video_id, v_user_id, p_user_agent);

  -- 현재까지 다운로드 횟수 조회 (UI 표시용)
  SELECT COUNT(*) INTO v_count
  FROM public.download_logs
  WHERE order_id = p_order_id;

  RETURN QUERY SELECT v_video_id, v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_download(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.log_download IS
  '라이선스 구매자가 영상 다운로드 시 호출. 권한 검증 + 로그 INSERT + video_id 반환';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--
--   -- 1. 본인 구매 내역 확인 (다운로드 가능 주문)
--   SELECT id, video_id, status FROM public.orders
--   WHERE buyer_id = auth.uid() AND status = 'completed';
--
--   -- 2. 위 id 중 하나로 다운로드 시뮬레이션
--   SELECT * FROM public.log_download('<order_id_uuid>'::uuid, 'TestAgent');
--   -- → video_id + download_count 반환되어야 정상
--
--   -- 3. 본인 다운로드 로그 조회
--   SELECT * FROM public.download_logs WHERE user_id = auth.uid()
--   ORDER BY downloaded_at DESC LIMIT 10;
-- ════════════════════════════════════════════════════════════════════════════
