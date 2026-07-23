-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 댓글·커뮤니티글 INSERT 컬럼 위조 차단 (2026-07-23 전체감사, 커뮤니티 모더레이션)
--
--   [상] community_c2_comment_lockdown / community_m1_posts_lockdown 은 REVOKE UPDATE +
--        GRANT UPDATE(화이트리스트)만 했고 **INSERT 는 안 잠갔다**. Supabase 기본
--        authenticated 전컬럼 INSERT GRANT 가 남아, RLS WITH CHECK 는 user_id 만 검사 →
--        **최초 INSERT 시 위조 가능**:
--          · 댓글: is_pinned=true(고정 배지 사칭·최상단 정렬), creator_hearted=true
--            (크리에이터 ❤️ 추천 사칭 — 전 시청자 노출), likes_count=9999(좋아요 부풀림)
--          · 커뮤니티글: likes_count/comments_count 임의값(가짜 인기글·popular 정렬 조작)
--        C2/M1 헤더가 명시한 위협을 UPDATE만 닫아 INSERT 경로로 그대로 뚫려 있었음.
--
--   해결: community_posts 의 tg_force_post_author(author 강제) 패턴처럼, BEFORE INSERT 트리거로
--        위조 대상 컬럼을 안전값(0/false)으로 강제. GRANT 화이트리스트는 community_posts insert
--        가 `...payload` 스프레드라 컬럼 누락 시 정상삽입이 깨져 트리거가 더 견고. is_hidden 은
--        건드리지 않음(금칙어 필터 트리거 tg_apply_creator_filter 소관 — 충돌 회피).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 댓글 INSERT 가드 ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_comments_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.likes_count     := 0;
  NEW.is_pinned       := false;
  NEW.pinned_at       := NULL;
  NEW.creator_hearted := false;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comments_insert_guard ON public.comments;
CREATE TRIGGER comments_insert_guard
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_comments_insert_guard();

-- ── 커뮤니티글 INSERT 가드 ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_community_posts_insert_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public
AS $$
BEGIN
  NEW.likes_count    := 0;
  NEW.comments_count := 0;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS community_posts_insert_guard ON public.community_posts;
CREATE TRIGGER community_posts_insert_guard
  BEFORE INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_community_posts_insert_guard();

-- ── 검증 ──
SELECT '댓글 INSERT 위조가드 트리거' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                    WHERE c.relname='comments' AND t.tgname='comments_insert_guard' AND NOT t.tgisinternal)
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '커뮤니티글 INSERT 위조가드 트리거',
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                    WHERE c.relname='community_posts' AND t.tgname='community_posts_insert_guard' AND NOT t.tgisinternal)
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
