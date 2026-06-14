# 🚀 CREAITE 출시(베타) 체크리스트

> 작성: 2026-06-13 · 코드 결함은 [full-audit-2026-06-11.md](full-audit-2026-06-11.md) 기준 거의 종료.
> 이 문서는 **출시에 필요한 외부 서비스 계약·전환·운영 항목**을 추적한다.
> 외부 콘솔(Vercel·Supabase·토스·Bunny·OAuth)의 실제 상태는 각 콘솔에서 직접 확인할 것.

## 🎯 핵심 경로 (출시 블로커)

```
사업자등록 → 통신판매업 신고 → 토스페이먼츠 가맹 계약·심사 → live 키 전환·재배포 → 결제 검증
```

이 순서가 막히면 실결제 출시 불가. 나머지 항목은 병렬 진행 가능.

---

## 💳 1. 결제 (가장 큰 미완 — 본인 계약 필요)

- [ ] 사업자등록증 발급
- [ ] 통신판매업 신고
- [ ] **토스페이먼츠 가맹 계약·심사** → `live_` 키 발급 (선행: 사업자등록증 + 정산 계좌)
- [ ] live 키 교체 (둘 다 **같은 가맹점 live 쌍**이어야 함)
  - [ ] Vercel 환경변수 `VITE_TOSS_CLIENT_KEY` → `live_ck_...`
  - [ ] Supabase Edge Function 시크릿 `TOSS_SECRET_KEY` → `live_sk_...`
- [ ] 전환 후 **기존 test 빌링키 무효** → 자동결제 사용자 카드 재등록 안내 공지
- [ ] 실결제 1건 검증 (소액 결제 → 환불 왕복 확인)

> 현재 상태: 로컬 `.env` = `test_ck_6bJX...` (가상결제). **아직 실결제 아님.**

## 🚀 2. 배포·인프라 (대부분 구축됨 — live 점검만)

- [x] Vercel 배포 (creaite.net 연결 정황 — index.html canonical)
- [x] **Supabase 마이그레이션 누락분 적용 확인** (2026-06-14) — `_verify_migrations_applied.sql` 진단 쿼리로 최근 41개 객체(테이블·함수) 전수 점검 → 전부 `exists=true`, 누락 없음. 결제·빌링·알림·graceful RPC 모두 적용 확인.
  - [x] `subscription_expiry_notify_20260613.sql` 적용 (2026-06-13 적용 완료)
- [ ] 프로덕션 환경변수 전체 점검 (Supabase URL/anon, Bunny, VAPID, Toss)
- [ ] Bunny Stream 페이월·라이브러리 설정 ([BUNNY_SETUP_GUIDE.md](../BUNNY_SETUP_GUIDE.md))
- [ ] 이메일 발신 도메인 인증 — Resend `mail.creaite.net` DKIM/SPF ([SMTP_SETUP_GUIDE.md](../SMTP_SETUP_GUIDE.md))

## 🔐 3. 소셜 로그인 검수

- [ ] **Google OAuth 프로덕션 검수/게시** ([GOOGLE_AUTH_SETUP.md](../GOOGLE_AUTH_SETUP.md))
- [ ] **Kakao 비즈앱 전환/검수** ([KAKAO_AUTH_SETUP.md](../KAKAO_AUTH_SETUP.md))
- [ ] Redirect URL·Site URL 프로덕션 도메인으로 설정

## ⚖️ 4. 법적·사업자 (일부 완료)

- [x] 약관·개인정보처리방침·청소년보호정책 (커밋 `84324da`)
- [ ] 사업자등록 + 통신판매업 신고 (PG 계약·전자상거래 필수 전제 — 1번과 연동)
- [ ] 결제/환불 정책 고지 노출 확인

## 🚨 0. 긴급 보안 (2026-06-14 전체감사 — 출시 블로커, 즉시 수정)

> 상세: [full-audit-2026-06-14.md](full-audit-2026-06-14.md). 🔬 = 운영 DB 직접 검증 완료(실제 악용 가능 확인).

- [x] ✅ 🔴 **C1 권한상승** (2026-06-14 적용·검증) — protect 트리거에 `is_admin` 보존 추가. 일반 사용자 어드민 승격 차단. (`security_patch_critical_20260614.sql`)
- [x] ✅ 🔴 **C2 정산계좌 노출** (2026-06-14 적용·검증) — `get_revenue_distributions_by_period`에 `assert_admin()` 가드. 어드민만 조회.
- [x] ✅ 🔴 **C3 결제 우회** (2026-06-14 적용·검증) — `confirm_payment` service_role 전용 REVOKE(anon/authenticated 제거), `fail_payment` 본인검증. Edge(service_role) 정상.
- [x] ✅ 🔴 **C4 회계 CASCADE 소실** (2026-06-14 적용·검증) — payments·revenue_distributions·orders FK를 `ON DELETE SET NULL`+nullable화. 계정삭제 시 원장 익명화 보존. purge cron 안전.
- [x] ✅ 🔴 **C5 빌링 이중청구** (2026-06-14 적용·배포) — 서버 멱등성 가드(최근 3분 내 활성 빌링이면 재청구 안 함) + 클라이언트 authKey URL 즉시 제거·중복실행 방지. Edge 재배포 완료.
- [x] ✅ 🔴 **C6 환불 후 재청구** (2026-06-14 적용·검증) — `admin_refund_payment` 구독 환불 분기에 `billing_subscriptions` 해지(auto_renew=false, canceled) 추가. (`refund_cancel_billing_20260614.sql`)
- [ ] 🟠 추천 깨짐(variable_conflict pragma) / 광고예산 위조 / 통계 IDOR / 빌드 타입검사 전무 / react-router 취약점 / Vercel 보안헤더 / 라이선스 중복구매 등 — 상세는 감사 문서

## 🧩 5. 코드 (감사 거의 종료)

- [x] R1 Bunny 키 노출 / R2 이메일 검증 우회 (완료)
- [x] R3·R9 공유 딥링크 / R6·R7·R8·R10 정산·환불·댓글 (완료, `fixes_audit_20260611.sql`)
- [x] R4 구독 만료 임박 알림 (완료, 2026-06-13)
- [x] **R5** 구독풀 분배 정책 결정 (2026-06-14 확정) — **OTT 전용 분배 의도, 유지**. 시네마 전용 크리에이터 구독풀 0원은 의도된 설계(시네마는 라이선스·광고로 별도 수익화). 근거 주석 추가 [phase8_revenue_distributions.sql:158](../supabase/phase8_revenue_distributions.sql#L158)
- [x] **R11~** 자잘한 항목 (2026-06-14 처리) — timeAgo 유틸 통합(4→1), 광고 overlay/midroll setTimeout cleanup, 저대비 고지문구 gray-400, collab 알림 메시지 원문 비노출(`collab_notify_privacy_20260614.sql` **SQL 적용 필요**), MyPage 조회실패 toast, 통화 ₩ 프리픽스 통일. 가입 레이트리밋/캡차는 코드 아님 → Supabase Auth 설정 영역(deprecated 엔드포인트 확인)

## 🧪 6. 베타 운영 준비

- [x] 고객센터 1:1 문의 (커밋 `c5fabd9`)
- [ ] 시드 콘텐츠/영상 준비
- [x] 에러 모니터링·로그 추적 체계 (2026-06-14) — Sentry(@sentry/react) env 게이트 연동 완료. `initSentry()`([main.tsx](../src/main.tsx)) + ErrorBoundary 자동 캡처([ErrorBoundary.tsx](../src/app/components/ErrorBoundary.tsx)). **활성화: Vercel 환경변수 `VITE_SENTRY_DSN` 추가 후 재배포** (미설정 시 비활성·무해). 청크에러는 자동 새로고침 복구라 보고 제외.
- [ ] 베타 테스터 모집 + 피드백 채널 운영

## 📱 7. 모바일 앱 출시 + 스토어 수수료 우회 (꼭 해야 함)

> 웹/PWA 출시 안정화 후 진행. 핵심은 **인앱결제(IAP) 30% 수수료를 피하는 넷플릭스식 "리더 앱" 구조.**

### 앱 패키징
- [ ] 패키징 방식 결정 — 현재 PWA 기반이라 **Android는 TWA(Trusted Web Activity)** 가 최단 경로. iOS는 WebView 래퍼(Capacitor 등) 또는 별도 검토
- [ ] Google Play 개발자 계정 등록 ($25 1회) / Apple Developer Program ($99/년)
- [ ] 앱 아이콘·스플래시·스토어 스크린샷·설명문 준비 (로고 자산 [로고/](../로고/) 활용)
- [ ] 스토어 등록·심사 제출

### 💳 결제 스토어 수수료 우회 (넷플릭스/스포티파이 "리더 앱" 방식) — 최우선
- [ ] **앱 내에서 구독 결제 UI를 노출하지 않음** → 결제는 웹(creaite.net)에서 Toss로만. 인앱결제(IAP) 미사용 = 30% 수수료 회피
  - [ ] 앱 래퍼 실행 감지 (UserAgent/주입 플래그) → `SubscriptionPage`/`SubscriptionModal` 의 결제 버튼을 "웹에서 구독하기" 안내로 대체
  - [ ] 구독 결제 흐름을 **외부 브라우저**로 라우팅 (Toss 결제창이 WebView에서 막히지 않게)
  - [ ] 앱에서는 이미 결제한 구독의 "이용/관리"만 — 구매 진입점 자체를 앱에 두지 않아야 스토어 리젝 안전
- [ ] 정책 근거 확인 — 한국 **전기통신사업법(인앱결제 강제금지법, 2021)** + Apple **리더 앱(reader app)** 가이드라인 준수
- [ ] 스토어 심사 리젝 대비 시나리오 정리 (디지털 콘텐츠 구매 경로가 앱에 없음을 명확히)

## 📢 8. 광고 수익화 신청 (꼭 해야 함)

> 코드 인프라는 이미 준비됨(`ExternalAdSlot`, env 스위치). **계정 신청·승인만 하면 노출 활성화.**

- [ ] **Google AdSense** 가입 → 사이트(creaite.net) 승인 → 게시자 ID(`ca-pub-...`) + 300×250 광고슬롯 ID 발급 → Vercel env `VITE_ADSENSE_CLIENT` / `VITE_ADSENSE_SLOT`
- [ ] **카카오 애드핏** 광고단위(300×250) 생성 → `VITE_ADFIT_UNIT_ID`
- [ ] (선택) 쿠팡 파트너스 등 제휴 광고
- [ ] 승인 완료 후 Vercel env `VITE_EXTERNAL_ADS_ENABLED=1` 로 외부광고 노출 ON → 재배포
- [ ] 노출·수익 리포트 모니터링 체계

## 🧱 9. 기능 백로그 (미구현·보류 기획)

> 코드 주석·SQL·문서 전수 검색으로 수집(2026-06-13). 출처 파일 명시. 상태: ❌미구현 / 🟡부분·준비중 / ❓확인필요

### 콘텐츠·크리에이터 도구
- [ ] ❌ **AI 자동 자막 생성/번역** — 현재 수동 자막만(언어 메타 + 파일 업로드). [Upload.tsx:1470](../src/app/components/Upload.tsx#L1470), [VideoEditModal.tsx](../src/app/components/VideoEditModal.tsx)
- [ ] ❌ **홍보문건(마케팅 소재) 자동 생성** — 코드·문서에 흔적 없음. 기획만 존재
- [ ] 🟡 **영상 클립 자동 생성 파이프라인** — 업로드 시 전 영화 hero clip 자동 생성("방법 B"). [hero_clip.sql:13](../supabase/hero_clip.sql)

### 알림·소셜
- [ ] 🟡 **푸시 알림 FCM 연동** — 현재 컬럼만, "준비 중" 표시. [NotificationSettings.tsx:8](../src/app/components/NotificationSettings.tsx#L8), [phase34_notifications.sql:13](../supabase/phase34_notifications.sql#L13)
- [ ] 🟡 **이메일 알림 트리거 잔여** — `ad_budget_low` 등 일부 트리거 미구현("준비 중" 비활성). `new_video_from_followed`는 6/12 구현됨(`new_video_follower_notify_20260612.sql`). [NotificationSettings.tsx:9](../src/app/components/NotificationSettings.tsx#L9)
- [ ] 🟡 **어드민 브로드캐스트 이메일 발송** — 현재 인앱만, Resend 이메일 연동 향후. [AdminBroadcast.tsx:104](../src/app/components/AdminBroadcast.tsx#L104)
- [ ] 🟡 **카카오톡 공유 SDK 연동** — 현재 링크 복사 안내로 대체. [ShareModal.tsx:8](../src/app/components/ShareModal.tsx#L8)

### 수익화 (베타 후)
- [ ] 🟡 **외부 광고 통합** (Google AdSense / 쿠팡 파트너스 등) — "준비 중 · 베타 후 통합". [AdminExternalAds.tsx](../src/app/components/AdminExternalAds.tsx)
- [ ] 🟡 **크리에이터 스폰서십/협찬 배지 검수** — 데이터 누적 후 본격 구현 예정. [AdminSponsorships.tsx:10](../src/app/components/AdminSponsorships.tsx#L10)

### 글로벌·기타
- [ ] 🟡 **다국어 확장** — 일본어(ja)·중국어 간체(zh-CN) 추후 추가. [i18n/index.ts:5](../src/app/i18n/index.ts#L5) · 수익 가이드 등 본문 i18n 보강([CreatorRevenueGuide.tsx:15](../src/app/components/CreatorRevenueGuide.tsx#L15))
- [ ] 🟡 **댓글 금지어 word_boundary 옵션** — [phase23_comment_management.sql:12](../supabase/phase23_comment_management.sql#L12)
- [ ] 🟡 **어드민 RPC 전반 감사로그 기록 보강** — [phase10_7_broadcast_and_logs.sql:162](../supabase/phase10_7_broadcast_and_logs.sql#L162)
- [x] ✅ **계정 삭제 30일 후 자동 삭제 cron** — (2026-06-14 해결·배포 완료) 기존엔 cron 미등록 + 함수 어드민 가드 + auth.users 미삭제로 **전혀 작동 안 함**(컴플라이언스 갭)이었음. → Edge Function `/server/purge-deletions`(auth.admin.deleteUser→CASCADE 파기) 신설·재배포(`--no-verify-jwt`), `purge-deletions-daily` cron 등록(매일 04:00 UTC). 엔드포인트 호출 검증 완료(`success:true, total:0`). 적용 SQL: [purge_deletions_cron_20260614.sql](../supabase/purge_deletions_cron_20260614.sql). [phase27_user_data_rights.sql:24](../supabase/phase27_user_data_rights.sql#L24)

### 코드 감사 잔여 (5번 항목과 연동)
- [x] **R5** 구독풀 분배 정책 결정 (2026-06-14) — OTT 전용 분배 의도, 유지 (시네마 전용 0원은 설계)
- [x] **R11~** 자잘한 항목 (2026-06-14 완료) — timeAgo 4곳→공용 util, 광고 setTimeout cleanup, 저대비 고지문구, collab 알림 원문 비노출, MyPage toast, ₩ 통일. 가입 캡차는 Supabase 설정 영역
- [ ] **M9** VAST 트래킹 픽셀 무인증 — impression 위조 가능 (현재 베타 House Ads 한정 수용 중)

### 기술 부채(정리)
- [x] ✅ `AuthModal.new.tsx` 중복 파일 정리 (2026-06-14) — 어디서도 import 안 되는 고아 파일 확인 후 삭제. 실사용은 `AuthModal.tsx`([App.tsx:73](../src/app/App.tsx#L73)).
- [x] Showcase Mock 영상 — `SHOWCASE_ENABLED=false` 이미 OFF (실제 시드 146편 등록, 2026-06-06). 참고용

> ⚠️ 이 백로그는 코드/문서에 **글로 남은 것만** 수집한 결과입니다. 머릿속에만 있던 기획은 추가로 떠오르는 대로 이 섹션에 적어주시면 검증해 채워 넣겠습니다.

---

## 진행 메모

- 2026-06-13: 체크리스트 최초 작성. 컴퓨터 재설치 후 개발환경 복구 완료, R4 만료알림 구현·배포.
- 2026-06-13: 기능 백로그 섹션 추가(코드 전수 검색). 자동 자막·홍보문건 생성 등 미구현 기획 포함.
- 2026-06-14: R11~ 자잘한 코드 항목 일괄 처리. ⚠️ `supabase/collab_notify_privacy_20260614.sql` 은 SQL Editor 수동 적용 필요(collab 알림 메시지 원문 비노출). 토스 심사는 홈택스 업종 확인 후 진행 예정.
