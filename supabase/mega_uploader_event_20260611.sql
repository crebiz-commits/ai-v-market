-- ════════════════════════════════════════════════════════════════════════════
-- 메가커피 "빅메가 업로더" 이벤트 (2026-06-11)
--   ① event_banners.dark 컬럼 (밝은 배경용 어두운 글씨)
--   ② 메가커피 노란색 배너 INSERT
--   ③ upload_milestones — 영화 30편 업로드마다 달성 기록 (트리거 자동) + 어드민 조회
-- 선행: event_banners (banners_bugreports_20260611.sql), public.is_admin()/assert_admin()
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ① 밝은 배경(노란색 등)에서 글씨를 어둡게 — 가독성
ALTER TABLE public.event_banners
  ADD COLUMN IF NOT EXISTS dark boolean NOT NULL DEFAULT false;

-- ② 메가커피 배너 (노란색 주색상 + 어두운 글씨). 이미 있으면 건너뜀.
INSERT INTO public.event_banners
  (sort_order, title, subtitle, badge, cta_label, link, gradient, align, dark, is_active)
SELECT
  15,
  '빅메가 업로더 가즈아! ☕',
  '메가커피와 함께! 영화 30편 업로드마다 메가커피 상품권 3만원권을 드려요.',
  '메가커피 EVENT',
  '지금 업로드하기',
  '/?tab=upload',
  'from-[#FFD200] via-[#FFC400] to-[#FFB000]',
  'left',
  true,
  true
WHERE NOT EXISTS (SELECT 1 FROM public.event_banners WHERE title LIKE '%빅메가%');

-- ③ 업로드 마일스톤 (30편 단위) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.upload_milestones (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone   integer NOT NULL,           -- 30, 60, 90 ...
  video_count integer NOT NULL,           -- 달성 시점 누적 업로드 수
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','coupon_sent')),
  note        text,
  created_at  timestamptz DEFAULT now(),
  rewarded_at timestamptz,
  UNIQUE (user_id, milestone)
);

CREATE INDEX IF NOT EXISTS upload_milestones_status_idx ON public.upload_milestones(status);
CREATE INDEX IF NOT EXISTS upload_milestones_created_idx ON public.upload_milestones(created_at DESC);

ALTER TABLE public.upload_milestones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS upload_milestones_admin ON public.upload_milestones;
CREATE POLICY upload_milestones_admin ON public.upload_milestones
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 트리거: 영상 INSERT 시 작성자의 누적 업로드가 30의 배수면 마일스톤 기록
-- SECURITY DEFINER — upload_milestones 의 admin-only RLS 를 우회해 시스템 기록
CREATE OR REPLACE FUNCTION public.tg_check_upload_milestone()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  IF NEW.creator_id IS NULL THEN RETURN NEW; END IF;
  SELECT COUNT(*) INTO v_count FROM public.videos WHERE creator_id = NEW.creator_id;
  IF v_count > 0 AND v_count % 30 = 0 THEN
    INSERT INTO public.upload_milestones (user_id, milestone, video_count)
    VALUES (NEW.creator_id, v_count, v_count)
    ON CONFLICT (user_id, milestone) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videos_upload_milestone ON public.videos;
CREATE TRIGGER videos_upload_milestone
  AFTER INSERT ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_check_upload_milestone();

-- 백필: 이미 30편 이상 올린 크리에이터의 각 30-단위 마일스톤 등록
INSERT INTO public.upload_milestones (user_id, milestone, video_count)
SELECT c.creator_id, gs.m, c.cnt
FROM (
  SELECT creator_id, COUNT(*)::int AS cnt
  FROM public.videos WHERE creator_id IS NOT NULL GROUP BY creator_id
) c
CROSS JOIN LATERAL generate_series(30, c.cnt, 30) AS gs(m)
ON CONFLICT (user_id, milestone) DO NOTHING;

-- 어드민 조회 RPC (크리에이터 이름·이메일 포함)
CREATE OR REPLACE FUNCTION public.admin_list_upload_milestones()
RETURNS TABLE (
  id uuid, user_id uuid, milestone int, video_count int, status text,
  note text, created_at timestamptz, rewarded_at timestamptz,
  creator_name text, creator_email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT m.id, m.user_id, m.milestone, m.video_count, m.status,
         m.note, m.created_at, m.rewarded_at,
         COALESCE(NULLIF(p.display_name, ''), split_part(u.email, '@', 1), '크리에이터'),
         u.email
  FROM public.upload_milestones m
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  ORDER BY (m.status = 'pending') DESC, m.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_upload_milestones() TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name='event_banners' AND column_name='dark';            -- 1행
--   SELECT title FROM public.event_banners WHERE title LIKE '%빅메가%';   -- 1행
--   SELECT count(*) FROM public.upload_milestones;                        -- 백필 결과
-- ════════════════════════════════════════════════════════════════════════════
