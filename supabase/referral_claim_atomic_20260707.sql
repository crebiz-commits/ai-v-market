-- ════════════════════════════════════════════════════════════════════════════
-- C3 (MAJOR) 추천 연결 원자화 — referral_count 부풀리기 차단 (2026-07-07)
--
--   문제: claim_referral 이 referred_by 연결(WHERE ... referred_by IS NULL, 원자적)
--         과 별개로 referral_count 를 **무조건 +1** 했다. 동시호출(TOCTOU) 또는
--         이미 연결된 사용자가 다른 코드로 재호출하면 연결은 0행이어도 추천인
--         카운트는 증가 → 부풀리기(추후 추천보상 도입 시 부정수령 위험).
--   수정: 연결 UPDATE 의 ROW_COUNT 를 확인해 **실제 연결된 경우에만** 카운트 증가.
--         (자기추천 v_referrer=v_uid 차단은 기존 유지) + search_path 고정(#9).
--   적용: Supabase SQL Editor → Run (멱등). 이 파일이 claim_referral 최신 정본.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.claim_referral(p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_referrer UUID;
  v_claimed  INTEGER;
BEGIN
  IF v_uid IS NULL OR p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN FALSE;
  END IF;

  -- 초대자 찾기 (대문자 정규화). 자기 자신 코드면 거부.
  SELECT id INTO v_referrer FROM public.profiles WHERE referral_code = upper(trim(p_code));
  IF v_referrer IS NULL OR v_referrer = v_uid THEN
    RETURN FALSE;
  END IF;

  -- 원자적 클레임: 아직 미연결(referred_by IS NULL)일 때만 연결.
  UPDATE public.profiles SET referred_by = v_referrer
  WHERE id = v_uid AND referred_by IS NULL;
  GET DIAGNOSTICS v_claimed = ROW_COUNT;

  IF v_claimed = 0 THEN
    RETURN FALSE;   -- 이미 연결됨/경합 패자 → 카운트 증가 없음(부풀리기 차단)
  END IF;

  -- 실제 연결된 경우에만 추천인 카운트 증가.
  UPDATE public.profiles SET referral_count = referral_count + 1 WHERE id = v_referrer;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_referral(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_referral(TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 본문에 ROW_COUNT 가드 존재(기대 true):
--   SELECT prosrc ~ 'GET DIAGNOSTICS' FROM pg_proc WHERE proname='claim_referral';
--   -- 기존 부풀림 탐지(referral_count 와 실제 referred_by 수 불일치):
--   SELECT p.id, p.referral_count,
--          (SELECT count(*) FROM public.profiles c WHERE c.referred_by = p.id) AS actual
--   FROM public.profiles p
--   WHERE p.referral_count &lt;&gt; (SELECT count(*) FROM public.profiles c WHERE c.referred_by = p.id);
--   -- 행이 있으면 과거 부풀림/수동조정분 → 필요시 재계산 UPDATE 로 정정.
-- ════════════════════════════════════════════════════════════════════════════
