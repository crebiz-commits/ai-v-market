-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ track_video_ad_event anon/authenticated EXECUTE 회수 (2026-07-17)
--
--   [🔴 결함] VAST 영상광고 과금 RPC track_video_ad_event 가 형제 집계 RPC 4종
--     (increment_ad_impressions/clicks·record_ad_impression/click)과 달리 **한 번도
--     REVOKE 된 적이 없어** 기본 PUBLIC EXECUTE 가 남아 있음. SECURITY DEFINER 라
--     PostgREST 로 `POST /rest/v1/rpc/track_video_ad_event` 직접 호출이 가능하고,
--     이는 Edge /vast-track 의 HMAC 서명·IP 레이트리밋을 전부 우회함.
--     dedup 키는 호출자 입력(p_viewer_user_id/p_ip_address)로만 만들어져 둘 다 NULL 이면
--     dedup skip → 매 호출 집계/과금.
--   [악용(금전)] ① 경쟁 예산광고에 impression 반복 → spent_krw 무한증가 → 예산소진으로
--     서빙 탈락(예산 파괴). ② p_source_video_id=공격자 영상으로 반복 → 정산에서
--     크리에이터 광고수익 부풀리기(과지급=플랫폼 손실). ③ click 인플레이션.
--     현재 예산광고 미출시·하우스 무과금이라 실피해는 카운터·ad_video_events 오염에
--     한정되나, 예산광고 출시 즉시 직접 금전손실. 형제 4종은 잠갔는데 이것만 빠진 공백.
--   [수정] service_role(Edge) 전용으로 회수. 정상 경로(/vast-track HMAC 검증 후 service_role)는 무영향.
--
--   적용: Supabase SQL Editor → Run (멱등). 이후 _verify_security_invariants #16 로 상시 감시.
-- ════════════════════════════════════════════════════════════════════════════

REVOKE ALL ON FUNCTION public.track_video_ad_event(uuid, text, text, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.track_video_ad_event(uuid, text, text, uuid, text, text)
  TO service_role;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT has_function_privilege('anon',
--     'public.track_video_ad_event(uuid,text,text,uuid,text,text)', 'EXECUTE') AS anon_exec,
--          has_function_privilege('authenticated',
--     'public.track_video_ad_event(uuid,text,text,uuid,text,text)', 'EXECUTE') AS auth_exec;
--     → 둘 다 false 여야 정상
-- ════════════════════════════════════════════════════════════════════════════
