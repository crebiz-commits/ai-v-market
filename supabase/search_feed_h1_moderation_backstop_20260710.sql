-- ════════════════════════════════════════════════════════════════════════════
-- H-1: 미검수 영상 직접 INSERT 노출 차단 (defense-in-depth) (2026-07-10)
--
--   갭: 크리에이터가 앱(save-metadata)이 아니라 PostgREST 로 videos 를 직접 INSERT 하며
--       is_hidden 을 생략하면 → is_hidden=false + moderation_status='pending' → Vision 검수 전에
--       검색·홈·시네마·OTT·채널 등 전 피드(전부 is_hidden 만 필터)에 노출됨. RLS "Users can insert
--       their own videos" 가 이 직접삽입을 허용하므로 hide-until-passed 가 애플리케이션 의존이었음.
--
--   확인: 앱은 videos 를 직접 insert 하지 않음(전부 save-metadata Edge=service_role 경유, grep 확인).
--         벌크업로드도 save-metadata 경유. 즉 정상 업로드는 service_role(auth.uid()=NULL) 삽입.
--
--   수정: BEFORE INSERT 트리거로 **인증 사용자의 직접 INSERT(auth.uid() 있음)만** 검수대기+숨김 강제.
--         → hide-until-passed 를 DB 불변식으로 승격. 뷰/RPC 변경·시드 백필 불필요(기존행 무영향),
--           service_role(save-metadata/벌크) 경로 안 깨짐. 검수 웹훅은 UPDATE 라 트리거 미발동.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_videos_enforce_moderation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- auth.uid() 는 SECURITY DEFINER 무관하게 실제 호출자 JWT 를 반영.
  --   service_role(앱 save-metadata/벌크업로드) 은 sub 없어 NULL → 강제 안 함(정상 업로드 보존).
  --   authenticated 직접 INSERT 만 강제 → 미검수 우회 차단(fail-closed).
  IF auth.uid() IS NOT NULL THEN
    NEW.moderation_status := 'pending';
    NEW.is_hidden := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS videos_enforce_moderation ON public.videos;
CREATE TRIGGER videos_enforce_moderation
  BEFORE INSERT ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_videos_enforce_moderation();

-- ── 검증 ──────────────────────────────────────────────────────────────────────
--   -- (인증 세션에서) 직접 INSERT 시 is_hidden/moderation_status 가 강제되는지:
--   -- INSERT INTO public.videos(id, title, creator_id, is_hidden, moderation_status)
--   --   VALUES ('test-guid','x', auth.uid(), false, 'passed') RETURNING is_hidden, moderation_status;
--   --   → is_hidden=true, moderation_status='pending' 여야(강제됨). (테스트 후 삭제)
--   SELECT tgname FROM pg_trigger WHERE tgrelid='public.videos'::regclass AND NOT tgisinternal;
