-- ════════════════════════════════════════════════════════════════════════════
-- community_posts.title_en / content_en — authenticated UPDATE 권한 추가 (2026-07-09)
--
--   배경: community_m1_posts_lockdown_20260707.sql 이 community_posts 의 UPDATE 를
--         9컬럼 화이트리스트(title, content, category, video_id, prompt_text, is_notice,
--         author_name, author_avatar, updated_at)로 잠갔다. 다음 날
--         community_post_i18n_20260708.sql 이 title_en/content_en 컬럼을 추가했으나
--         이 화이트리스트에는 넣지 않았다.
--   증상: Community.tsx autoTranslateNotice() 가 관리자 세션으로
--         `update({ title_en, content_en })` 를 실행하면 컬럼단위 권한에 걸려
--         42501(permission denied for column title_en)로 전체 UPDATE 가 거부된다.
--         호출부가 try/catch 로 조용히 무시(번역 실패=한글 폴백)하기 때문에 에러 없이
--         "신규 공지의 영문본이 영영 저장되지 않는" 형태로 degrade 됐다.
--   범위: title_en/content_en 은 title/content 와 동급의 콘텐츠 컬럼이고, UPDATE 대상 행은
--         RLS(community_posts UPDATE = auth.uid()=user_id)로 본인 글에 한정되므로
--         authenticated 에 컬럼 UPDATE 를 여는 것은 안전(민감 컬럼 아님).
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

GRANT UPDATE (title_en, content_en) ON public.community_posts TO authenticated;

-- 검증: authenticated 가 UPDATE 가능한 community_posts 컬럼에 title_en/content_en 이 포함돼야 함
--   SELECT column_name
--     FROM information_schema.column_privileges
--    WHERE grantee = 'authenticated'
--      AND table_schema = 'public' AND table_name = 'community_posts'
--      AND privilege_type = 'UPDATE'
--    ORDER BY column_name;
--   -- 기대: title_en, content_en 이 목록에 보임 (기존 9컬럼 + 2)
