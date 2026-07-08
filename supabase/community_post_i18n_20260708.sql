-- ════════════════════════════════════════════════════════════════════════════
-- 커뮤니티 공지 다국어(영문) — community_posts 에 title_en/content_en 추가 + 기존 공지 3건 백필
--   2026-07-08. 챌린지(challenges.title_en 등)와 동일한 패턴.
--   프론트 rowToPost: 영어 모드에서 title_en/content_en 있으면 노출, 없으면 한글 폴백.
--   앞으로 관리자가 운영팀 명의로 공지를 쓰면 서버(/translate-post, Claude)가 자동 번역해
--   title_en/content_en 을 채움 → DB 수동작업 불필요. (ANTHROPIC_API_KEY 필요)
-- 적용: Supabase SQL Editor → Run (멱등).
-- ════════════════════════════════════════════════════════════════════════════

-- 1) 컬럼 추가 (멱등)
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS title_en   text;
ALTER TABLE public.community_posts ADD COLUMN IF NOT EXISTS content_en text;

-- 2) 기존 공식 공지 3건 영문 백필 (자동번역 대기 없이 즉시 영문화)
UPDATE public.community_posts SET
  title_en = $t$☕ [Event] Become a Big Mega Uploader with Mega Coffee!$t$,
  content_en = $en$Hello from the CREAITE Team.

We're running the "Big Mega Uploader" event to cheer on the creators who fill CREAITE with their work! We've prepared sweet rewards together with Mega Coffee. ☕

🎁 Event details
For every 30 films you upload, we'll send you a ₩30,000 Mega Coffee gift card.
· 30 uploads → one ₩30,000 card
· 60 uploads → another ₩30,000 card
· 90, 120… another card every 30 uploads!

🚀 How to join
1. Upload your AI videos from the "Upload" menu at the top.
2. Once you reach 30 cumulative uploads, the milestone is recorded automatically.
3. After the team verifies it, we'll email your Mega Coffee gift card to your sign-up address.

📌 Notes
· Only your own AI-created original videos count. (Re-uploading others' videos or duplicate uploads are excluded.)
· Only videos 1 minute or longer appear in Cinema/OTT and are counted.
· Uploaded videos can also earn ad, sales, and subscription revenue.

The more you make, the more coffee — and income — you stack up. Take on the Big Mega Uploader challenge right now!

— The CREAITE Team$en$
WHERE id = '4795bf82-275e-440e-80fc-1578698c5fca';

UPDATE public.community_posts SET
  title_en = $t$🐛 [Event] Hunt the Bugs! Report one and get a coffee coupon$t$,
  content_en = $en$Hello from the CREAITE Team.

During the beta, we're running the "Bug Hunt" event to make CREAITE more solid. Report any errors, odd behavior, or inconveniences you find, and after the team reviews and accepts your report, everyone whose report is accepted gets a coffee coupon. ☕

🎯 What to look for
· Buttons that don't work or take you to the wrong place
· Broken layouts or text/images that look off
· Errors during video playback, payment, login, and so on
· Typos, awkward wording, confusing guidance
· Anything that makes you think "this is a bit inconvenient"

🎁 How to join
1. Tap the "Bug Hunt 🐛" banner in the bottom menu or at the top of Cinema.
2. Write a title and description to report it. (Adding steps to reproduce and the screen where it happened helps a lot!)
3. After the team reviews and accepts it, we'll send a coffee coupon to the contact you provided.

📌 Notes
· For the same bug, the reward goes to whoever reports it first.
· Even small things are welcome — one small report improves everyone's experience.
· Reporting requires sign-in. (We need it to send your coupon.)

Your sharp eyes complete CREAITE. We'd love your participation!

— The CREAITE Team$en$
WHERE id = '366258d7-f2f0-4015-9098-8eed9debb33a';

UPDATE public.community_posts SET
  title_en = $t$🎬 Welcome to CREAITE — the world's first AI cinema OTT$t$,
  content_en = $en$Hello from the CREAITE Team.

CREAITE, the world's first AI cinema OTT connecting AI creators' work with audiences, is now open. We're currently in beta and refining the service quickly based on your valuable feedback.

✨ What you can do on CREAITE

· Watch — From short-form on the home feed to mid-length films in Cinema and full-length features in OTT, enjoy a wide range of AI-made works for free. (Premium subscription ₩4,900/mo: ad-free + full-length access)
· Create — Anyone can upload their own AI videos from the Upload tab. Creators earn from three sources: ads, sales, and subscription share.
· Challenges — Join the community's monthly contest. 1st place wins ₩300,000, and top entries are featured on the main feed.
· Connect — Share prompts, find collaboration partners, and mingle with other creators in the community.

💬 For questions, please check the FAQ at the bottom first, and send any issues or suggestions to support@creaite.net anytime. We'll carefully read and act on every piece of beta feedback.

The new era of AI-made cinema — start it with CREAITE. Thank you.

— The CREAITE Team$en$
WHERE id = '16f1a633-3aec-454c-bbca-fc5618d60435';

-- 3) 검증: 3건 모두 영문 채워졌는지 (기대: 3행, title_en/content_en NOT NULL)
-- SELECT id, (title_en IS NOT NULL) AS has_title_en, (content_en IS NOT NULL) AS has_content_en
-- FROM public.community_posts WHERE is_notice = true ORDER BY created_at DESC;
