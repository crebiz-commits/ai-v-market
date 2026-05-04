-- ════════════════════════════════════════════════════════════════════════════
-- 주문/결제 테이블 (영상 라이선스 판매 트래킹)
-- 적용 일자: 2026-05-02
--
-- 목적:
--   - 사용자가 영상 라이선스 구매 시 기록
--   - MyPage 구매 내역 + 판매자 매출 통계 + 정산 계산의 근거
--   - cart_items가 임시 장바구니라면, orders는 결제 완료 후 영구 기록
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 이 파일 내용 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. orders 테이블 생성 (이미 존재하면 누락된 컬럼만 추가)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 누락된 컬럼 보강 (기존 테이블이 이미 존재하는 경우 대비)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seller_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS video_id text REFERENCES public.videos(id) ON DELETE CASCADE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS license_type text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount integer;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_id text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- 기본값 + NOT NULL 제약 적용 (NULL은 기본값으로 백필 후 NOT NULL 강제)
UPDATE public.orders SET license_type = 'all-in-one' WHERE license_type IS NULL;
UPDATE public.orders SET status = 'completed' WHERE status IS NULL;
ALTER TABLE public.orders ALTER COLUMN license_type SET DEFAULT 'all-in-one';
ALTER TABLE public.orders ALTER COLUMN license_type SET NOT NULL;
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'completed';
ALTER TABLE public.orders ALTER COLUMN status SET NOT NULL;

-- CHECK 제약 (이미 있으면 스킵)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_license_type_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_license_type_check
      CHECK (license_type IN ('standard', 'commercial', 'extended', 'exclusive', 'all-in-one'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_status_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_status_check
      CHECK (status IN ('pending', 'completed', 'refunded', 'failed', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_amount_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_amount_check
      CHECK (amount IS NULL OR amount >= 0);
  END IF;
END$$;

-- ────────────────────────────────────────────────────────────────────────────
-- 인덱스
-- ────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON public.orders(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON public.orders(seller_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_video ON public.orders(video_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status, created_at DESC);

-- ────────────────────────────────────────────────────────────────────────────
-- updated_at 자동 갱신 트리거 (profiles와 같은 함수 재사용)
-- ────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- RLS 정책
--   - 본인 구매 내역 SELECT 가능 (buyer로서)
--   - 본인 영상의 판매 내역 SELECT 가능 (seller로서)
--   - INSERT/UPDATE는 service_role만 (결제 웹훅)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_select_own" ON public.orders;
CREATE POLICY "orders_select_own"
  ON public.orders FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- INSERT/UPDATE는 service_role만 가능 (RLS 자동 우회)
-- 일반 클라이언트가 결제 정보를 직접 수정 못 하게 차단

-- ────────────────────────────────────────────────────────────────────────────
-- 신규 주문 시 seller_id 자동 채움 (videos.creator_id에서 복사)
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_order_seller_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.seller_id IS NULL THEN
    SELECT creator_id INTO NEW.seller_id
    FROM public.videos
    WHERE id = NEW.video_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_set_seller_id ON public.orders;
CREATE TRIGGER orders_set_seller_id
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_seller_id();

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT count(*) FROM public.orders;  -- 0이어야 정상 (아직 결제 미연동)
--   \d public.orders                     -- 컬럼 구조 확인
-- ════════════════════════════════════════════════════════════════════════════
