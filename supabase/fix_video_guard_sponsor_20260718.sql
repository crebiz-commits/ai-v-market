-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 크리에이터 협찬 검수 자가승인 우회 차단 — 가드에 sponsor_review_status 편입 (2026-07-18)
--
--   [결함] tg_protect_video_update(fix_videos_update_guard_20260712.sql)가 비신뢰 직접
--     PostgREST UPDATE 에서 is_hidden/moderation/show_on/creator/price 는 OLD 로 되돌리나
--     sponsor_review_status/sponsor_reviewed_at/sponsor_review_note 는 보호 목록에 없음.
--     GRANT UPDATE ON videos TO authenticated 라, 크리에이터가
--       UPDATE public.videos SET sponsor_review_status='approved' WHERE id='<본인영상>'
--     로 관리자 검수 없이 자가승인 가능 → 부적정/기만 공시가 "승인됨"으로 위장
--     (공정거래법 부당표시 리스크). 관리자 RPC admin_review_sponsorship 은 SECURITY DEFINER
--     (=postgres 신뢰)라 가드가 통과시켜 정상 동작 — 영향 없음.
--   [수정] 비신뢰 revert 목록에 sponsor 검수 3컬럼 추가. 재검수 트리거(trg_reset_sponsor_review,
--     BEFORE UPDATE OF sponsor_brand/logo/disclosure/link_url → status=NULL)와 트리거명 순서
--     (protect_video_update < trg_reset_sponsor_review)로 정합: 협찬정보 직접수정 시 protect가
--     OLD로 되돌린 뒤 reset이 NULL(재검수)로 확정 → 자가승인 차단 + 재검수 유지.
--
--   ★ 이 파일이 tg_protect_video_update 새 정본. fix_videos_update_guard_20260712.sql 의
--     해당 함수 재실행 금지(sponsor 보호가 빠져 자가승인 재개통). 게이트 #14/#20 로 감시.
--   보안: SECURITY DEFINER + inline search_path 유지(게이트 #9). GRANT/트리거는 기존 유지.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_protect_video_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  -- 신뢰 경로(DEFINER 트리거/RPC=postgres·supabase_admin, Edge=service_role)는 그대로 통과.
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
    -- 협찬 검수 상태 자가승인 차단(2026-07-18) — 크리에이터가 직접 approved/reviewed 설정 무효화.
    --   협찬 정보 수정 시의 재검수(status=NULL)는 trg_reset_sponsor_review 가 이후 처리.
    NEW.sponsor_review_status := OLD.sponsor_review_status;
    NEW.sponsor_reviewed_at   := OLD.sponsor_reviewed_at;
    NEW.sponsor_review_note   := OLD.sponsor_review_note;
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

-- 트리거는 이미 존재(재생성 불필요) — 함수 본문만 교체됨. 안전상 재보장:
DROP TRIGGER IF EXISTS protect_video_update ON public.videos;
CREATE TRIGGER protect_video_update
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.tg_protect_video_update();

-- ── 스폰서십 검수 RPC 하드닝 — PUBLIC/anon EXECUTE 회수(assert_admin 은 최종 게이트) ──
REVOKE ALL ON FUNCTION public.admin_list_sponsored_videos(TEXT)            FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_sponsored_videos(TEXT)         TO authenticated;
REVOKE ALL ON FUNCTION public.admin_review_sponsorship(TEXT,BOOLEAN,TEXT,BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_sponsorship(TEXT,BOOLEAN,TEXT,BOOLEAN) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(비관리자 세션):
--   UPDATE public.videos SET sponsor_review_status='approved' WHERE id='<본인 협찬영상>';
--     → 반영 안 됨(OLD 유지). 관리자 admin_review_sponsorship 만 승인 가능.
-- ════════════════════════════════════════════════════════════════════════════
