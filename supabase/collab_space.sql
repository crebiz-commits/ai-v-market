-- ════════════════════════════════════════════════════════════════════════════
-- 🛑 미배포 폐기 설계 (2026-07-07 확인) — 재실행 금지.
--   이 파일의 collab_applications 테이블 + apply_to_collab() '지원(관심)' 모델은
--   라이브에 배포되지 않았고 채택되지도 않았음(라이브 검증: apply_to_collab 부재).
--   실제 라이브 협업 지원 흐름 = **비공개 문의 스레드 모델**:
--     collab_inquiries.sql (collab_inquire / collab_thread_send / collab_threads_for
--     / collab_thread_mark_read + collab_threads / collab_messages 테이블)
--     + collab_inquire_closed_guard_20260628.sql + collab_notify_privacy_20260614.sql.
--   프론트(CollabInquiryModal.tsx)도 위 문의스레드 RPC만 호출한다.
--   ⚠️ 이 파일을 Run 하면 쓰지 않는 collab_applications/apply_to_collab 이 생겨 감사
--     혼선을 유발하므로 적용하지 말 것. (collab_posts 테이블 정의는 collab_inquiries.sql
--     쪽과 중복 — 라이브는 이미 존재.)
-- ════════════════════════════════════════════════════════════════════════════
-- 크리에이터 협업 공간 (커뮤니티 → 협업 탭)
-- 적용 일자: 2026-06-08
--
-- 구성:
--   1. collab_posts          — 협업 모집/구직/도움/외주 글
--   2. collab_applications   — 협업 지원(관심) 기록 (post_id + applicant_id UNIQUE)
--   3. notifications.type 에 'collab' 추가 (글 작성자에게 인앱 알림)
--   4. apply_to_collab() RPC — SECURITY DEFINER: 지원 기록 + 지원자수 증가 + 작성자 알림
--      (notifications RLS 가 본인에게만 insert 허용하므로 타인 알림은 definer 로 처리)
--
-- 적용: Supabase Dashboard → SQL Editor → 새 쿼리("+")에 전체 붙여넣기 → Run
--       (IF NOT EXISTS / idempotent — 재실행 안전)
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. 협업 글 테이블 ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collab_posts (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name      text NOT NULL,
  author_avatar    text,
  type             text NOT NULL CHECK (type IN ('recruit', 'join', 'help', 'outsource')),
  title            text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 200),
  description      text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 5000),
  roles            text[] NOT NULL DEFAULT '{}',
  reward           text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  applicants_count integer NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS collab_posts_created_idx ON public.collab_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS collab_posts_type_idx    ON public.collab_posts(type);
CREATE INDEX IF NOT EXISTS collab_posts_user_idx    ON public.collab_posts(user_id);

ALTER TABLE public.collab_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS collab_posts_select ON public.collab_posts;
CREATE POLICY collab_posts_select ON public.collab_posts
  FOR SELECT USING (true);   -- 누구나 열람

DROP POLICY IF EXISTS collab_posts_insert ON public.collab_posts;
CREATE POLICY collab_posts_insert ON public.collab_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 주의: authenticated 역할에는 profiles SELECT 권한이 없어서, RLS 정책 안에서
--       profiles 를 참조하면 "permission denied for table profiles" 로 작업 전체가 실패한다.
--       따라서 작성자 본인만 허용한다. (관리자 모더레이션은 service_role 이 RLS 우회)
DROP POLICY IF EXISTS collab_posts_update ON public.collab_posts;
CREATE POLICY collab_posts_update ON public.collab_posts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS collab_posts_delete ON public.collab_posts;
CREATE POLICY collab_posts_delete ON public.collab_posts
  FOR DELETE USING (auth.uid() = user_id);

-- ── 2. 협업 지원(관심) 테이블 ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collab_applications (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id        uuid NOT NULL REFERENCES public.collab_posts(id) ON DELETE CASCADE,
  applicant_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applicant_name text,
  message        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, applicant_id)
);

CREATE INDEX IF NOT EXISTS collab_apps_post_idx ON public.collab_applications(post_id);
CREATE INDEX IF NOT EXISTS collab_apps_app_idx  ON public.collab_applications(applicant_id);

ALTER TABLE public.collab_applications ENABLE ROW LEVEL SECURITY;

-- 지원자 본인 또는 글 작성자만 열람
DROP POLICY IF EXISTS collab_apps_select ON public.collab_applications;
CREATE POLICY collab_apps_select ON public.collab_applications
  FOR SELECT USING (
    applicant_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.collab_posts p WHERE p.id = post_id AND p.user_id = auth.uid())
  );

-- 직접 insert 도 허용(본인 명의) — 단, 알림 발송은 RPC 권장
DROP POLICY IF EXISTS collab_apps_insert ON public.collab_applications;
CREATE POLICY collab_apps_insert ON public.collab_applications
  FOR INSERT WITH CHECK (applicant_id = auth.uid());

-- 지원 철회(본인)
DROP POLICY IF EXISTS collab_apps_delete ON public.collab_applications;
CREATE POLICY collab_apps_delete ON public.collab_applications
  FOR DELETE USING (applicant_id = auth.uid());

-- ── 3. notifications.type 에 'collab' 추가 ───────────────────────────────────
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('like', 'comment', 'purchase', 'sale', 'system', 'challenge', 'collab'));

-- ── 4. 지원 RPC (SECURITY DEFINER) ───────────────────────────────────────────
--   반환값: 'ok'(지원 완료) / 'already'(이미 지원함)
--   예외:   auth 없음 / 글 없음 / 본인 글 지원 시도
CREATE OR REPLACE FUNCTION public.apply_to_collab(p_post_id uuid, p_message text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_title  text;
  v_status text;
  v_name   text;
  v_inserted integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;

  SELECT user_id, title, status INTO v_owner, v_title, v_status
  FROM public.collab_posts WHERE id = p_post_id;

  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'collab post not found';
  END IF;
  IF v_owner = v_uid THEN
    RAISE EXCEPTION 'cannot apply to your own post';
  END IF;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'this collab is closed';
  END IF;

  SELECT COALESCE(display_name, '크리에이터') INTO v_name
  FROM public.profiles WHERE id = v_uid;
  v_name := COALESCE(v_name, '크리에이터');

  INSERT INTO public.collab_applications (post_id, applicant_id, applicant_name, message)
  VALUES (p_post_id, v_uid, v_name, NULLIF(btrim(p_message), ''))
  ON CONFLICT (post_id, applicant_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    RETURN 'already';
  END IF;

  UPDATE public.collab_posts
  SET applicants_count = applicants_count + 1
  WHERE id = p_post_id;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    v_owner,
    'collab',
    v_name || '님이 협업에 관심을 보였어요',
    '「' || v_title || '」',
    '/?tab=community&sub=collab'
  );

  RETURN 'ok';
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_to_collab(uuid, text) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- (선택) 샘플 데이터 — 본인 계정으로 몇 개 올려보고 싶다면 아래를 참고하세요.
--   실제로는 앱의 "협업 글 올리기" 버튼으로 등록하는 것을 권장합니다.
-- ════════════════════════════════════════════════════════════════════════════
