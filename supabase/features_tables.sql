-- =============================================
-- AI-V-Market: 추가 기능 테이블
-- comments, cart_items, notifications
-- =============================================

-- 1. 댓글 테이블
CREATE TABLE IF NOT EXISTS public.comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid REFERENCES public.videos(id) ON DELETE CASCADE,
  post_id text, -- community posts (text id for mock data compatibility)
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE, -- 대댓글
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  likes_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 댓글 인덱스
CREATE INDEX IF NOT EXISTS comments_video_id_idx ON public.comments(video_id);
CREATE INDEX IF NOT EXISTS comments_post_id_idx ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS comments_user_id_idx ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS comments_created_at_idx ON public.comments(created_at DESC);

-- 댓글 RLS
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments_select" ON public.comments
  FOR SELECT USING (true);

CREATE POLICY "comments_insert" ON public.comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments_update" ON public.comments
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "comments_delete" ON public.comments
  FOR DELETE USING (auth.uid() = user_id);

-- 댓글 수 자동 업데이트 함수 (videos 테이블 comment_count 필드가 있을 경우)
-- CREATE OR REPLACE FUNCTION update_video_comment_count() ...

-- 2. 장바구니 테이블
CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  license_type text NOT NULL DEFAULT 'standard' CHECK (license_type IN ('standard', 'commercial', 'extended')),
  price integer NOT NULL,
  added_at timestamptz DEFAULT now(),
  UNIQUE(user_id, video_id, license_type)
);

CREATE INDEX IF NOT EXISTS cart_items_user_id_idx ON public.cart_items(user_id);

ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cart_select" ON public.cart_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "cart_insert" ON public.cart_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "cart_delete" ON public.cart_items
  FOR DELETE USING (auth.uid() = user_id);

-- 3. 알림 테이블
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('like', 'comment', 'purchase', 'sale', 'system', 'challenge')),
  title text NOT NULL,
  body text,
  link text, -- 클릭 시 이동할 경로
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx ON public.notifications(user_id, read) WHERE read = false;
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "notifications_delete" ON public.notifications
  FOR DELETE USING (auth.uid() = user_id);

-- 4. 커뮤니티 게시글 테이블
CREATE TABLE IF NOT EXISTS public.community_posts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL,
  author_avatar text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  content text NOT NULL CHECK (char_length(content) BETWEEN 10 AND 5000),
  category text NOT NULL DEFAULT '일반' CHECK (category IN ('팁', '챌린지', '비교', '프롬프트', '튜토리얼', '일반', '질문')),
  image_url text,
  likes_count integer DEFAULT 0,
  comments_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_posts_user_id_idx ON public.community_posts(user_id);
CREATE INDEX IF NOT EXISTS community_posts_created_at_idx ON public.community_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS community_posts_likes_idx ON public.community_posts(likes_count DESC);

ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "posts_select" ON public.community_posts
  FOR SELECT USING (true);

CREATE POLICY "posts_insert" ON public.community_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "posts_update" ON public.community_posts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "posts_delete" ON public.community_posts
  FOR DELETE USING (auth.uid() = user_id);

-- 게시글 좋아요 테이블 (중복 방지)
CREATE TABLE IF NOT EXISTS public.post_likes (
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_likes_select" ON public.post_likes
  FOR SELECT USING (true);

CREATE POLICY "post_likes_insert" ON public.post_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "post_likes_delete" ON public.post_likes
  FOR DELETE USING (auth.uid() = user_id);

-- 5. 댓글 좋아요 테이블
CREATE TABLE IF NOT EXISTS public.comment_likes (
  comment_id uuid NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE public.comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comment_likes_select" ON public.comment_likes
  FOR SELECT USING (true);

CREATE POLICY "comment_likes_insert" ON public.comment_likes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comment_likes_delete" ON public.comment_likes
  FOR DELETE USING (auth.uid() = user_id);
