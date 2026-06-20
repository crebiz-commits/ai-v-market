-- ════════════════════════════════════════════════════════════════════════════
-- 시네마 감사 #4 — event_banners 공개 SELECT 정책 좁히기 (2026-06-20)
--
--   문제: event_banners_select 가 USING(true) 라, anon 이 직접 쿼리하면
--         비활성(is_active=false)·예약(active_from 미래)·종료(active_to 과거) 배너까지
--         조회 가능 → 미공개 이벤트 문구/일정 사전유출(민감정보는 아님, 마케팅 사전노출).
--   수정: 공개 SELECT 를 "활성 + 노출기간 내" 로 제한. 관리자(event_banners_admin, FOR ALL)는
--         그대로라 RLS OR 결합으로 전체 배너 관리 가능(어드민 UI 영향 없음).
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS event_banners_select ON public.event_banners;
CREATE POLICY event_banners_select ON public.event_banners
  FOR SELECT USING (
    is_active = true
    AND (active_from IS NULL OR active_from <= now())
    AND (active_to   IS NULL OR active_to   >= now())
  );

-- (event_banners_admin: FOR ALL USING(is_admin()) — 그대로 유지. 관리자는 비활성/예약 배너도 조회·관리)

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   SELECT policyname, qual FROM pg_policies WHERE tablename='event_banners';
--   -- event_banners_select 의 qual 이 is_active/active_from/active_to 조건이어야 함
-- ════════════════════════════════════════════════════════════════════════════
