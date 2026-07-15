-- ════════════════════════════════════════════════════════════════════════════
-- 비즈니스 문의 감사(3차) — 공개 제출 폼 rate-limit + 캡차 하드닝 (2026-07-16)
--
--   [결함/갭] business_inquiries INSERT RLS 가 WITH CHECK(true) 라 인증·제한·캡차 없이
--     누구나(공개 anon 키만으로) 무제한 제출 가능 → 스팸/봇 문의로 패널 오염 + (2차에서
--     추가한) 관리자 알림 증폭의 근본 원인. 2차 트리거 스로틀은 "알림"만 상한했을 뿐
--     제출 자체는 못 막음.
--   [수정] 제출을 Edge /submit-business-inquiry(service_role) 로 단일화 —
--     ① IP 해시 기준 rate-limit(시간당 3건) ② Turnstile 캡차(키 설정 시) ③ 서버측 필드검증
--     후 삽입. 직접 INSERT RLS 정책 제거(= anon/authenticated 직접삽입 차단, Edge 만 가능).
--     ip_hash: 원문 IP 미저장(프라이버시), sha256(ip+서버시크릿) 만 저장 → rate-limit·남용추적.
--
--   ⚠️ 적용 순서: 프론트(Edge 경유)·Edge 배포가 라이브가 된 뒤 이 SQL 을 Run 할 것.
--     (Edge 는 service_role 라 정책 제거 후에도 삽입 가능. 구 프론트 직접삽입만 차단됨.)
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- rate-limit·남용추적용 IP 해시(원문 미저장)
ALTER TABLE public.business_inquiries
  ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_business_inquiries_ip
  ON public.business_inquiries(ip_hash, created_at DESC);

-- 직접 INSERT 차단 — 제출은 Edge /submit-business-inquiry(service_role) 로만.
--   (service_role 는 RLS 우회라 이 정책 제거 후에도 Edge 삽입은 정상.)
DROP POLICY IF EXISTS "Anyone can submit inquiry" ON public.business_inquiries;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- INSERT 정책이 없어야(anon/authenticated 직접삽입 차단):
--   SELECT policyname, cmd FROM pg_policies
--   WHERE tablename='business_inquiries' AND cmd='INSERT';   -- 0행 기대
--   -- 폼 제출(Edge 경유) 후 ip_hash 채워지는지:
--   SELECT company_name, ip_hash, created_at FROM public.business_inquiries
--   ORDER BY created_at DESC LIMIT 3;
-- ════════════════════════════════════════════════════════════════════════════
