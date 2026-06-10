-- ════════════════════════════════════════════════════════════════════════════
-- 협업 글 관리자 삭제 정책 (2026-06-11)
-- 작성자 본인 삭제(collab_posts_delete)는 collab_space.sql 에 이미 존재.
-- 운영(스팸·부적절 글) 대응을 위해 어드민 삭제 추가.
-- 글 삭제 시 문의 스레드/메시지는 FK ON DELETE CASCADE 로 함께 삭제됨.
-- 적용 방법: Supabase Dashboard → SQL Editor → 새 쿼리("+") → 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS collab_posts_admin_delete ON public.collab_posts;
CREATE POLICY collab_posts_admin_delete ON public.collab_posts
  FOR DELETE USING (public.is_admin());
