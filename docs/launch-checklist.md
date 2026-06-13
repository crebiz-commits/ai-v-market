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
  - [ ] `subscription_expiry_notify_20260613.sql` 적용 ✅ (2026-06-13 적용 완료)
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
- [ ] **R11~** 자잘한 항목 검증 (가입 레이트리밋·캡차, collab 알림 원문 노출, 저대비 텍스트, ₩/원 표기 등)

## 🧪 6. 베타 운영 준비

- [x] 고객센터 1:1 문의 (커밋 `c5fabd9`)
- [ ] 시드 콘텐츠/영상 준비
- [ ] 에러 모니터링·로그 추적 체계
- [ ] 베타 테스터 모집 + 피드백 채널 운영

---

## 진행 메모

- 2026-06-13: 체크리스트 최초 작성. 컴퓨터 재설치 후 개발환경 복구 완료, R4 만료알림 구현·배포.
