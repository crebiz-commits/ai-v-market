-- =============================================
-- CREAITE: 광고 관리 테이블
-- Supabase Dashboard > SQL Editor에서 실행
-- =============================================

CREATE TABLE IF NOT EXISTS public.ads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,                         -- 광고명 (관리용)
  advertiser    text NOT NULL DEFAULT '',              -- 광고주명
  image_url     text,                                  -- 이미지 광고 URL
  video_url     text,                                  -- Bunny.net HLS URL (m3u8)
  thumbnail_url text,                                  -- 동영상 광고 썸네일
  link_url      text NOT NULL DEFAULT '',              -- 클릭 시 이동 URL
  cta_text      text NOT NULL DEFAULT '자세히 보기',   -- CTA 버튼 텍스트
  interval_count integer NOT NULL DEFAULT 4,          -- 몇 영상마다 광고 1회 노출
  is_active     boolean NOT NULL DEFAULT true,
  starts_at     timestamptz,                           -- 노출 시작일 (null = 즉시)
  ends_at       timestamptz,                           -- 노출 종료일 (null = 무기한)
  impressions   bigint NOT NULL DEFAULT 0,             -- 누적 노출수
  clicks        bigint NOT NULL DEFAULT 0,             -- 누적 클릭수
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS set_ads_updated_at ON public.ads;
CREATE TRIGGER set_ads_updated_at
  BEFORE UPDATE ON public.ads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS 정책
ALTER TABLE public.ads ENABLE ROW LEVEL SECURITY;

-- 누구나 활성 광고 조회 가능
CREATE POLICY "Anyone can view active ads"
  ON public.ads FOR SELECT
  USING (
    is_active = true
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at   IS NULL OR ends_at   >= now())
  );

-- 관리자만 모든 광고 조회/수정/삭제 가능
-- (Supabase Dashboard에서 관리자 이메일을 직접 설정하거나 admin 역할 사용)
CREATE POLICY "Admin full access"
  ON public.ads FOR ALL
  USING (
    auth.uid() IN (
      SELECT id FROM auth.users
      WHERE email IN (
        -- 여기에 관리자 이메일 추가
        'admin@ai-v-market.com'
      )
    )
  );

-- 노출/클릭 카운터 RPC 함수 (보안: 인증 없이도 카운트 증가 가능)
CREATE OR REPLACE FUNCTION increment_ad_impressions(ad_id uuid)
RETURNS void AS $$
  UPDATE public.ads SET impressions = impressions + 1 WHERE id = ad_id;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION increment_ad_clicks(ad_id uuid)
RETURNS void AS $$
  UPDATE public.ads SET clicks = clicks + 1 WHERE id = ad_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- 샘플 광고 데이터
INSERT INTO public.ads (title, advertiser, image_url, link_url, cta_text, interval_count, is_active)
VALUES
  (
    '샘플 배너 광고 1',
    'AI Tool Co.',
    'https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=800&h=450&fit=crop',
    'https://ai-v-market.com',
    '지금 체험하기',
    4,
    true
  ),
  (
    '샘플 배너 광고 2',
    'VideoGen Studio',
    'https://images.unsplash.com/photo-1626544827763-d516dce335e2?w=800&h=450&fit=crop',
    'https://ai-v-market.com',
    '무료 체험',
    4,
    false
  );
