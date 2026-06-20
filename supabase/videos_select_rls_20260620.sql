-- ════════════════════════════════════════════════════════════════════════════
-- OTT/사이트 전체 감사 #1 — videos 테이블 SELECT RLS 좁히기 (2026-06-20)
--
--   문제: videos 의 공개 SELECT 정책이 "Anyone can view videos" USING(true) 라,
--         anon 이 .from("videos") 직접 조회로 **비공개(private)·미등록(unlisted)이지만
--         숨김된·모더레이션 미통과 영상의 모든 행/컬럼**(video_url·moderation_*·seed 등)을
--         읽을 수 있었음. → 홈피드 #6(RPC만 안전뷰로 막음)을 직접 SELECT 경로로 우회.
--         (OTT 히어로 Ott.tsx:209 가 videos 직접 조회라 이 경로가 드러남.)
--
--   수정: SELECT 를 "공개/미등록(링크공유)이고 숨김 아님  OR  본인 영상  OR  관리자" 로 제한.
--     - 공개(public)·미등록(unlisted)·레거시(visibility NULL) 이고 is_hidden=false → 누구나(링크/상세)
--     - creator_id = auth.uid() → 본인 영상은 전부(비공개·숨김 포함, 업로드편집·마이페이지)
--     - public.is_admin() → 관리자는 전부(어드민 화면)
--
--   영향범위 검증(코드 grep, .from("videos") 직접조회 12곳):
--     소유자조회(.eq creator_id=본인)·공개콘텐츠(id/visibility 필터)·관리자UI 전부 위 조건으로 통과.
--     RPC(SECURITY DEFINER)·Edge(service_role)는 RLS 우회라 무관.
--   주의: 컬럼 권한(REVOKE)은 안 함 — App.tsx/MyPage 가 select("*") 를 써서 깨질 수 있음.
--         즉 "공개 영상의 moderation_* 내부값" 노출은 남음(낮은 위험: 이미 공개된 영상의 운영 메타).
--
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Anyone can view videos" ON public.videos;
DROP POLICY IF EXISTS "videos_select_public_or_owner" ON public.videos;  -- 재실행 대비

CREATE POLICY "videos_select_public_or_owner" ON public.videos
  FOR SELECT USING (
    (COALESCE(visibility, 'public') IN ('public', 'unlisted') AND COALESCE(is_hidden, false) = false)
    OR creator_id = auth.uid()
    OR public.is_admin()
  );

-- (INSERT "Users can insert their own videos" / UPDATE "Users can update their own videos" 는 그대로 유지)

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT policyname, cmd, qual FROM pg_policies WHERE tablename='videos';
--   -- SELECT 행 qual 이 (visibility IN public,unlisted AND not hidden) OR creator_id=uid OR is_admin() 여야 함
--   -- (익명 세션 가정) 비공개/숨김 영상 직접조회는 0행, 공개 영상은 정상 조회
-- ════════════════════════════════════════════════════════════════════════════
