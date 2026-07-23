-- ════════════════════════════════════════════════════════════════════════════
-- 🤝 B2B 시드 리브랜딩 + 본문 보강 (2026-07-23)
--
--   ① 회사명 'CREAITE (크리에이트)' → 'CREAITE (크리에잇)'
--      (공식 한글 표기는 '크리에잇' — meta.description·상표 기준. 시드가 '크리에이트'로
--       잘못 박아 DB에 들어간 2행을 정정한다.)
--   ② 본문(description)을 요약형에서 "진짜 게시글" 수준으로 보강
--      (상세 모달에서 펼쳐 보이므로 실제 배급사가 쓸 법한 완성된 글로 교체)
--
--   ★ 멱등: 제목(title)으로 특정해 UPDATE. 여러 번 Run 해도 동일 결과.
--   ★ b2b_seed_posts_20260723.sql(시드 SSOT)도 같은 내용으로 갱신됨 → 신규 설치 일관.
--   ★ 순서 주의: 이 UPDATE 로 기존 행이 '크리에잇'이 되어야, 시드의 WHERE NOT EXISTS
--      (company_name='CREAITE (크리에잇)' + title)가 매칭되어 재삽입(중복)을 막는다.
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run.
-- ════════════════════════════════════════════════════════════════════════════

-- ── ① 콘텐츠 배급 파트너 모집 (회사명 + 본문 보강) ──────────────────────────────
UPDATE public.b2b_posts SET
  company_name = 'CREAITE (크리에잇)',
  description = E'CREAITE(크리에잇)는 세계 최초의 AI 시네마 OTT 플랫폼입니다. 자체 스튜디오 제작과 검증된 크리에이터 네트워크를 통해 확보한 AI 영상 콘텐츠를 보유하고 있으며, 이 라이브러리를 함께 넓혀갈 유통·배급 파트너를 찾습니다.\n\n■ 우리가 가진 것\n· 자체 제작 AI 시네마 라인업(단편·시리즈)과 지속 확장되는 크리에이터 원본 콘텐츠\n· All-in-One 상업 라이선스 체계 — 구매 즉시 상업적 활용이 가능한 권리 패키지\n· 홈·시네마·프리미엄 OTT로 이어지는 자체 노출 채널과 큐레이션 컬렉션\n\n■ 원하는 제휴\n· 국내외 OTT·채널 동시 배급 및 신디케이션\n· 브랜드·IP 컬래버레이션, 라이선싱 딜\n· 지역별 로컬라이징(자막·더빙) 파트너십\n\n■ 이런 분을 찾습니다\n· 콘텐츠 배급사 / 유통사\n· OTT·채널 편성 담당\n· 브랜드·IP 라이선싱 팀\n\n관심 있으신 배급사·제작사는 이 게시판에 회사 소개 글을 올려주시거나, 아래 회사 사이트의 제휴 문의로 연락 주세요. 함께 AI 시네마 시장을 열어갈 파트너를 기다립니다.'
WHERE title = 'AI 시네마 콘텐츠, 함께 배급할 파트너를 찾습니다'
  AND company_name IN ('CREAITE (크리에이트)', 'CREAITE (크리에잇)');

-- ── ② 광고·브랜디드 콘텐츠 협업 (회사명 + 본문 보강) ───────────────────────────
UPDATE public.b2b_posts SET
  company_name = 'CREAITE (크리에잇)',
  description = E'CREAITE(크리에잇)는 브랜드의 이야기를 AI 영상으로 빠르고 감각적으로 제작해, 플랫폼과 크리에이터 네트워크를 통해 노출까지 한 번에 연결합니다. 기획–제작–배포가 하나의 파이프라인으로 이어져, 기존 광고 제작 대비 짧은 리드타임과 유연한 예산이 강점입니다.\n\n■ 제안하는 협업\n· 브랜디드 필름 / 브랜드 스토리 영상\n· 제품·서비스 프로모션 영상\n· 프리롤·인스트림 광고 캠페인(홈·시네마·OTT 타깃 노출)\n\n■ 제공 가능\n· AI 제작 파이프라인(콘셉트→스크립트→영상)\n· 플랫폼 내 타깃 노출 지면과 크리에이터 협업\n· 캠페인 성과 리포트(노출·시청·전환 지표)\n\n■ 이런 분을 찾습니다\n· 광고주 / 브랜드 마케팅팀\n· 광고대행사 / 미디어 에이전시\n· AI 브랜디드 콘텐츠를 테스트해보려는 스타트업\n\n협업을 원하는 브랜드·대행사는 회사 소개와 캠페인 목표(예산·일정·타깃)를 이 게시판에 남겨주시거나 회사 사이트로 문의 주세요. 샘플 레퍼런스가 필요하시면 함께 안내드립니다.'
WHERE title = '광고주·브랜드와 AI 브랜디드 콘텐츠 협업을 원합니다'
  AND company_name IN ('CREAITE (크리에이트)', 'CREAITE (크리에잇)');

-- ── ③ 혹시 남아 있는 다른 '크리에이트' 표기도 통일 ─────────────────────────────
UPDATE public.b2b_posts SET company_name = 'CREAITE (크리에잇)'
WHERE company_name = 'CREAITE (크리에이트)';

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT
  '① 크리에잇 표기로 통일(크리에이트 잔여 0건)' AS check_name,
  CASE WHEN (SELECT count(*) FROM public.b2b_posts WHERE company_name LIKE '%크리에이트%') = 0
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '② 크리에잇 시드 2편 존재',
  CASE WHEN (SELECT count(*) FROM public.b2b_posts WHERE company_name = 'CREAITE (크리에잇)') >= 2
    THEN '✅ PASS' ELSE '🔴 FAIL' END
UNION ALL
SELECT '③ 본문 보강 반영(■ 섹션 헤더 존재)',
  CASE WHEN (SELECT count(*) FROM public.b2b_posts
             WHERE company_name = 'CREAITE (크리에잇)' AND description LIKE '%■%') >= 2
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
