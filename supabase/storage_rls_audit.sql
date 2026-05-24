-- ════════════════════════════════════════════════════════════════════════════
-- Supabase Storage RLS 정책 점검 (2026-05-24)
--
-- 목적:
--   현재 운영 중인 모든 Storage 버킷과 그 RLS 정책을 한눈에 확인
--   누락된 버킷이 있으면 비공개 파일이 비공개 처리 안 될 수 있음
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 ("+") → 본 파일 내용 붙여넣기 → Run
--   결과 3개 쿼리: 버킷 목록, 정책 목록, 누락된 정책 발견
-- ════════════════════════════════════════════════════════════════════════════

-- ① 등록된 모든 Storage 버킷 + 공개 여부
SELECT
  id AS bucket_id,
  name AS bucket_name,
  public AS is_public,
  file_size_limit,
  allowed_mime_types,
  created_at
FROM storage.buckets
ORDER BY created_at;

-- ② storage.objects 에 적용된 RLS 정책 전체 목록
SELECT
  pol.polname AS policy_name,
  CASE pol.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END AS command,
  pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
  pg_get_expr(pol.polwithcheck, pol.polrelid) AS with_check_expr
FROM pg_policy pol
JOIN pg_class cls ON cls.oid = pol.polrelid
JOIN pg_namespace ns ON ns.oid = cls.relnamespace
WHERE ns.nspname = 'storage'
  AND cls.relname = 'objects'
ORDER BY pol.polname;

-- ③ 정책이 없는 비공개 버킷 발견 (위험)
--    is_public=false 인데 RLS 정책이 그 버킷 이름을 언급 안 하면 누구도 접근 불가 또는 무제한
SELECT
  b.id AS bucket_id,
  b.name AS bucket_name,
  b.public AS is_public,
  CASE
    WHEN b.public THEN '⚠️ 공개 — 누구나 READ 가능. 의도 확인'
    ELSE '🔒 비공개 — RLS 정책 점검 필요'
  END AS status
FROM storage.buckets b
ORDER BY b.public DESC, b.name;

-- ────────────────────────────────────────────────────────────────────────────
-- 점검 후 확인 사항
--
--   1. 모든 버킷이 의도된 공개/비공개 설정인지
--      - 영상 (Bunny Stream) → 우리 Storage에 없을 가능성 (Bunny 외부)
--      - 썸네일 (video-thumbnails) → 공개 OK (URL로 접근)
--      - 자막 (video-subtitles) → 공개 OK (vtt 파일 직접 fetch)
--      - 아바타/배너 → 공개 OK
--      - 결제 영수증·세금계산서·기타 민감 자료가 Storage에 있다면 비공개여야 함
--
--   2. ②번 결과의 정책이 의도된 동작인지
--      - 본인 폴더만 업로드 가능 (bucket_id = 'video-thumbnails' AND auth.uid()::text = ...)
--      - 인증된 사용자만 INSERT/DELETE 허용 등
--
--   3. 누락된 정책이 있으면 추가 SQL 작성
-- ────────────────────────────────────────────────────────────────────────────
