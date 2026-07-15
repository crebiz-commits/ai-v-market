-- ════════════════════════════════════════════════════════════════════════════
-- 챌린지(공모전) 감사 — CRUD 감사로그 + 서버검증 RPC (2026-07-16)
--
--   [결함/갭] AdminChallenges.tsx 가 challenges 를 프론트에서 직접 INSERT/UPDATE/DELETE
--     (RLS challenges_admin_manage 로 is_admin 만 허용) → admin_logs 에 기록이 없어
--     "누가 언제 어떤 공모전을 만들/고치/지웠는지" 감사추적이 없음. 형제 관리 페이지
--     (고객·비즈니스 문의)는 이미 admin_set_*_status 로 로깅 → 챌린지만 비일관.
--   [갭2] 태그(tag)는 출품작 연결 슬러그('challenge:<tag>' 영상태그)인데, 수정으로
--     태그를 바꾸면 기존 출품작 연결이 통째로 끊어짐(orphan). UI 경고만 있고 서버 방지
--     없음 → 실수로 출품작 다수가 공모전에서 증발할 수 있음.
--
--   [수정]
--     1) admin_upsert_challenge(...) — p_id NULL=신규 / 값=수정. assert_admin +
--        프론트와 동일한 검증(태그정규식·제목·기간) 서버 이중화 + admin_logs 기록.
--        수정 시 출품작이 존재하면 태그 변경 차단(orphan 방지, defense-in-depth).
--     2) admin_delete_challenge(uuid) — assert_admin + DELETE + admin_logs 기록.
--     프론트는 직접 쓰기 대신 이 RPC 를 호출. RLS admin_manage 정책은 폴백 유지.
--
--   보안: 둘 다 SECURITY DEFINER + inline `SET search_path = public`(게이트 #9 WARN 없음),
--         PUBLIC/anon REVOKE, authenticated GRANT(런타임 assert_admin 이 실게이트).
--
--   적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 등록/수정(upsert) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_challenge(
  p_id             uuid,
  p_tag            text,
  p_title          text,
  p_title_en       text,
  p_prize          text,
  p_prize_en       text,
  p_description    text,
  p_description_en text,
  p_image          text,
  p_starts_at      date,
  p_deadline       date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tag     text := lower(trim(coalesce(p_tag, '')));
  v_old_tag text;
  v_id      uuid;
BEGIN
  PERFORM public.assert_admin();

  -- 검증(프론트와 이중화 — RPC 직접호출/우회 방어)
  IF v_tag !~ '^[a-z0-9][a-z0-9-]{1,48}$' THEN
    RAISE EXCEPTION '태그 형식이 올바르지 않습니다(영문 소문자·숫자·하이픈 2~49자): %', v_tag;
  END IF;
  IF char_length(trim(coalesce(p_title, ''))) < 2 THEN
    RAISE EXCEPTION '제목을 2자 이상 입력해주세요';
  END IF;
  IF coalesce(trim(p_description), '') = '' THEN
    RAISE EXCEPTION '설명을 입력해주세요';
  END IF;
  IF p_starts_at IS NULL OR p_deadline IS NULL THEN
    RAISE EXCEPTION '시작일과 마감일이 필요합니다';
  END IF;
  IF p_deadline < p_starts_at THEN
    RAISE EXCEPTION '마감일이 시작일보다 빠를 수 없습니다';
  END IF;

  IF p_id IS NULL THEN
    -- 신규 등록
    INSERT INTO public.challenges
      (tag, title, title_en, prize, prize_en, description, description_en, image, starts_at, deadline, created_by)
    VALUES
      (v_tag, trim(p_title),
       NULLIF(trim(coalesce(p_title_en, '')), ''),
       COALESCE(NULLIF(trim(coalesce(p_prize, '')), ''), '이달의 크리에이터 패키지'),
       NULLIF(trim(coalesce(p_prize_en, '')), ''),
       trim(p_description),
       NULLIF(trim(coalesce(p_description_en, '')), ''),
       NULLIF(trim(coalesce(p_image, '')), ''),
       p_starts_at, p_deadline, auth.uid())
    RETURNING id INTO v_id;

    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'create_challenge', 'challenge', v_id::text,
            jsonb_build_object('tag', v_tag, 'title', trim(p_title),
                               'starts_at', p_starts_at, 'deadline', p_deadline));
  ELSE
    -- 수정 — 기존 태그 확인
    SELECT tag INTO v_old_tag FROM public.challenges WHERE id = p_id;
    IF v_old_tag IS NULL THEN
      RAISE EXCEPTION '해당 챌린지를 찾을 수 없습니다';
    END IF;

    -- 출품작이 있으면 태그 변경 차단(연결 orphan 방지)
    IF v_tag <> v_old_tag AND EXISTS (
      SELECT 1 FROM public.videos
      WHERE tags @> ARRAY['challenge:' || v_old_tag]::text[]
        AND is_hidden = false
    ) THEN
      RAISE EXCEPTION '출품작이 있는 챌린지의 태그는 변경할 수 없습니다(출품작 연결이 끊어집니다)';
    END IF;

    UPDATE public.challenges SET
      tag            = v_tag,
      title          = trim(p_title),
      title_en       = NULLIF(trim(coalesce(p_title_en, '')), ''),
      prize          = COALESCE(NULLIF(trim(coalesce(p_prize, '')), ''), '이달의 크리에이터 패키지'),
      prize_en       = NULLIF(trim(coalesce(p_prize_en, '')), ''),
      description    = trim(p_description),
      description_en = NULLIF(trim(coalesce(p_description_en, '')), ''),
      image          = NULLIF(trim(coalesce(p_image, '')), ''),
      starts_at      = p_starts_at,
      deadline       = p_deadline,
      updated_at     = now()
    WHERE id = p_id;
    v_id := p_id;

    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'update_challenge', 'challenge', v_id::text,
            jsonb_build_object('tag', v_tag, 'old_tag', v_old_tag, 'title', trim(p_title)));
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_challenge(uuid,text,text,text,text,text,text,text,text,date,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_challenge(uuid,text,text,text,text,text,text,text,text,date,date) TO authenticated;

-- ── 2) 삭제 ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_challenge(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_tag text; v_title text;
BEGIN
  PERFORM public.assert_admin();
  DELETE FROM public.challenges WHERE id = p_id
    RETURNING tag, title INTO v_tag, v_title;
  IF v_tag IS NULL THEN
    RAISE EXCEPTION '해당 챌린지를 찾을 수 없습니다';
  END IF;
  -- 참고: 출품작 영상은 삭제하지 않음(태그 challenge:<tag> 만 잔존) — 의도된 동작.
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'delete_challenge', 'challenge', p_id::text,
          jsonb_build_object('tag', v_tag, 'title', v_title));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_challenge(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_challenge(uuid) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   SELECT public.admin_upsert_challenge(NULL,'test-audit','감사테스트',NULL,NULL,NULL,
--          '설명',NULL,NULL,CURRENT_DATE,CURRENT_DATE+7);   -- uuid 반환 + admin_logs 1행
--   SELECT action,target_type,details FROM public.admin_logs
--     WHERE action LIKE '%challenge%' ORDER BY created_at DESC LIMIT 3;
--   SELECT public.admin_delete_challenge('<위 uuid>');       -- 삭제 + admin_logs 1행
-- ════════════════════════════════════════════════════════════════════════════
