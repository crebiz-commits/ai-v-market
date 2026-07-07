-- ════════════════════════════════════════════════════════════════════════════
-- C2 (CRITICAL) 댓글 UPDATE 쓰기 잠금 (2026-07-07) — 커뮤니티 감사
--
--   문제: comments_update 정책이 USING(auth.uid()=user_id) 만 있고 WITH CHECK 가
--         없음 → 소유자가 자기 댓글의 임의 컬럼을 변조 가능.
--         ① post_id/video_id 변경 = 타 게시글·영상으로 댓글 이동(IDOR/스팸)
--         ② is_hidden=false 자가복원 = 신고/금칙어 자동숨김 무력화
--         ③ is_pinned/creator_hearted 위조 = 크리에이터 핀/하트 배지 사칭
--         ④ likes_count 임의값 = 좋아요 수 부풀리기
--   (라이브 검증 2026-07-07: comments_update with_check_expr = NULL 확인됨)
--
--   수정: RLS 는 "행"만 게이트하고 "컬럼"은 못 막으므로 컬럼단위 UPDATE GRANT 로 잠근다.
--         클라(authenticated) 직접 UPDATE 는 content/updated_at 만 허용.
--         핀/하트/좋아요는 SECURITY DEFINER RPC(toggle_pin_comment /
--         toggle_creator_heart / like_comment)로만 변경 — 이들은 definer(postgres)
--         권한으로 실행되어 컬럼잠금·RLS 를 우회하므로 정상 동작한다.
--         (profiles 쓰기잠금과 동일 SSOT 패턴 — profiles-column-grant-ssot 참조)
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ① 정책에 WITH CHECK 보강 (user_id 스왑 방지 — 방어심층)
DROP POLICY IF EXISTS "comments_update" ON public.comments;
CREATE POLICY "comments_update" ON public.comments
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ② 컬럼단위 쓰기 잠금 — authenticated 직접 UPDATE 는 content/updated_at 만
--    (테이블단위 UPDATE 를 회수하고 화이트리스트 2컬럼만 재부여)
REVOKE UPDATE ON public.comments FROM authenticated;
GRANT  UPDATE (content, updated_at) ON public.comments TO authenticated;

-- anon 은 애초에 댓글 수정 불가 — 혹시 남아있으면 회수(정지사용자/비로그인 차단)
REVOKE UPDATE ON public.comments FROM anon;

-- service_role(Edge/모더레이션)·postgres(정의자 RPC)는 건드리지 않음 — 전 컬럼 유지.

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(비어드민 본인 댓글로 실행 시 아래는 모두 차단되어야):
--   -- content 편집만 통과:
--   UPDATE public.comments SET content='수정' WHERE id='<내댓글>';            -- OK
--   -- 아래는 컬럼 GRANT 없어 실패해야:
--   UPDATE public.comments SET is_hidden=false WHERE id='<내숨김댓글>';       -- 권한오류
--   UPDATE public.comments SET is_pinned=true, likes_count=9999 WHERE id='<내댓글>'; -- 권한오류
--   UPDATE public.comments SET post_id='<피해자글>' WHERE id='<내댓글>';       -- 권한오류
--   -- 핀/하트/좋아요 RPC 는 여전히 정상:
--   SELECT public.toggle_pin_comment('<영상속댓글>');  -- 크리에이터면 OK
--   SELECT public.like_comment('<댓글>');              -- OK
--
-- 권한 확인:
--   SELECT grantee, privilege_type, column_name
--   FROM information_schema.role_column_grants
--   WHERE table_schema='public' AND table_name='comments'
--     AND privilege_type='UPDATE' AND grantee IN ('authenticated','anon');
--   -- 기대: authenticated 에 content/updated_at 2행만, anon 0행.
-- ════════════════════════════════════════════════════════════════════════════
