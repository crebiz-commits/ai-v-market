-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 videos 잠금 회귀 수정 — REVOKE → 가드 트리거로 전환 (2026-07-12)
--
--   회귀: fix_videos_update_lockdown_20260711.sql 의 REVOKE UPDATE(...FROM PUBLIC 포함)가
--         너무 광범위해서, videos 를 갱신하는 SECURITY DEFINER 트리거/함수(좋아요·조회수
--         카운트 동기화 등)의 videos UPDATE 권한까지 막음. 결과: 좋아요 시
--         "permission denied for table videos"(42501) → 좋아요/조회수 카운트 실패.
--
--   해결: REVOKE 대신 protect_subscription_columns 와 동일한 BEFORE UPDATE 가드 트리거로
--         보호. GRANT 를 복원해 DEFINER 경로(트리거·RPC=postgres 실행)를 되살리고, 직접
--         PostgREST UPDATE(비신뢰 current_user)만 민감 컬럼 변경을 무효화 →
--         self-approve·티어위조·소유권/가격 조작·편집 재검수 우회를 grant 와 무관하게 차단.
--
-- 적용: Supabase SQL Editor → Run (멱등). 이후 _verify_videos_update_rls 의 ③은
--       "직접 UPDATE 권한 있음"으로 바뀌지만, 보호는 가드 트리거가 담당(정상).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) GRANT 복원 — REVOKE 로 끊긴 DEFINER 트리거/함수 경로 되살림 ───────────
--   authenticated: 앱/일반 경로. postgres: DEFINER 트리거·RPC 소유자(핵심 복원).
GRANT UPDATE ON public.videos TO authenticated;
GRANT UPDATE ON public.videos TO postgres;

-- ── 2) 보호 가드 트리거 — 비신뢰 롤의 직접 UPDATE 만 민감 컬럼 변경 차단 ──────
CREATE OR REPLACE FUNCTION public.tg_protect_video_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- 신뢰 경로(DEFINER 트리거/RPC=postgres·supabase_admin, Edge=service_role)는 그대로 통과.
  --   protect_subscription_columns 와 동일 판정.
  IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role')
     AND COALESCE(current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    -- 비신뢰(authenticated 직접 PostgREST UPDATE): 검수·티어·소유권·가격·기간 변경 무효화
    NEW.is_hidden         := OLD.is_hidden;
    NEW.moderation_status := OLD.moderation_status;
    NEW.moderation_score  := OLD.moderation_score;
    NEW.show_on_ott       := OLD.show_on_ott;
    NEW.show_on_cinema    := OLD.show_on_cinema;
    NEW.creator_id        := OLD.creator_id;
    NEW.duration_seconds  := OLD.duration_seconds;
    NEW.price_standard    := OLD.price_standard;
    NEW.price_commercial  := OLD.price_commercial;
    NEW.price_exclusive   := OLD.price_exclusive;
    -- 콘텐츠(제목·설명·썸네일·태그) 직접변경 시 재검수 게이트(RPC 우회 차단, 편집 재검수와 동일)
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.thumbnail IS DISTINCT FROM OLD.thumbnail
       OR NEW.tags IS DISTINCT FROM OLD.tags THEN
      NEW.is_hidden := true;
      NEW.moderation_status := 'pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_video_update ON public.videos;
CREATE TRIGGER protect_video_update
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_video_update();

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 좋아요/조회수 카운트 갱신 정상(42501 안 남) — 앱에서 좋아요 눌러 확인.
--   -- 가드 존재: SELECT tgname FROM pg_trigger WHERE tgrelid='public.videos'::regclass
--   --            AND tgname='protect_video_update';                       -- 1행
--   -- 직접 self-approve 차단(비관리 세션): UPDATE videos SET is_hidden=false WHERE id='...';
--   --   → 0행 영향(있어도 is_hidden 안 바뀜) 이어야 정상.
-- ════════════════════════════════════════════════════════════════════════════
