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

- [ ] 사업자등록증 발급 *(푸터에 번호 표기됨 → 보유 정황, 확인만)*
- [ ] 통신판매업 신고 *(동일 — 보유 정황)*
- [ ] **(선행) 홈택스에서 업종/종목 확인** — 콘텐츠/전자상거래 종목 없으면 추가 (토스 심사 반려 1순위 사유)
- [ ] **토스페이먼츠 가맹 계약·심사** → `live_` 키 발급 (선행: 사업자등록증 + 정산 계좌)
- [ ] live 키 교체 (둘 다 **같은 가맹점 live 쌍**) — 토큰 주면 대행 가능
  - [ ] Vercel 환경변수 `VITE_TOSS_CLIENT_KEY` → `live_ck_...`
  - [ ] Supabase Edge Function 시크릿 `TOSS_SECRET_KEY` → `live_sk_...`
- [ ] 전환 후 기존 test 빌링키 무효 → 자동결제 사용자 카드 재등록 공지 *(현재 빌링 사용자 없음 → 거의 무관)*
- [ ] 실결제 1건 검증 (소액 결제 → 환불 왕복 확인)

> 현재: 로컬 `.env` = `test_ck_...` (가상결제). **아직 실결제 아님.**

## 🚀 2. 배포·인프라 (live 점검만)

- [ ] 프로덕션 환경변수 전체 점검 (Supabase URL/anon, Bunny, VAPID, Toss, 선택 Sentry DSN)
- [ ] Bunny Stream 페이월·라이브러리 설정 ([BUNNY_SETUP_GUIDE.md](../BUNNY_SETUP_GUIDE.md))
- [ ] (선택) DMARC 레코드 추가 — `_dmarc.mail.creaite.net` TXT `v=DMARC1; p=none; rua=mailto:support@creaite.net` (수신율 개선, 필수 아님)

## 🔐 3. 소셜 로그인 검수

> Supabase 연동(키·활성화)·Site/Redirect URL 모두 완료 확인(2026-06-14, API). 남은 건 **콘솔 게시 상태**뿐.

- [ ] **Google OAuth 동의화면 게시 상태 확인** — Google Cloud Console → OAuth 동의 화면 → 게시 상태가 `프로덕션`인지(테스트면 "앱 게시" 클릭). 기본 스코프는 구글 검수 불필요 ([GOOGLE_AUTH_SETUP.md](../GOOGLE_AUTH_SETUP.md))
- [ ] **Kakao 비즈앱 전환 확인** — Kakao Developers → 앱 설정 → 비즈니스 → 비즈앱 전환(미전환 시 로그인 사용자 수 제한) ([KAKAO_AUTH_SETUP.md](../KAKAO_AUTH_SETUP.md))

## ⚖️ 4. 법적·사업자

- [ ] 사업자등록 + 통신판매업 신고 (PG 계약·전자상거래 전제 — 1번과 연동)
- [ ] 결제/환불 정책 고지 노출 확인 *(약관 7조+FAQ 존재 → 노출 위치 최종 확인)*

## 🧪 5. 베타 운영 준비

- [ ] 시드 콘텐츠/영상 준비
- [ ] 베타 테스터 모집 + 피드백 채널 운영
- [ ] (선택) Sentry 활성화 — Vercel env `VITE_SENTRY_DSN` 추가 후 재배포 (코드 연동은 완료, env만 넣으면 ON)

## 📱 6. 모바일 앱 출시 + 스토어 수수료 우회 (꼭 해야 함)

> 핵심: 인앱결제(IAP) 30% 수수료를 피하는 넷플릭스식 "리더 앱" 구조.

### 앱 패키징
- [ ] 패키징 방식 결정 — PWA 기반이라 **Android는 TWA**가 최단. iOS는 WebView 래퍼(Capacitor 등) 검토
- [ ] Google Play 개발자 계정($25 1회) / Apple Developer($99/년) 등록
- [ ] 앱 아이콘·스플래시·스토어 스크린샷·설명문 준비 ([로고/](../로고/) 활용)
- [ ] 스토어 등록·심사 제출

### 💳 결제 수수료 우회 (리더 앱 방식)
- [x] ✅ **결제 우회 코드 완료** (2026-06-14) — `appWrapper.ts` 앱 래퍼 감지 → SubscriptionModal/Page 결제 버튼이 "웹에서 구독"으로 분기·외부 브라우저 라우팅. 웹/PWA 영향 0. 앱 래퍼 빌드 시 UA `CreaiteApp`/`?app=1`/localStorage 중 하나만 설정하면 동작.
- [ ] 정책 근거 확인 — 전기통신사업법(인앱결제 강제금지, 2021) + Apple 리더앱 가이드라인
- [ ] 스토어 리젝 대비 시나리오 정리

## 📢 7. 광고 수익화 신청 (꼭 해야 함)

> 코드 인프라(`ExternalAdSlot`, env 스위치) 준비됨 → 계정 신청·승인만 하면 노출 활성화.

- [ ] **Google AdSense** 가입·승인 → `ca-pub-...` + 슬롯ID → Vercel env `VITE_ADSENSE_CLIENT`/`VITE_ADSENSE_SLOT`
- [ ] **카카오 애드핏** 광고단위(300×250) → `VITE_ADFIT_UNIT_ID`
- [ ] (선택) 쿠팡 파트너스 등 제휴
- [ ] 승인 후 Vercel env `VITE_EXTERNAL_ADS_ENABLED=1` → 재배포
- [ ] 노출·수익 리포트 모니터링

## 🧱 8. 기능 백로그 (베타 후 — 코드, 대행 가능)

### 콘텐츠·크리에이터
- [ ] ❌ AI 자동 자막 생성/번역 (현재 수동 자막만)
- [ ] ❌ 홍보문건(마케팅 소재) 자동 생성 (기획만 존재)
- [ ] 🟡 영상 클립 자동 생성 파이프라인 (업로드 시 hero clip 자동) — [hero_clip.sql](../supabase/hero_clip.sql)

### 알림·소셜
- [ ] 🟡 푸시 알림 FCM 연동 (현재 컬럼만·"준비 중") — Firebase 프로젝트 필요
- [ ] 🟡 `ad_budget_low` 알림 트리거 — **이제 광고주 셀프서비스로 owner_id 생겨 구현 가능** (예산 80% 도달 시 광고주 알림)
- [ ] 🟡 어드민 브로드캐스트 이메일 발송 (현재 인앱만 → Resend 연동, 배치 발송 설계 필요)

### 수익화·글로벌·기타
- [ ] 🟡 외부 광고 통합 (AdSense/쿠팡 — 7번과 연동)
- [ ] 🟡 크리에이터 스폰서십/협찬 배지 검수 (데이터 누적 후)
- [ ] 🟡 다국어 확장 (일본어·중국어) + 본문 i18n 보강
- [ ] 🟡 어드민 RPC 전반 감사로그 기록 보강
- [ ] 🟡 광고주 셀프서비스 후속 — 이미지 업로드(현재 URL), 영상 프리롤 광고, 영상광고(track_video_ad_event) dedup

## 🧩 9. 감사 잔여 (낮은 우선순위 — 출시 후/코드)

- [ ] 🟡 N3 billing-run race(행 락) / N9 구독풀 산정 payments 기준 재계산 / CommentItem 리마운트 리팩터 / 이메일 변경 기능 / 과대 청크 manualChunks / 마이그레이션 정본 문서화
- [ ] 🟡 부분환불(N6)·원천징수 범위(N10) — 정책/세무 확인 필요
- [ ] **M9** VAST 트래킹 픽셀 무인증 (베타 House Ads 한정 수용 중)

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

## 진행 메모
- 2026-06-13: 체크리스트 최초 작성. 개발환경 복구, R4 만료알림 배포.
- 2026-06-14: 전체감사(6영역) + Critical~Medium 일괄 수정·배포. 토스 심사는 홈택스 업종 확인 후 진행 예정.
