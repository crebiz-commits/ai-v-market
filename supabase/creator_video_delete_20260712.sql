-- ════════════════════════════════════════════════════════════════════════════
-- 창작자 본인 영상 삭제 RPC + 골드베인 시리즈 정정 (2026-07-12)
--
--   ① delete_my_video: 마이페이지에서 크리에이터가 본인 영상을 직접 삭제(기존엔 편집만
--      있고 삭제가 없어 관리자 경유해야 했음). 소유권(creator_id=auth.uid()) 검증 +
--      판매된 라이선스 있으면 차단(구매자 보호).
--   ② 일회성 데이터 정정: 오늘 재업로드한 골드베인(①)이 어제 것(1화)과 같은 시리즈의
--      "2화"로 잡혀 시리즈 대표작(1화=숨김)이 없어 피드 카드가 안 뜸. 어제 1화를 삭제했으니
--      오늘 것을 단독 영화로(series_id/화수 해제) → 정상 단일 카드로 노출.
--
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 창작자 본인 영상 삭제 ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_my_video(p_video_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다'; END IF;
  SELECT creator_id INTO v_owner FROM public.videos WHERE id = p_video_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION '영상을 찾을 수 없습니다'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION '본인 영상만 삭제할 수 있습니다'; END IF;
  -- 구매자 보호: 판매된 라이선스(완료 주문)가 있으면 삭제 금지
  IF EXISTS (SELECT 1 FROM public.orders WHERE video_id = p_video_id AND status = 'completed') THEN
    RAISE EXCEPTION '이미 판매된 라이선스가 있어 삭제할 수 없습니다. 필요하면 숨김 처리 후 고객센터로 문의해 주세요.';
  END IF;
  DELETE FROM public.videos WHERE id = p_video_id AND creator_id = auth.uid();
  -- collection_videos 는 FK ON DELETE CASCADE 로 자동 정리.
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_my_video(text) TO authenticated;

-- ── ② 골드베인(오늘 것) 단독 영화로 정정 (시리즈 해제) ──────────────────────
UPDATE public.videos
SET series_id = NULL, season_number = NULL, episode_number = NULL
WHERE id = '7a60da30-03a9-4783-86c1-e5025cd0f1d2';

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT id, title, series_id, season_number, episode_number
--   FROM public.videos WHERE id='7a60da30-03a9-4783-86c1-e5025cd0f1d2';  -- series_id=NULL
-- ════════════════════════════════════════════════════════════════════════════
