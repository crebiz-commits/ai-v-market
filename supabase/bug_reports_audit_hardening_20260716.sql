-- ════════════════════════════════════════════════════════════════════════════
-- 버그 제보 감사 하드닝 (2026-07-16)
--
--   독립 감사 2종 확정 결함 수정:
--   [1·중] 상태변경·쿠폰지급(금전)·삭제가 admin_logs 무기록 + reviewed_by 부재
--          → admin_set_bug_status / admin_delete_bug_report RPC(assert_admin+로깅),
--            reviewed_by 컬럼. 쿠폰지급은 action='bug_coupon_sent' 로 별도 추적.
--   [2·낮중] INSERT 정책이 user_id 만 검사 → 사용자가 자기 제보에 status='valid'/
--          'coupon_sent'·admin_note·reviewed_at 임의 지정 가능(배지 회피·메모 주입).
--          → WITH CHECK 에 status='new' + admin_note/reviewed_at/reviewed_by NULL 강제.
--   [3·낮중] image_urls 개수 무제한(직접 insert 로 수천개 → admin 페이지 DoS)
--          → CHECK(<=3).
--   [4·낮중] 옛 bug_screenshots_20260611.sql 재실행 시 버킷 public=true·공개 read 정책
--          부활 → 비공개 재확정 + 공개 read 정책 제거(방어).
--   삭제는 RPC 로만(감사) → 직접 DELETE RLS 정책 제거. (상태변경도 RPC 경유; 단 내부메모
--   편집은 직접 UPDATE 유지라 admin UPDATE 정책은 존치.)
--
--   적용: Supabase Dashboard → SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 검토자 추적 컬럼
ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- image_urls 개수 상한(<=3) — 직접 insert 대량 첨부로 admin 페이지 DoS 방지
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bug_reports_image_urls_max') THEN
    ALTER TABLE public.bug_reports ADD CONSTRAINT bug_reports_image_urls_max
      CHECK (image_urls IS NULL OR array_length(image_urls, 1) <= 3);
  END IF;
END $$;

-- INSERT 하드닝 — 본인 명의 + status='new' + 관리자 전용 필드 미지정 강제
DROP POLICY IF EXISTS bug_reports_insert ON public.bug_reports;
CREATE POLICY bug_reports_insert ON public.bug_reports
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND status = 'new'
    AND admin_note IS NULL
    AND reviewed_at IS NULL
    AND reviewed_by IS NULL
  );

-- 직접 DELETE 차단 — 삭제는 admin_delete_bug_report RPC(감사로그)로만
DROP POLICY IF EXISTS bug_reports_admin_delete ON public.bug_reports;

-- 상태변경 RPC (assert_admin + admin_logs). 쿠폰지급은 별도 action.
CREATE OR REPLACE FUNCTION public.admin_set_bug_status(p_id uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_title text; v_contact text; v_prev text;
BEGIN
  PERFORM public.assert_admin();
  IF p_status NOT IN ('new','reviewing','valid','invalid','coupon_sent') THEN
    RAISE EXCEPTION '허용되지 않는 상태입니다: %', p_status;
  END IF;
  SELECT title, reporter_contact, status INTO v_title, v_contact, v_prev
    FROM public.bug_reports WHERE id = p_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'bug report not found'; END IF;

  UPDATE public.bug_reports
    SET status = p_status, reviewed_at = now(), reviewed_by = auth.uid()
    WHERE id = p_id;

  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(),
          CASE WHEN p_status = 'coupon_sent' THEN 'bug_coupon_sent' ELSE 'set_bug_status' END,
          'bug_report', p_id::text,
          jsonb_build_object('status', p_status, 'prev', v_prev, 'title', v_title,
            'contact', CASE WHEN p_status = 'coupon_sent' THEN v_contact ELSE NULL END));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_bug_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_bug_status(uuid, text) TO authenticated;

-- 삭제 RPC (assert_admin + admin_logs). 스토리지 파일은 클라가 image_urls 로 정리.
CREATE OR REPLACE FUNCTION public.admin_delete_bug_report(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_title text;
BEGIN
  PERFORM public.assert_admin();
  SELECT title INTO v_title FROM public.bug_reports WHERE id = p_id;
  IF v_title IS NULL THEN RAISE EXCEPTION 'bug report not found'; END IF;
  DELETE FROM public.bug_reports WHERE id = p_id;
  INSERT INTO public.admin_logs (admin_id, action, target_type, target_id, details)
  VALUES (auth.uid(), 'delete_bug_report', 'bug_report', p_id::text,
          jsonb_build_object('title', v_title));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_bug_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_bug_report(uuid) TO authenticated;

-- 공개 부활 가드 — bug-screenshots 비공개 재확정 + 공개 read 정책 제거
UPDATE storage.buckets SET public = false WHERE id = 'bug-screenshots';
DROP POLICY IF EXISTS "Public read bug screenshots" ON storage.objects;

-- ════════════════════════════════════════════════════════════════════════════
-- 검증:
--   -- 관리자 세션: SELECT public.admin_set_bug_status('<id>','coupon_sent');
--   --   → bug_reports.status='coupon_sent', reviewed_by 설정, admin_logs 에 bug_coupon_sent 1행
--   SELECT action, target_id, details FROM public.admin_logs
--   WHERE action IN ('bug_coupon_sent','set_bug_status','delete_bug_report') ORDER BY created_at DESC LIMIT 5;
--   -- 버킷 비공개 확인:
--   SELECT id, public FROM storage.buckets WHERE id='bug-screenshots';   -- public=false
-- ════════════════════════════════════════════════════════════════════════════
