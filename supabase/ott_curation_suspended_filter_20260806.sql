-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ OTT 큐레이션(셀렉트·피처링) 정지/숨김 서버필터 (2026-08-06, 전수감사 B#2)
--
--   Ott.tsx 의 셀렉트(컬렉션 by-ids)·피처링(featured_hero_until) 히어로는 videos 를
--   **직접 쿼리**해 v_available_videos 를 우회했다. 클라는 profiles.is_suspended 를 못 읽어
--   (컬럼 GRANT 잠금) 정지 크리에이터를 필터할 수 없어, admin 이 큐레이션에 넣은 크리에이터가
--   이후 정지돼도 OTT 히어로·셀렉트 행에 계속 노출됐다.
--   → SECURITY DEFINER RPC 2종이 profiles 를 조인해 is_suspended·is_hidden·visibility 를
--     서버에서 거른 뒤 안전 컬럼만 반환한다(직접쿼리와 동일 컬럼셋 — 클라 매핑 무변경).
--
--   반환 컬럼은 기존 직접쿼리와 동일(id·title·thumbnail·creator·creator_id·category·genre·
--   duration·duration_seconds·ai_tool·price_standard·views·likes·highlight_start·highlight_end).
--   PII 없음. anon/authenticated 공개(공개 콘텐츠).
--
-- 적용: Supabase SQL Editor → Run (멱등). 게이트 #62.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 셀렉트/컬렉션 by-ids (정지·숨김 제외, 공개만) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.get_videos_by_ids_public(p_ids TEXT[])
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, creator TEXT, creator_id UUID,
  category TEXT, genre TEXT, duration TEXT, duration_seconds INTEGER, ai_tool TEXT,
  price_standard INTEGER, views TEXT, likes INTEGER, highlight_start REAL, highlight_end REAL
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT v.id::TEXT, v.title, v.thumbnail, v.creator, v.creator_id,
         v.category, v.genre, v.duration, v.duration_seconds, v.ai_tool,
         v.price_standard, v.views, v.likes, v.highlight_start, v.highlight_end
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE v.id::TEXT = ANY(p_ids)
    AND (COALESCE(v.visibility, 'public') = 'public')
    AND COALESCE(v.is_hidden, false) = false
    AND COALESCE(p.is_suspended, false) = false;
$$;
REVOKE ALL ON FUNCTION public.get_videos_by_ids_public(TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_videos_by_ids_public(TEXT[]) TO anon, authenticated, service_role;

-- ── ② 피처링 히어로 (featured_hero_until 미래 + 정지·숨김 제외) ───────────────
CREATE OR REPLACE FUNCTION public.get_featured_hero_videos(p_limit INTEGER DEFAULT 3)
RETURNS TABLE (
  id TEXT, title TEXT, thumbnail TEXT, creator TEXT, creator_id UUID,
  category TEXT, genre TEXT, duration TEXT, duration_seconds INTEGER, ai_tool TEXT,
  price_standard INTEGER, views TEXT, likes INTEGER, highlight_start REAL, highlight_end REAL
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public
AS $$
  SELECT v.id::TEXT, v.title, v.thumbnail, v.creator, v.creator_id,
         v.category, v.genre, v.duration, v.duration_seconds, v.ai_tool,
         v.price_standard, v.views, v.likes, v.highlight_start, v.highlight_end
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE v.featured_hero_until > now()
    AND v.visibility = 'public'
    AND v.status = 'ready'
    AND COALESCE(v.is_hidden, false) = false
    AND COALESCE(p.is_suspended, false) = false
  ORDER BY v.featured_hero_until DESC
  LIMIT p_limit;
$$;
REVOKE ALL ON FUNCTION public.get_featured_hero_videos(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_featured_hero_videos(INTEGER) TO anon, authenticated, service_role;

-- ── 검증 ──
SELECT 'OTT 큐레이션 정지필터 RPC 2종' AS check_name,
  CASE WHEN to_regprocedure('public.get_videos_by_ids_public(text[])') IS NOT NULL
    AND to_regprocedure('public.get_featured_hero_videos(integer)') IS NOT NULL
    AND (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_videos_by_ids_public')
    AND (SELECT prosrc ~ 'is_suspended' FROM pg_proc WHERE proname='get_featured_hero_videos')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status;
