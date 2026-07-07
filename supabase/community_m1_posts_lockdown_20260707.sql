-- ════════════════════════════════════════════════════════════════════════════
-- M1 (MAJOR) 커뮤니티 게시글 UPDATE 쓰기 잠금 (2026-07-07) — 커뮤니티 감사
--
--   문제: posts_update 정책이 행(auth.uid()=user_id)만 게이트하고 컬럼은 못 막아,
--         소유자가 자기 글의 likes_count/comments_count 를 임의값으로 UPDATE 가능
--         → 가짜 인기 + '인기' 정렬(sortKey='popular', likes 기준) 조작.
--   수정: C2(댓글)와 동일 — 컬럼단위 UPDATE GRANT 로 잠근다.
--         클라(authenticated) 직접 UPDATE 허용 컬럼 = 실제 글 편집 페이로드만
--         (title/content/category/video_id/prompt_text/is_notice/author_name/
--          author_avatar/updated_at). likes_count/comments_count/is_hidden/user_id
--         등은 차단.
--         · likes_count/comments_count → tg_sync_post_*_count 트리거(SECURITY
--           DEFINER)가 갱신하므로 잠금 무관하게 정상 동작.
--         · is_notice → RLS WITH CHECK(is_notice=false OR is_admin) 가 여전히
--           비어드민의 공지화를 막음(컬럼 부여해도 RLS 로 이중차단).
--         · author_name/avatar → tg_force_post_author 트리거가 비어드민 값을
--           프로필로 강제(사칭 차단). 어드민 운영팀 명의만 허용.
--         · is_hidden(숨김/복원)은 어드민도 moderate_report(DEFINER)로만 처리 —
--           직접 UPDATE 경로 없음(확인함).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- WITH CHECK 보강(user_id 스왑 방지 — posts_update 정본은 community_upgrade 에 있음)
DROP POLICY IF EXISTS "posts_update" ON public.community_posts;
CREATE POLICY "posts_update" ON public.community_posts
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id AND (is_notice = false OR public.is_admin()));

-- 컬럼단위 쓰기 잠금
REVOKE UPDATE ON public.community_posts FROM authenticated;
GRANT  UPDATE (title, content, category, video_id, prompt_text, is_notice,
               author_name, author_avatar, updated_at)
  ON public.community_posts TO authenticated;
REVOKE UPDATE ON public.community_posts FROM anon;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 카운트 직접조작 시도(본인 글) → 권한오류여야:
--   UPDATE public.community_posts SET likes_count=999999 WHERE id='<내글>';   -- 실패
--   -- 정상 편집은 통과:
--   UPDATE public.community_posts SET content='수정', updated_at=now() WHERE id='<내글>'; -- OK
--   -- 좋아요는 트리거로 여전히 정상(post_likes INSERT):
--   SELECT grantee, column_name FROM information_schema.role_column_grants
--   WHERE table_schema='public' AND table_name='community_posts'
--     AND privilege_type='UPDATE' AND grantee IN ('authenticated','anon')
--   ORDER BY grantee, column_name;
--   -- 기대: authenticated 9컬럼, anon 0행. likes_count/comments_count 미포함.
-- ════════════════════════════════════════════════════════════════════════════
