-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 협업 DM 레이트리밋 (2026-07-25, A2) — 문의·메시지 도배 상한
--
--   콘텐츠 작성 레이트리밋(content_rate_limit_20260725)은 user_id 컬럼 기준이라 협업 DM
--   (collab_messages=sender_id, collab_threads=inquirer_id)엔 못 붙었다. tg_content_rate_limit
--   을 **소유자 컬럼명 인자(TG_ARGV[1], 기본 user_id)** 를 받게 확장(하위호환 — 기존 4개
--   content 트리거는 1-arg 라 그대로 user_id) + DM 2테이블에 트리거 연결.
--
--   상한(시간당): 협업 메시지 60 / 협업 문의(스레드) 20. 관리자 예외.
--   ★ tg_content_rate_limit 새 정본(제네릭). content_rate_limit_20260725.sql 의 함수 재실행
--     금지 — 비제네릭으로 되돌아가면 collab_messages(user_id 없음) insert 가 깨진다.
--
-- 적용: Supabase SQL Editor → Run (멱등). content_rate_limit_20260725.sql 선적용 필요.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 제네릭화: 소유자 컬럼명을 TG_ARGV[1] 로(기본 user_id) ─────────────────────
CREATE OR REPLACE FUNCTION public.tg_content_rate_limit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_limit INTEGER := COALESCE(NULLIF(TG_ARGV[0], '')::INTEGER, 30);
  v_col   TEXT    := COALESCE(NULLIF(TG_ARGV[1], ''), 'user_id');   -- 소유자 컬럼(기본 user_id)
  v_owner UUID;
  v_count INTEGER;
BEGIN
  -- 관리자는 예외(공지·운영)
  IF public.is_admin() THEN RETURN NEW; END IF;

  -- NEW 의 소유자 컬럼값 동적 추출(테이블별 user_id/sender_id/inquirer_id 대응)
  EXECUTE format('SELECT ($1).%I', v_col) INTO v_owner USING NEW;

  EXECUTE format(
    'SELECT count(*) FROM public.%I WHERE %I = $1 AND created_at > now() - interval ''1 hour''',
    TG_TABLE_NAME, v_col)
  INTO v_count USING v_owner;

  IF v_count >= v_limit THEN
    RAISE EXCEPTION '작성이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 협업 DM 트리거 (collab_messages=sender_id, collab_threads=inquirer_id) ────
DROP TRIGGER IF EXISTS collab_messages_rate_limit ON public.collab_messages;
CREATE TRIGGER collab_messages_rate_limit
  BEFORE INSERT ON public.collab_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_rate_limit('60', 'sender_id');

DROP TRIGGER IF EXISTS collab_threads_rate_limit ON public.collab_threads;
CREATE TRIGGER collab_threads_rate_limit
  BEFORE INSERT ON public.collab_threads
  FOR EACH ROW EXECUTE FUNCTION public.tg_content_rate_limit('20', 'inquirer_id');

-- ── 검증 ──
SELECT '협업 DM 레이트리밋 트리거 2종 연결' AS check_name,
  CASE WHEN (
    SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    WHERE t.tgname IN ('collab_messages_rate_limit','collab_threads_rate_limit')
      AND NOT t.tgisinternal
  ) = 2 AND (SELECT prosrc ~ 'TG_ARGV\[1\]' FROM pg_proc WHERE proname='tg_content_rate_limit')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
