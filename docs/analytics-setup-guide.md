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

---

# 관리자 대시보드 "방문자" 카드 (GA4 Data API 연동)

> 코드는 **완료**. 관리자 → 대시보드에 `👣 방문자 (Google Analytics)` 카드가 이미 있고,
> 시크릿 2개를 넣으면 숫자가 채워진다. 넣기 전에는 "연동 필요" 안내가 뜬다(에러 아님).
> · Edge: `supabase/functions/server/index.ts` 의 `GET /admin-visitor-stats`
> · 화면: `src/app/components/AdminOverview.tsx`

**왜 서비스 계정이 필요한가**: GA4 Data API 는 **API 키를 받지 않는다**(OAuth2 전용). 기존 `GOOGLE_VISION_API_KEY` 는 Vision 용 API 키라 사용 불가. 서비스 계정 개인키는 브라우저에 내릴 수 없으므로 Edge 가 대신 호출하고 숫자만 넘긴다.

## ⓐ GA4 속성 ID 확인 (측정 ID 아님)

GA → **관리(⚙️) → 속성 설정 → 속성 세부정보** → 우측 상단 **속성 ID**(9~10자리 숫자).
⚠️ `G-B7B53STY1Y`(측정 ID)나 스트림 ID(`15471135536`)와 **다른 값**이다.

## ⓑ 구글 클라우드 서비스 계정 만들기

1. <https://console.cloud.google.com> → 상단에서 프로젝트 선택(기존 `aimarket` 재사용 가능)
2. **API 및 서비스 → 라이브러리** → `Google Analytics Data API` 검색 → **사용 설정**
3. **API 및 서비스 → 사용자 인증 정보 → 사용자 인증 정보 만들기 → 서비스 계정**
   - 이름: `creaite-ga-reader` (역할 부여 단계는 **건너뛰기** — GA 권한은 GA 쪽에서 준다)
4. 만들어진 서비스 계정 클릭 → **키 → 키 추가 → 새 키 만들기 → JSON** → 파일 다운로드
5. 그 서비스 계정의 **이메일**(`...@....iam.gserviceaccount.com`)을 복사

## ⓒ GA 속성에 서비스 계정을 뷰어로 추가 ★ 빼먹기 쉬움

GA → **관리 → 속성 액세스 관리 → + → 사용자 추가**
→ ⓑ에서 복사한 서비스 계정 이메일 입력 → 역할 **뷰어** → 추가

이걸 안 하면 카드에 `403 permission denied` 가 뜬다(카드가 원인 문구를 그대로 보여준다).

## ⓓ Supabase Edge 시크릿 2개 등록

```
GA_PROPERTY_ID          = 123456789          (ⓐ 값)
GA_SERVICE_ACCOUNT_JSON = {JSON 파일 전문}     (ⓑ 다운로드 파일 내용 그대로)
```

Supabase 대시보드 → Project Settings → Edge Functions → Secrets 에서 등록하거나,
JSON 파일 경로를 알려주면 CLI(`npx supabase secrets set`)로 대신 넣을 수 있다.
**시크릿 등록 후 Edge 재배포는 불필요**(런타임에 읽는다).

## ⓔ 확인

관리자 → 대시보드 → `👣 방문자` 카드에 **오늘/어제/최근 7일 방문자 + 30일 추이 그래프**가 뜨면 완료.

- "연동 필요" 문구 → 시크릿 미등록(ⓓ)
- `403` / `permission denied` → ⓒ 누락
- `PERMISSION_DENIED: Google Analytics Data API has not been used` → ⓑ-2 누락
