-- ════════════════════════════════════════════════════════════════════════════
-- 🤝 B2B 배급사 제휴 게시판 — 초기 시드 글 2편 (2026-07-23)
--
--   목적: 게시판 오픈 직후 "글 0건 빈 화면"을 피하고, 동시에 **좋은 글의 예시**를
--         보여줘 실제 배급사·사업자가 어떻게 써야 할지 감을 잡게 한다.
--         (CREAITE 자체가 첫 게시자 → "우리는 이런 제휴를 원한다"를 공개)
--
--   작성자: 첫 관리자 계정(profiles.is_admin=true). user_id 가 실계정이라 나중에
--           관리자 화면/앱에서 본인 글로 수정·삭제 가능(is_mine=true).
--
--   ★ 멱등: 같은 (company_name, title) 조합이 이미 있으면 INSERT 안 함 → 재실행 안전.
--   ★ RLS/컬럼잠금은 authenticated/anon 대상이라 SQL Editor(postgres) 삽입엔 무관.
--   ★ block_suspended 트리거는 is_self_suspended()=현재 로그인 유저(auth.uid()) 기준 →
--     SQL Editor 에선 auth.uid()=NULL 이라 시드 삽입을 막지 않는다.
--
--   적용: Supabase SQL Editor → 전체 붙여넣기 → Run. (b2b_partnership_board 적용 후)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_admin uuid;
BEGIN
  SELECT id INTO v_admin
  FROM public.profiles
  WHERE is_admin = true
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_admin IS NULL THEN
    RAISE NOTICE '관리자 계정을 찾지 못해 시드를 건너뜁니다 (profiles.is_admin=true 없음).';
    RETURN;
  END IF;

  -- ── 시드 ①: 콘텐츠 배급 파트너 모집 ──────────────────────────────────────────
  INSERT INTO public.b2b_posts
    (user_id, company_name, category, title, description, link_url, region, status)
  SELECT
    v_admin,
    'CREAITE (크리에잇)',
    'content_partnership',
    'AI 시네마 콘텐츠, 함께 배급할 파트너를 찾습니다',
    E'CREAITE(크리에잇)는 세계 최초의 AI 시네마 OTT 플랫폼입니다. 자체 스튜디오 제작과 검증된 크리에이터 네트워크를 통해 확보한 AI 영상 콘텐츠를 보유하고 있으며, 이 라이브러리를 함께 넓혀갈 유통·배급 파트너를 찾습니다.\n\n■ 우리가 가진 것\n· 자체 제작 AI 시네마 라인업(단편·시리즈)과 지속 확장되는 크리에이터 원본 콘텐츠\n· All-in-One 상업 라이선스 체계 — 구매 즉시 상업적 활용이 가능한 권리 패키지\n· 홈·시네마·프리미엄 OTT로 이어지는 자체 노출 채널과 큐레이션 컬렉션\n\n■ 원하는 제휴\n· 국내외 OTT·채널 동시 배급 및 신디케이션\n· 브랜드·IP 컬래버레이션, 라이선싱 딜\n· 지역별 로컬라이징(자막·더빙) 파트너십\n\n■ 이런 분을 찾습니다\n· 콘텐츠 배급사 / 유통사\n· OTT·채널 편성 담당\n· 브랜드·IP 라이선싱 팀\n\n관심 있으신 배급사·제작사는 이 게시판에 회사 소개 글을 올려주시거나, 아래 회사 사이트의 제휴 문의로 연락 주세요. 함께 AI 시네마 시장을 열어갈 파트너를 기다립니다.',
    'https://www.creaite.net',
    '대한민국 · 글로벌',
    'open'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.b2b_posts
    WHERE company_name = 'CREAITE (크리에잇)'
      AND title = 'AI 시네마 콘텐츠, 함께 배급할 파트너를 찾습니다'
  );

  -- ── 시드 ②: 광고·브랜디드 콘텐츠 협업 ───────────────────────────────────────
  INSERT INTO public.b2b_posts
    (user_id, company_name, category, title, description, link_url, region, status)
  SELECT
    v_admin,
    'CREAITE (크리에잇)',
    'advertising',
    '광고주·브랜드와 AI 브랜디드 콘텐츠 협업을 원합니다',
    E'CREAITE(크리에잇)는 브랜드의 이야기를 AI 영상으로 빠르고 감각적으로 제작해, 플랫폼과 크리에이터 네트워크를 통해 노출까지 한 번에 연결합니다. 기획–제작–배포가 하나의 파이프라인으로 이어져, 기존 광고 제작 대비 짧은 리드타임과 유연한 예산이 강점입니다.\n\n■ 제안하는 협업\n· 브랜디드 필름 / 브랜드 스토리 영상\n· 제품·서비스 프로모션 영상\n· 프리롤·인스트림 광고 캠페인(홈·시네마·OTT 타깃 노출)\n\n■ 제공 가능\n· AI 제작 파이프라인(콘셉트→스크립트→영상)\n· 플랫폼 내 타깃 노출 지면과 크리에이터 협업\n· 캠페인 성과 리포트(노출·시청·전환 지표)\n\n■ 이런 분을 찾습니다\n· 광고주 / 브랜드 마케팅팀\n· 광고대행사 / 미디어 에이전시\n· AI 브랜디드 콘텐츠를 테스트해보려는 스타트업\n\n협업을 원하는 브랜드·대행사는 회사 소개와 캠페인 목표(예산·일정·타깃)를 이 게시판에 남겨주시거나 회사 사이트로 문의 주세요. 샘플 레퍼런스가 필요하시면 함께 안내드립니다.',
    'https://www.creaite.net',
    '대한민국 · 글로벌',
    'open'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.b2b_posts
    WHERE company_name = 'CREAITE (크리에잇)'
      AND title = '광고주·브랜드와 AI 브랜디드 콘텐츠 협업을 원합니다'
  );

  RAISE NOTICE '시드 완료. 현재 b2b_posts 건수: %', (SELECT count(*) FROM public.b2b_posts);
END $$;

-- ── 검증 ──────────────────────────────────────────────────────────────────────
SELECT
  '① CREAITE 시드 2편 존재' AS check_name,
  CASE WHEN (SELECT count(*) FROM public.b2b_posts WHERE company_name='CREAITE (크리에잇)') >= 2
    THEN '✅ PASS' ELSE '🔴 FAIL' END AS status
UNION ALL
SELECT '② 공개 노출(get_b2b_posts 로 조회됨)',
  CASE WHEN (SELECT count(*) FROM public.get_b2b_posts(NULL, 30, 0)
             WHERE company_name='CREAITE (크리에잇)') >= 2
    THEN '✅ PASS' ELSE '🔴 FAIL' END;
