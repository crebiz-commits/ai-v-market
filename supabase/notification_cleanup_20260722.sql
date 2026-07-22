-- ════════════════════════════════════════════════════════════════════════════
-- 🔔 알림 정리 — 사용자 삭제 권한 확정 + 자동 보관기한 (2026-07-22)
--
--   [결함] 알림이 **쌓이기만 하고 줄어들 방법이 하나도 없었다.**
--     · 사용자: 패널에 삭제 UI 가 없었다. 읽음 처리만 가능(읽어도 목록엔 그대로 남음).
--     · 시스템: 보관기한·정리 잡이 없어 notifications 가 무한 성장.
--       (ads dedup 3종은 cleanup 잡이 있는데 알림만 빠져 있었다 — 같은 무한성장 클래스)
--
--   ▣ 흥미롭게도 **DB 는 처음부터 삭제를 허용하고 있었다**(features_tables.sql:94):
--       CREATE POLICY "notifications_delete" ON public.notifications
--         FOR DELETE USING (auth.uid() = user_id);
--     설계 의도는 있었는데 프론트가 연결을 안 한 것 → UI 를 붙이는 게 이번 수정의 본체이고,
--     이 파일은 ① 그 권한이 실제로 살아있는지 확정하고 ② 자동 정리를 추가한다.
--
--   [조치]
--     ① GRANT DELETE 명시 — Supabase 기본 권한에 의존하지 않고 못을 박는다.
--        (RLS 정책이 있어도 테이블 GRANT 가 없으면 삭제가 안 된다. 지금은 기본값 덕에
--         동작하지만, 기본값이 바뀌거나 누가 REVOKE 하면 UI 만 조용히 실패한다.)
--     ② cleanup_old_notifications() + 일일 cron. 3단 정리:
--          · 읽은 알림 90일 경과
--          · 안 읽은 알림도 365일 경과 (안 읽었다고 영구 보관할 이유 없음)
--          · 사용자당 최근 300건 초과분 (단기 폭증 대비 — 기간 정리만으론 못 막음)
--        cleanup_ad_* 3종과 같은 시간대(03시)에 붙인다.
--
--   ▣ 정리 함수는 anon/authenticated 에 노출하지 않는다. 인자 없는 전역 DELETE 라
--     노출되면 아무나 전체 사용자 알림을 날릴 수 있다(cron=postgres 만 실행).
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── ① 사용자 삭제 권한 확정 ──────────────────────────────────────────────────
--   RLS 정책(notifications_delete)이 본인 행으로 제한하므로 남의 알림은 못 지운다.
GRANT DELETE ON public.notifications TO authenticated;

-- ── ② 보관기한 정리 함수 ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_total INTEGER := 0;
  v_n     INTEGER;
BEGIN
  -- 읽은 알림 — 90일
  DELETE FROM public.notifications
  WHERE read = true AND created_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_total := v_total + v_n;

  -- 안 읽은 알림 — 365일 (계정을 안 쓰는 사용자의 알림이 영구 적재되는 걸 막는다)
  DELETE FROM public.notifications
  WHERE created_at < now() - INTERVAL '365 days';
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_total := v_total + v_n;

  -- 사용자당 최근 300건 초과분 — 기간 정리로는 못 막는 단기 폭증 대비
  --   (예: 인기 영상 하나에 댓글 수천 개 → 하루 만에 수천 건)
  DELETE FROM public.notifications n
  USING (
    SELECT id,
           row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC, id DESC) AS rn
    FROM public.notifications
  ) r
  WHERE r.id = n.id AND r.rn > 300;
  GET DIAGNOSTICS v_n = ROW_COUNT;  v_total := v_total + v_n;

  RETURN v_total;
END;
$fn$;

COMMENT ON FUNCTION public.cleanup_old_notifications IS
  '알림 보관기한 정리(읽음 90일 / 전체 365일 / 사용자당 300건 상한). pg_cron 전용 — 사용자 노출 금지';

-- 인자 없는 전역 DELETE 라 노출되면 아무나 전체 알림을 날릴 수 있다 → cron(postgres)만.
REVOKE ALL ON FUNCTION public.cleanup_old_notifications() FROM PUBLIC, anon, authenticated;

COMMIT;

-- ── ③ 일일 정리 잡 등록 (cleanup_ad_* 3종과 같은 03시대) ─────────────────────
--   pg_cron 미설치 환경에서 파일 전체가 실패하지 않도록 방어적으로 등록한다.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('cleanup-old-notifications', '25 3 * * *',
                          'SELECT public.cleanup_old_notifications();');
    RAISE NOTICE '✅ cron 잡 등록: cleanup-old-notifications (매일 03:25)';
  ELSE
    RAISE NOTICE '⚠️ pg_cron 미설치 — 정리 함수만 생성됨. 수동 실행: SELECT public.cleanup_old_notifications();';
  END IF;
END
$do$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '① 사용자 삭제 권한(RLS 정책 + 테이블 GRANT)' AS check_name,
  CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                    WHERE schemaname='public' AND tablename='notifications' AND cmd='DELETE')
        AND has_table_privilege('authenticated', 'public.notifications', 'DELETE')
    THEN '✅ PASS' ELSE '🔴 FAIL — 패널 삭제 버튼이 조용히 실패' END AS status
UNION ALL
SELECT '② 정리 함수 생성',
  CASE WHEN to_regprocedure('public.cleanup_old_notifications()') IS NOT NULL
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '③ 정리 함수 사용자 비노출(전역 DELETE 보호)',
  CASE WHEN NOT has_function_privilege('authenticated', 'public.cleanup_old_notifications()', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.cleanup_old_notifications()', 'EXECUTE')
    THEN '✅ PASS' ELSE '🔴 FAIL — 아무나 전체 알림 삭제 가능' END
UNION ALL
SELECT '④ 일일 cron 잡 등록',
  CASE WHEN NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN '⚠️ pg_cron 미설치'
       WHEN EXISTS (SELECT 1 FROM cron.job WHERE jobname='cleanup-old-notifications') THEN '✅ PASS'
       ELSE '🔴 FAIL' END;
-- ════════════════════════════════════════════════════════════════════════════
