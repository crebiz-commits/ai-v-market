# CREAITE — 제품 요구사항 정의서 (PRD)

> **문서 성격:** 본 PRD는 CREAITE의 **현재 구현(as-built)** 을 코드베이스 기준으로 체계화하고, 향후 요구사항·정책을 함께 담은 **단일 기준 문서(SSOT)** 입니다.
> **작성:** 2026-06-28 · **최종 개정:** 2026-07-13 · **기준 브랜치:** main(프로덕션) · **근거:** 실제 소스/마이그레이션 감사
> **언어:** 한글 · **갱신 규칙:** 기능 변경 시 해당 절을 함께 수정. 출시 추적은 [`docs/launch-checklist.md`](launch-checklist.md), 마이그레이션은 [`docs/MIGRATIONS.md`](MIGRATIONS.md) 참조.

---

## 0. 개정 이력
| 버전 | 일자 | 내용 |
|---|---|---|
| 1.0 | 2026-06-28 | 최초 작성 — 전 영역 as-built 기준 구조화 |
| 1.1 | 2026-07-13 | **전수 감사 개정** — v1.0 이후 266커밋 델타 반영: 배급사 3종(컬렉션·스포트라이트·셀렉트)+매거진, 홈피드 frozen-order, 업로드 서버강제 검수, 19+ 신규등급 제거, 얼리버드 가격, 정산 클로백, i18n 완전 영문화(2108키), SEO 일체, 시리즈 대표작 규칙, 감사 확정결함 11건 수정. 영역 심화 명세(prd/01~09)도 동일자 현행화. |

---

## 1. 제품 개요

### 1.1 한 줄 정의
**CREAITE는 세계 최초의 "AI 시네마 OTT + 크리에이터 라이선스 마켓" 결합 플랫폼**이다. AI로 제작된 영상을 ① 시청(피드·시네마·OTT)하고 ② 라이선스로 사고팔며 ③ 광고·구독·판매로 크리에이터가 수익을 얻는다.

### 1.2 비전 / 포지셔닝
- **거대 플랫폼(유튜브·넷플릭스)은 수익을 독점하지만, CREAITE는 크리에이터를 "배급사"로 만들어 수익을 돌려준다.** (마케팅 핵심 메시지)
- "그냥 올려만 두세요 — 플랫폼은 가져가고, CREAITE는 돌려드립니다."
- AI 영상 시대(Runway·KLING·Veo·Sora 등 도구 범람)에 **유통·수익화 인프라**를 선점.
- **배급사 아이덴티티 3종**(2026-07): ① **CREAITE 컬렉션**(에디터 큐레이션 셀렉션) ② **CREAITE 스포트라이트**(창작자 조명 편집 코너) ③ **CREAITE 셀렉트 배지**(공식 선정작 인장) + **CREAITE 매거진**(원본 아티클 20편, 한/영) — "선별의 권위"로 차별화.

### 1.3 운영 주체
- 판매·결제 주체: **개인사업자 '크레비즈'** (사업자등록번호 107-10-27099). 법인 ㈜크레비즈(그룹 본사)와는 별개이며 결제·정산·사업자정보는 개인 기준. (참고: 메모리 `crebiz-entity-structure`)

### 1.4 현재 단계
- **실서비스(베타 아님)** 지향. `BETA_MODE=true`(land-grab) 활성 — 빈 카테고리도 노출하고 "영상 등록" CTA로 크리에이터 선점 유도.
- 콘텐츠 **자체 제작 AI 영상 21편** 적재(2026-07-21 기준. 초기 외부 링크 시드 180+편은 전량 삭제). **카카오 애드핏 매체심사 승인 → 실광고 노출·수익화 중**(2026-07-07). 무료 광고형 티어는 선출시 가능, **프리미엄 구독·라이선스 실결제는 토스 가맹심사(병목) 후행** — 그동안 `payments_enabled=0` 서버 게이트로 결제 차단(live 전환 시 해제).
- Google Play: 개인 계정, 내부테스트 `.aab`(1.0.0) 업로드 완료 — 비공개테스트 12명×14일이 프로덕션 선행 요건.

---

## 2. 문제 정의 & 가치 제안

| 이해관계자 | 문제 | CREAITE 제공 가치 |
|---|---|---|
| **AI 크리에이터** | 만든 영상의 유통·수익화 경로 부재. 기존 플랫폼은 수익 독점·정산 불투명 | 업로드만 하면 ① 라이선스 판매(80% 환원) ② 광고 수익(50~60%) ③ 구독 풀 분배(50%). 무마찰 온보딩 + 레퍼럴 |
| **시청자** | AI 영상이 흩어져 있고 품질·연령 분류 부재 | 큐레이션된 피드/시네마/OTT + 컬렉션·셀렉트, 연령등급, 미리보기, 검색 디스커버리 |
| **라이선스 구매자(기업/제작자)** | AI 영상 합법 소싱 어려움 | 명확한 라이선스 구매·다운로드, 출처/증빙(prompt·seed·AI도구) 공개 |
| **광고주** | AI 영상 시청자 타겟 광고 채널 | 셀프서비스 광고 등록·심사·예산 충전·성과 대시보드 |

---

## 3. 타겟 사용자 / 페르소나
1. **크리에이터(공급)** — AI 영상 제작자. 핵심 획득 대상. 무마찰 업로드·수익·선점 욕구.
2. **시청자(수요)** — AI 영상 소비자. 무료(광고)·프리미엄(무광고·장편) 분기.
3. **라이선스 바이어** — 영상 소재가 필요한 기업/편집자. 결제·다운로드·라이선스 명확성 중시.
4. **광고주** — 셀프서비스로 광고 집행.
5. **운영자/관리자** — 콘텐츠·정산·심사·통계 관리.

---

## 4. 비즈니스 모델 & 수익 구조

### 4.1 사용자 티어 (`profiles.subscription_tier`)
| 티어 | 설명 | 영상 접근 | 광고 |
|---|---|---|---|
| **free** | 비구독 | 미리보기 1분(전 영상 통일), 홈 피드 | 노출(프리롤/미드롤/범퍼/오버레이) |
| **basic** | 예약 티어(현재 미판매, tierMeta 폴백 하드닝) | 미리보기 + 광고 SKIP 5초 후 가능 | 일부(SKIP 가능) |
| **premium** | 프리미엄 구독 — **오픈 얼리버드 ₩2,900/월(정상가 ₩4,900)** | 전체 시청 무제한, 장편(OTT) | **광고 제거** |

> 구독 활성 판정: `tier='premium'` **AND `subscription_expires_at`이 NOT NULL이면서 미래**(P9, 2026-07-05 — NULL=비구독으로 통일). 만료 시 cron(`reset_expired_subscriptions`)이 free로 자동 강등 + billing 정리.

### 4.2 콘텐츠 길이 게이팅 (트리거 `content_policy_v2`)
- **홈 피드(Discovery):** 0~3분 하이라이트 코너(모든 공개 영상).
- **시네마(`show_on_cinema`):** **60초+** (2026-06 3분→1분 하향, `cinema_min`).
- **OTT(`show_on_ott`):** 10분+ (600초) — 장편.
- 게이팅은 **영상 길이 기반 자동 플래그**이지 구독 게이트가 아님(프리미엄 구독 잠금 UI는 토스 후행, 현재 미구현).

### 4.3 수익원 & 분배율 (`platform_settings`, 관리자 변경 가능)
| 항목 | 키 | 기본값 | 크리에이터 분배 |
|---|---|---|---|
| 라이선스 판매 | `creator_share_sale` | 80% | 80% (플랫폼 20%) |
| 광고(홈 0~3분) | `creator_share_ad_home` | 50% | 50% |
| 광고(시네마 60초+) | `creator_share_ad_cinema` | 55% | 55% |
| 광고(OTT 10분+) | `creator_share_ad_ott` | 60% | 60% |
| 구독료 풀 | `creator_share_subscription_pool` | 50% | 50% |
| 월 구독료 | `subscription_price_krw` | **₩2,900(얼리버드)** — 종료 시 ₩4,900 복귀. ⚠️ 가격이 setting+UI+i18n+FAQ+폴백 여러 곳에 있음 — 변경 시 전부 손댈 것(메모리 `subscription-early-bird-pricing`) | — |
| 광고 CPM | `ad_cpm_krw` | ₩2,000/1,000노출 (오버레이는 노출시간 비례 과금) | — |
| 월 정산 최소액 | `payout_minimum_krw` | ₩10,000 | 미만 시 익월 이월(deferred) |

- 외부 수익: **카카오 애드핏**(승인·노출 중) + **쿠팡 파트너스 배너**(푸터) + AdSense(심사 대기).

### 4.4 정산 (Settlement)
- 월별 `calculate_monthly_revenue`(관리자) → `revenue_distributions`(크리에이터별 sale/ad/subscription 매출 + 원천징수 + 순액). **정본 = `ad_revenue_house_exclude_20260711.sql`** — 광고수익 집계에서 하우스광고(budget NULL) 노출 제외(`ad_impression_basis='paid_only'`), 구독풀은 실수납액 기준.
- 세금: `phase32_tax_withholding` — 개인 3.3%/사업자 0% 원천징수, 연말정산 CSV(`admin_get_tax_annual_report`). 사업자번호는 국세청 체크섬 서버검증.
- 지급: 관리자 `mark_revenue_paid`(pending만, 감사로그·중복메일 방지 가드). 크리에이터는 **정산계좌(payout_info)** 등록(`update_my_payout_info` — 형식검증).
- **클로백 원장**(2026-07-11, `settlement_clawbacks_20260711.sql`): 지급완료(paid) 월의 라이선스 환불 시 자동 등록 → 다음 정산에서 수동 차감 추적. `admin_refund_payment` 정본도 이 파일.
- 라이선스 ₩1,000만+ 는 **협의 판매(negotiation)** — 직접결제 대신 문의 전환.

---

## 5. 정보 구조(IA) & 내비게이션

### 5.1 메인 탭 (`Tab` 타입, 하단/상단 내비)
| 탭 키 | 화면 | 컴포넌트 |
|---|---|---|
| `discovery` | **홈 피드**(숏폼 세로 피드) | `DiscoveryFeed` |
| `market` | **시네마**(Netflix형 가로 행 + 컬렉션) | `Cinema` (tier="cinema") |
| `ott` | **OTT**(프리미엄 장편, 히어로+셀렉트+마퀴) | `Ott` |
| `upload` | **업로드** | `Upload` |
| `community` | **커뮤니티**(게시글·챌린지·협업) | `Community` |
| `channel` | **채널**(구독/탐색 + 스포트라이트) | `Channel` |
| `mypage` | **마이페이지** | `MyPage` |
| `search` | **검색·디스커버리** | `SearchPage` |
| `subscription` | **구독 관리** | `SubscriptionPage` |
| `advertiser` | **광고주 대시보드** | `AdvertiserDashboard` |
| `admin` | **관리자 패널** | `AdminLayout` |

### 5.2 보조/정책/편집 화면
`business` · `about` · `terms` · `privacy` · `youth` · `faq` · `notices` · `bug-report` · `top-creators` · `support` · 상세페이지(`ProductDetail`).
**편집 코너(?info=)**: `magazine`(+`article=슬러그`) · `collections`(+`c=컬렉션`) · `spotlight`(+`s=슬러그`) — 매거진·컬렉션·스포트라이트는 SSR 프리렌더(`api/info.ts`) 대상.

### 5.3 URL 라우팅 규칙
- `?tab=<탭>` 진입, `?video=<id>` 상세(SSR 메타 주입 `api/og.ts`), `?info=<페이지>` 정보/편집 코너, `?q=` 검색어 동기화, `?payment=|billing=` 결제 결과, `?ref=<code>` 레퍼럴, `?support=<id>` 고객센터 답변, `?app=1` 앱 래퍼, `?preview=*` 개발자 프리뷰.
- 라우트별 **동적 canonical + og:url**(App.tsx effect)로 SPA 중복색인 방지.

---

## 6. 핵심 사용자 여정

1. **시청자 획득:** 홈 피드(비로그인도 열람, 스플래시 2.8초 자동진입) → 가치 노출 → 소셜/이메일 가입 → 시청/좋아요/팔로우 → (선택) 프리미엄 구독.
2. **크리에이터 획득:** "영상 등록" CTA(베타 land-grab) → 가입 → 업로드(무마찰) → **자동 검수(통과 전 숨김)** → 라이선스/광고/구독 수익 → 정산계좌 등록 → 월 정산.
3. **라이선스 구매:** 상세페이지 → 미리보기 1분 → 구매(토스) → 다운로드. (실결제는 토스 심사 후)
4. **광고주:** 광고주 대시보드 → 광고 생성(draft) → 심사 제출 → 관리자 승인 → 예산 충전(토스) → 노출/성과 확인.
5. **레퍼럴 확산:** 초대링크(`?ref=`) → 신규 가입 시 `claim_referral`(원자화 — 실연결 시에만 +1) → 초대수 누적(현금 보상은 결제 오픈 후).

---

## 7. 기능 명세 (영역별)

> 📁 **각 영역의 심화 명세(화면 상태·RPC 계약·엣지케이스·수용기준)는 [`docs/prd/`](prd/README.md) 에 분리** — 아래는 요약. 전 문서 2026-07-13 전수 감사로 현행화됨:
> [01 인증·온보딩](prd/01-auth-onboarding.md) · [02 홈피드](prd/02-home-feed.md) · [03 시네마·OTT](prd/03-cinema-ott.md) · [04 검색·상세·라이선스](prd/04-search-detail-licensing.md) · [05 업로드·크리에이터대시보드](prd/05-upload-creator-dashboard.md) · [06 커뮤니티·채널·알림](prd/06-community-channel-notifications.md) · [07 마이페이지·결제·구독](prd/07-mypage-payment-billing.md) · [08 광고·광고주·관리자](prd/08-ads-advertiser-admin.md) · [09 정책·보안·데이터·기술](prd/09-policy-security-data-tech.md)

### 7.1 인증 · 온보딩
- **가입:** 이메일(`supabase.auth.signUp`, 확인 메일 필수) / 소셜(**Google·Kakao만** — FB/Apple/X/LINE 버튼은 2026-07-10 제거). `handle_new_user`가 `profiles`(id·display_name·avatar·referral_code) 생성. **권한 컬럼은 메타데이터 유입 불가.**
- **로그인:** Edge `/auth/signin` 또는 클라 직접. AuthContext가 세션 관리(getSession 2초 race + 4초 실패세이프), 프로필은 `get_my_profile`.
- **비밀번호 재설정:** `resetPasswordForEmail` → recovery 세션 → `updateUser`.
- **계정 삭제/데이터 권리(phase27):** 30일 유예 삭제·취소·`export_my_data`. 영구 파기 Edge `/purge-deletions`(cron 04:00 UTC), 결제·정산 원장은 익명화 보존.
- **정지 강제:** `is_suspended` → **DB 트리거 `tg_block_suspended`가 8개 테이블 쓰기 차단** + 업로드 Edge 403.
- **profiles 쓰기 잠금:** 전면 REVOKE 후 편집 5컬럼만 재부여(컬럼 GRANT가 방어선, protect 트리거는 심층방어).

### 7.2 홈 피드 (Discovery — `DiscoveryFeed`)
- **데이터(frozen-order):** `get_home_feed_order`(세션당 1회, 랭킹 id 전체 확정) + `get_home_feed_by_ids`(12개씩 배치, 순서보존) → `v_home_feed_public` 뷰. 칩 필터 all/new/popular/free/paid/cinema. **시리즈는 "첫 노출가능 에피소드"가 대표작**(1화 숨김 시 다음 화 — 2026-07-12, 증발 버그 수정). `get_home_feed_count`도 동일 규칙(2026-07-13 동기화).
- **개인화:** 좋아요/시청/팔로우 가중(3/1/5, likes 0.05, 기시청 −4), 없으면 인기+최신.
- **캐시:** 90초 fresh + 30분 SWR + **localStorage 콜드스타트 캐시**(첫 페이지, 즉시 페인트).
- **상호작용:** 좋아요·댓글·조회수는 **전역 LikesContext 스토어**(모든 피드 동시 반영). 카드에 조회수 표시(전 피드 통일). 19+ 잠금 영상은 플레이어 자체 미생성.
- **광고:** `HOME_FEED_SELF_ADS=false`(SSOT `config/ads.ts`) — 외부광고(애드핏 격리 iframe)만, 모바일 5·데스크탑 6칸 주기. 클릭은 열기 선행→집계 후행(팝업차단 회피).
- **전체화면 게이트:** `cinemaPreviewSeconds`(기본 60) 확실히 이하인 숏폼만 직접 재생, 연령게이트 선행.

### 7.3 시네마 (`Cinema`, tier="cinema")
- **구성:** CoverFlow(3편+일 때 렌더) + 추천·**CREAITE 컬렉션 행**·트렌딩·신규·Top10·형식·장르 행.
- **RPC 정본 = `cinema_rpc_hardening_20260708.sql`**(5종 전부): 트렌딩 시청자 dedup, v.id 2차 정렬키, SECURITY DEFINER+search_path, 추천=카테고리+장르 가중+likes×0.1.
- **연령:** 19+ 블러/잠금(본인 예외), `useAgeRatings` fail-closed+백오프 재시도.

### 7.4 OTT (`Ott`)
- **구성:** 히어로 빌보드(트렌딩 30초 순환, admin featured 우선) + **CREAITE 셀렉트 행**(히어로 아래) + 시간대 무드 편성 + 마퀴 행.
- **히어로 클립:** `hero_clip_id` + `hero_clip_status='passed'`(검수 게이트) — 크리에이터가 30초 티저 등록(업로드/편집), 검수 통과 시 히어로에서 0초부터 선명 재생. 클립 없으면 하이라이트 seek(상한 90초, 렌디션 폴백).
- **admin featured 스톱갭:** 10분 미만 지정작도 노출 허용(길이 게이트 넣지 말 것 — 10분+ 쌓일 때까지 의도된 임시).

### 7.5 검색 · 디스커버리 (`SearchPage`)
- **검색 전 디스커버리:** 이어보기(시청기록)·최근검색·카테고리 둘러보기·인기 태그·실시간 인기·지금 뜨는 영상·카테고리 캐러셀·추천 크리에이터.
- **검색:** `search_videos`·`search_creators` — **정본 = `search_feed_audit_20260710.sql`+`audit2`**(LIKE 이스케이프, 정지 크리에이터 제외, 결정적 정렬). 자동완성 썸네일 미리보기, `?q=` URL 동기화. 인기검색은 COUNT(DISTINCT user_id), 비로그인 로깅 차단.
- **청소년보호:** 표시되는 모든 영상 소스가 `allVideoIds`에 포함(누락=19금 fail-open — 메모리 `search-feed-ssot`).

### 7.6 영상 상세 · 재생 · 라이선스 (`ProductDetail`)
- **재생:** Bunny iframe + **재생 토큰**(Edge `video-play-token`): 비구독 150초/권한자(프리미엄·소유자·관리자·구매자) 4시간. **서버 게이트 2종 — 19금 미인증 `ageBlocked` + 숨김/비공개 `hiddenBlocked`(2026-07-13, 검수 대기 영상 직링크 재생 차단)** — 토큰 자체 미발급. iframe은 tokenReady+metaReady 후 마운트.
- **페이월:** 미리보기 1분 컷오프(본인·관리자 면제, 월클록 백스톱), 19+ 미인증 차단.
- **광고(비프리미엄):** 프리롤·미드롤(10분+, 50%)·범퍼·포스트롤·오버레이(25%+, Premium 제외). 동시노출 방지.
- **라이선스 구매:** 단일가(All-in-One). `start_payment(license)` — **금액=price_standard 정확 일치만**(티어 위조 차단; ⚠️ videos.id는 TEXT — ::uuid 캐스트 금지, 2026-07-13 수정) → 토스 → `/toss-confirm`(Bearer 필수+소유자 바인딩) → `confirm_payment`. 재구매 차단. 다운로드 `log_download`.
- **연속재생:** 종료 → 8초 카운트다운 → 유사 영상.

### 7.7 업로드 (`Upload`) · 모더레이션
- **플로우:** `create-upload`(rate limit 30/h 원자 카운터+정지 403) → TUS presigned → `save-metadata`(소유권 3계층 + thumbnail/hls **서버 재구성**(클라값 무시) + duration Bunny 실측 + 가격 클램프·180초 미만 판매 0 강제).
- **검수 파이프라인(2026-07-09, 서버강제):** 신규 업로드 **즉시 숨김** → Bunny 인코딩완료 웹훅 → Vision SafeSearch → `apply_moderation_result`(service_role 전용, pending에서만 전이, error도 fail-closed 숨김) → **통과 시에만 공개**. 클라 폴링은 폴백.
- **편집 재검수:** 제목/설명/썸네일/태그 실변경 시 자동 pending+숨김(`video_edit_remoderation_20260711.sql`).
- **연령등급:** **all/12+/15+ 3버튼**(19+는 광고정책으로 신규 업로드 제거, 2026-06-29 — 기존 19 영상은 서버 게이트 유지). 서버 폴백 '15'.
- **중복 방지:** `uploadingRef` 동기 락 + 재시도 시 `uploadedRef` Bunny 영상 재사용(고아·중복 방지).
- **본인 영상 삭제:** `delete_my_video`(판매완료 주문 있으면 차단) + 마이페이지 삭제 버튼(2026-07-12).

### 7.8 커뮤니티 (`Community`)
- 게시글/댓글/챌린지(비현금 보상)/협업/신고 — 작성자명 서버 강제(+관리자 '운영팀' 명의 예외), 공지 자동 영문번역(`translate-post`), 차단 사용자 글 숨김.
- **협업 문의:** 1:1 스레드(`collab_inquire` get-or-create — **새 스레드 시 문의 카운터 +1**, 2026-07-13 연결) + `collab_thread_send`(원문 비노출 알림).
- 신고: 사유 7종·중복방지·시간당 20건·대상 실존검증·누적 자동숨김(keep 복원은 자동숨김분만).

### 7.9 채널 & 팔로우
- `creator_followers` — insert/delete 본인만, **SELECT도 본인 팔로잉만**(팔로우 그래프 PII 비노출). 채널 RPC 정본 = `channel_feed_audit_20260709.sql`(메모리 `channel-rpc-ssot`).
- 새 영상 벨: **검수통과 시 발동**(INSERT+is_hidden/visibility UPDATE 트리거), opt-out 기본 ON, 재발송 금지.
- 채널 탭 스포트라이트 featured 카드. 이달의 크리에이터 뱃지(`admin_crown_creator`).

### 7.10 크리에이터 대시보드 (`CreatorDashboard`)
- KPI·차트·시청자 분석·광고수익(auth.uid() 고정, IDOR 불가). **정본 = `channel_feed_audit5_20260710.sql`**(pending=확정 분배액만, KST 정산일, total_views 공개 스코프). 수익 라벨 정직성·계좌 마스킹.

### 7.11 마이페이지 (`MyPage`)
- 프로필 편집·정산계좌(형식검증)·세금(체크섬)·결제내역+환불요청(7일)·레퍼럴·시청기록·플레이리스트·차단관리·데이터 내보내기/계정삭제·**받은 댓글**(답글·숨김·복원)·**본인 영상 편집/삭제**.

### 7.12 광고 & 광고주 셀프서비스
- **플로우:** create(draft) → submit → 관리자 심사(반려 사유 필수) → set_active → 충전(`start_payment(ad_budget)` 본인만). 생성 한도(시간당 10·미승인 30).
- **집계 = Edge `/ad-event` 전용**(raw RPC anon 회수): 노출/클릭 dedup(뷰어·1h — 하우스광고 포함), IP 다양성 레이트리밋, VAST 서명 30분+dedup. 오버레이 노출시간 비례 과금. 예산 80% 알림. 예산 소진 시 `ads_public` 뷰에서 제외.
- **외부:** 애드핏(격리 iframe, 노출 중)·쿠팡 파트너스(푸터)·AdSense(대기, 지연 로드).
- **형식:** `HOME_FEED_SELF_ADS=false` 동안 판매 형식 overlay/preroll 2종만.

### 7.13 결제 · 구독 (토스페이먼츠)
- **게이트:** `payments_enabled=0`(test 키 동안 서버 차단) — live 전환 시 1로 해제(launch-checklist §1).
- **단건:** `start_payment`(서버 금액검증) → 토스 → `/toss-confirm`(**Bearer 필수·소유자 바인딩·금액 대조·멱등**, ALREADY_PROCESSED 성공 수렴) → `confirm_payment`(service_role 전용). **PaymentResult는 세션복원 재시도+'다시 시도' 버튼**(2026-07-13, BillingResult 패턴).
- **빌링:** billing-auth-confirm(활성 프리미엄 스킵+결정적 orderId+Idempotency-Key) + billing-run(원자 claim, 실패 +3days 백오프, 토스 성공+DB 실패 시 자동 void). 빌링키 클라 미노출.
- **환불:** `request_refund` → 관리자 `/refund-payment` → `admin_refund_payment`(정본=clawbacks 파일 — paid월 클로백 자동 등록).

### 7.14 알림 (인앱·이메일·웹푸시)
- **3채널 독립 게이트:** `should_send_notification(user, type, channel)` — inapp(벨)·email·push 각각 opt-out. 벨 타입별 설정 UI(9종)+기기 푸시 토글. 게이트 fail-open(설정 조회 실패 시 발송).
- 발송: 벨 INSERT + Edge `/send-email`(Resend, actor는 서버 템플릿·10초 디듀프·new_follower 24h 디듀프) + 웹푸시(`/send-email` 내부, VAPID). 브로드캐스트(푸시/메일)는 is_admin.
- 커버리지: 판매·신규 댓글·새 영상(검수통과)·정산·환불·신고결과·구독 갱신(opt-out) 등. 알림 link는 쿼리스트링 형식만(App 파서 — 메모리 `notification-feed-ssot`).

### 7.15 관리자 패널 (`AdminLayout` — 23메뉴)
대시보드(자체광고) · 사용자(정지/권한/**프리미엄 수동 지급**) · 콘텐츠·댓글 · 모더레이션/신고 · 결제/환불 · 수익정산(+**클로백 원장**) · 정책(금전 키 변경 확인 다이얼로그) · 공지(이메일 병행) · 문의·버그(내부 메모) · 챌린지 · 배너(**예약 노출 편집**) · 광고심사(반려 사유 필수, 영상 소재 재생) · **스폰서십 검수(실구현)** · 외부광고 대시보드 · **컬렉션·셀렉트 관리**(`AdminCollections` — DB 기반 CRUD·영상 피커·정렬) · 메가업로더 · 활동로그. **모든 쓰기 서버측 admin 강제 + 감사로그.** 드리프트 검증 = `_verify_admin_audit_20260711.sql`.

### 7.16 정책 페이지 / 고객지원 / 편집 코너
약관·개인정보·청소년보호·FAQ(한/영 이중언어)·공지·회사소개·비즈니스 문의·버그 헌트·고객센터. **매거진 20편(한/영, `magazineArticles.ts` — 새 기사는 RAW_ARTICLES+ARTICLES_EN 쌍으로)** · 컬렉션 · 스포트라이트.

---

## 8. 콘텐츠 정책 & 모더레이션
- **연령등급:** all/13/15 (**19+ 신규 업로드 제거** — 광고정책. 기존 19 영상은 인증 게이트+토큰 미발급 유지). 생년월일 기반 인증(`verify_my_age`).
- **자동 모더레이션(hide-until-passed):** 업로드 즉시 숨김 → Bunny 웹훅 → Vision SafeSearch → `apply_moderation_result`(passed만 공개, error도 숨김 유지). 편집 시 콘텐츠 필드 변경 → 재검수. 미검수 직접 INSERT 노출 차단 트리거.
- **신고→자동숨김:** 임계 3(서로 다른 신고자). keep 복원은 자동숨김분만.
- **사용자 정지:** `is_suspended` → 전 쓰기 차단(트리거+Edge).
- **시리즈:** 대표작 = 첫 노출가능 에피소드. 회차 무결성 검증(`set_video_series`).

---

## 9. 데이터 모델 (주요 테이블)
| 테이블 | 용도 | 핵심 RLS |
|---|---|---|
| `profiles` | 사용자(구독·is_admin·payout_info·세금·레퍼럴) | SELECT 공개 7컬럼만(컬럼 GRANT), **쓰기 잠금**(편집 5컬럼만)+protect 트리거 8컬럼 |
| `videos` (**id=TEXT**, Bunny GUID) | 영상 메타 | SELECT 공개 정책 + 숨김은 명시 필터(RLS 미강제 — 호출부 책임). UPDATE는 가드 트리거(`protect_video_update`) |
| `orders` / `payments` | 라이선스 주문/결제 | 본인만, buyer_id FK=profiles SET NULL(원장 보존) |
| `revenue_distributions` / `settlement_clawbacks` | 월 정산 / 환불 클로백 | 본인 OR admin / admin |
| `billing_subscriptions` | 자동결제(빌링키) | 전면 차단(service_role만) |
| `collections` / `collection_videos` | CREAITE 컬렉션·셀렉트(video_id TEXT) | 조회 공개, 편집 admin RPC |
| `community_posts`/`comments`/`reports`/`collab_*` | 커뮤니티 | 본인 쓰기·컬럼 잠금·숨김필터·DEFINER RPC |
| `creator_followers` | 팔로우 | 본인 insert/delete/**select** |
| `notifications`/`push_subscriptions`/`notification_preferences` | 알림 | 본인만 |
| `ads`/`ad_*` | 광고·과금 | 공개는 `ads_public` 뷰만, dedup·guard 테이블 |
| `platform_settings` | 정책 | 조회 공개·변경 admin(화이트리스트) |

> 마이그레이션: [`docs/MIGRATIONS.md`](MIGRATIONS.md). **드리프트 주의** — 같은 함수가 여러 파일에 정의됨(최신 날짜 파일이 정본, SUPERSEDED 배너 확인). 보안 회귀 점검 = `_verify_security_invariants_20260628.sql`(**15항목**, 마이그레이션 적용 후 Run).

---

## 10. 기술 아키텍처
- **프론트:** React + Vite + TS, Vercel(`www.creaite.net`), i18next **한/영 완전 대칭 2108키**(pre-commit `i18n-check` 게이트 — 커밋마다 자동 검증), Tailwind, motion, video.js.
- **백엔드:** Supabase — Postgres(+RLS), Edge Functions(`server`, **항상 `--no-verify-jwt` 배포**), RPC(SECURITY DEFINER+search_path 고정), Realtime, Storage.
- **영상:** Bunny Stream(HLS iframe + Embed Token Auth ON + CDN token auth OFF(출시 전 결정) + TUS). 스트림 CDN 리퍼러 화이트리스트 — `www.creaite.net`에서만 재생(vercel.app 403 정상).
- **결제:** Toss Payments(단건+빌링, live 심사 대기). **메일/푸시:** Resend + VAPID 웹푸시.
- **AI:** Anthropic claude-haiku-4-5(홍보문 `/generate-promo`), Google Vision(모더레이션).
- **SEO(2026-07):** `api/og.ts`(영상 메타+VideoObject, **공개+미숨김만**) · `api/info.ts`(매거진 등 SSR) · `api/sitemap.ts`(video sitemap, player_loc=Bunny) · `api/thumb.ts`(썸네일 프록시) · middleware 리라이트 · 동적 canonical. 프리렌더 응답은 CDN 캐시 허용(no-store 예외).
- **PWA/앱:** sw.js(네비 네트워크 우선·앱셸 폴백은 순수 셸만), manifest, Android TWA(`net.creaite.app`, assetlinks 2지문).
- **타입체크:** `npx tsc --noEmit`(커밋 전).

## 11. 보안 모델
- **인가 SSOT:** 클라 값은 UI 게이팅일 뿐 — 실차단은 서버(RLS/Edge/RPC). 관리자 판별 `is_admin()`/`assert_admin()`.
- **금지선(메모리화):** protect 트리거 8컬럼 유지 / `GRANT SELECT ON profiles`(컬럼 미지정) 금지 / videos UPDATE는 REVOKE가 아닌 **가드 트리거**(REVOKE는 DEFINER 카운트 트리거를 깨뜨림 — 42501 회귀 교훈) / 모더레이션 RPC(update_video_moderation 등) PUBLIC/anon EXECUTE 금지(게이트 #15).
- **결제 무결성:** 서버 금액검증·멱등·소유자 바인딩·service_role 격리·빌링키 미노출·payments_enabled 게이트.
- **시청 보호:** Embed 토큰인증 + 토큰 발급 게이트(19금·숨김·비공개). 잔여: CDN token auth OFF → 직링크 m3u8/mp4 접근 가능(출시 전 결정, launch-checklist §9).
- **회귀 게이트:** `_verify_security_invariants_20260628.sql` 15항목 — 마이그레이션 적용 후 전부 ✅ 확인.

## 12. 비기능 요구사항
- **성능:** 모듈 캐시(SWR)+localStorage 콜드스타트, video.js 지연마운트/dispose, 화면밖 정지, 서비스워커 앱셸, RPC 병렬화, 애드센스 지연 로드.
- **i18n:** 한/영 전체(관리자 화면 제외 — 의도적 후순위). 매거진·공지는 콘텐츠 레벨 이중언어.
- **반응형·접근성:** 모바일/데스크탑 분기, safe-area(pb-safe), aria-label.
- **재생 안정성:** 하이라이트 클립 우선, 토큰 TTL, 포스터 폴백, 리퍼러 화이트리스트.

## 13. 분석 / KPI
공급(신규 크리에이터·업로드·레퍼럴) / 수요(DAU·유효 시청·완주율·구독 전환) / 수익(라이선스·광고·구독·정산액·RPM) / 운영(모더레이션 큐·신고·환불율). 관리자 대시보드 실시간 집계(assert_admin).

## 14. 출시 계획 & 의존성
- **병목: 토스 가맹심사(1~2개월).** 승인 후: live 키 교체 → `payments_enabled=1` → 실결제 검증 → 개인 전화번호 제거.
- **진행 중:** 애드핏 실광고 수익화 ✅ / Play 내부테스트 업로드 ✅ → 비공개테스트 12명×14일 → 프로덕션 / AdSense 심사 대기 / iOS 베타 후.
- 추적 SSOT: [`docs/launch-checklist.md`](launch-checklist.md) · 인계: [`docs/WORK-HANDOFF.md`](WORK-HANDOFF.md).

## 15. 알려진 제약 / 이월 항목
| 항목 | 내용 | 상태 |
|---|---|---|
| CDN token auth | OFF — 직링크 시청 가능 vs preview.webp 무토큰 트레이드오프 | **출시 전 결정** |
| 카트 일괄 단일결제 | 멀티아이템 주문+combined 결제 = 백엔드 신규 | 이월(live 결제 후 — 현재 항목별 구매+합계) |
| 부분환불(N6)·구독풀 재계산(N9)·원천징수 범위(N10) | 금융 로직, 사용자 0 | 이월(출시 후 테스트 데이터 동반) |
| 미드롤 완료율(p_completed) | 재기록 금지로 미수집 | 보류(지표 필요 시) |
| 프리미엄 구독 잠금 UI | tier 페이월 표시 | 미구현(토스 후행) |
| 리스트 가상화 / 홈 IO 통합 | 성능 | 보류(회귀 위험) |
| InstallPrompt iOS 가이드 | `<Trans>` 리팩터 필요(현재 영문 하드코딩) | 이월 |
| 관리자 화면 영문화 / ja·zh 확장 | 사용자 비노출 / 글로벌 | 후순위 |
| 죽은 코드 정리 | MyPage SubscriptionModal, HOME_CHIPS ko/en 필드, tierBasicPrice 키 등 | 정리 후보(위험 낮음) |

## 16. 용어집
- **티어(tier):** 콘텐츠 길이 구분(home 0~3분 / cinema 60초+ / ott 10분+). 구독 등급과 별개.
- **시리즈 대표작:** 피드에서 시리즈를 대표하는 1편 = 노출가능(공개·미숨김) 에피소드 중 가장 앞 화.
- **hide-until-passed:** 업로드 즉시 숨김 → 검수 통과 시에만 공개하는 모더레이션 원칙.
- **클로백(clawback):** 지급완료 월 환불분을 다음 정산에서 차감 추적하는 원장.
- **하이라이트 클립 / 히어로 클립:** 카드 미리보기 구간 / OTT 히어로용 30초 티저(검수 게이트).
- **land-grab(베타):** 빈 카테고리도 노출하고 등록 CTA로 크리에이터 선점.
- **협의 판매(negotiation):** ₩1천만+ 라이선스는 문의 전환.
- **frozen-order:** 홈피드 순서를 세션 시작 시 확정해 페이지네이션 누락·중복 0을 보장하는 방식.

---

*본 PRD는 코드베이스 변경과 함께 갱신되어야 하는 살아있는 문서입니다. 신규 기능/정책 추가 시 해당 절과 §0 개정 이력을 함께 수정하세요.*
