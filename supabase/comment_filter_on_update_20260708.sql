-- ════════════════════════════════════════════════════════════════════════════
-- 댓글 자동필터를 UPDATE(수정)에도 적용 — 모더레이션 바이패스 수정 (2026-07-08)
--
--   문제: comments_apply_creator_filter 트리거가 BEFORE INSERT 전용이라
--         (phase23_comment_management.sql:142-144), 사용자가 "깨끗한" 댓글을 올린 뒤
--         금칙어/차단 대상 내용으로 "수정"하면 필터가 재실행되지 않아 그대로 노출됨.
--         (클라 saveEdit 의 is_hidden 처리(CommentPanel.tsx)도 UPDATE 시 트리거가 안 돌아
--          사실상 死코드였음.)
--   해결: 같은 트리거 함수(tg_apply_creator_filter — 본문 불변, 멱등)를 INSERT + content
--         컬럼 UPDATE 에도 걸어 수정 시에도 크리에이터 금칙어·차단을 재평가한다.
--
--   ※ community_c2_comment_lockdown 의 컬럼 화이트리스트(UPDATE=content,updated_at)와 무관:
--     is_hidden 등은 BEFORE 트리거(SECURITY DEFINER)가 NEW 에 세팅 → 컬럼 GRANT 제약 대상 아님
--     (INSERT 때와 동일 메커니즘).
--   적용: Supabase SQL Editor → Run.
-- ════════════════════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS comments_apply_creator_filter ON public.comments;
CREATE TRIGGER comments_apply_creator_filter
  BEFORE INSERT OR UPDATE OF content ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_apply_creator_filter();

-- 검증:
--   SELECT tgname, tgtype FROM pg_trigger WHERE tgname = 'comments_apply_creator_filter';
--   -- 시나리오: 깨끗한 댓글 작성(보임) → 금칙어로 UPDATE content → is_hidden=true 로 전환되어야 함.
