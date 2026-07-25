-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 콘텐츠 작성 레이트리밋 (2026-07-25) — 댓글·글 도배 방지 (정책 ③)
--
--   기존: 신고(create_report)만 20/h 상한이 있고, 댓글·커뮤니티글·협업글·B2B글은 클라가
--         RLS 로 직접 insert(RPC 아님)라 **서버 레이트리밋이 없어 도배 가능**했다.
--   조치: 클라 변경·RPC 래핑 없이 BEFORE INSERT 트리거로 "최근 1시간 본인 작성수" 상한.
--         테이블별 상한은 트리거 인자(TG_ARGV[0])로 주입, 대상 테이블은 TG_TABLE_NAME 으로
--         동적 카운트(공통 함수 1개). 관리자(is_admin)는 예외(공지·운영).
--
--   상한(시간당): 댓글 30 / 커뮤니티글 10 / 협업글 10 / B2B글 5.
--   ※ 정지·차단·신고와 무관한 순수 스팸 방지. 4테이블 다 user_id + created_at 보유(확인).
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 공통 레이트리밋 트리거 함수 (테이블별 상한은 TG_ARGV[0]) ──────────────────
CREATE OR REPLACE FUNCTION public.tg_content_rate_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := COALESCE(NULLIF(TG_ARGV[0], '')::INTEGER, 30);
  v_count INTEGER;
BEGIN
  -- 관리자는 예외(공지·운영 다량 작성 허용)
  IF public.is_admin() THEN RETURN NEW; END IF;

  -- 최근 1시간 본인이 이 테이블에 작성한 건수 (DEFINER 라 RLS 무관하게 전수 카운트)
  EXECUTE format(
    'SELECT count(*) FROM public.%I WHERE user_id = $1 AND created_at > now() - interval ''1 hour''',
    TG_TABLE_NAME)
  INTO v_count USING NEW.user_id;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION '작성이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4개 테이블에 연결(테이블별 상한) ─────────────────────────────────────────
DROP TRIGGER IF EXISTS comments_rate_limit ON public.comments;
CREATE TRIGGER comments_rate_limit
  BEFORE INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_rate_limit('30');

DROP TRIGGER IF EXISTS community_posts_rate_limit ON public.community_posts;
CREATE TRIGGER community_posts_rate_limit
  BEFORE INSERT ON public.community_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_rate_limit('10');

DROP TRIGGER IF EXISTS collab_posts_rate_limit ON public.collab_posts;
CREATE TRIGGER collab_posts_rate_limit
  BEFORE INSERT ON public.collab_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_rate_limit('10');

DROP TRIGGER IF EXISTS b2b_posts_rate_limit ON public.b2b_posts;
CREATE TRIGGER b2b_posts_rate_limit
  BEFORE INSERT ON public.b2b_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_rate_limit('5');

-- ── 검증 ──
SELECT '콘텐츠 레이트리밋 트리거 4테이블 연결' AS check_name,
  CASE WHEN (
    SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgname IN ('comments_rate_limit','community_posts_rate_limit',
                       'collab_posts_rate_limit','b2b_posts_rate_limit')
      AND NOT t.tgisinternal
  ) = 4 THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
