-- ════════════════════════════════════════════════════════════════════════════
-- 이벤트 배너 감사 — CRUD 감사로그 RPC (2026-07-16)
--
--   [갭] AdminBanners.tsx 가 event_banners 를 프론트에서 직접 INSERT/UPDATE/DELETE +
--     노출 토글(is_active) → admin_logs 무기록. AdminActivityLog(관리자 활동 로그)에서
--     "누가 언제 공개 시네마 상단 배너를 바꿨/지웠/숨겼는지" 추적 불가(사각지대).
--     형제 관리 페이지(챌린지·고객/비즈니스 문의)는 이미 로깅 → 배너만 비일관.
--   [수정] 3종 RPC 로 전환(assert_admin + admin_logs 기록):
--     1) admin_upsert_event_banner(...) — p_id NULL=신규 / 값=수정
--     2) admin_delete_event_banner(uuid)
--     3) admin_set_event_banner_active(uuid, boolean) — 목록 눈 아이콘 토글
--     프론트는 직접 쓰기 대신 이 RPC 호출. RLS event_banners_admin(FOR ALL) 은 폴백 유지.
--
--   보안: SECURITY DEFINER + inline search_path(게이트 #9 무WARN), PUBLIC/anon REVOKE,
--         authenticated GRANT(런타임 assert_admin 이 실게이트). 표 CHECK(title 1~120,
--         align in left/center)는 그대로 유효 — 위반 시 제약 에러로 표면화.
--
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 등록/수정(upsert) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_upsert_event_banner(
  p_id             uuid,
  p_sort_order     integer,
  p_title          text,
  p_subtitle       text,
  p_eyebrow        text,
  p_badge          text,
  p_badges         text[],
  p_cta_label      text,
  p_link           text,
  p_image          text,
  p_align          text,
  p_title_gradient boolean,
  p_gradient       text,
  p_dark           boolean,
  p_is_active      boolean,
  p_active_from    timestamptz,
  p_active_to      timestamptz
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id    uuid;
  v_align text := lower(coalesce(nullif(trim(p_align), ''), 'left'));
BEGIN
  PERFORM public.assert_admin();

  IF coalesce(trim(p_title), '') = '' THEN
    RAISE EXCEPTION '제목을 입력해주세요';
  END IF;
  IF v_align NOT IN ('left', 'center') THEN
    RAISE EXCEPTION '정렬은 left/center 만 허용됩니다: %', v_align;
  END IF;
  IF p_active_from IS NOT NULL AND p_active_to IS NOT NULL AND p_active_from >= p_active_to THEN
    RAISE EXCEPTION '종료 시각은 시작 시각보다 뒤여야 합니다';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.event_banners
      (sort_order, title, subtitle, eyebrow, badge, badges, cta_label, link, image,
       align, title_gradient, gradient, dark, is_active, active_from, active_to)
    VALUES
      (COALESCE(p_sort_order, 0), trim(p_title),
       NULLIF(trim(coalesce(p_subtitle, '')), ''),
       NULLIF(trim(coalesce(p_eyebrow, '')), ''),
       NULLIF(trim(coalesce(p_badge, '')), ''),
       p_badges,
       NULLIF(trim(coalesce(p_cta_label, '')), ''),
       NULLIF(trim(coalesce(p_link, '')), ''),
       NULLIF(trim(coalesce(p_image, '')), ''),
       v_align, COALESCE(p_title_gradient, false),
       NULLIF(trim(coalesce(p_gradient, '')), ''),
       COALESCE(p_dark, false), COALESCE(p_is_active, true),
       p_active_from, p_active_to)
    RETURNING id INTO v_id;

    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'create_event_banner', 'event_banner', v_id::text,
            jsonb_build_object('title', trim(p_title), 'sort_order', COALESCE(p_sort_order, 0)));
  ELSE
    UPDATE public.event_banners SET
      sort_order     = COALESCE(p_sort_order, 0),
      title          = trim(p_title),
      subtitle       = NULLIF(trim(coalesce(p_subtitle, '')), ''),
      eyebrow        = NULLIF(trim(coalesce(p_eyebrow, '')), ''),
      badge          = NULLIF(trim(coalesce(p_badge, '')), ''),
      badges         = p_badges,
      cta_label      = NULLIF(trim(coalesce(p_cta_label, '')), ''),
      link           = NULLIF(trim(coalesce(p_link, '')), ''),
      image          = NULLIF(trim(coalesce(p_image, '')), ''),
      align          = v_align,
      title_gradient = COALESCE(p_title_gradient, false),
      gradient       = NULLIF(trim(coalesce(p_gradient, '')), ''),
      dark           = COALESCE(p_dark, false),
      is_active      = COALESCE(p_is_active, true),
      active_from    = p_active_from,
      active_to      = p_active_to,
      updated_at     = now()
    WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION '해당 배너를 찾을 수 없습니다'; END IF;
    v_id := p_id;

    INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
    VALUES (auth.uid(), 'update_event_banner', 'event_banner', v_id::text,
            jsonb_build_object('title', trim(p_title), 'sort_order', COALESCE(p_sort_order, 0)));
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_event_banner(uuid,integer,text,text,text,text,text[],text,text,text,text,boolean,text,boolean,boolean,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_event_banner(uuid,integer,text,text,text,text,text[],text,text,text,text,boolean,text,boolean,boolean,timestamptz,timestamptz) TO authenticated;

-- ── 2) 삭제 ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_delete_event_banner(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_title text;
BEGIN
  PERFORM public.assert_admin();
  DELETE FROM public.event_banners WHERE id = p_id RETURNING title INTO v_title;
  IF v_title IS NULL THEN RAISE EXCEPTION '해당 배너를 찾을 수 없습니다'; END IF;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'delete_event_banner', 'event_banner', p_id::text,
          jsonb_build_object('title', v_title));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_event_banner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_event_banner(uuid) TO authenticated;

-- ── 3) 노출 토글(is_active) ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_set_event_banner_active(p_id uuid, p_active boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_title text;
BEGIN
  PERFORM public.assert_admin();
  UPDATE public.event_banners SET is_active = COALESCE(p_active, false), updated_at = now()
    WHERE id = p_id RETURNING title INTO v_title;
  IF v_title IS NULL THEN RAISE EXCEPTION '해당 배너를 찾을 수 없습니다'; END IF;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'toggle_event_banner', 'event_banner', p_id::text,
          jsonb_build_object('title', v_title, 'is_active', COALESCE(p_active, false)));
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_event_banner_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_event_banner_active(uuid, boolean) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   SELECT public.admin_upsert_event_banner(NULL,999,'감사테스트',NULL,NULL,NULL,NULL,
--          NULL,'/?tab=upload',NULL,'left',false,NULL,false,true,NULL,NULL);  -- uuid 반환
--   SELECT action,target_type,details FROM public.admin_logs
--     WHERE action LIKE '%event_banner%' ORDER BY created_at DESC LIMIT 3;
--   SELECT public.admin_delete_event_banner('<위 uuid>');
-- ════════════════════════════════════════════════════════════════════════════
