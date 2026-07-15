-- ════════════════════════════════════════════════════════════════════════════
-- 🛡️ 콘텐츠 관리 감사 — 판매 영상 삭제 가드 + 목록 판매수 컬럼 (2026-07-15)
--
--   [A] admin_delete_video — 완료주문(판매 라이선스) 있으면 하드삭제 차단.
--       ⚠️ orders.video_id 는 ON DELETE CASCADE(orders_table.sql:25) → 관리자가
--       판매된 영상을 삭제하면 구매자의 주문(라이선스)이 함께 CASCADE 삭제돼
--       구매증빙·다운로드 권한이 조용히 소실됐음(video_views/download_logs 도 CASCADE).
--       크리에이터용 delete_my_video 는 이미 차단하는데 관리자용만 없었음.
--       → 판매분 있으면 삭제 거부하고 "숨김" 유도(숨김은 피드·검색·재생토큰 전부 차단해
--         콘텐츠를 완전 비노출하면서 구매기록·정산기초는 보존). 새 정본(SSOT)=이 파일.
--         (admin_action_logging_restore_20260711.sql 의 admin_delete_video 재실행 금지)
--
--   [B] admin_search_videos — 반환에 orders_completed(판매 완료수) 추가.
--       관리자가 목록에서 판매 여부를 보고 삭제/숨김을 판단하도록. 2026-07-15
--       tiebreaker(v.id)+search_path 유지. 반환 시그니처 변경 → DROP 후 재생성.
--       새 정본(SSOT)=이 파일. (admin_users_siblings_and_detail_20260715.sql 의
--         admin_search_videos 재실행 금지 — 이 파일이 최신.) 트레일링 컬럼 추가라
--         이름 매핑 소비처(AdminContent·AdminCollections 피커)엔 무해.
--
--   적용: Supabase Dashboard → SQL Editor → 붙여넣기 → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- ── [A] admin_delete_video — 판매분 있으면 삭제 차단(숨김 유도) ──────────────
CREATE OR REPLACE FUNCTION public.admin_delete_video(p_video_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_title TEXT;
BEGIN
  PERFORM public.assert_admin();
  SELECT title INTO v_title FROM public.videos WHERE id = p_video_id;
  IF v_title IS NULL THEN
    RAISE EXCEPTION '영상을 찾을 수 없습니다 (id: %)', p_video_id;
  END IF;
  -- 구매자 보호: 완료주문(판매) 있으면 하드삭제 금지(CASCADE 로 구매기록 소실 방지).
  --   콘텐츠 제거가 목적이면 숨김(is_hidden)으로 충분(모든 노출면·재생토큰 차단).
  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.video_id = p_video_id AND o.status = 'completed') THEN
    RAISE EXCEPTION '판매된 라이선스가 있어 영구삭제할 수 없습니다. 대신 "숨김"을 사용하세요(구매자 기록·정산 보존).';
  END IF;
  DELETE FROM public.videos WHERE id = p_video_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'delete_video', 'video', p_video_id,
    jsonb_build_object('title', v_title));
END;
$$;

-- ── [B] admin_search_videos — orders_completed 컬럼 추가 (DROP 후 재생성) ────
DROP FUNCTION IF EXISTS public.admin_search_videos(TEXT, TEXT, INTEGER, INTEGER);
CREATE FUNCTION public.admin_search_videos(
  p_query TEXT DEFAULT NULL,
  p_filter TEXT DEFAULT 'all',
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id              TEXT,
  title           TEXT,
  thumbnail       TEXT,
  creator_id      UUID,
  creator_name    TEXT,
  duration_seconds INTEGER,
  views           BIGINT,
  price           INTEGER,
  is_hidden       BOOLEAN,
  hidden_reason   TEXT,
  hidden_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ,
  pending_reports BIGINT,
  orders_completed BIGINT   -- 🆕 판매 완료수(구매 라이선스) — 삭제 가드 UI용
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.assert_admin();
  RETURN QUERY
  SELECT
    v.id::TEXT,
    v.title,
    v.thumbnail,
    v.creator_id,
    p.display_name,
    v.duration_seconds,
    CASE
      WHEN v.views IS NULL THEN 0::BIGINT
      WHEN v.views::TEXT ~ '^[0-9]+$' THEN v.views::TEXT::BIGINT
      ELSE 0::BIGINT
    END AS views,
    COALESCE(v.price_standard, 0)::INTEGER AS price,
    COALESCE(v.is_hidden, false),
    v.hidden_reason,
    v.hidden_at,
    v.created_at,
    (SELECT COUNT(*) FROM public.reports r
       WHERE r.target_type = 'video' AND r.target_id = v.id AND r.status = 'pending')::BIGINT,
    (SELECT COUNT(*) FROM public.orders o
       WHERE o.video_id = v.id AND o.status = 'completed')::BIGINT
  FROM public.videos v
  LEFT JOIN public.profiles p ON p.id = v.creator_id
  WHERE
    (p_query IS NULL OR p_query = '' OR v.title ILIKE '%' || p_query || '%')
    AND (
      p_filter = 'all'
      OR (p_filter = 'visible' AND COALESCE(v.is_hidden, false) = false)
      OR (p_filter = 'hidden'  AND v.is_hidden = true)
    )
  ORDER BY v.created_at DESC, v.id DESC   -- 🔑 유니크 2차키(더보기 중복/누락 방지)
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_search_videos(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_search_videos(TEXT, TEXT, INTEGER, INTEGER) TO authenticated;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증(관리자 세션):
--   -- [A] 판매된 영상 삭제 시도 → '판매된 라이선스가 있어...' 예외
--   -- [B] orders_completed 컬럼 존재 + 값:
--   SELECT id, title, orders_completed, pending_reports
--   FROM public.admin_search_videos(NULL,'all',5,0);
-- ════════════════════════════════════════════════════════════════════════════
