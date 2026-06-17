# 🔄 작업 이어가기 핸드오프 (컴퓨터 이동용)

> **새 컴퓨터에서 이 폴더를 열고 작업을 이어갈 때 가장 먼저 읽는 문서.**
> 개인 메모리(`~/.claude/...`)는 폴더 밖이라 이동 시 사라짐 → 핵심을 여기(저장소+GitHub)에 박아둠.
> 마지막 갱신: 2026-06-17.

## 📖 새 컴퓨터에서 읽는 순서
1. [`CLAUDE.md`](../CLAUDE.md) — 작업 원칙(⭐검증 우선·한글·실서비스·출시순서)
2. **이 문서** — 지금 무엇을 어디까지 했고 다음에 뭘 하는지
3. [`docs/launch-checklist.md`](launch-checklist.md) — 출시 준비 SSOT(전체 미완/완료)

---

## 🟢 지금 진행 중인 메인 작업 4개 (상태 + 다음 스텝)

### ① Google Play (안드로이드 앱) — 본인확인 검토중 ⏳
- ✅ **개인(Personal) 개발자 계정 생성 완료** ($25 결제). 계정ID `6416230521373665610`. 소유 구글계정 `crebizlogistics@gmail.com`. 개발자명 **CREAITE**.
- ✅ **본인확인·주소확인 제출** → **구글 검토중**(며칠, 결과는 crebizlogistics@gmail.com 메일). 제출정보: 이현우 / 사업자등록증(사업장주소) / 주민번호앞7 / KT알뜰폰 / +82 10-2797-7009.
- ✅ Android 기기 액세스 확인 완료(Play Console 모바일앱 로그인).
- ⏳ 연락처 전화번호 인증 = **본인확인 승인 후** 자동 열림.
- **다음(승인 메일 오면):** `앱 만들기` → **CREAITE.aab 업로드(비공개테스트 트랙)** → **테스터 12명 초대×14일 연속** → 스토어등록정보(스크린샷·설명·개인정보URL `https://www.creaite.net/?info=privacy`)·콘텐츠선언(등급·타겟·데이터보안·광고) → **assetlinks에 Play 앱서명 SHA-256 추가** → 프로덕션 신청.
- **앱 패키지 파일 위치(⚠️ 폴더 밖!):** `C:\Users\crebi\Downloads\_creaite_pkg\` 와 `CREAITE - Google Play package.zip` 안에 `CREAITE.aab`·`CREAITE.apk`·`signing.keystore`·`signing-key-info.txt`. → **새 컴퓨터로 이 파일들(특히 `signing.keystore`)도 따로 옮기거나, 사용자가 백업한 것 복원.** (.aab/.apk은 PWABuilder로 재생성 가능: https://www.pwabuilder.com → www.creaite.net, Package ID `net.creaite.app`)
- 패키지명 **`net.creaite.app`**. assetlinks 로컬키 지문은 이미 `public/.well-known/assetlinks.json`에 있음(`6D:90:DA:…:3D:85`). Play 업로드 후 **Play 앱서명 지문을 배열에 추가** 필요([twa-build-guide.md](twa-build-guide.md) 3단계).

### ② 카카오 애드핏 (웹 광고) — 카카오 인증 일시차단 🔒
- adfit.kakao.com 진행 중 "**연령인증 시도 횟수 초과**"(일시 차단) + 그전 "본인확인 3계정 제한". → **몇 시간~하루 뒤** 재시도.
- **재시도 방법:** **메인 카카오톡 계정(이미 본인확인됨)으로 QR코드 로그인** → 한도 안 걸림.
- **그다음:** 매체 등록(웹 / CREAITE / `https://www.creaite.net` / 엔터테인먼트) → **광고단위 300×250** 생성 → `DAN-...` ID 발급 → Vercel env `VITE_ADFIT_UNIT_ID=DAN-...` + `VITE_EXTERNAL_ADS_ENABLED=1` 넣고 재배포(코드는 `ExternalAdSlot`에 연동완료) → **심사 요청**(스크립트가 광고 호출하는 걸 애드핏이 확인해야 통과, 1~2영업일).
- 가이드: [ad-monetization-guide.md](ad-monetization-guide.md). 토스 무관 — 무료 광고형 수익은 결제 없이 가능.

### ③ 토스페이먼츠 (결제) — 가맹 심사 대기 ⏳ (진짜 병목)
- 신청·결제 완료, **심사 1~2개월 대기.** 승인 후: live 키 교체(Vercel `VITE_TOSS_CLIENT_KEY`→`live_ck_`, Supabase 시크릿 `TOSS_SECRET_KEY`→`live_sk_`) → 실결제 1건 검증 → ⚠️ **푸터·햄버거의 개인 전화 `010-2797-7009` 제거**(Footer.tsx·HamburgerMenu.tsx).
- 코드는 Toss 기반 완성. PG 변경(이니시스 등)은 빌링 재개발 커서 토스 반려 시에만 검토.

### ④ Apple (iOS) — 보류 (베타 후)
- Apple ID 생성이 throttle/503로 계속 실패 → **지금 불필요**(iOS는 나중). Apple Developer $99/년은 iOS 단계에서.

---

## 🔑 핵심 ID·사실 (비밀 아님)
- 사업자: **개인사업자 크레비즈 / 107-10-27099 / 대표 이현우** / 통신판매업 제2020-경기파주-0327호 / 사업장 **경기도 파주시 평화로342번길 71-5, A동 (검산동) 10848**
- 도메인 **www.creaite.net** (Vercel). Supabase 프로젝트 `tvbpiuwmvrccfnplhwer`. Bunny 라이브러리 **creaite_market(615810)**.
- 상표 출원 **40-2026-0120579** (CREAITE 영문, 41·38·42류, 심사중).
- Google Play 계정ID `6416230521373665610` / 안드로이드 패키지 `net.creaite.app`.
- 카카오: 비즈앱 AI-V-Market(ID 1411057). Google OAuth 프로젝트 aimarket(aimarket-490109, 프로덕션).

## ⚠️ 주의사항
- **검증 우선**(CLAUDE.md): 가격·정책·지역특수성은 웹검색·파일확인 후 답. (예: 한국 D-U-N-S는 나이스디앤비 유료 ₩550,000 → 그래서 개인계정 채택.)
- **Supabase `server` Edge Function은 항상 `--no-verify-jwt`로 배포**(공개 엔드포인트 있음). config.toml 고정.
- **토스 live 후 개인 전화번호 제거.**
- `signing.keystore` 분실 주의(앱 업데이트 불가). 사용자 백업 완료.
- 커밋 전 `npx tsc --noEmit` 통과 확인.

## ✅ 이번 세션 코드 변경 (모두 커밋·푸시됨, main)
페이월 1분 컷오프 복구+fullAccess면제+게이트 페일세이프 / 가로 전체화면(VideoFullscreen 버튼+ProductDetail 가로잠금+fullscreenchange) / 미리보기배지 투명화 / CoverFlow 화살표 z-index 누출(z-200→z-30) / 헤더 중간너비 / ExternalAdSlot 빈박스 제거 / TWA 준비(assetlinks·ads.txt·가이드) / CLAUDE.md.

---

## ▶ 다음 세션 첫 행동
1. **구글 본인확인 승인 메일 왔나** 확인 → 왔으면 ①의 "앱 만들기→.aab 업로드→테스터 12명"
2. **카카오 차단 풀렸으면** ②의 메인계정 QR로그인 → 매체등록 → 광고단위 → DAN-ID (받으면 env 넣고 배포)
3. 토스는 계속 대기. 애플은 보류.
