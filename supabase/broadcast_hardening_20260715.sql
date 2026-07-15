-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 공지 발송 하드닝 — admin_broadcast_notification search_path 인라인 + 명시 GRANT
--    (2026-07-15 공지발송 감사 BE3)
--
--   [결함/갭] admin_broadcast_notification(정본: phase10_7_broadcast_and_logs.sql)이
--     SECURITY DEFINER 인데 인라인 `SET search_path` 가 없어 불변식 게이트 #9(WARN) 대상.
--     라이브는 search_path 스윕(security_definer_search_path_sweep)으로 ALTER 고정돼 있으나,
--     phase10_7 재실행 시 다시 풀림(정본이 인라인 미기재). 또 명시 GRANT/REVOKE 가 없어
--     기본 PUBLIC EXECUTE 에 의존(본문 assert_admin 이 최종 게이트라 유출은 없으나 비일관).
--   [수정] 본문 동일 + 인라인 search_path 고정 + anon/PUBLIC EXECUTE 회수 → authenticated 만.
--     ★ 이 파일이 admin_broadcast_notification 의 새 정본. phase10_7 의 해당 함수 재실행 금지.
--     (phase10_7 의 공지 외 다른 함수는 이미 다른 정본으로 이동 — [[admin-page-audit-ssot]])
--
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_title TEXT,
  p_body TEXT,
  p_link TEXT DEFAULT NULL,
  p_segment TEXT DEFAULT 'all'   -- 'all' / 'premium' / 'free' / 'creators' (영상 1개+)
)
RETURNS INTEGER  -- 발송된 사용자 수
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  PERFORM public.assert_admin();

  IF p_title IS NULL OR LENGTH(TRIM(p_title)) = 0 THEN
    RAISE EXCEPTION '공지 제목은 비울 수 없습니다';
  END IF;

  IF p_segment NOT IN ('all', 'premium', 'free', 'creators') THEN
    RAISE EXCEPTION '잘못된 세그먼트: % (all/premium/free/creators 중 하나)', p_segment;
  END IF;

  -- 세그먼트별로 notifications 일괄 INSERT (정지 계정 제외)
  WITH targets AS (
    SELECT p.id AS user_id
    FROM public.profiles p
    WHERE
      CASE p_segment
        WHEN 'all'      THEN true
        WHEN 'premium'  THEN p.subscription_tier = 'premium'
        WHEN 'free'     THEN p.subscription_tier = 'free'
        WHEN 'creators' THEN EXISTS (SELECT 1 FROM public.videos v WHERE v.creator_id = p.id)
      END
      AND COALESCE(p.is_suspended, false) = false
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, type, title, body, link, read)
    SELECT user_id, 'system', p_title, p_body, p_link, false FROM targets
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM inserted;

  -- 활동 로그 기록
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    'broadcast_notification',
    'segment',
    p_segment,
    jsonb_build_object(
      'title', p_title,
      'body', p_body,
      'link', p_link,
      'segment', p_segment,
      'recipient_count', v_count
    )
  );

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.admin_broadcast_notification(TEXT, TEXT, TEXT, TEXT) IS
  '어드민 전체/세그먼트 인앱 공지(정지 제외). search_path 인라인 고정. 정본=broadcast_hardening_20260715.sql';

-- 관리자 콘솔 전용 — anon/PUBLIC 실행 회수(본문 assert_admin 이 최종 게이트)
REVOKE ALL ON FUNCTION public.admin_broadcast_notification(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- search_path 인라인 확인:
--   SELECT proconfig FROM pg_proc WHERE proname='admin_broadcast_notification';  -- search_path=... 포함
--   -- 게이트 #9(WARN) 목록에서 admin_broadcast_notification 이 빠졌는지:
--   --   _verify_security_invariants_20260628.sql Run
-- ════════════════════════════════════════════════════════════════════════════
