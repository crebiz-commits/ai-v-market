-- ════════════════════════════════════════════════════════════════════════════
-- 커뮤니티 업그레이드 (2026-06-10)
--   ① 공지 고정글 (is_notice — 어드민만 등록 가능)
--   ③ 좋아요·북마크 영속화 (post_likes 카운트 동기화 트리거 + post_bookmarks 신설)
--   ④ 챌린지 DB화 (challenges 테이블 + 어드민 관리 + 기존 3건 시드)
--   ⑤ 게시글 영상 임베드 (video_id)
--   ⑥ 프롬프트 갤러리 (prompt_text)
--   + 댓글 수 자동 동기화 (comments → community_posts.comments_count)
--
-- 선행: public.is_admin() (phase_admin_rls_unify.sql),
--       community_posts / post_likes (features_tables.sql)
-- 적용 방법: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 전체 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. community_posts 컬럼 추가 — 공지 / 영상 임베드 / 프롬프트
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS is_notice boolean NOT NULL DEFAULT false;
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS video_id text REFERENCES public.videos(id) ON DELETE SET NULL;
ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS prompt_text text
  CHECK (prompt_text IS NULL OR char_length(prompt_text) <= 3000);

CREATE INDEX IF NOT EXISTS community_posts_notice_idx
  ON public.community_posts(is_notice) WHERE is_notice;

-- 공지 등록/수정은 어드민만 (일반 사용자가 is_notice=true 로 끼워넣는 것 차단)
DROP POLICY IF EXISTS "posts_insert" ON public.community_posts;
CREATE POLICY "posts_insert" ON public.community_posts
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND (is_notice = false OR public.is_admin())
  );

DROP POLICY IF EXISTS "posts_update" ON public.community_posts;
CREATE POLICY "posts_update" ON public.community_posts
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id AND (is_notice = false OR public.is_admin())
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. 좋아요 영속화 — post_likes ↔ community_posts.likes_count 자동 동기화
--    (phase23_1_video_likes_count_sync.sql 의 영상 좋아요 패턴과 동일)
-- ────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER 필수: community_posts UPDATE 는 작성자만 가능한 RLS 라서
-- 다른 사용자의 좋아요로 실행되면 silently fail (영향 행 0)함.
CREATE OR REPLACE FUNCTION public.tg_sync_post_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.community_posts
    SET likes_count = COALESCE(likes_count, 0) + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.community_posts
    SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.tg_sync_post_likes_count IS
  'post_likes INSERT/DELETE 시 community_posts.likes_count 자동 갱신';

DROP TRIGGER IF EXISTS post_likes_sync_count ON public.post_likes;
CREATE TRIGGER post_likes_sync_count
  AFTER INSERT OR DELETE ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_post_likes_count();

-- 백필 — 현재 post_likes 실제 카운트로 일괄 동기화
UPDATE public.community_posts p
SET likes_count = COALESCE(
  (SELECT COUNT(*)::integer FROM public.post_likes WHERE post_id = p.id), 0
);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. 북마크 영속화 — post_bookmarks 신설 (post_likes 와 동일 구조)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.post_bookmarks (
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS post_bookmarks_user_idx ON public.post_bookmarks(user_id);

ALTER TABLE public.post_bookmarks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "post_bookmarks_select" ON public.post_bookmarks;
CREATE POLICY "post_bookmarks_select" ON public.post_bookmarks
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_bookmarks_insert" ON public.post_bookmarks;
CREATE POLICY "post_bookmarks_insert" ON public.post_bookmarks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "post_bookmarks_delete" ON public.post_bookmarks;
CREATE POLICY "post_bookmarks_delete" ON public.post_bookmarks
  FOR DELETE USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 4. 댓글 수 자동 동기화 — comments(post_id) → community_posts.comments_count
--    (지금까지 comments_count 가 갱신되지 않아 목록에 항상 0 표시되던 문제)
--    숨김(is_hidden) 변경도 반영하기 위해 증감이 아닌 재계산 방식.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_sync_post_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_post_id text;
BEGIN
  v_post_id := COALESCE(NEW.post_id, OLD.post_id);
  -- comments.post_id 는 text (mock 호환) — uuid 형식일 때만 동기화
  IF v_post_id IS NOT NULL AND v_post_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    UPDATE public.community_posts
    SET comments_count = (
      SELECT COUNT(*)::integer FROM public.comments
      WHERE post_id = v_post_id AND COALESCE(is_hidden, false) = false
    )
    WHERE id = v_post_id::uuid;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.tg_sync_post_comments_count IS
  '커뮤니티 글 댓글 INSERT/DELETE/숨김 변경 시 comments_count 재계산';

DROP TRIGGER IF EXISTS comments_sync_post_count ON public.comments;
CREATE TRIGGER comments_sync_post_count
  AFTER INSERT OR DELETE OR UPDATE OF is_hidden ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_post_comments_count();

-- 백필
UPDATE public.community_posts p
SET comments_count = COALESCE(
  (SELECT COUNT(*)::integer FROM public.comments c
   WHERE c.post_id = p.id::text AND COALESCE(c.is_hidden, false) = false), 0
);

-- ────────────────────────────────────────────────────────────────────────────
-- 5. 챌린지 DB화 — challenges 테이블 (하드코딩 3건 → 어드민이 등록·관리)
-- ────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.challenges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tag text NOT NULL UNIQUE CHECK (tag ~ '^[a-z0-9][a-z0-9-]{1,48}$'),  -- 영상 태그 'challenge:<tag>' 연결 슬러그
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  title_en text,
  prize text NOT NULL DEFAULT '이달의 크리에이터 패키지',
  prize_en text DEFAULT 'Creator of the Month package',
  description text NOT NULL,
  description_en text,
  image text,
  starts_at date NOT NULL DEFAULT CURRENT_DATE,
  deadline date NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS challenges_deadline_idx ON public.challenges(deadline DESC);

ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "challenges_select" ON public.challenges;
CREATE POLICY "challenges_select" ON public.challenges
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "challenges_admin_manage" ON public.challenges;
CREATE POLICY "challenges_admin_manage" ON public.challenges
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 기존 하드코딩 3건 시드 (이미 있으면 건너뜀)
INSERT INTO public.challenges (tag, title, title_en, prize, prize_en, description, description_en, image, starts_at, deadline)
VALUES
  (
    'future-city',
    '이달의 챌린지 · 미래 도시',
    'This Month · Future City',
    '이달의 크리에이터 패키지', 'Creator of the Month package',
    E'매달 열리는 CREAITE 콘테스트, 이달의 테마는 ''미래 도시''입니다.\n\nCyberpunk, 네온, 미래 도시를 주제로 한 5분 이내 AI 영상을 제작해주세요. Blade Runner, 사이버펑크 2077, 고스트 인 더 셸 같은 작품들에서 영감을 받아 자신만의 미래 도시 비전을 표현해 보세요. 디스토피아든 유토피아든, 어떤 미래를 그리느냐는 자유입니다.\n\n🏆 1등 프리미엄 6개월 + 홈 히어로 1개월 · 2등 프리미엄 3개월 · 3등 프리미엄 1개월\n우수작은 CREAITE 메인 피드에 1주일 동안 무료 노출됩니다.',
    E'CREAITE''s monthly contest — this month''s theme is ''Future City''.\n\nCreate an AI video (up to 5 minutes) on Cyberpunk, neon, or future city themes. Draw inspiration from Blade Runner, Cyberpunk 2077, or Ghost in the Shell, and express your own vision of the future city. Whether dystopia or utopia, the vision is yours.\n\n🏆 1st Premium 6mo + Home Hero 1mo · 2nd Premium 3mo · 3rd Premium 1mo\nTop entries will be featured on CREAITE''s home feed for one week, free of charge.',
    'https://images.unsplash.com/photo-1580895456895-cfdf02e4c23f?w=400&h=200&fit=crop',
    CURRENT_DATE - 15, CURRENT_DATE + 15
  ),
  (
    'nature-doc',
    '지난 달 · 자연 다큐멘터리',
    'Last Month · Nature Documentary',
    '이달의 크리에이터 패키지', 'Creator of the Month package',
    E'BBC Earth 같은 시네마틱 자연 다큐 스타일 영상을 만드는 챌린지였습니다. (마감된 지난 회차)\n\n광활한 자연의 경이로움, 야생 동물의 생동감 넘치는 순간, 또는 작은 곤충의 미시 세계까지 — 어떤 자연이든 좋습니다. 시네마틱 연출과 감정적 임팩트가 핵심 평가 요소였습니다.\n\n🏆 1등 프리미엄 6개월 + 홈 히어로 1개월 · 2등 프리미엄 3개월 · 3등 프리미엄 1개월',
    E'A challenge to make a cinematic nature documentary in the style of BBC Earth. (Closed — past round)\n\nFrom the wonders of vast landscapes, to the lively moments of wildlife, to the microcosm of tiny insects — any subject works. Cinematic direction and emotional impact were the key criteria.\n\n🏆 1st Premium 6mo + Home Hero 1mo · 2nd Premium 3mo · 3rd Premium 1mo',
    'https://images.unsplash.com/photo-1551728715-88730314d185?w=400&h=200&fit=crop',
    CURRENT_DATE - 35, CURRENT_DATE - 5
  ),
  (
    'abstract-art',
    '다음 달 예고 · 추상 아트 비주얼',
    'Next Month · Abstract Art Visuals',
    '이달의 크리에이터 패키지', 'Creator of the Month package',
    E'다음 달 콘테스트 테마는 ''추상 아트 비주얼''입니다. (오픈 예정)\n\n추상적 비주얼, 컬러, 모션, 패턴을 활용한 실험적인 영상을 제작하세요. 구체적인 주제 없이도 OK. 음악 시각화, 추상 표현주의, 사이키델릭 아트 등 자유롭게 표현해 주세요. 영상미와 독창성이 평가 기준입니다.\n\n🏆 1등 프리미엄 6개월 + 홈 히어로 1개월 · 2등 프리미엄 3개월 · 3등 프리미엄 1개월',
    E'Next month''s contest theme is ''Abstract Art Visuals''. (Coming soon)\n\nCreate an experimental video using abstract visuals, color, motion, and pattern. No specific subject required. Feel free to express yourself with music visualization, abstract expressionism, psychedelic art, and more. Visual quality and originality are the evaluation criteria.\n\n🏆 1st Premium 6mo + Home Hero 1mo · 2nd Premium 3mo · 3rd Premium 1mo',
    'https://images.unsplash.com/photo-1633743252577-ccb68cbdb6ed?w=400&h=200&fit=crop',
    CURRENT_DATE + 10, CURRENT_DATE + 40
  )
ON CONFLICT (tag) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증 쿼리:
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'community_posts'
--      AND column_name IN ('is_notice','video_id','prompt_text');   -- 3행
--   SELECT COUNT(*) FROM public.challenges;                          -- 3 이상
--   SELECT tablename FROM pg_tables WHERE tablename = 'post_bookmarks'; -- 1행
-- ════════════════════════════════════════════════════════════════════════════
