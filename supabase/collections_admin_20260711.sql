-- ════════════════════════════════════════════════════════════════════════════
-- CREAITE 컬렉션·셀렉트 관리자화 — DB 이관 (2026-07-11)
--
--   기존: src/app/data/collections.ts 에 하드코딩(videoIds 배열). 큐레이션 변경마다
--         코드 수정→커밋→배포 필요. CREAITE 셀렉트 배지도 이 파일의 creaite-select
--         컬렉션 videoIds 로 판별(정적).
--   목표: collections/collection_videos 테이블 + 관리자 CRUD RPC → AdminCollections
--         페이지에서 코드배포 없이 컬렉션·셀렉트 조절. 프론트는 get_collections() 로 로드.
--
--   ※ is_select=true 컬렉션(1개)이 CREAITE 셀렉트 배지의 소스. 프론트는 그 컬렉션의
--     video_ids 로 배지를 표시. seed 는 collections.ts 현재값 이관(ON CONFLICT DO NOTHING).
--
-- 적용: Supabase SQL Editor → Run (멱등). 이후 collections.ts 는 Phase 3에서 제거/대체.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) 테이블 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.collections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text UNIQUE NOT NULL,
  title        text NOT NULL,
  tagline      text,
  intro        text,                                  -- 에디토리얼 HTML(p/strong/em)
  emoji        text,
  gradient     text,                                  -- tailwind 그라데이션 클래스
  sort_order   integer NOT NULL DEFAULT 100,
  is_active    boolean NOT NULL DEFAULT true,
  is_select    boolean NOT NULL DEFAULT false,        -- CREAITE 셀렉트 배지 소스(단 1개)
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.collection_videos (
  collection_id uuid NOT NULL REFERENCES public.collections(id) ON DELETE CASCADE,
  video_id      uuid NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  position      integer NOT NULL DEFAULT 0,
  PRIMARY KEY (collection_id, video_id)
);
CREATE INDEX IF NOT EXISTS collection_videos_col_idx ON public.collection_videos(collection_id, position);

-- 셀렉트 컬렉션은 최대 1개(부분 유니크 인덱스)
CREATE UNIQUE INDEX IF NOT EXISTS collections_single_select_idx
  ON public.collections((is_select)) WHERE is_select = true;

-- RLS: 직접 접근 차단(RPC 전용). 프론트 읽기/관리 모두 SECURITY DEFINER RPC 경유.
ALTER TABLE public.collections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_videos ENABLE ROW LEVEL SECURITY;

-- ── 2) 공개 읽기 RPC — 활성 컬렉션 + 정렬된 video_ids ───────────────────────
CREATE OR REPLACE FUNCTION public.get_collections()
RETURNS TABLE (
  slug text, title text, tagline text, intro text,
  emoji text, gradient text, is_select boolean, video_ids uuid[]
)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT c.slug, c.title, c.tagline, c.intro, c.emoji, c.gradient, c.is_select,
         COALESCE(
           array_agg(cv.video_id ORDER BY cv.position, cv.video_id)
             FILTER (WHERE cv.video_id IS NOT NULL),
           '{}'::uuid[]
         ) AS video_ids
  FROM public.collections c
  LEFT JOIN public.collection_videos cv ON cv.collection_id = c.id
  WHERE c.is_active = true
  GROUP BY c.id
  ORDER BY c.sort_order, c.created_at;
$$;
GRANT EXECUTE ON FUNCTION public.get_collections() TO anon, authenticated;

-- ── 3) 관리자 RPC — 목록/업서트/삭제/영상배정 ──────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_list_collections()
RETURNS TABLE (
  id uuid, slug text, title text, tagline text, intro text, emoji text, gradient text,
  sort_order integer, is_active boolean, is_select boolean, video_count bigint, video_ids uuid[]
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT c.id, c.slug, c.title, c.tagline, c.intro, c.emoji, c.gradient,
         c.sort_order, c.is_active, c.is_select,
         COUNT(cv.video_id) AS video_count,
         COALESCE(array_agg(cv.video_id ORDER BY cv.position, cv.video_id)
                    FILTER (WHERE cv.video_id IS NOT NULL), '{}'::uuid[]) AS video_ids
  FROM public.collections c
  LEFT JOIN public.collection_videos cv ON cv.collection_id = c.id
  GROUP BY c.id
  ORDER BY c.sort_order, c.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_collection(
  p_id uuid, p_slug text, p_title text, p_tagline text, p_intro text,
  p_emoji text, p_gradient text, p_sort_order integer,
  p_is_active boolean, p_is_select boolean)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.assert_admin();
  IF p_slug IS NULL OR btrim(p_slug) = '' THEN RAISE EXCEPTION 'slug는 필수입니다'; END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN RAISE EXCEPTION '제목은 필수입니다'; END IF;

  -- 셀렉트는 단 1개 — 새로 지정하면 나머지 해제(부분 유니크 인덱스 충돌 방지)
  IF p_is_select THEN
    UPDATE public.collections SET is_select = false, updated_at = now()
    WHERE is_select = true AND (p_id IS NULL OR id <> p_id);
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.collections (slug, title, tagline, intro, emoji, gradient, sort_order, is_active, is_select)
    VALUES (btrim(p_slug), p_title, p_tagline, p_intro, p_emoji, p_gradient,
            COALESCE(p_sort_order, 100), COALESCE(p_is_active, true), COALESCE(p_is_select, false))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.collections SET
      slug = btrim(p_slug), title = p_title, tagline = p_tagline, intro = p_intro,
      emoji = p_emoji, gradient = p_gradient, sort_order = COALESCE(p_sort_order, sort_order),
      is_active = COALESCE(p_is_active, is_active), is_select = COALESCE(p_is_select, is_select),
      updated_at = now()
    WHERE id = p_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION '컬렉션을 찾을 수 없습니다 (id: %)', p_id; END IF;
  END IF;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'collection_upsert', 'collection', v_id::text,
    jsonb_build_object('slug', p_slug, 'title', p_title, 'is_select', p_is_select, 'is_active', p_is_active));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_collection(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_slug text;
BEGIN
  PERFORM public.assert_admin();
  SELECT slug INTO v_slug FROM public.collections WHERE id = p_id;
  IF v_slug IS NULL THEN RAISE EXCEPTION '컬렉션을 찾을 수 없습니다'; END IF;
  DELETE FROM public.collections WHERE id = p_id;   -- collection_videos CASCADE
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'collection_delete', 'collection', p_id::text, jsonb_build_object('slug', v_slug));
END;
$$;

-- 영상 목록 통째 교체(순서=배열 순서). 존재하는 영상만 반영.
CREATE OR REPLACE FUNCTION public.admin_set_collection_videos(p_id uuid, p_video_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  PERFORM public.assert_admin();
  IF NOT EXISTS (SELECT 1 FROM public.collections WHERE id = p_id) THEN
    RAISE EXCEPTION '컬렉션을 찾을 수 없습니다';
  END IF;
  DELETE FROM public.collection_videos WHERE collection_id = p_id;
  INSERT INTO public.collection_videos (collection_id, video_id, position)
  SELECT p_id, x.vid, x.ord
  FROM unnest(p_video_ids) WITH ORDINALITY AS x(vid, ord)
  WHERE EXISTS (SELECT 1 FROM public.videos v WHERE v.id = x.vid)
  ON CONFLICT (collection_id, video_id) DO NOTHING;
  SELECT COUNT(*) INTO v_count FROM public.collection_videos WHERE collection_id = p_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'collection_set_videos', 'collection', p_id::text,
    jsonb_build_object('count', v_count, 'requested', array_length(p_video_ids, 1)));
  RETURN v_count;
END;
$$;

-- 컬렉션의 배정 영상 상세(관리자 UI 표시용) — 썸네일·제목·작성자·숨김여부, 순서대로
CREATE OR REPLACE FUNCTION public.admin_get_collection_videos(p_id uuid)
RETURNS TABLE (video_id uuid, title text, thumbnail text, creator_name text, is_hidden boolean, position integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT cv.video_id, v.title, v.thumbnail, p.display_name, COALESCE(v.is_hidden, false), cv.position
  FROM public.collection_videos cv
  JOIN public.videos v ON v.id = cv.video_id
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE cv.collection_id = p_id
  ORDER BY cv.position, cv.video_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_collections()                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_collection_videos(uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_collection(uuid,text,text,text,text,text,text,integer,boolean,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_collection(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_collection_videos(uuid, uuid[])             TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 4) 시드 — collections.ts 현재값 이관 (멱등: ON CONFLICT DO NOTHING)
-- ════════════════════════════════════════════════════════════════════════════
INSERT INTO public.collections (slug, title, tagline, intro, emoji, gradient, sort_order, is_active, is_select) VALUES
('creaite-select', 'CREAITE 셀렉트', '에디터 공식 선정작 · 명예의 전당',
$i$
<p><strong>CREAITE 셀렉트</strong>는 우리가 자신 있게 내세우는 작품에 부여하는 공식 선정입니다. 영화제의 'Official Selection'처럼, 이 배지는 <strong>"CREAITE가 골랐다"</strong>는 인장입니다.</p>
<p>완성도, 이야기의 힘, 그리고 AI 시네마의 가능성을 보여준 작품들이 이 명예의 전당에 오릅니다. 선정작에는 영상 카드와 상세 페이지에 <em>✦ CREAITE 셀렉트</em> 배지가 붙습니다. 창작자에게는 훈장이고, 관객에게는 "실패 없는 선택"의 표식입니다.</p>
<p>무엇을 볼지 고민된다면, 여기서 시작하세요. CREAITE가 보증하는 작품들입니다.</p>
$i$, '🏆', 'from-[#f59e0b] to-[#ec4899]', 10, true, true),
('first-watch', '처음이라면, 이 다섯 편', 'AI 시네마 입문 셀렉션',
$i$
<p>"AI로 만든 영화, 대체 어떤 느낌일까?" 처음 CREAITE에 온 분이라면 이 다섯 편으로 시작하세요. 장르도, 길이도, 온도도 일부러 다르게 골랐습니다. <strong>짧지만 각기 다른 결</strong>을 가진 작품들이라, 15분이면 AI 시네마가 어디까지 왔는지 감이 잡힙니다.</p>
<p>SF의 서늘함, 드라마의 여운, 로맨스의 설렘 — 한 편씩 넘기다 보면 자연스럽게 취향이 드러날 겁니다. 마음에 드는 장르를 찾았다면, 그 갈래를 더 깊이 파고드는 다른 컬렉션으로 이어 가 보세요.</p>
$i$, '🎟️', 'from-[#6366f1] to-[#8b5cf6]', 20, true, false),
('quick-punch', '짧고 강렬한', '1분 안에 끝나는 숏필름 셀렉션',
$i$
<p>시간이 없을 때, 딱 한 편. 1분 안에 강한 인상을 남기는 <strong>숏필름</strong>만 모았습니다. 길이는 짧지만 밀도는 높습니다 — 단 몇십 초 안에 하나의 장면, 하나의 감정을 완결하는 작품들입니다.</p>
<p>짧은 영상일수록 <em>버릴 것이 없어야</em> 합니다. 군더더기 없는 컷, 한 방의 연출, 여운을 남기는 마무리. 출퇴근길 한 편, 쉬는 시간 한 편 — 부담 없이 즐기면서도, AI 숏필름의 완성도를 확인하기 좋은 셀렉션입니다.</p>
$i$, '⚡', 'from-[#10b981] to-[#06b6d4]', 30, true, false),
('night-tension', '긴장의 밤', '액션 · 스릴러 · 공포 셀렉션',
$i$
<p>불을 끄고 소리를 키우세요. 심장이 빨라지는 밤을 위한 셀렉션입니다. 총성과 추격의 <strong>액션</strong>, 서늘한 반전의 <strong>스릴러</strong>, 보이지 않는 것이 더 무서운 <strong>공포</strong>까지 — 긴장이라는 하나의 감정을 여러 각도에서 담았습니다.</p>
<p>특히 주목할 점은 <em>카메라의 속도</em>입니다. 액션의 흔들리는 핸드헬드, 스릴러의 느리게 조여드는 시선, 공포의 숨죽인 정적 — 같은 '긴장'도 연출에 따라 이렇게 다른 질감이 됩니다. AI 영상이 어떻게 감정을 설계하는지 보고 싶다면 이 컬렉션이 좋은 교재입니다.</p>
$i$, '🌙', 'from-[#ef4444] to-[#6366f1]', 40, true, false),
('heart-stays', '마음이 머무는 곳', '드라마 · 로맨스 셀렉션',
$i$
<p>모든 이야기가 빠를 필요는 없습니다. 천천히 스며들어 오래 남는 작품들을 모았습니다. 스무 살의 설렘과 이별, 황혼의 노스탤지어, 무언가를 끝까지 지켜낸 사람의 뒷모습 — <strong>감정의 온도</strong>가 주인공인 셀렉션입니다.</p>
<p>이 컬렉션의 작품들은 화려한 스펙터클 대신 <em>빛과 색, 그리고 침묵</em>으로 마음을 건드립니다. 따뜻한 골든아워 조명, 얕은 피사계 심도, 여백을 두는 편집 — AI 영상이 액션만이 아니라 '정서'도 담을 수 있다는 증거입니다. 조용한 밤, 한 편씩 천천히 보기를 권합니다.</p>
$i$, '💗', 'from-[#ec4899] to-[#f59e0b]', 50, true, false),
('beyond-the-edge', '경계 너머', 'SF · 판타지 셀렉션',
$i$
<p>현실의 규칙이 통하지 않는 곳으로 가는 셀렉션입니다. 성층권을 넘는 종이비행기, 마지막 교신 너머의 우주, 천사군단이 벌이는 전쟁 — <strong>상상이 곧 장르</strong>가 되는 작품들을 모았습니다.</p>
<p>SF와 판타지는 AI 영상이 가장 빛나는 영역입니다. 실사로 찍으려면 천문학적 예산이 필요한 장면을, 한 사람이 프롬프트로 만들어 냅니다. <em>규모감과 세계관</em>이 핵심인 이 장르에서, 창작자의 상상력이 어디까지 확장되는지 확인해 보세요. AI 시네마의 진짜 가능성이 여기 있습니다.</p>
$i$, '🚀', 'from-[#06b6d4] to-[#8b5cf6]', 60, true, false)
ON CONFLICT (slug) DO NOTHING;

-- 컬렉션별 영상 배정 (존재하는 영상만, 순서 보존)
INSERT INTO public.collection_videos (collection_id, video_id, position)
SELECT c.id, x.vid::uuid, x.pos
FROM public.collections c
CROSS JOIN (VALUES
  ('creaite-select', 'b74e4056-5dc8-4824-8807-3675cbe2b247', 1),
  ('creaite-select', 'bee906d7-6d7b-4c7a-a302-f9155b16eba9', 2),
  ('creaite-select', 'bb0299c7-3b80-4dc4-833b-a265e78f4e97', 3),
  ('creaite-select', 'a93224cf-2e62-4049-8e60-c2eed710ed2e', 4),
  ('creaite-select', '269be30c-9fd1-4094-bc9a-6b0ef6512d69', 5),
  ('first-watch', 'c9ef3216-32b8-4917-8ca9-438b94051697', 1),
  ('first-watch', 'e45b9277-2864-4d26-aa09-f605aa0224ce', 2),
  ('first-watch', '669b092e-74eb-488f-a789-f6dc6632217d', 3),
  ('first-watch', 'c2b4d02b-2be8-4278-8f7d-d665a6515c9f', 4),
  ('first-watch', '668b0680-d606-4b08-a915-14bb6523a57d', 5),
  ('quick-punch', 'e21d3001-1265-47d8-81e4-f2a5a6993a50', 1),
  ('quick-punch', 'c9ef3216-32b8-4917-8ca9-438b94051697', 2),
  ('quick-punch', 'c2b4d02b-2be8-4278-8f7d-d665a6515c9f', 3),
  ('quick-punch', 'e45b9277-2864-4d26-aa09-f605aa0224ce', 4),
  ('quick-punch', 'f8382a4b-7e58-479a-a063-ad418440a248', 5),
  ('quick-punch', '668b0680-d606-4b08-a915-14bb6523a57d', 6),
  ('night-tension', 'a5806b5f-93a3-45c8-8ba6-432e3939aa52', 1),
  ('night-tension', '37ef786b-f4c5-49c5-93dc-cf405a99cde2', 2),
  ('night-tension', 'c2b4d02b-2be8-4278-8f7d-d665a6515c9f', 3),
  ('night-tension', '42bc84e3-6685-447b-9741-02f0b3671218', 4),
  ('night-tension', 'a93224cf-2e62-4049-8e60-c2eed710ed2e', 5),
  ('heart-stays', 'bb0299c7-3b80-4dc4-833b-a265e78f4e97', 1),
  ('heart-stays', '669b092e-74eb-488f-a789-f6dc6632217d', 2),
  ('heart-stays', 'e45b9277-2864-4d26-aa09-f605aa0224ce', 3),
  ('heart-stays', 'f8382a4b-7e58-479a-a063-ad418440a248', 4),
  ('beyond-the-edge', 'bee906d7-6d7b-4c7a-a302-f9155b16eba9', 1),
  ('beyond-the-edge', '269be30c-9fd1-4094-bc9a-6b0ef6512d69', 2),
  ('beyond-the-edge', 'c9ef3216-32b8-4917-8ca9-438b94051697', 3),
  ('beyond-the-edge', 'd5d80e41-14b4-40dc-87eb-ea1d5836d4b3', 4),
  ('beyond-the-edge', '668b0680-d606-4b08-a915-14bb6523a57d', 5)
) AS x(cslug, vid, pos)
WHERE c.slug = x.cslug
  AND EXISTS (SELECT 1 FROM public.videos v WHERE v.id = x.vid::uuid)
ON CONFLICT (collection_id, video_id) DO NOTHING;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT slug, title, is_select, array_length(video_ids,1) FROM public.get_collections();
--   -- 셀렉트 배지 소스: SELECT video_ids FROM public.get_collections() WHERE is_select;
-- ════════════════════════════════════════════════════════════════════════════
