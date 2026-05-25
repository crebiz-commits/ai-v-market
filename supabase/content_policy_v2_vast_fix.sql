-- ════════════════════════════════════════════════════════════════════════════
-- 콘텐츠 정책 v2 — VAST Pre-roll 정책 재설계 (2026-05-26)
--
-- 배경 (시간순):
--   v1: Phase 28 RPC만 갱신해서 1분 미만 영상의 본편 광고를 차단했지만,
--       Bunny 내장 VAST pre-roll 은 별도 RPC(pick_random_video_preroll)를
--       호출해서 짧은 영상에서도 광고가 노출되는 버그 발견.
--   v2: source_video_id 검사 추가 → path parameter 방식으로 우회 시도.
--   v3 (확정): Bunny 플레이어가 vastTagUrl 의 path 마지막 segment 까지
--       잘라서 IMA SDK 에 전달 → source_video_id 가 서버에 도달 X.
--       서버에서 영상 길이 판단 자체가 불가.
--
-- 최종 설계 (v3):
--   클라이언트(ProductDetail.tsx)가 durationSeconds < 60 인 영상에선
--   vastTagUrl 파라미터 자체를 Bunny iframe URL 에 안 넣음 → Bunny 가
--   광고 호출 시도 X → 광고 노출 X. 1분+ 영상만 vastTagUrl 전송.
--
--   본 RPC 는 호출되면 무조건 광고 반환 (영상 길이 검사 안 함).
--   source_video_id 는 Bunny 가 잘라서 어차피 NULL 로 도착하므로
--   파라미터 자체는 hint 용 (트래킹 URL 에만 포함).
--
-- 실행 방법:
--   Supabase Dashboard → SQL Editor → 새 쿼리 → 본 파일 전체 붙여넣기 → Run
-- ════════════════════════════════════════════════════════════════════════════

-- 기존 시그니처(인자 없음) 명시적 제거 — 시그니처 변경이라 CREATE OR REPLACE만으론 안 됨
DROP FUNCTION IF EXISTS public.pick_random_video_preroll();
DROP FUNCTION IF EXISTS public.pick_random_video_preroll(TEXT);

CREATE OR REPLACE FUNCTION public.pick_random_video_preroll(
  p_source_video_id TEXT DEFAULT NULL
)
RETURNS SETOF public.ads
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 영상 길이 검사는 클라이언트 측에서 처리 (Bunny가 vastTagUrl path 잘라먹어
  -- source_video_id 가 서버에 도달 못함). 본 RPC 는 호출되면 광고 반환.
  -- p_source_video_id 는 hint 용 — 트래킹 URL 빌드에만 사용 (Edge Function에서).
  RETURN QUERY
  SELECT * FROM public.ads
  WHERE ad_type = 'video_preroll'
    AND is_active = true
    AND video_url IS NOT NULL
    AND video_url <> ''
    AND (starts_at IS NULL OR starts_at <= now())
    AND (ends_at IS NULL OR ends_at >= now())
  ORDER BY random() * weight DESC
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION public.pick_random_video_preroll IS
  'VAST pre-roll 광고 랜덤 선택. 1분 미만 차단은 클라이언트(ProductDetail)에서 처리 (콘텐츠 정책 v3)';

-- ────────────────────────────────────────────────────────────────────────────
-- 검증
--
--   -- 호출 시 광고 1개 반환되면 정상 (1분 미만 차단은 클라이언트 책임)
--   SELECT * FROM pick_random_video_preroll();
--   SELECT * FROM pick_random_video_preroll('a4991a29-85f9-4843-b0ab-878589b74547');
-- ════════════════════════════════════════════════════════════════════════════
