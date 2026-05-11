-- ════════════════════════════════════════════════════════════════════════════
-- Phase 6.6 — 사용자 아바타 일관화 (2026-05-12)
--
-- 추가 작업:
--   1. user-avatars Storage 버킷 (본인이 직접 업로드)
--   2. get_creators_info(uuid[]) RPC — 여러 크리에이터 정보를 한 번에 반환
--      → 모든 영상 카드/카드 그리드에서 일관된 이름·아바타 표시
--
-- 적용 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 만들어서 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- ────────────────────────────────────────────────────────────────────────────
-- 1. user-avatars 버킷
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'user-avatars',
  'user-avatars',
  true,
  2097152,  -- 2MB (아바타는 작아도 충분)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public read user avatars" ON storage.objects;
CREATE POLICY "Public read user avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-avatars');

DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'user-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'user-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'user-avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 2. RPC: 여러 크리에이터의 이름·아바타를 한 번에 반환
--    클라이언트는 영상 목록 받은 후 unique creator_ids로 한 번 호출 → 매핑
-- ────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_creators_info(UUID[]);
CREATE OR REPLACE FUNCTION public.get_creators_info(p_creator_ids UUID[])
RETURNS TABLE (
  creator_id UUID,
  creator_name TEXT,
  avatar_url TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id AS creator_id,
    COALESCE(
      NULLIF(p.display_name, ''),
      NULLIF(u.raw_user_meta_data->>'name', ''),
      NULLIF(u.raw_user_meta_data->>'full_name', ''),
      NULLIF(split_part(u.email, '@', 1), ''),
      'AI Creator'
    ) AS creator_name,
    COALESCE(
      NULLIF(p.avatar_url, ''),
      NULLIF(u.raw_user_meta_data->>'avatar_url', ''),
      NULLIF(u.raw_user_meta_data->>'picture', '')
    ) AS avatar_url
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE u.id = ANY(p_creator_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_creators_info(UUID[]) TO anon, authenticated;
