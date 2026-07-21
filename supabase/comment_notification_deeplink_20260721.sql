-- ════════════════════════════════════════════════════════════════════════════
-- 🔗 댓글 알림 딥링크에 댓글 ID 넣기 (2026-07-21)
--
--   [결함] 댓글 알림 link 가 `/?video={영상ID}&comment=1` 이라 **어느 댓글인지 특정 불가**.
--     · 알림을 눌러도 댓글창만 열릴 뿐 그 댓글로 이동하지 않는다(다른 댓글이 많으면 못 찾음).
--     · 그 사이 댓글이 삭제되면 "왜 없지?" 상태가 된다 — 화면이 아무 안내도 못 한다.
--       (2026-07-21 실제 발생: 알림엔 `방준호…: 영상 쿨 좋있네요` 가 있으나 DB 에 댓글 0건 =
--        작성자가 삭제. 사장님이 영상들을 뒤졌으나 찾을 수 없었음.)
--   [수정] link 를 `/?video={영상ID}&comment={댓글ID}` 로 바꾼다.
--     프론트는 **이미** `?comment={id}` 딥링크를 지원한다(CommentPanel targetCommentId —
--     해당 댓글로 스크롤+하이라이트, 답글이면 부모 자동 펼침). 관리자용으로 만들어둔 것을
--     알림도 그대로 쓰게 되는 것이라 프론트 신규 배선 없음.
--     `comment=1`(패널만 열기)도 계속 유효 — App.tsx 파서가 `cp !== "1"` 로 구분한다.
--
--   ▣ 커뮤니티 글 댓글(post_id) 링크는 건드리지 않았다 — App.tsx 파서가 post 경로에서는
--     comment 파라미터를 읽지 않아 넣어봐야 무시된다(불필요한 노이즈 방지).
--   ▣ 기존 알림 소급 수정 없음 — 옛 링크는 댓글 ID 를 몰라 복원 불가. 새 알림부터 적용.
--   ▣ 트리거는 AFTER INSERT 라 NEW.id 가 확정돼 있다(BEFORE 였다면 기본값 타이밍 확인 필요).
--
--   ★ 이 파일이 tg_notify_owner_on_comment 의 새 정본.
--     notification_audit_20260710.sql / notification_audit3_20260710.sql 의 **이 함수**
--     재실행 금지(옛 링크 형식으로 회귀 + audit_20260710 판은 inapp_comment opt-out 도 없음).
--     본문은 audit3(최신) 기준이며 v_link 한 줄만 다르다.
--   적용: Supabase Dashboard → SQL Editor → 전체 붙여넣기 → Run. 멱등.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.tg_notify_owner_on_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_owner UUID;
  v_link  TEXT;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_hidden, false) THEN RETURN NEW; END IF;

  IF NEW.video_id IS NOT NULL THEN
    SELECT creator_id INTO v_owner FROM public.videos WHERE id = NEW.video_id;
    -- ★ 변경점: comment=1 → comment={댓글ID}. 알림 클릭 시 그 댓글로 스크롤+하이라이트.
    v_link := '/?video=' || NEW.video_id || '&comment=' || NEW.id;
  ELSIF NEW.post_id IS NOT NULL THEN
    BEGIN
      SELECT user_id INTO v_owner FROM public.community_posts WHERE id = NEW.post_id::uuid;
    EXCEPTION WHEN others THEN
      v_owner := NULL;   -- post_id 가 uuid 아니면 조용히 스킵
    END;
    v_link := '/?tab=community&sub=posts&post=' || NEW.post_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_owner IS NULL OR v_owner = NEW.user_id THEN RETURN NEW; END IF;
  -- 벨 opt-out: 콘텐츠 주인이 댓글 알림을 껐으면 스킵
  IF EXISTS (SELECT 1 FROM public.notification_preferences
             WHERE user_id = v_owner AND inapp_comment = false) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    v_owner, 'comment',
    '새 댓글이 달렸어요 💬',
    COALESCE(NULLIF(NEW.author_name, ''), '누군가') || ': ' || left(COALESCE(NEW.content, ''), 80),
    v_link
  );
  RETURN NEW;
END; $fn$;

-- 트리거 재연결(멱등) — AFTER INSERT 유지
DROP TRIGGER IF EXISTS comments_notify_owner ON public.comments;
CREATE TRIGGER comments_notify_owner
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.tg_notify_owner_on_comment();

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT '댓글ID 딥링크 반영' AS check_name,
  CASE WHEN (SELECT prosrc LIKE '%''&comment='' || NEW.id%'
             FROM pg_proc WHERE proname = 'tg_notify_owner_on_comment')
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '옛 comment=1 하드코딩 제거',
  CASE WHEN (SELECT prosrc NOT LIKE '%&comment=1%'
             FROM pg_proc WHERE proname = 'tg_notify_owner_on_comment')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '숨김 댓글 알림 스킵 유지',
  CASE WHEN (SELECT prosrc LIKE '%COALESCE(NEW.is_hidden, false)%'
             FROM pg_proc WHERE proname = 'tg_notify_owner_on_comment')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '벨 opt-out(inapp_comment) 유지',
  CASE WHEN (SELECT prosrc LIKE '%inapp_comment%'
             FROM pg_proc WHERE proname = 'tg_notify_owner_on_comment')
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT 'comments 트리거 연결(AFTER INSERT)',
  CASE WHEN (SELECT count(*) FROM pg_trigger t
               JOIN pg_class c ON c.oid = t.tgrelid
               JOIN pg_namespace n ON n.oid = c.relnamespace
               JOIN pg_proc p ON p.oid = t.tgfoid
             WHERE n.nspname = 'public' AND c.relname = 'comments'
               AND p.proname = 'tg_notify_owner_on_comment'
               AND NOT t.tgisinternal) > 0
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
