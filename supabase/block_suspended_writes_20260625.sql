-- ════════════════════════════════════════════════════════════════════════════
-- 정지(is_suspended) 사용자 쓰기 전면 차단 (2026-06-25) — 인증 감사 #1
--
--   문제: admin_suspend_user/moderate_report 가 profiles.is_suspended=true 로 정지해도
--   로그인·쓰기를 막는 강제가 없어(검색/Top/브로드캐스트 "감추기"에만 사용) 정지자가
--   계속 댓글·게시글·팔로우·좋아요·신고를 할 수 있었음 → 모더레이션 사실상 무력(Medium).
--
--   해결: SECURITY DEFINER 헬퍼 is_self_suspended() + BEFORE INSERT/UPDATE 트리거로
--   사용자 쓰기 경로를 DB 레이어에서 차단(클라/RPC 무관, auth.uid() 기준).
--   service_role(시스템/Edge) 인서트는 auth.uid()=NULL → 차단 안 됨(정상 동작 보존).
--   영상 업로드는 Edge save-metadata(service_role)라 트리거 미적용 → create-upload Edge 에서 별도 403 차단.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 본인(auth.uid()) 정지 여부 — DEFINER 로 is_suspended 컬럼 직접 조회(클라 SELECT 불가 컬럼)
CREATE OR REPLACE FUNCTION public.is_self_suspended()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_suspended FROM public.profiles WHERE id = auth.uid()), false);
$$;

CREATE OR REPLACE FUNCTION public.tg_block_suspended()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF public.is_self_suspended() THEN
    RAISE EXCEPTION '정지된 계정은 이 작업을 할 수 없습니다. 고객센터로 문의해 주세요.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- 텍스트 콘텐츠(작성·수정 모두 차단)
DROP TRIGGER IF EXISTS block_suspended ON public.comments;
CREATE TRIGGER block_suspended BEFORE INSERT OR UPDATE ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_suspended();

DROP TRIGGER IF EXISTS block_suspended ON public.community_posts;
CREATE TRIGGER block_suspended BEFORE INSERT OR UPDATE ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_suspended();

DROP TRIGGER IF EXISTS block_suspended ON public.collab_posts;
CREATE TRIGGER block_suspended BEFORE INSERT OR UPDATE ON public.collab_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_suspended();

-- 상호작용(생성 차단)
DROP TRIGGER IF EXISTS block_suspended ON public.creator_followers;
CREATE TRIGGER block_suspended BEFORE INSERT ON public.creator_followers
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_suspended();

DROP TRIGGER IF EXISTS block_suspended ON public.post_likes;
CREATE TRIGGER block_suspended BEFORE INSERT ON public.post_likes
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_suspended();

DROP TRIGGER IF EXISTS block_suspended ON public.comment_likes;
CREATE TRIGGER block_suspended BEFORE INSERT ON public.comment_likes
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_suspended();

DROP TRIGGER IF EXISTS block_suspended ON public.video_likes;
CREATE TRIGGER block_suspended BEFORE INSERT ON public.video_likes
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_suspended();

-- 신고(create_report RPC 경유 INSERT — RPC 안에서도 auth.uid()=호출자라 차단됨)
DROP TRIGGER IF EXISTS block_suspended ON public.reports;
CREATE TRIGGER block_suspended BEFORE INSERT ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_suspended();

-- ── 인증 감사 #2(Low, 관리자 한정): purge_pending_deletions EXECUTE 회수(내부 assert_admin 가드는 이미 있음) ──
REVOKE EXECUTE ON FUNCTION public.purge_pending_deletions(integer) FROM PUBLIC, anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 테스트 계정 정지: UPDATE profiles SET is_suspended=true WHERE id='<uid>';  (또는 admin_suspend_user)
--   -- 그 계정 세션에서 댓글/팔로우/좋아요 INSERT → "정지된 계정은..." 예외여야 함.
--   -- 정지 해제 후 정상 동작. 일반(미정지) 사용자·시스템(service_role) 인서트는 영향 없음.
--   SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname='block_suspended';
-- ════════════════════════════════════════════════════════════════════════════
