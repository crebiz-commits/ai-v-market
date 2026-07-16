-- ════════════════════════════════════════════════════════════════════════════
-- 컬렉션·셀렉트 감사(2차) — slug 형식 검증 + intro 위험콘텐츠 서버 차단 (2026-07-16)
--
--   [갭1] admin_upsert_collection 이 slug 를 non-empty 만 검사 → 관리자가 공백·대문자·
--     특수문자를 넣으면 그대로 저장. slug 는 URL 식별자(?info=collections&c=<slug>)라
--     깨지거나 매칭 실패. 프론트는 slugify 로 정규화하지만, RPC 직접호출 우회 방어를 위해
--     서버도 정규식 검증(방어심층).
--   [갭2] intro 는 관리자 편집 HTML 이며 공개 컬렉션 페이지에 dangerouslySetInnerHTML 로
--     렌더 → 관리자 세션 탈취 시 전 방문자 대상 저장형 XSS. 렌더측 새니타이저(허용목록)를
--     추가했고, 서버도 명백한 위험 벡터(script/iframe/on*=/javascript:)를 거부(이중 방어).
--
--   ★ 이 파일이 admin_upsert_collection 새 정본. collections_admin_20260711.sql 의 해당
--     함수 재실행 금지(본문은 동일 + slug/intro 검증만 추가). REVOKE/GRANT 도 재적용.
--   적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_upsert_collection(
  p_id uuid, p_slug text, p_title text, p_tagline text, p_intro text,
  p_emoji text, p_gradient text, p_sort_order integer,
  p_is_active boolean, p_is_select boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid; v_slug text := btrim(lower(coalesce(p_slug, '')));
BEGIN
  PERFORM public.assert_admin();
  IF v_slug = '' THEN RAISE EXCEPTION 'slug는 필수입니다'; END IF;
  -- slug 형식: 영문 소문자·숫자로 시작, 소문자·숫자·하이픈, 앞뒤/연속 하이픈 없음
  IF v_slug !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$' THEN
    RAISE EXCEPTION 'slug 형식이 올바르지 않습니다(영문 소문자·숫자·하이픈): %', v_slug;
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION '제목은 필수입니다'; END IF;
  -- intro 위험 콘텐츠 차단(렌더측 새니타이저와 이중 방어). 정상 p/strong/em 은 통과.
  IF p_intro IS NOT NULL AND p_intro ~* '<\s*(script|iframe|object|embed|style|svg|form)\b|javascript:|[\s/"''`]on[a-z]+\s*=' THEN
    RAISE EXCEPTION 'intro 에 허용되지 않는 콘텐츠(스크립트/이벤트 핸들러 등)가 있습니다';
  END IF;

  -- 셀렉트는 단 1개 — 새로 지정하면 나머지 해제(부분 유니크 인덱스 충돌 방지)
  IF p_is_select THEN
    UPDATE public.collections SET is_select = false, updated_at = now()
    WHERE is_select = true AND (p_id IS NULL OR id <> p_id);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.collections (slug, title, tagline, intro, emoji, gradient, sort_order, is_active, is_select)
    VALUES (v_slug, p_title, p_tagline, p_intro, p_emoji, p_gradient,
            COALESCE(p_sort_order, 100), COALESCE(p_is_active, true), COALESCE(p_is_select, false))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.collections SET
      slug = v_slug, title = p_title, tagline = p_tagline, intro = p_intro,
      emoji = p_emoji, gradient = p_gradient, sort_order = COALESCE(p_sort_order, sort_order),
      is_active = COALESCE(p_is_active, is_active), is_select = COALESCE(p_is_select, is_select),
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION '컬렉션을 찾을 수 없습니다 (id: %)', p_id; END IF;
  END IF;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'collection_upsert', 'collection', v_id::text,
    jsonb_build_object('slug', v_slug, 'title', p_title, 'is_select', p_is_select, 'is_active', p_is_active));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_collection(uuid,text,text,text,text,text,text,integer,boolean,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_collection(uuid,text,text,text,text,text,text,integer,boolean,boolean) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   SELECT public.admin_upsert_collection(NULL,'Bad Slug!','제목',NULL,NULL,NULL,NULL,100,true,false);
--     → 'slug 형식이 올바르지 않습니다' 에러(정상)
--   SELECT public.admin_upsert_collection(NULL,'ok-slug','제목',NULL,'<img src=x onerror=alert(1)>',
--          NULL,NULL,100,true,false);  → 'intro 에 허용되지 않는...' 에러(정상)
-- ════════════════════════════════════════════════════════════════════════════
