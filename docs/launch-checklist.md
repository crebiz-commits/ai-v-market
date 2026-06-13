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
- [ ] **Supabase 마이그레이션 누락분 적용 확인** — `supabase/*.sql` 중 SQL Editor 수동 적용 파일 다수. 빠진 것 없는지 점검
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

## 🧩 5. 코드 (감사 거의 종료)

- [x] R1 Bunny 키 노출 / R2 이메일 검증 우회 (완료)
- [x] R3·R9 공유 딥링크 / R6·R7·R8·R10 정산·환불·댓글 (완료, `fixes_audit_20260611.sql`)
- [x] R4 구독 만료 임박 알림 (완료, 2026-06-13)
- [ ] **R5** 구독풀 분배 정책 결정 — 시네마 전용 크리에이터 분배 0원 (의도 확인 필요)
- [x] **R11~** 자잘한 항목 (2026-06-14 처리) — timeAgo 유틸 통합(4→1), 광고 overlay/midroll setTimeout cleanup, 저대비 고지문구 gray-400, collab 알림 메시지 원문 비노출(`collab_notify_privacy_20260614.sql` **SQL 적용 필요**), MyPage 조회실패 toast, 통화 ₩ 프리픽스 통일. 가입 레이트리밋/캡차는 코드 아님 → Supabase Auth 설정 영역(deprecated 엔드포인트 확인)

## 🧪 6. 베타 운영 준비

- [x] 고객센터 1:1 문의 (커밋 `c5fabd9`)
- [ ] 시드 콘텐츠/영상 준비
- [ ] 에러 모니터링·로그 추적 체계
- [ ] 베타 테스터 모집 + 피드백 채널 운영

## 🧱 7. 기능 백로그 (미구현·보류 기획)

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
- [ ] ❓ **계정 삭제 30일 후 자동 삭제 cron** — 컬럼은 있음, 실제 삭제 크론 동작 여부 확인 필요. [phase27_user_data_rights.sql:24](../supabase/phase27_user_data_rights.sql#L24)

### 코드 감사 잔여 (5번 항목과 연동)
- [ ] **R5** 구독풀 분배 정책 결정 (시네마 전용 크리에이터 0원)
- [x] **R11~** 자잘한 항목 (2026-06-14 완료) — timeAgo 4곳→공용 util, 광고 setTimeout cleanup, 저대비 고지문구, collab 알림 원문 비노출, MyPage toast, ₩ 통일. 가입 캡차는 Supabase 설정 영역
- [ ] **M9** VAST 트래킹 픽셀 무인증 — impression 위조 가능 (현재 베타 House Ads 한정 수용 중)

### 기술 부채(정리)
- [ ] ❓ `AuthModal.new.tsx` 중복 파일 정리 여부 확인 ([AuthModal.new.tsx](../src/app/components/AuthModal.new.tsx))
- [x] Showcase Mock 영상 — `SHOWCASE_ENABLED=false` 이미 OFF (실제 시드 146편 등록, 2026-06-06). 참고용

> ⚠️ 이 백로그는 코드/문서에 **글로 남은 것만** 수집한 결과입니다. 머릿속에만 있던 기획은 추가로 떠오르는 대로 이 섹션에 적어주시면 검증해 채워 넣겠습니다.

---

## 진행 메모

- 2026-06-13: 체크리스트 최초 작성. 컴퓨터 재설치 후 개발환경 복구 완료, R4 만료알림 구현·배포.
- 2026-06-13: 기능 백로그 섹션 추가(코드 전수 검색). 자동 자막·홍보문건 생성 등 미구현 기획 포함.
- 2026-06-14: R11~ 자잘한 코드 항목 일괄 처리. ⚠️ `supabase/collab_notify_privacy_20260614.sql` 은 SQL Editor 수동 적용 필요(collab 알림 메시지 원문 비노출). 토스 심사는 홈택스 업종 확인 후 진행 예정.
