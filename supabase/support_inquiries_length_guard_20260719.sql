-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 고객센터 문의 입력 서버강제 (2026-07-19) — 길이/공백 CHECK
--
--   [배경] 고객센터(SupportPage) 감사. 배선·보안은 정상:
--     · RLS INSERT WITH CHECK(auth.uid()=user_id) — 타인 명의 문의 위조 차단
--     · RLS SELECT (본인 OR is_admin) — 교차 열람 없음 / UPDATE 관리자 전용
--     · admin_reply_support_inquiry: assert_admin + 알림 link '/?support={id}'(쿼리스트링 파서 호환)
--       → 답변→알림→딥링크→스크롤·강조 사슬 정상
--   [결함] 클라는 maxLength(제목 100·본문 2000)와 공백금지를 걸지만 **DB엔 제약이 없어**
--     PostgREST 직접 INSERT 로 우회 가능: 수 MB 본문(저장소 남용·관리자 목록 렌더 파손),
--     빈 제목/본문(관리자 큐 오염). source_url 도 클라 제공값인데 무제한.
--   [조치] 서버측 CHECK 로 클라 규칙을 강제. 여유(2배)를 둬 기존 정상행은 그대로 통과.
--     · subject : 트림 후 1~200자   (클라 100)
--     · message : 트림 후 1~4000자  (클라 2000)
--     · source_url : NULL 또는 500자 이하
--   적용: Supabase SQL Editor → Run (멱등 — DROP 후 ADD).
--
--   ※ 도배(레이트리밋)는 미적용 — 현재 남용 정황 없고 정상 사용자 차단 리스크가 있어 보류.
--     필요 시 BEFORE INSERT 트리거로 "1시간 N건" 제한 추가 가능.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.support_inquiries DROP CONSTRAINT IF EXISTS support_inquiries_subject_len;
ALTER TABLE public.support_inquiries
  ADD CONSTRAINT support_inquiries_subject_len
  CHECK (char_length(btrim(subject)) BETWEEN 1 AND 200);

ALTER TABLE public.support_inquiries DROP CONSTRAINT IF EXISTS support_inquiries_message_len;
ALTER TABLE public.support_inquiries
  ADD CONSTRAINT support_inquiries_message_len
  CHECK (char_length(btrim(message)) BETWEEN 1 AND 4000);

ALTER TABLE public.support_inquiries DROP CONSTRAINT IF EXISTS support_inquiries_source_url_len;
ALTER TABLE public.support_inquiries
  ADD CONSTRAINT support_inquiries_source_url_len
  CHECK (source_url IS NULL OR char_length(source_url) <= 500);

-- ── 검증 (선택) ──
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.support_inquiries'::regclass AND contype = 'c'
--   ORDER BY conname;   -- category/status 기존 CHECK + 위 3종이 보여야 정상
-- ════════════════════════════════════════════════════════════════════════════
