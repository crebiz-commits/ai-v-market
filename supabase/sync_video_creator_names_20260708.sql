-- ════════════════════════════════════════════════════════════════════════════
-- 영상 업로더명(videos.creator) → 프로필 표시이름(display_name) 동기화 (2026-07-08)
--
--   문제: 업로드 시 creator 필드에 OAuth user_metadata.name('crebiz크레비즈')이
--         저장돼, 사용자가 CREAITE 에서 바꾼 표시이름('크리에잇')과 달라 히어로/카드에
--         업로더명이 뒤섞여 보임. (RPC 조인 표면은 display_name, raw 표면은 옛 creator)
--   조치: 모든 영상의 creator 를 소유자 프로필의 현재 display_name 으로 맞춤.
--         (플랫폼 모델상 업로더명 = 프로필 표시이름. Edge save-metadata 도 이후 display_name 우선.)
--   적용: Supabase Dashboard → SQL Editor → Run (멱등 재실행 안전).
-- ════════════════════════════════════════════════════════════════════════════

UPDATE public.videos v
SET creator = p.display_name
FROM public.profiles p
WHERE v.creator_id = p.id
  AND COALESCE(NULLIF(btrim(p.display_name), ''), NULL) IS NOT NULL
  AND v.creator IS DISTINCT FROM p.display_name;

-- 검증: 프로필과 다른 creator 가 남았는지(0행이어야) — creator_id 있는 영상 기준
-- SELECT v.id, v.title, v.creator, p.display_name
-- FROM public.videos v JOIN public.profiles p ON p.id = v.creator_id
-- WHERE v.creator IS DISTINCT FROM p.display_name AND btrim(p.display_name) <> '';
