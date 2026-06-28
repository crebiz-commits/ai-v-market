# 🚀 CREAITE 출시(베타) 체크리스트

> 갱신: 2026-06-14 · **완료 항목은 제거**하고 미해결만 추적. 완료 내역 요약은 맨 아래 "✅ 완료 기록".
> 코드/보안 감사는 [full-audit-2026-06-14.md](full-audit-2026-06-14.md) 기준 Critical~Medium 처리 완료.
> 외부 콘솔(Vercel·Supabase·토스·Bunny·OAuth) 실제 상태는 각 콘솔에서 직접 확인.

## 🎯 핵심 경로 (출시 블로커)

```
홈택스 업종 확인 → 토스페이먼츠 가맹 계약·심사 → live 키 전환·재배포 → 실결제 검증
```

이 흐름이 막히면 실결제 출시 불가. 나머지는 병렬 진행 가능.

---

## 💳 1. 결제 (가장 큰 미완 — 본인 계약 필요)

- [x] ✅ 사업자등록증 (107-10-27099, 크레비즈)
- [x] ✅ 통신판매업 신고 (제2020-경기파주-0327호)
- [x] ✅ **업종/종목 추가 완료** (2026-06-15) — 전자상거래업 + 포털·인터넷정보매개서비스업(정보통신업) 추가. 토스 업종 불일치 반려 리스크 해소.
- [ ] **토스페이먼츠 가맹 계약·심사** → `live_` 키 발급 (선행: 사업자등록증 ✅ + 정산 계좌) ← **지금 신청 가능**
- [ ] live 키 교체 (둘 다 **같은 가맹점 live 쌍**) — 토큰 주면 대행 가능
  - [ ] Vercel 환경변수 `VITE_TOSS_CLIENT_KEY` → `live_ck_...`
  - [ ] Supabase Edge Function 시크릿 `TOSS_SECRET_KEY` → `live_sk_...`
- [ ] 전환 후 기존 test 빌링키 무효 → 자동결제 사용자 카드 재등록 공지 *(현재 빌링 사용자 없음 → 거의 무관)*
- [ ] 실결제 1건 검증 (소액 결제 → 환불 왕복 확인)
- [ ] ⚠️ **토스 연결/승인 후 → 푸터·햄버거 사업자정보의 전화번호 제거** — 현재 `010-2797-7009`(개인 휴대폰)을 토스 심사 요건(전자상거래법 §13 전화번호 표시) 때문에 **임시로** 넣어둠. 일반전화 없어 개인번호라 승인 후 바로 빼야 함. (Footer.tsx·HamburgerMenu.tsx의 `010-2797-7009` 라인 삭제 — 토큰 주면 대행)

> 현재: 로컬 `.env` = `test_ck_...` (가상결제). **아직 실결제 아님.**

## 🚀 2. 배포·인프라 (live 점검만)

- [x] ✅ **Supabase Edge Function 시크릿 전수 확인**(2026-06-16, API) — BUNNY_*·RESEND_*·TOSS_SECRET_KEY·VAPID_*·GOOGLE_VISION_API_KEY·BILLING_CRON_SECRET 모두 설정됨. (TOSS_SECRET_KEY는 현재 test → live 전환만 남음)
- [x] ✅ **Vercel 프론트 환경변수 확인 완료**(2026-06-16). 필수 모두 등록됨: `VITE_BUNNY_HOSTNAME`(All)·`VITE_BUNNY_LIBRARY_ID`(Production)·`VITE_TOSS_CLIENT_KEY`(test, 승인 후 live 교체)·`VITE_VAPID_PUBLIC_KEY`·`VITE_SUPABASE_URL/ANON_KEY`. ⚪ `VITE_KAKAO_JS_KEY`는 **카카오톡 공유 전용**(로그인은 Supabase OAuth라 무관) — 없으면 링크복사 폴백, 출시 무관. ⚪ (선택) `VITE_BUNNY_LIBRARY_ID`를 Preview에도 추가하면 PR 미리보기 배포에서 영상 노출됨(Production엔 영향 없음).
- [x] ✅ **Bunny Stream 페이월·라이브러리 설정 확인**(2026-06-16). 라이브러리 creaite_market(615810): Direct play ON·**Embed view token auth ON**·CDN token auth OFF(맞음)·Allowed domains에 `*`. 서버 `BUNNY_TOKEN_AUTH_KEY` 설정됨(엔드포인트가 실토큰 발급 확인). 마켓 재생 정상 = 키 일치. 🟡(선택) Allowed domains에서 localhost 정리+실도메인(`creaite.net`,`*.vercel.app`) 추가는 출시 후. ([BUNNY_SETUP_GUIDE.md](../BUNNY_SETUP_GUIDE.md))
- [x] ✅ **미리보기 1분 컷오프 버그 수정**(2026-06-16, ProductDetail.tsx) — 비구독자가 1분 후에도 끝까지 재생되던 문제. 원인: player.js `ready` 레이스로 timeupdate 구독을 놓쳐 컷오프·조회수·종료오버레이가 모두 죽음. 수정: ① ready 대기 없이 timeupdate 능동 반복구독(레이스 방어) ② 월클록 백스톱 타이머로 한도 보장. 인접버그도 수정: 클라 컷오프가 `isSubscriber`만 봐서 **라이선스 구매자·영상 소유자·관리자도 1분에 잘리던** 모순 → 서버 `fullAccess` 반영해 면제. **Vercel 재배포 후 비구독 계정으로 재검증 필요.**
- [x] ✅ **재생 페이월 전 피드 전수 점검**(2026-06-16) — 홈/시네마/OTT 모든 재생 표면 확인. 결과: 모든 "보기" 진입점이 ProductDetail(페이월)로 funnel됨. 인라인 카드=30초 하이라이트 루프·시네마 히어로(CoverFlow)=15초 루프·OTT 히어로=30초 클립/preview.webp → 전편 노출 없음. 유일한 무제한 플레이어 VideoFullscreen은 홈피드 풀스크린 버튼에서만 도달하며 게이트(`openFullscreenGated`)로 구독자·숏폼만 허용. **추가 수정**: 게이트가 길이 메타 0/누락 영상을 통과시키던 페일세이프 구멍 → "길이를 확실히 아는 60초 이하"만 직접 재생, 미확정은 페이월로 우회(DiscoveryFeed.tsx). ⚠️ 잔여(경미): 게이트 임계값이 하드코딩 60초 — 어드민이 `cinemaPreviewSeconds`를 60 미만으로 낮추면 30~60초 영상이 풀스크린 버튼으로 샐 수 있음(기본 60이라 현재 무관, 설정 낮출 때만 주의).
- [ ] (선택) DMARC 레코드 추가 — `_dmarc.mail.creaite.net` TXT `v=DMARC1; p=none; rua=mailto:support@creaite.net` (수신율 개선, 필수 아님)

## 🔐 3. 소셜 로그인 검수

> Supabase 연동(키·활성화)·Site/Redirect URL 모두 완료 확인(2026-06-14, API). 콘솔 게시 상태도 확인 완료(2026-06-16).

- [x] ✅ **Google OAuth 동의화면 — 프로덕션 게시 확인 완료**(2026-06-16). 프로젝트 `aimarket`(aimarket-490109), 게시 상태=프로덕션, 사용자 유형=외부, 기본 스코프(email·profile)라 구글 별도 검수 불필요. ([GOOGLE_AUTH_SETUP.md](../GOOGLE_AUTH_SETUP.md))
- [x] ✅ **Kakao 비즈앱 전환 확인 완료**(2026-06-16). 앱 AI-V-Market(ID 1411057)=비즈앱, 카카오 로그인·동의항목 설정함. 사용자 수 제한 없음. (비즈니스 채널 미연결은 로그인에 무관 — 선택 기능.) ([KAKAO_AUTH_SETUP.md](../KAKAO_AUTH_SETUP.md))

## ⚖️ 4. 법적·사업자

- [x] ✅ 사업자등록 + 통신판매업 신고 완료 (§1 참조 — 107-10-27099 / 제2020-경기파주-0327호)
- [x] ✅ **운영 주체 확정**(2026-06-16): **개인사업자 크레비즈 / 107-10-27099 / 대표 이현우**. 푸터·햄버거 사업자정보 표시가 이와 일치(유지). ⚠️ **토스 가맹계약·정산통장도 반드시 이 개인사업자(107-10-27099) 명의**로 진행. (참고: 카카오 비즈앱은 법인 "주식회사 크레비즈/683-87-03399"로 인증돼 있으나 로그인 전용이라 무관.)
- [x] ✅ **결제/환불 정책 고지 노출 완료**(2026-06-16) — 약관 제7조+FAQ에 더해, 결제 직전 고지 추가: 구독모달(정기결제)·라이선스 구매(청약철회 제한)·광고 충전(환불). 모두 약관 제7조 링크. (전자상거래법 결제 전 고지 충족)

### 지식재산(IP)
- [x] ✅ **상표권 출원 (CREAITE, 영문)** — 국내 선등록 0건 확인. 셀프 출원·납부 완료(2026-06-16, 출원번호 **40-2026-0120579**, 제41·38·42류, ₩138,000). 심사 8~14개월. *유사상표 CREAITER(일본 41류) 주의 — 의견제출통지 시 대응 필요.*
- [ ] ⚪ (보류) 한글 "크리에잇" 상표 — 2026-06-16 사용자 결정으로 패스. 추후 필요 시 동일 류로 출원 가능(누가 선점하면 그때 대응).
- [x] ✅ **자체광고 실제 브랜드 → 데모 교체** (2026-06-15) — 삼성·옥션·지마켓 등 무단 브랜드명·이미지·영상 노출 제거(데모 커머스/샘플 마켓/예시 테크). 삼성 프리롤 영상은 비활성. 무단 브랜드 사용 리스크 해소.
- [x] ✅ **약관 IP 조항 보강** (2026-06-15) — 제4조: 권리 보증·면책·마켓 재실시(서브라이선스). 제5조: 상표·초상·퍼블리시티·딥페이크·기존 IP 모방 AI생성물 금지 + 신고-삭제. (KO·EN 동기화)
- [ ] ⚪ 특허 — 일반 플랫폼이라 불필요. 독창적 기술 발명 시에만 검토.

## 🧪 5. 베타 운영 준비

- [~] 시드 콘텐츠 — **저작권 안전 영상 180+편 이미 적재(서비스 중)**. ⚠️ **외부 크리에이터의 자발적 콘텐츠는 토스(정산)·구독자·트래픽이 생긴 뒤 따라오는 결과물**(선행 강요 불가 — 돈/관객 없는 곳에 안 올림). 운영자 마중물(본인 AI 원본)만 베타 직전 보강.
- [ ] 베타 테스터 모집 + 피드백 채널 운영
- [ ] (선택) Sentry 활성화 — Vercel env `VITE_SENTRY_DSN` 추가 후 재배포 (코드 연동은 완료, env만 넣으면 ON)

## 📱 6. 모바일 앱 출시 + 스토어 수수료 우회 (꼭 해야 함)

> 핵심: 인앱결제(IAP) 30% 수수료를 피하는 넷플릭스식 "리더 앱" 구조.

### 앱 패키징 — 📘 [twa-build-guide.md](twa-build-guide.md) (절차 전체)
> 토스 무관 · 콘텐츠 180+ 보유라 "빈 앱" 아님 → **무료 광고형으로 토스 없이 선출시 가능**(프리미엄 구독만 토스 후행).
- [x] ✅ 준비물 세팅(2026-06-16): 패키지명 `net.creaite.app` 확정, `public/.well-known/assetlinks.json` 배치(핑거프린트만 빌드 후 기입), PWA 매니페스트·아이콘·sw 완비. 빌드 시 dist 복사 검증 완료.
- [x] ✅ 패키징 실행 — PWABuilder로 `.aab`/`.apk` 생성 완료(2026-06-16). 서명키 백업 완료. assetlinks 로컬키 지문 배포.
- [x] ✅ **Google Play 개발자 계정 생성 완료**(2026-06-17) — **개인(Personal)** 계정, $25 결제 완료. (조직은 한국 D-U-N-S가 나이스디앤비 유료 ₩550,000이라 회피 / 애플 무료경로도 서버오류로 보류 → 개인 계정이 무료·무 D-U-N-S라 채택. 개발자명 CREAITE, 결제프로필 주소=사업장(공개), 연락처=비공개 개인. 단 **정식출시 전 테스터 12명×14일 비공개테스트** 필요.) Apple Developer($99/년)는 iOS 단계에서.
- [ ] ⭐ Play 앱서명 SHA-256 → `assetlinks.json` 기입·배포(URL바 제거 핵심)
- [ ] 앱 아이콘·스플래시·스토어 스크린샷·설명문 준비 ([로고/](../로고/) 활용)
- [ ] 스토어 등록·심사 제출

### 💳 결제 수수료 우회 (리더 앱 방식)
- [x] ✅ **결제 우회 코드 완료** (2026-06-14) — `appWrapper.ts` 앱 래퍼 감지 → SubscriptionModal/Page 결제 버튼이 "웹에서 구독"으로 분기·외부 브라우저 라우팅. 웹/PWA 영향 0. 앱 래퍼 빌드 시 UA `CreaiteApp`/`?app=1`/localStorage 중 하나만 설정하면 동작.
- [ ] 정책 근거 확인 — 전기통신사업법(인앱결제 강제금지, 2021) + Apple 리더앱 가이드라인
- [ ] 스토어 리젝 대비 시나리오 정리

## 📢 7. 광고 수익화 신청 (꼭 해야 함)

> 코드 인프라(`ExternalAdSlot`, env 스위치) 준비됨 → 계정 신청·승인만 하면 노출 활성화. 📘 [ad-monetization-guide.md](ad-monetization-guide.md)
> 토스 무관 — **무료 광고형 수익은 결제 없이 가능.** `public/ads.txt` 배치 완료(승인 후 ID 기입).

- [ ] **카카오 애드핏**(먼저·쉬움) 광고단위(300×250) → `VITE_ADFIT_UNIT_ID`
- [ ] **Google AdSense**(까다로움 — 끌어온 영상 위주면 "가치낮음" 반려 주의, 커뮤니티·원본 보강 후) → `VITE_ADSENSE_CLIENT`/`VITE_ADSENSE_SLOT` + ads.txt 기입
- [ ] (선택) 쿠팡 파트너스 등 제휴
- [ ] 승인 후 Vercel env `VITE_EXTERNAL_ADS_ENABLED=1` → 재배포
- [ ] 노출·수익 리포트 모니터링

## 🧱 8. 기능 백로그 (베타 후 — 코드, 대행 가능)

### 콘텐츠·크리에이터
- [x] ✅ 자막 정책 확정(2026-06-16) — **크리에이터가 직접 .vtt 수동 업로드(무료, 기존 기능)**. 플랫폼은 AI 자막 비용 부담 안 함. Bunny AI 자막($0.10/분/언어)은 비싸서 **어드민 전용 버튼으로만** 남김(크리에이터 비노출 → 플랫폼 과금 차단). Bunny Transcription 기능은 미활성 유지(안 켜면 0원). *시청자는 플레이어 CC로 on/off, 자막은 영상별 opt-in.*
- [x] ✅ 홍보문건(마케팅 소재) 자동 생성(2026-06-16) — Claude(haiku) 연동 엣지 `/generate-promo` + VideoEditModal "AI 홍보문건" UI(캐치프레이즈·SNS캡션·해시태그·복사). **선행: ANTHROPIC_API_KEY 시크릿(미설정 시 503 안내).**
- [x] ✅ OTT 히어로 미리보기 동적화(2026-06-16) — 클립 없는 영상도 Bunny 자동 preview.webp로 동적 표시(검증 200), 회전 20초. **결정: 진짜 클립 자동생성(ffmpeg 인프라 필요)은 비용대비 보류 — preview.webp로 충분. 출시 후 필요 시 ffmpeg.wasm/Bunny MP4fallback 도입 검토.** ([hero_clip.sql](../supabase/hero_clip.sql) 참고)

### 알림·소셜
- [ ] ⚪ 푸시 알림 FCM 연동 — **§6 네이티브 앱 + Firebase 프로젝트 선행 필요**(웹/PWA는 VAPID 웹푸시로 이미 동작). 네이티브 앱 빌드 시 함께 처리.
- [x] ✅ 어드민 브로드캐스트 이메일 (2026-06-16) — 공지 발송 시 「이메일도 발송」 체크 시 세그먼트(전체/프리미엄/무료/크리에이터) 대상 Resend 배치(100건씩) 발송. 수신거부(notification_preferences.email_broadcast) 제외 + 메일 푸터 수신거부 안내, 마이페이지 알림설정에 「서비스 공지 이메일」 토글. 엣지 `/broadcast-email` 배포, 타겟 RPC service_role 전용(PII 보호).

### 수익화·글로벌·기타
- [x] ✅ 외부 광고 통합 코드(2026-06-16) — ExternalAdSlot 커뮤니티 피드 연결(비프리미엄, 미설정 시 null). **남은 건 §7 계정 발급·env만.**
- [x] ✅ **광고 노출/클릭 사기 방어 강화(#2)** 완료(2026-06-28) — Edge `/ad-event` 집계 전환(신뢰 IP+auth.uid 식별), IP 다양성 레이트리밋(`ad_event_guard`), raw RPC anon REVOKE, VAST `track_video_ad_event` dedup+exp 6h→30분, `advertiser_create_ad` 생성한도. SQL `ad_fraud_hardening_edge_20260628.sql` 적용 + Edge 배포 완료. 설계: [ad-fraud-hardening-plan.md](ad-fraud-hardening-plan.md).
- [ ] ⚪ 크리에이터 스폰서십/협찬 배지 검수 — **현재 스폰서십 데이터 0 → 시기상조**(데이터 누적 후 admin 검수 UI 추가).
- [ ] ⚪ 다국어 확장 (일본어·중국어) — **한국 출시 무관(글로벌 확장용), 전면 번역=대형 작업** → 출시 후 전용 작업(native 검수 동반). 코드 구조(i18n)는 ja/zh 추가만 하면 되게 준비됨.
- [~] 🟡 어드민 감사로그 — admin_review_ad(광고 승인/반려)에 admin_logs 기록 추가(2026-06-16). 나머지 admin RPC는 점진 보강 여지.

## 🧩 9. 감사 잔여 (낮은 우선순위 — 출시 후/코드)

- [x] ✅ 과대 청크 manualChunks(2026-06-16, index 813→325KB) · 마이그레이션 정본 문서화([MIGRATIONS.md](MIGRATIONS.md))
- [x] ✅ N3 billing-run race — 원자적 claim(FOR UPDATE SKIP LOCKED) 적용(2026-06-16).
- [ ] 🟡 N9 구독풀 재계산 / 부분환불(N6) — **금융 로직, 현재 빌링/결제 사용자 0이라 영향 없음. 토스 부분취소 API·정산 재계산 얽혀 출시 후 테스트 데이터 동반 처리 권장**(서두르면 정합성 리스크).
- [ ] ⚪ CommentItem 리마운트 리팩터 — 핵심 댓글 기능의 ~300줄 인라인 컴포넌트 추출 = 고위험·저가치. 출시 후 테스트 동반 처리.
- [ ] 🟡 부분환불(N6)·원천징수 범위(N10) — 정책/세무 확인 필요(외부 결정)
- [x] ✅ **M9** VAST 트래킹 픽셀 서명 인증(2026-06-16) — HMAC-SHA256+6h 만료로 위조·스팸 차단. (배포 중 verify_jwt 회귀도 복구·config.toml 고정)

---

## ✅ 완료 기록 (압축 — 참조용)

**2026-06-14 (코드·DB·보안):**
- 🔴 Critical 6건 전부 해결·검증: C1 권한상승·C2 정산계좌노출·C3 결제우회·C4 회계CASCADE소실·C5 빌링이중청구·C6 환불후재청구
- 🟠 High: 추천 깨짐(pragma)·통계 IDOR·라이선스 중복(부분 UNIQUE)·search_path 13개·광고인덱스·장르라벨·SEO uploadDate·빌드 타입검사 도입·미사용 deps 6개 제거·Vercel 보안헤더
- 🟡 Medium: 가입 트리거 안전망·팔로워 알림 opt-in·effect 취소가드(Cinema/Ott/ProductDetail/MyPage)·SearchPage race·조용한 실패 toast·console.log drop·2FA 버튼 비노출
- 🟢 죽은 파일 5개 삭제, R5(구독풀 정책 확정), R11(자잘한 정돈), 계정삭제 30일 cron 구현·배포, 마이그레이션 누락 점검(누락 없음), Sentry 연동(env 게이트)

**프로덕션 DB에 적용된 SQL (운영 반영 완료):**
`collab_notify_privacy_20260614` · `purge_deletions_cron_20260614` · `security_patch_critical_20260614` · `refund_cancel_billing_20260614` · `high_fixes_20260614` · `medium_fixes_db_20260614` · (빌링 C5는 Edge Function 재배포)

**이전 완료:** Vercel 배포, 약관·개인정보·청소년정책, 고객센터 1:1, R1~R10 감사 수정, 구독 만료 알림.
**이메일 (2026-06-14 확인):** Resend 도메인 인증(DKIM+SPF+MX), Supabase Auth 커스텀 SMTP, API 키 모두 OK. DMARC만 선택 잔여.
**OAuth (2026-06-14 확인):** Google/Kakao Supabase 연동·Site/Redirect URL 완료. 콘솔 게시 상태만 잔여(§3).
**기능 (2026-06-14 추가):** 카카오톡 공유 SDK(env 게이트), 리더앱 결제우회 코드, 댓글 금지어 word_boundary(하드닝), 광고예산 dedup.
**광고주 셀프서비스 (2026-06-14, Phase 1~5 완료):** 광고 생성→심사→승인→예산충전(Toss)→노출(dedup·과금)→일자별 성과. 컴포넌트 5개+RPC 9개 운영 적용. 실결제는 Toss live 키 후 활성.

**2026-06-15 (광고 시스템·UX 보강, 모두 운영 반영):**
- 광고 노출면 상호 배타화(오버레이↔피드↔프리롤 분리), 오버레이 노출시간 비례 과금, 피드 미승인광고 노출 차단(status 필터).
- 광고주 셀프서비스 후속 완료: 이미지 스토리지 업로드·영상 프리롤·영상 피드 카드·영상광고 dedup, `ad_budget_low` 80% 알림 트리거.
- 광고주 승인광고 수정 허용(콘텐츠 변경 시 재심사), 어드민의 자체/광고주 광고 분리·직접수정, 광고 수정폼 형식별 필드 게이팅, 광고 만들기 비용 안내.
- 업로드 단계 필수검증·스크롤 상단리셋, 데스크탑 상단 햄버거, 어드민 모달 z-index, 홈피드 ₩1,000만+ '별도 협의' 표시 통일.
- 적용 SQL: `advertiser_self_service_phase1~5`·`ad_charge_dedup_phase3`·`ad_budget_low_notify`·`ad_surface_exclusive`·`ad_overlay_duration_pricing`·`advertiser_my_ads_add_video_url`·`advertiser_edit_approved_rereview`.

**2026-06-16 (출시 준비·법무·기능):**
- 결제 전 청약철회·환불 고지 추가(구독모달·라이선스·광고충전, 전자상거래법). Edge 시크릿 전수 확인.
- 약관·개인정보 법정 고지 보강: 통신판매중개자 지위·면책·약관개정·관할 보정 / 만14세미만·파기·안전조치·권익침해구제. KO·EN 동기화.
- 상표 출원(영문 CREAITE, 40-2026-0120579, 41·38·42류) 납부 완료. 자체광고 실브랜드→데모 교체.
- 자막: 업로드 화면 .vtt 업로드 추가 + 하드/소프트섭 안내. AI 자막(Bunny) 어드민 전용(과금 차단). 정책=크리에이터 수동.

## 진행 메모
- 2026-06-13: 체크리스트 최초 작성. 개발환경 복구, R4 만료알림 배포.
- 2026-06-14: 전체감사(6영역) + Critical~Medium 일괄 수정·배포. 토스 심사는 홈택스 업종 확인 후 진행 예정.
- 2026-06-15: 토스 가맹 신청·결제 완료(심사 대기). 광고 시스템 대폭 보강·검수 완료.
