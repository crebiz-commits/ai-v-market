# 🔄 작업 이어가기 핸드오프 (컴퓨터 이동용)

> **새 컴퓨터에서 이 폴더를 열고 작업을 이어갈 때 가장 먼저 읽는 문서.**
> 개인 메모리(`~/.claude/...`)는 폴더 밖이라 이동 시 사라짐 → 핵심을 여기(저장소+GitHub)에 박아둠.
> 마지막 갱신: 2026-06-19.

## 📖 새 컴퓨터에서 읽는 순서
1. [`CLAUDE.md`](../CLAUDE.md) — 작업 원칙(⭐검증 우선·한글·실서비스·출시순서)
2. **이 문서** — 지금 무엇을 어디까지 했고 다음에 뭘 하는지
3. [`docs/launch-checklist.md`](launch-checklist.md) — 출시 준비 SSOT(전체 미완/완료)
4. [`docs/creator-acquisition-plan.md`](creator-acquisition-plan.md) — 크리에이터 유치 계획(공급 콜드스타트). 홍보 자산은 `marketing/`(전단 4종+QR).

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

### ② 카카오 애드핏 (웹 광고) — 계정 승인·env 배포 완료, 매체 재심사 대기 ⏳
- ✅ **차단 풀림**(이전 "연령인증 시도 횟수 초과"). 로그인 계정 = **메인 카카오 `nomad55@naver.com`**(아이디/비번 로그인으로도 통과).
- ✅ **사업자 계정 "크레비즈" 생성 완료**(2026-06-18). 개인사업자 107-10-27099 / 일반과세자 / 대표 이현우 / 세금계산서 **정발행** / 알림 3개(이메일·문자·카톡)+일일리포트 ON / 계정설명 "CREAITE 웹광고". 마스터=본인.
- ✅ **계정 심사 = 승인**(2026-06-18). (계정 승인과 별개로 **매체 심사**가 따로 있음 — 아래.)
- ✅ **매체 등록 완료**(CREAITE / Web / creaite.net / 엔터테인먼트·사진영상) + **광고단위 생성 완료**: 배너 300×250, **광고단위 코드 `DAN-u9aMDBktu0JpNuLu`**.
- ✅ **Vercel env 2개 넣고 재배포 완료**: `VITE_EXTERNAL_ADS_ENABLED=1` + `VITE_ADFIT_UNIT_ID=DAN-u9aMDBktu0JpNuLu`(ai-v-market 프로젝트, All). 배포 자산(`ExternalAdSlot-*.js`)에 DAN id·`ba.min.js` 박힌 것 검증함.
- ⏳ **매체 심사: 1차 보류 → 재심사 요청 완료(매체상태=심사 대기, 1~2영업일).** 보류 사유="로그인/회원가입 요구 페이지"(심사자가 랜딩/스플래시의 로그인 버튼을 로그인벽으로 오인) → **코드 수정**(랜딩 off + 스플래시 라벨 로그인→둘러보기 + 2.8초 자동진입)으로 비로그인도 바로 콘텐츠 도달하게 함 → 재심사 넣음. 통과 시 카카오 하우스광고 대신 실광고 노출.
- 📌 코드 로더 `t1.daumcdn.net/kas/static/ba.min.js` (콘솔 스크립트는 kakaocdn.net — 동일 CDN, 보통 호환. 승인 후 광고 안 뜨면 kakaocdn.net으로 교체).
- 📌 앱은 **TWA(웹 감싼 앱)**라 웹 광고단위 하나로 웹+앱 둘 다 노출됨 → 애드핏 앱 SDK 별도 연동 불필요(네이티브 앱 만들 때만).
- 📌 법인 전환 시: 같은 카카오 로그인에서 **법인(683-87-03399) 사업자 계정 새로 생성** → 매체·광고단위 재등록 → env 교체. (기존 적립금 먼저 정산)
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
**2026-06-18 (애드핏 연동·광고 노출·온보딩 UX):**
- 홈피드 광고: 데스크탑 그리드 **6칸마다** 광고 셀(주기 7칸=2·3·4열 서로소로 같은 열 쏠림 방지) / **현재 `HOME_FEED_SELF_ADS=false`라 자체광고 말고 외부망(애드핏+애드센스)으로만 채움**(나중에 직접 광고주 생기면 true→자체광고 우선) / 모바일도 외부 폴백 추가 / 광고 슬롯 **지연로드**(IntersectionObserver 300px, 첫화면 멈춤·과부하 해소) / 데스크탑 광고 셀 가로·세로 중앙 정렬.
- 첫화면: **비로그인 랜딩 off**(`SHOW_LANDING=false`, 콘텐츠 우선) / **스플래시** 버튼 라벨 로그인→**둘러보기** + **2.8초 자동진입**(ref+빈deps) + 태그라인 정리. → 애드핏 "로그인벽" 보류 사유 해소 + SEO/유입.
- 검증 결론: 상세페이지 음량 작음 = **PC 스피커 문제**(영상은 YouTube 동급, Bunny 음량정규화 미지원 → 재인코딩 마이그레이션 **보류**).
- 인프라(새 PC): Node24 LTS·Git winget 설치, git identity(crebiz-commits), `.claude/settings.local.json` 안전명령 allow목록. node_modules는 D:라 보존됨.
- 핵심 스위치 위치: 광고정책 `DiscoveryFeed.tsx` `HOME_FEED_SELF_ADS` / 랜딩 `App.tsx` `SHOW_LANDING` / 외부광고 가드 `ExternalAdSlot.tsx` `EXTERNAL_ADS_ACTIVE`.

**2026-06-19 (전면 성능 최적화 — "유튜브/넷플릭스급 즉시 전환" 목표):**
- ⚡ **탭 재방문 즉시화 = 모듈 캐시(stale-while-revalidate) 패턴** 을 모든 주요 탭에 적용. `useAgeRatings` 의 모듈 캐시와 동일 방식 — 컴포넌트 밖 `Record<key, snapshot>` 에 직전 데이터 보관 → 재진입 시 캐시 즉시 표시 + 백그라운드 갱신(스피너 제거). 적용처:
  - `Cinema.tsx`(`cinemaCache`, 키 tier:showcase) · `Ott.tsx`(`ottCache`, 키 showcase) · `Community.tsx`(`postsCache`/`challengesCache`) · `Channel.tsx`(`channelCreatorsCache`/`followingVideosCache`) · `MyPage.tsx`(`myPageCache`, 키 user.id) · `DiscoveryFeed.tsx`(`homeFeedCache`, 키 user:chip — 무한스크롤 누적분+offset까지 보관해 복귀 시 이어보기).
  - ⚠️ 전부 **메모리 캐시**(페이지 reload 시 비워짐, 세션 내에서만 유효). 의도된 설계(과한 staleness 방지).
- ⚡ **홈피드 영상 플레이어 지연 마운트**(`DiscoveryFeed.tsx` MovieSection): 모든 섹션이 즉시 video.js 생성하던 것 → IntersectionObserver(±1화면)로 가까울 때만 생성/dispose. **스크롤 중 Aw Snap 크래시·메모리 폭발 해소.** video 엘리먼트는 React 밖 생성(removeChild 충돌 방지, DesktopMovieCard 패턴).
- ⚡ **서비스워커 앱셸 캐싱**(`public/sw.js`, CACHE v3): 네비게이션=네트워크 우선(항상 최신), `/assets/*` 해시 자산=캐시 우선(불변) → **재방문 즉시 로드.** 외부 도메인(Supabase/Bunny/애드핏)은 가로채지 않음.
- ⚡ 초기로딩: Sentry를 idle 동적 import로 첫페인트에서 분리(`main.tsx`) / 썸네일 `loading=lazy` / 탭 lazy청크 idle 프리페치(`App.tsx`) / 인증 4초 실패세이프(`AuthContext.tsx`, 로고 무한멈춤 방지).
- ⚡ OTT 초기 fetch 3단 워터폴 → 단일 Promise.all(왕복3→1).
- 🟡 **남은 것(보류)**: 시네마/OTT **첫 진입**(최초 데이터 로드)은 캐시로 못 줄임 — 더 빠르게 하려면 서버 단일 RPC(30쿼리→1) 또는 행당 항목수 50→축소. 사용자가 "충분히 빠름"이라 보류.

(별개: 사용자 커밋 `b5157fa` 무마찰 온보딩 게이트+레퍼럴 엔진 — `supabase/referral_20260618.sql`. 이전 세션분은 git 이력 참조.)

---

## ▶ 다음 세션 첫 행동
1. **구글 본인확인 승인 메일 왔나** 확인 → 왔으면 ①의 "앱 만들기→.aab 업로드→테스터 12명"
2. **카카오 애드핏 매체 재심사 결과** 확인(메일/문자/카톡, 1~2영업일). 통과면 카카오 하우스광고→실광고 노출 시작. 또 보류면 사유 보고 대응. (계정·매체·광고단위·env·재배포·재심사요청까지 전부 완료 상태 — ② 참조.)
3. 토스는 계속 대기. 애플은 보류.
