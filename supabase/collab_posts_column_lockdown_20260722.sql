-- ════════════════════════════════════════════════════════════════════════════
-- 🔒 collab_posts 컬럼 단위 쓰기 잠금 (2026-07-22) — 커뮤니티 감사
--
--   [결함] community_posts 는 컬럼 GRANT 로 likes_count/comments_count/is_hidden/
--     user_id 조작을 막았는데(community_m1_posts_lockdown_20260707), 형제 테이블
--     collab_posts(협업 공간)에는 그 잠금이 없다. RLS 정책은 `auth.uid()=user_id`
--     (작성자)만 UPDATE 를 허용하지만, **작성자는 자기 글의 applicants_count 를
--     임의 값으로 직접 UPDATE 할 수 있다** → "지원자 9999명"으로 위조해 인기 조작.
--     applicants_count 는 apply_to_collab()/moderate 경로가 +1 자동 갱신하는
--     집계 컬럼이라 사용자가 직접 쓰면 안 된다(likes_count 와 같은 클래스).
--
--   [조치] community_posts 와 동일 패턴 — REVOKE UPDATE 후 안전 컬럼만 재부여.
--     현재 collab 편집 UI 는 UPDATE 를 호출하지 않지만(insert·delete 만), 향후
--     '모집 마감'(status) 등이 생길 것에 대비해 사용자 편집 가능 컬럼만 화이트리스트.
--     applicants_count 는 apply_to_collab(SECURITY DEFINER)이 갱신하므로 GRANT 불필요.
--
--   ▣ author_name/author_avatar 는 tg_force_post_author 트리거가 프로필로 강제
--     덮으므로(community_security_20260621) 위조 무의미하나, GRANT 는 유지(트리거가
--     BEFORE 라 컬럼 쓰기 자체는 허용돼야 트리거가 값을 덮어씀).
--   적용: Supabase SQL Editor → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE UPDATE ON public.collab_posts FROM authenticated;
REVOKE UPDATE ON public.collab_posts FROM anon;
GRANT  UPDATE (title, description, type, roles, reward, status,
               author_name, author_avatar, updated_at)
  ON public.collab_posts TO authenticated;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   authenticated 가 applicants_count·user_id·id·created_at 에 UPDATE 권한이 없어야 PASS.
SELECT 'collab_posts 집계·소유 컬럼 쓰기잠금(applicants_count 조작차단)' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM information_schema.role_column_grants
    WHERE table_schema='public' AND table_name='collab_posts'
      AND grantee='authenticated' AND privilege_type='UPDATE'
      AND column_name IN ('applicants_count','user_id','id','created_at')
  ) THEN '✅ PASS' ELSE '🔴 FAIL — applicants_count 등 조작 가능' END AS status
UNION ALL
SELECT '편집 가능 컬럼(title/status 등)은 유지',
  CASE WHEN (
    SELECT count(DISTINCT column_name) FROM information_schema.role_column_grants
    WHERE table_schema='public' AND table_name='collab_posts'
      AND grantee='authenticated' AND privilege_type='UPDATE'
      AND column_name IN ('title','description','status')
  ) = 3 THEN '✅ PASS' ELSE '🔴 FAIL — 편집 컬럼이 과잉 회수됨' END;
-- ════════════════════════════════════════════════════════════════════════════
