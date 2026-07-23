-- ════════════════════════════════════════════════════════════════════════════
-- 🤝 B2B 배급사 제휴 게시판 (2026-07-23) — 로그인 사용자 자유 게시(공개)
--
--   배급사·사업자가 "우리는 이런 회사이고, 이런 영화·광고·프로모션·제휴를 원한다"를
--   공개 게시하고 서로 발견하는 공개 게시판. 커뮤니티 4번째 탭.
--
--   ★ 보안 모델은 방금 감사한 collab_posts 와 100% 동형(협업 공간의 사촌):
--     · RLS: 공개 SELECT(숨김글은 작성자·관리자만) / 본인만 INSERT·UPDATE·DELETE
--     · 컬럼 단위 GRANT 잠금(is_hidden·user_id·id·created_at 직접쓰기 차단, #40 교훈)
--     · 정지 계정 쓰기 차단 트리거(block_suspended)
--     · 신고(create_report)에 target_type 'b2b_post' 추가 → 관리자 모더레이션
--
--   ▣ collab 과 다른 점(의도적):
--     · author_name 강제 트리거(tg_force_post_author)를 **걸지 않는다.** 여기선 개인
--       표시명이 아니라 **회사명(company_name)** 이 핵심이라 사용자 입력을 존중해야 한다.
--       (대신 user_id 는 RLS/컬럼잠금으로 위조 불가 → 실제 게시자 추적은 가능)
--     · link_url(회사 웹사이트)은 http/https 만 허용(CHECK) — javascript: 등 XSS 차단.
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1) 테이블 ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_posts (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name  text NOT NULL CHECK (char_length(company_name) BETWEEN 2 AND 100),
  -- 원하는 제휴 종류
  category      text NOT NULL CHECK (category IN
                  ('content_partnership','advertising','co_production','distribution','tech','other')),
  title         text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  description   text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 5000),
  -- 회사 웹사이트(선택) — http/https 만 허용해 링크 XSS/스킴 오용 차단
  link_url      text CHECK (link_url IS NULL OR link_url ~ '^https?://'),
  region        text CHECK (region IS NULL OR char_length(region) <= 60),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  is_hidden     boolean NOT NULL DEFAULT false,
  hidden_reason text,
  hidden_at     timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS b2b_posts_created_idx  ON public.b2b_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS b2b_posts_category_idx ON public.b2b_posts(category, created_at DESC);
CREATE INDEX IF NOT EXISTS b2b_posts_user_idx     ON public.b2b_posts(user_id);

-- ── 2) RLS (community_posts / collab_posts 와 동형) ──────────────────────────
ALTER TABLE public.b2b_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS b2b_posts_select ON public.b2b_posts;
CREATE POLICY b2b_posts_select ON public.b2b_posts
  FOR SELECT USING (
    COALESCE(is_hidden, false) = false   -- 공개
    OR auth.uid() = user_id              -- 내 글은 숨겨도 보임
    OR public.is_admin()                 -- 관리자
  );

DROP POLICY IF EXISTS b2b_posts_insert ON public.b2b_posts;
CREATE POLICY b2b_posts_insert ON public.b2b_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS b2b_posts_update ON public.b2b_posts;
CREATE POLICY b2b_posts_update ON public.b2b_posts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS b2b_posts_delete ON public.b2b_posts;
CREATE POLICY b2b_posts_delete ON public.b2b_posts
  FOR DELETE USING (auth.uid() = user_id);

-- ── 3) 컬럼 단위 쓰기 잠금 (#40 교훈: is_hidden·user_id 직접 조작 차단) ───────
REVOKE UPDATE ON public.b2b_posts FROM authenticated, anon;
GRANT  UPDATE (company_name, category, title, description, link_url, region, status, updated_at)
  ON public.b2b_posts TO authenticated;
-- SELECT/INSERT/DELETE 는 테이블 기본 GRANT + RLS 로 제어
GRANT SELECT ON public.b2b_posts TO anon, authenticated;
GRANT INSERT, DELETE ON public.b2b_posts TO authenticated;

-- ── 4) 정지 계정 쓰기 차단 (기존 트리거 함수 재사용) ─────────────────────────
DROP TRIGGER IF EXISTS block_suspended ON public.b2b_posts;
CREATE TRIGGER block_suspended BEFORE INSERT OR UPDATE ON public.b2b_posts
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_suspended();

COMMIT;

-- ── 5) 신고 시스템에 'b2b_post' 추가 (create_report 확장) ─────────────────────
--   community_reports_hardening_20260707 의 create_report 를 **기계 추출**해 3지점만
--   확장: target_type 화이트리스트 + 존재검증 + 자동숨김에 b2b_post 추가. 나머지(레이트
--   리밋·자기신고·comment/video 분기 등)는 원문 100% 보존. ★ create_report 새 정본 —
--   community_reports_hardening·reports_rpc_lockdown 재실행 금지(b2b 분기 소실).
CREATE OR REPLACE FUNCTION public.create_report(
  p_target_type TEXT,
  p_target_id TEXT,
  p_reason TEXT,
  p_description TEXT DEFAULT NULL
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reporter_id     UUID := auth.uid();
  v_report_id       BIGINT;
  v_threshold       NUMERIC;
  v_pending_count   INTEGER;
BEGIN
  IF v_reporter_id IS NULL THEN
    RAISE EXCEPTION '로그인이 필요합니다';
  END IF;

  -- 도배 방지: 1시간 20건 상한
  IF (SELECT COUNT(*) FROM public.reports
        WHERE reporter_id = v_reporter_id AND created_at > now() - INTERVAL '1 hour') >= 20 THEN
    RAISE EXCEPTION '신고가 너무 많습니다. 잠시 후 다시 시도해 주세요.';
  END IF;

  IF p_target_type NOT IN ('video', 'comment', 'user', 'community_post', 'b2b_post') THEN
    RAISE EXCEPTION '잘못된 신고 대상 종류: %', p_target_type;
  END IF;

  IF p_reason NOT IN ('spam', 'inappropriate', 'copyright', 'violence', 'harassment', 'misinformation', 'other') THEN
    RAISE EXCEPTION '잘못된 신고 사유: %', p_reason;
  END IF;

  IF p_target_type = 'user' AND p_target_id = v_reporter_id::TEXT THEN
    RAISE EXCEPTION '본인 자신은 신고할 수 없습니다';
  END IF;

  -- M3: 대상 실존검증 — 위조/미존재 target_id 로 큐·자동숨김 카운트 오염 차단
  IF p_target_type = 'video' AND NOT EXISTS (
       SELECT 1 FROM public.videos WHERE id = p_target_id) THEN
    RAISE EXCEPTION '존재하지 않는 신고 대상입니다';
  ELSIF p_target_type = 'comment' AND NOT EXISTS (
       SELECT 1 FROM public.comments WHERE id::TEXT = p_target_id) THEN
    RAISE EXCEPTION '존재하지 않는 신고 대상입니다';
  ELSIF p_target_type = 'community_post' AND NOT EXISTS (
       SELECT 1 FROM public.community_posts WHERE id::TEXT = p_target_id) THEN
    RAISE EXCEPTION '존재하지 않는 신고 대상입니다';
  ELSIF p_target_type = 'b2b_post' AND NOT EXISTS (
       SELECT 1 FROM public.b2b_posts WHERE id::TEXT = p_target_id) THEN
    RAISE EXCEPTION '존재하지 않는 신고 대상입니다';
  ELSIF p_target_type = 'user' AND NOT EXISTS (
       SELECT 1 FROM public.profiles WHERE id::TEXT = p_target_id) THEN
    RAISE EXCEPTION '존재하지 않는 신고 대상입니다';
  END IF;

  -- 신고 기록 (중복 시 unique index가 차단)
  INSERT INTO public.reports (reporter_id, target_type, target_id, reason, description)
  VALUES (v_reporter_id, p_target_type, p_target_id, p_reason, p_description)
  RETURNING id INTO v_report_id;

  -- 자동 숨김 처리 (신고 N건 누적 시)
  v_threshold := COALESCE(public.get_platform_setting('auto_hide_threshold'), 3);

  SELECT COUNT(*) INTO v_pending_count
  FROM public.reports
  WHERE target_type = p_target_type AND target_id = p_target_id AND status = 'pending';

  IF v_pending_count >= v_threshold THEN
    IF p_target_type = 'video' THEN
      UPDATE public.videos
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id = p_target_id AND is_hidden = false;
    ELSIF p_target_type = 'comment' THEN
      UPDATE public.comments
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id::TEXT = p_target_id AND is_hidden = false;
    ELSIF p_target_type = 'community_post' THEN
      UPDATE public.community_posts
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id::TEXT = p_target_id AND is_hidden = false;
    ELSIF p_target_type = 'b2b_post' THEN
      UPDATE public.b2b_posts
      SET is_hidden = true, hidden_reason = '신고 누적 자동 숨김 (어드민 검토 대기)', hidden_at = now()
      WHERE id::TEXT = p_target_id AND is_hidden = false;
    END IF;
  END IF;

  RETURN v_report_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_report(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_report(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── 6) 목록 조회 RPC (표시이름·정지 필터 불필요 — company_name 사용, 공개 게시판) ──
--   숨김글 제외는 RLS 가 이미 처리하나, DEFINER 로 명시(정렬·페이지네이션 안정).
CREATE OR REPLACE FUNCTION public.get_b2b_posts(
  p_category TEXT DEFAULT NULL,   -- NULL=전체
  p_limit    INT  DEFAULT 30,
  p_offset   INT  DEFAULT 0
)
RETURNS TABLE (
  id uuid, user_id uuid, company_name TEXT, category TEXT, title TEXT,
  description TEXT, link_url TEXT, region TEXT, status TEXT,
  created_at TIMESTAMPTZ, is_mine BOOLEAN
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT b.id, b.user_id, b.company_name, b.category, b.title,
         b.description, b.link_url, b.region, b.status,
         b.created_at, (b.user_id = auth.uid()) AS is_mine
  FROM public.b2b_posts b
  WHERE COALESCE(b.is_hidden, false) = false
    AND (p_category IS NULL OR b.category = p_category)
  ORDER BY b.created_at DESC, b.id DESC
  LIMIT GREATEST(p_limit, 0) OFFSET GREATEST(p_offset, 0);
$$;
REVOKE ALL ON FUNCTION public.get_b2b_posts(TEXT, INT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_b2b_posts(TEXT, INT, INT) TO anon, authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '① b2b_posts 테이블·RLS' AS check_name,
  CASE WHEN (SELECT relrowsecurity FROM pg_class WHERE oid='public.b2b_posts'::regclass)
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '② 집계·소유 컬럼 쓰기잠금(is_hidden·user_id 직접쓰기 차단)',
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.role_column_grants
    WHERE table_schema='public' AND table_name='b2b_posts'
      AND grantee='authenticated' AND privilege_type='UPDATE'
      AND column_name IN ('is_hidden','user_id','id','created_at'))
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '③ 편집 컬럼(company_name/title/status 등) 유지',
  CASE WHEN (SELECT count(DISTINCT column_name) FROM information_schema.role_column_grants
             WHERE table_schema='public' AND table_name='b2b_posts'
               AND grantee='authenticated' AND privilege_type='UPDATE'
               AND column_name IN ('company_name','title','description','status')) = 4
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '④ 정지 계정 쓰기차단 트리거',
  CASE WHEN EXISTS (SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
                    WHERE c.relname='b2b_posts' AND t.tgname='block_suspended' AND NOT t.tgisinternal)
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑤ 신고에 b2b_post 추가',
  CASE WHEN (SELECT prosrc ~ 'b2b_post' FROM pg_proc WHERE proname='create_report')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '⑥ link_url http/https 제약',
  CASE WHEN EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid='public.b2b_posts'::regclass AND contype='c'
                      AND pg_get_constraintdef(oid) ~ 'https\?')
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
