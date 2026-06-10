-- ════════════════════════════════════════════════════════════════════════════
-- 이벤트 배너 DB화 + 버그 제보(버그 헌트 이벤트) (2026-06-11)
--   ① event_banners 테이블 — 하드코딩 eventBanners.ts 를 어드민 관리로 전환
--      (기존 배너 시드: 구독 50% 제외 + "버그를 잡아라" 배너 추가)
--   ② bug_reports 테이블 — "버그를 잡아라" 코너 제보 수집 + 어드민 검토/쿠폰 관리
--
-- 선행: public.is_admin() (phase_admin_rls_unify.sql)
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 전체 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- ① event_banners — 시네마 상단 이벤트 배너 보드
--    컬럼은 BoardBanner 인터페이스(EventBannerBoard.tsx)와 1:1 매핑
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.event_banners (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sort_order     integer NOT NULL DEFAULT 0,
  title          text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  subtitle       text,
  eyebrow        text,                 -- 상단 작은 라벨
  badge          text,                 -- 좌상단 pill
  badges         text[],               -- 하단 pill 묶음
  cta_label      text,
  link           text,                 -- "/?tab=upload" 내부 경로 또는 외부 URL
  image          text,                 -- 배경 사진 URL (없으면 gradient)
  align          text NOT NULL DEFAULT 'left' CHECK (align IN ('left','center')),
  title_gradient boolean NOT NULL DEFAULT false,
  gradient       text,                 -- 이미지 없을 때 배경 그라데이션 클래스
  is_active      boolean NOT NULL DEFAULT true,
  active_from    timestamptz,
  active_to      timestamptz,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_banners_order_idx ON public.event_banners(sort_order);

ALTER TABLE public.event_banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS event_banners_select ON public.event_banners;
CREATE POLICY event_banners_select ON public.event_banners
  FOR SELECT USING (true);

DROP POLICY IF EXISTS event_banners_admin ON public.event_banners;
CREATE POLICY event_banners_admin ON public.event_banners
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 기존 하드코딩 배너 시드 (구독 50% 제외 + 버그 헌트 추가). 이미 있으면 건너뜀.
INSERT INTO public.event_banners (sort_order, title, subtitle, eyebrow, badge, badges, cta_label, link, image, align, title_gradient, gradient)
SELECT * FROM (VALUES
  (10,
   '내가 만든 영상이 1000만 관객!',
   '집에서 간단하게 만든 AI영화, 너도 방구석 제임스카메론이 될 수 있다! 지금 바로 도전하세요.',
   NULL, '스페셜 이벤트', NULL::text[], '지금 도전하기', '/?tab=upload',
   'https://tvbpiuwmvrccfnplhwer.supabase.co/storage/v1/object/public/video-thumbnails/banners/cinema-audience.jpg',
   'left', false, NULL),
  (20,
   '버그를 잡아라! 🐛',
   '베타 기간 버그를 발견해 제보하면, 채택된 모든 분께 커피 쿠폰을 드려요!',
   NULL, '버그 헌트', NULL::text[], '버그 제보하기', '/?tab=bug-report',
   NULL,
   'left', false, 'from-[#0f2027] via-[#203a43] to-[#0d0d14]'),
  (30,
   '매달 열리는 AI 영상 콘테스트',
   '이달의 테마에 도전하세요. 1등 30만원·2등 20만원·3등 10만원!',
   NULL, NULL, ARRAY['매월 진행','참가비 무료'], '참가하기', '/?tab=community&sub=challenges',
   'https://tvbpiuwmvrccfnplhwer.supabase.co/storage/v1/object/public/video-thumbnails/banners/contest-award.jpg',
   'left', false, NULL),
  (40,
   'Create. Share. Profit. With AI.',
   '창작하고, 공유하고, 부자가 되다. AI로.',
   '크리에잇 슬로건', NULL, NULL::text[], '지금 바로 잇!! 하라', '/?tab=discovery',
   NULL,
   'center', true, NULL),
  (50,
   '이번 주 TOP 크리에이터',
   '가장 사랑받은 AI 영상과 크리에이터를 만나보세요.',
   '위클리 랭킹', NULL, NULL::text[], '랭킹 보기', '/?tab=ott',
   NULL,
   'left', false, 'from-[#1e1b4b] via-[#3b0764] to-[#0d0d14]')
) AS v
WHERE NOT EXISTS (SELECT 1 FROM public.event_banners);

-- ────────────────────────────────────────────────────────────────────────────
-- ② bug_reports — "버그를 잡아라" 제보 수집
--    로그인 사용자만 제보(쿠폰 지급 대상 식별). 어드민이 검토·쿠폰 발송 상태 관리.
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bug_reports (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reporter_name    text,
  reporter_contact text,                 -- 쿠폰 받을 이메일/카카오 등
  title            text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  description      text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 4000),
  steps            text,                 -- 재현 경로(선택)
  page_url         text,                 -- 발생 위치(선택)
  status           text NOT NULL DEFAULT 'new'
                     CHECK (status IN ('new','reviewing','valid','invalid','coupon_sent')),
  admin_note       text,
  created_at       timestamptz DEFAULT now(),
  reviewed_at      timestamptz
);

CREATE INDEX IF NOT EXISTS bug_reports_status_idx ON public.bug_reports(status);
CREATE INDEX IF NOT EXISTS bug_reports_user_idx ON public.bug_reports(user_id);
CREATE INDEX IF NOT EXISTS bug_reports_created_idx ON public.bug_reports(created_at DESC);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- 본인 제보 조회 + 어드민 전체 조회
DROP POLICY IF EXISTS bug_reports_select ON public.bug_reports;
CREATE POLICY bug_reports_select ON public.bug_reports
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

-- 본인 명의로만 제보
DROP POLICY IF EXISTS bug_reports_insert ON public.bug_reports;
CREATE POLICY bug_reports_insert ON public.bug_reports
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 상태 변경/삭제는 어드민만
DROP POLICY IF EXISTS bug_reports_admin_update ON public.bug_reports;
CREATE POLICY bug_reports_admin_update ON public.bug_reports
  FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS bug_reports_admin_delete ON public.bug_reports;
CREATE POLICY bug_reports_admin_delete ON public.bug_reports
  FOR DELETE USING (public.is_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT count(*) FROM public.event_banners;                    -- 5
--   SELECT tablename FROM pg_tables WHERE tablename = 'bug_reports'; -- 1행
-- ════════════════════════════════════════════════════════════════════════════
