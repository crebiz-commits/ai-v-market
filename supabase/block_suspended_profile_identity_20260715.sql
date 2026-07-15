-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 정지 사용자 — 공개 신원(표시명·소개·아바타·배너) 수정 동결 (2026-07-15)
--
--   [결함/갭] block_suspended_writes_20260625.sql 는 댓글·게시글·팔로우·좋아요·
--     신고 INSERT/UPDATE 만 차단하고 profiles 는 대상에서 빠져 있었음. profiles RLS
--     는 본인 UPDATE 를 허용하므로, 정지된 사용자가 여전히 display_name/bio/
--     avatar_url/banner_url 을 바꿀 수 있었고 그 신원이 채널/검색에 계속 노출됨.
--     정지 사유가 사칭·스토킹일 때 정작 사칭 표시명을 계속 편집·유지 → 모더레이션
--     목적 부분 무력화(2026-07-15 사용자관리 재감사 F3).
--
--   [수정] BEFORE UPDATE 트리거로, "정지된 본인(auth.uid())"이 자기 프로필의
--     공개 신원 4필드를 바꾸려 하면 OLD 값으로 되돌림(freeze). protect_subscription_
--     columns 와 동일한 "되돌림" 패턴 — 하드 차단(RAISE)이 아니라 동결이라
--     계정 삭제요청(deletion_requested_at) 등 다른 자기수정 흐름은 계속 허용.
--
--   [무영향 경로] 관리자(auth.uid()=다른 관리자)·시스템(service_role, auth.uid()=NULL)
--     의 profiles 변경은 is_self_suspended()=false 라 동결되지 않음 → admin_suspend_user
--     /admin_unsuspend_user, 결제 웹훅 등 정상 동작 보존.
--   의존: is_self_suspended() (block_suspended_writes_20260625.sql 에서 정의됨).
--   적용: Supabase SQL Editor → Run (멱등). block_suspended_writes 이후 적용.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_freeze_suspended_identity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- 정지된 본인이 공개 신원(표시명·소개·아바타·배너)을 바꾸려 하면 원복.
  -- 관리자/시스템(auth.uid() 이 정지자 본인이 아님)의 변경은 그대로 통과.
  IF public.is_self_suspended() THEN
    NEW.display_name := OLD.display_name;
    NEW.bio          := OLD.bio;
    NEW.avatar_url   := OLD.avatar_url;
    NEW.banner_url   := OLD.banner_url;
  END IF;
  RETURN NEW;
END;
$$;

-- 트리거명 'freeze_suspended_identity' 는 알파벳순상 profiles_protect_subscription /
-- profiles_set_updated_at 보다 먼저 발화 — 각기 다른 컬럼을 다뤄 충돌 없음.
DROP TRIGGER IF EXISTS freeze_suspended_identity ON public.profiles;
CREATE TRIGGER freeze_suspended_identity
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_freeze_suspended_identity();

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 테스트 계정 정지: UPDATE profiles SET is_suspended=true WHERE id='<uid>';
--   -- 그 계정 세션에서 display_name/bio/avatar_url/banner_url UPDATE → 값이 안 바뀌어야 함(원복).
--   -- 같은 세션에서 deletion_requested_at 등 다른 컬럼 UPDATE 는 정상 반영돼야 함.
--   -- 관리자 세션에서 해당 계정 unsuspend → 정상, 이후 본인 신원수정 다시 허용.
--   SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname='freeze_suspended_identity';
-- ════════════════════════════════════════════════════════════════════════════
