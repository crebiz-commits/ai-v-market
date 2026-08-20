# 방문자 분석 설정 가이드 (GA4 + Vercel Web Analytics) — 2026-08-20

> **왜 붙였나**: 그동안 "1일 방문자"를 볼 수단이 아예 없었다. 관리자 대시보드의 "24h 시청"은
> [video_views](../supabase/phase8_video_views.sql) 기준(= 영상을 실제로 재생한 기록)이라
> **들어와서 둘러보다 나간 사람·비로그인 방문자는 전혀 잡히지 않는다.**
>
> **코드는 이미 배선 완료** — [src/app/utils/analytics.ts](../src/app/utils/analytics.ts), [src/main.tsx](../src/main.tsx).
> 아래 ①~③은 **사장님이 직접** 하셔야 하는 계정·대시보드 작업이다.

---

## ⚠️ 시작 전 — 개인정보처리방침 고지 순서

GA는 쿠키·행태정보를 수집하므로 방침 고지가 선행돼야 한다. 이미 개정해 두었다:

- 개인정보처리방침 **§5 처리 위탁**(Google LLC 추가) · **§6 국외 이전**(Google LLC 미국) · **§8 쿠키 및 행태정보 수집**(GA·Vercel 명시 + 거부 방법)
- 방침 개정일만 **2026-08-20** 로 올림(이용약관·청소년보호정책은 변경 없어 기존 날짜 유지)
- 방침 §14 는 "개정 시 시행일 7일 전부터 공지"라고 정하고 있다 → **공지사항에 개정 안내를 올리고 7일 뒤 ①을 진행**하는 것이 가장 안전하다.

**안전장치**: 코드는 `VITE_GA_MEASUREMENT_ID` 환경변수가 없으면 **GA 스크립트를 아예 로드하지 않는다.**
즉 env 를 넣기 전까지는 수집이 시작되지 않으니, 공지 기간을 두고 나중에 켜도 된다.

---

## ① GA4 속성 만들기 → 측정 ID 발급

1. <https://analytics.google.com> 접속 (creaite 관리용 구글 계정으로)
2. **관리(⚙️) → 만들기 → 속성**
   - 속성 이름: `CREAITE`
   - 보고 시간대: **대한민국**, 통화: **대한민국 원(₩)**
3. 업종·규모 선택 후 **웹** 데이터 스트림 생성
   - 웹사이트 URL: `https://www.creaite.net`
   - 스트림 이름: `CREAITE Web`
4. 생성되면 **측정 ID `G-XXXXXXXXXX`** 가 나온다 → 복사
5. **향상된 측정(Enhanced Measurement)은 켜둔 채로 유지** ⚠️
   - 우리 사이트는 `?tab=` 쿼리스트링 라우팅(SPA)이라 페이지 이동이 `history.pushState` 로 일어난다.
   - 향상된 측정의 "브라우저 기록 이벤트 기반 페이지 변경"이 이걸 자동으로 잡는다.
   - 그래서 **코드에는 수동 page_view 전송을 넣지 않았다** — 넣으면 이중 집계된다.

## ② Vercel 환경변수 등록 → 재배포

1. Vercel → 프로젝트 `ai-v-market` → **Settings → Environment Variables**
2. 추가: `VITE_GA_MEASUREMENT_ID` = `G-XXXXXXXXXX` (Environments: **All**)
3. **Deployments → 최신 배포 → Redeploy** (env 는 빌드 시 번들에 박히므로 재배포해야 반영됨)

## ③ Vercel Web Analytics 켜기

1. Vercel → 프로젝트 → **Analytics** 탭 → **Enable**
2. 코드는 이미 `@vercel/analytics` 를 로드하므로 켜기만 하면 수집 시작
3. **Hobby 플랜은 월 5만 이벤트 무료**, 초과하면 그 달 수집이 멈춘다(추가 구매 불가, Pro 업그레이드만 가능)
   → 현재 트래픽 규모에선 충분. 넘치기 시작하면 그때 판단.

---

## 확인 방법 (설정 후 10분 내)

| 도구 | 확인 위치 | 나오는 값 |
|---|---|---|
| GA4 | 보고서 → **실시간** | 지금 접속 중인 사용자 수. 폰으로 www.creaite.net 열면 1 이상 떠야 정상 |
| GA4 | 보고서 → 수명 주기 → **참여도 → 페이지 및 화면** | 일별 방문자·페이지뷰 (데이터는 보통 24시간 내 집계 확정) |
| Vercel | 프로젝트 → **Analytics** | Visitors / Page Views (경로는 `/` 하나로 모임 — 쿼리스트링 라우팅이라 정상) |

**로컬(localhost)에서는 수집되지 않는다** — 개발 트래픽이 실지표를 오염시키지 않도록 코드에서 제외했다.

---

## AdSense 와의 관계

- AdSense 신청에 GA4 가 **필수는 아니다.** 다만 심사 후 유입·체류 분석에 쓰이고, GA4↔AdSense 계정 연결도 가능하다.
- AdSense 는 별도 항목: `VITE_ADSENSE_CLIENT` / `VITE_ADSENSE_SLOT` + `public/ads.txt` 기입 → [ad-monetization-guide.md](ad-monetization-guide.md), [launch-checklist.md](launch-checklist.md) §7.
- 콘텐츠 21편 기준이라 "가치 낮은 콘텐츠" 반려 리스크가 있다는 점은 그대로다(체크리스트 §7 주의사항 참고).

## 나중에 (선택)

- **관리자 대시보드에 방문자 카드 통합** — 지금은 GA/Vercel 대시보드를 따로 봐야 한다. 매출·시청과 한 화면에서 보려면 자체 집계 테이블(`site_visits`)이 필요하고, 봇 필터·중복제거·IP 익명화를 직접 구현해야 한다. 트래픽이 의미 있게 쌓인 뒤 판단.
