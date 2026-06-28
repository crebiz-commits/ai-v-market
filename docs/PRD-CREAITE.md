# CREAITE — 제품 요구사항 정의서 (PRD)

> **문서 성격:** 본 PRD는 CREAITE의 **현재 구현(as-built)** 을 코드베이스 기준으로 체계화하고, 향후 요구사항·정책을 함께 담은 **단일 기준 문서(SSOT)** 입니다.
> **작성:** 2026-06-28 · **기준 브랜치:** main(프로덕션) · **근거:** 실제 소스/마이그레이션 감사
> **언어:** 한글 · **갱신 규칙:** 기능 변경 시 해당 절을 함께 수정. 출시 추적은 [`docs/launch-checklist.md`](launch-checklist.md), 마이그레이션은 [`docs/MIGRATIONS.md`](MIGRATIONS.md) 참조.

---

## 0. 개정 이력
| 버전 | 일자 | 내용 |
|---|---|---|
| 1.0 | 2026-06-28 | 최초 작성 — 전 영역 as-built 기준 구조화 |

---

## 1. 제품 개요

### 1.1 한 줄 정의
**CREAITE는 세계 최초의 "AI 시네마 OTT + 크리에이터 라이선스 마켓" 결합 플랫폼**이다. AI로 제작된 영상을 ① 시청(피드·시네마·OTT)하고 ② 라이선스로 사고팔며 ③ 광고·구독·판매로 크리에이터가 수익을 얻는다.

### 1.2 비전 / 포지셔닝
- **거대 플랫폼(유튜브·넷플릭스)은 수익을 독점하지만, CREAITE는 크리에이터를 "배급사"로 만들어 수익을 돌려준다.** (마케팅 핵심 메시지)
- "그냥 올려만 두세요 — 플랫폼은 가져가고, CREAITE는 돌려드립니다."
- AI 영상 시대(Runway·KLING·Veo·Sora 등 도구 범람)에 **유통·수익화 인프라**를 선점.

### 1.3 운영 주체
- 판매·결제 주체: **개인사업자 '크레비즈'** (사업자등록번호 107-10-27099). 법인 ㈜크레비즈(그룹 본사)와는 별개이며 결제·정산·사업자정보는 개인 기준. (참고: 메모리 `crebiz-entity-structure`)

### 1.4 현재 단계
- **실서비스(베타 아님)** 지향. 단 `BETA_MODE=true`(land-grab) 활성 — 빈 카테고리도 노출하고 "영상 등록" CTA로 크리에이터 선점 유도.
- 콘텐츠 180+편 적재. 무료 광고형 티어는 선출시 가능, **프리미엄 구독은 토스 가맹심사(병목) 후행.**

---

## 2. 문제 정의 & 가치 제안

| 이해관계자 | 문제 | CREAITE 제공 가치 |
|---|---|---|
| **AI 크리에이터** | 만든 영상의 유통·수익화 경로 부재. 기존 플랫폼은 수익 독점·정산 불투명 | 업로드만 하면 ① 라이선스 판매(80% 환원) ② 광고 수익(50~60%) ③ 구독 풀 분배(50%). 무마찰 온보딩 + 레퍼럴 |
| **시청자** | AI 영상이 흩어져 있고 품질·연령 분류 부재 | 큐레이션된 피드/시네마/OTT, 연령등급, 미리보기, 검색 |
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
| **basic** | 기본 구독 | 미리보기 + SKIP 5초 후 가능 | 일부(SKIP 가능) |
| **premium** | 프리미엄 구독(₩4,900/월) | 전체 시청 무제한, 장편(OTT) | **광고 제거** |

> 구독 만료 시 cron(`reset_expired_subscriptions`)이 free로 자동 강등.

### 4.2 콘텐츠 길이 게이팅 (트리거 `content_policy_v2`)
- **홈 피드(Discovery):** 0~3분 하이라이트 코너(모든 공개 영상).
- **시네마(`show_on_cinema`):** 3분+ (cinema_min).
- **OTT(`show_on_ott`):** 10분+ (600초) — 장편.
- 게이팅은 **영상 길이 기반 자동 플래그**이지 구독 게이트가 아님(프리미엄 구독 잠금 UI는 토스 후행, 현재 미구현).

### 4.3 수익원 & 분배율 (`platform_settings`, 관리자 변경 가능)
| 항목 | 키 | 기본값 | 크리에이터 분배 |
|---|---|---|---|
| 라이선스 판매 | `creator_share_sale` | 80% | 80% (플랫폼 20%) |
| 광고(홈 0~3분) | `creator_share_ad_home` | 50% | 50% |
| 광고(시네마 3분+) | `creator_share_ad_cinema` | 55% | 55% |
| 광고(OTT 10분+) | `creator_share_ad_ott` | 60% | 60% |
| 구독료 풀 | `creator_share_subscription_pool` | 50% | 50% |
| 월 구독료 | `subscription_price_krw` | ₩4,900 | — |
| 광고 CPM | `ad_cpm_krw` | ₩2,000/1,000노출 | — |
| 월 정산 최소액 | `payout_minimum_krw` | ₩10,000 | 미만 시 익월 이월 |

### 4.4 정산 (Settlement)
- 월별 `calculate_monthly_revenue`(관리자) → `revenue_distributions`(크리에이터별 sale/ad/subscription 매출 + 원천징수 + 순액).
- 세금: `phase32_tax_withholding` — 개인/사업자 유형별 원천징수, 연말정산 CSV(`admin_get_tax_annual_report`).
- 지급: 관리자 `mark_revenue_paid`. 크리에이터는 **정산계좌(payout_info)** 등록(`update_my_payout_info`).
- 라이선스 ₩1,000만+ 는 **협의 판매(negotiation)** — 직접결제 대신 문의 전환.

---

## 5. 정보 구조(IA) & 내비게이션

### 5.1 메인 탭 (`Tab` 타입, 하단/상단 내비)
| 탭 키 | 화면 | 컴포넌트 |
|---|---|---|
| `discovery` | **홈 피드**(숏폼 세로 피드) | `DiscoveryFeed` |
| `market` | **시네마**(Netflix형 가로 행) | `Cinema` (tier="cinema") |
| `ott` | **OTT**(프리미엄 장편, 히어로+마퀴) | `Ott` |
| `upload` | **업로드** | `Upload` |
| `community` | **커뮤니티**(게시글·챌린지·협업) | `Community` |
| `channel` | **채널**(구독/탐색) | `Channel` |
| `mypage` | **마이페이지** | `MyPage` |
| `search` | **검색** | `SearchPage` |
| `subscription` | **구독 관리** | `SubscriptionPage` |
| `advertiser` | **광고주 대시보드** | `AdvertiserDashboard` |
| `admin` | **관리자 패널** | `AdminLayout` |

### 5.2 보조/정책 화면
`business`(비즈니스 문의) · `about` · `terms` · `privacy` · `youth`(청소년보호) · `faq` · `notices`(공지) · `bug-report`(버그 헌트) · `top-creators` · `support`(고객센터) · 상세페이지(`ProductDetail`, 모달/오버레이).

### 5.3 URL 라우팅 규칙
- `?tab=<탭>` 진입, `?video=<id>` 상세, `?payment=success|fail` 결제 결과, `?ref=<code>` 레퍼럴, `?support=<id>` 고객센터 답변, `?preview=*` 개발자 디자인 프리뷰(목업).

---

## 6. 핵심 사용자 여정

1. **시청자 획득:** 홈 피드(비로그인도 열람) → 가치 노출 → 소셜/이메일 가입(온보딩 게이트) → 시청/좋아요/팔로우 → (선택) 프리미엄 구독.
2. **크리에이터 획득:** "영상 등록" CTA(베타 land-grab) → 가입 → 업로드(무마찰) → 라이선스/광고/구독 수익 → 정산계좌 등록 → 월 정산.
3. **라이선스 구매:** 상세페이지 → 미리보기 → 구매(토스) → 다운로드.
4. **광고주:** 광고주 대시보드 → 광고 생성(draft) → 심사 제출 → 관리자 승인 → 예산 충전(토스) → 노출/성과 확인.
5. **레퍼럴 확산:** 초대링크(`?ref=`) → 신규 가입 시 `claim_referral` → 초대수 누적(현금 보상은 결제 오픈 후).

---

## 7. 기능 명세 (영역별)

### 7.1 인증 · 온보딩
- **가입:** 이메일(`supabase.auth.signUp`, 확인 메일 필수) / 소셜(Google·Kakao OAuth). 가입 메타데이터는 `name`만 → `handle_new_user`가 `profiles`(id·display_name·avatar·referral_code) 생성. **권한 컬럼(is_admin/구독/payout)은 메타데이터에서 유입 불가.**
- **로그인:** Edge `/auth/signin`(signInWithPassword) 또는 클라 직접. 세션은 AuthContext가 `onAuthStateChange`로 관리, 프로필은 `get_my_profile` RPC(본인·민감컬럼 포함).
- **비밀번호 재설정:** `resetPasswordForEmail` → recovery 세션 → `updateUser`.
- **온보딩 게이트:** 홈 피드에서 가치 노출 후 소셜로그인 유도.
- **계정 삭제/데이터 권리(phase27):** `request_account_deletion`(30일 유예)·`cancel_account_deletion`·`export_my_data`(본인 전 데이터). 영구 파기는 Edge `/purge-deletions`(cron) → auth.users 삭제, 결제·정산 원장은 익명화 보존(전자상거래법).
- **요구:** 정지(`is_suspended`) 사용자는 **모든 쓰기 차단**(DB 트리거 `tg_block_suspended` + 업로드 Edge 403).

### 7.2 홈 피드 (Discovery — `DiscoveryFeed`)
- **구성:** 세로 풀스크린 숏폼 피드(틱톡형). 모바일/데스크탑 분기.
- **데이터:** `get_home_feed(limit, offset, filter)` → `v_home_feed_public` 뷰(모더레이션 내부필드 제외). 칩 필터: all/new/popular/free/paid/cinema. 시리즈는 1화만 노출.
- **개인화:** 로그인+이력 시 좋아요/시청/팔로우 가중 정렬, 없으면 인기+최신.
- **자동재생:** video.js, inView 기반 마운트/dispose, 음소거 시작(정책), 하이라이트 구간 재생.
- **상호작용:** 좋아요(낙관적+롤백)·댓글(CommentPanel)·공유·장바구니·팔로우.
- **광고:** N번째마다 자체광고(`HOME_FEED_SELF_ADS`, 현재 OFF) → 외부광고(AdFit/AdSense) 폴백. 노출/클릭 dedup(viewer_key).
- **성능:** 모듈 캐시(stale-while-revalidate), useMemo(visibleVideos/feedItems), 이미지 lazy, sentinel 무한스크롤.

### 7.3 시네마 (`Cinema`, tier="cinema")
- **구성:** Netflix형 가로 행 캐러셀 + 시그니처 **CoverFlow**(원통형 추천 큐레이션) + 트렌딩 히어로.
- **행:** 추천(개인화)·트렌딩(24h)·신규(14일)·인기 Top10·형식(애니/다큐/뮤비)·장르 11종.
- **RPC:** `get_recommended_videos`·`get_trending_videos`·`get_new_releases`·`get_videos_by_category`·`get_videos_by_genre`(전부 `p_tier`), `v_available_videos` 뷰. `Promise.allSettled` 병렬 + 부분 렌더.
- **연령:** 19+ 블러/잠금(본인 영상 예외). 시리즈 배지.
- **성능:** 모듈 캐시(user:tier:showcase), VideoCard memo, 핸들러 안정화, CoverFlow 화면밖/탭숨김 회전 정지.

### 7.4 OTT (`Ott`)
- **구성:** 풀블리드 **히어로 빌보드**(트렌딩 상위 20초 순환, 클립 자동재생·음소거 토글) + 시간대 무드 편성 + 좌우 교차 **마퀴 행**(쿠팡플레이형).
- **데이터:** `get_trending_videos`·`get_videos_by_category`·`get_videos_by_genre`(p_tier='ott', `show_on_ott`=600초+). 히어로 영상소스는 `videos` 직접 조회(video_url/highlight/hero_clip_url) + 모듈 캐시.
- **성능:** 화면밖 마퀴 reflow 스킵, 히어로 화면밖 정지, CategoryRow/HeroBillboard memo.

### 7.5 검색 (`SearchPage`)
- **입력:** 자동완성(debounce 250ms + race 가드, `get_search_suggestions` — prefix 우선 정렬), 최근검색(localStorage), 인기검색(`get_popular_searches`).
- **검색:** `search_videos`(제목/태그/크리에이터 ilike + 카테고리/AI도구/길이/가격 필터 + 4종 정렬), `search_creators`(정지 제외). race 가드(seq).
- **결과:** 영상/크리에이터 탭, "더 보기" 페이지네이션(60/페이지), 차단 사용자 제외.
- **누출 방지:** `v_available_videos`(숨김/비공개 제외) 기반.

### 7.6 영상 상세 · 재생 · 라이선스 (`ProductDetail`)
- **재생:** Bunny iframe 임베드. **재생 토큰**(Edge `video-play-token` — 구독/소유/구매 권한별 TTL 차등: 비구독 150초/권한자 4시간) + Bunny Embed Token Auth. iframe eager 로딩.
- **페이월:** 미리보기 1분(전 영상 통일) 후 컷오프, 19+ 미인증 차단, 광고 재생 중 차단.
- **광고(비프리미엄):** 프리롤(`AdMidrollPlayer`)·미드롤·범퍼·포스트롤·오버레이 배너. preroll 우선(범퍼와 동시노출 방지).
- **메타:** 제목·크리에이터·장르·연도·출연/감독/작가/작곡·언어·자막·**AI 증빙(prompt·seed·ai_tool·model)**·챕터·스폰서십.
- **라이선스 구매:** 단일가(All-in-One). `start_payment(license)` → 토스 → `confirm_payment` → `orders`. 협의전용(₩1천만+)은 문의 전환. 다운로드는 `log_download`(본인 완료주문 검증).
- **연속재생:** 종료 → 다음 영상 카운트다운(`get_similar_videos`).

### 7.7 업로드 (`Upload`)
- **플로우:** `create-upload`(Bunny 영상 생성 + rate limit 30/h + 정지 차단) → **TUS presigned 업로드**(라이브러리 키 미노출, 진행률, abort 지원) → 썸네일/자막(본인 폴더) → `save-metadata`(소유권 검증 + 일시실패 3회 재시도 → 고아영상 방지).
- **폼:** 제목·설명·카테고리·**장르(GENRES 단일출처)**·연령등급·AI도구·해상도·재생시간(형식검증)·가격·하이라이트 구간·시리즈·스폰서십. 드래프트 자동저장.
- **검증:** step별 필수검증, 중복제출 가드. 3분 미만은 라이선스 판매 불가.
- **자동 모더레이션:** 업로드 후 `moderate-video`(Google Vision SafeSearch, fire-and-forget).
- **챌린지:** 챌린지 컨텍스트 시 `challenge:<tag>` 태그 자동 부착.

### 7.8 커뮤니티 (`Community`)
- **게시글(`community_posts`):** 작성/수정/삭제(본인), 공지(관리자만), 좋아요·북마크·댓글. **작성자명/아바타는 서버 트리거가 profiles에서 강제**(사칭 차단). 숨김글 비노출.
- **댓글(`comments`):** 영상·게시글 공용, 본인 작성/수정/삭제, 숨김 필터, 크리에이터 하트·고정·필터워드.
- **챌린지/공모전(`challenges`):** 관리자 생성, 태그 기반 출품 집계, 상세(`CommunityChallengeDetail`).
- **협업(`collab_posts`):** 모집/구직/도움/외주, 지원(`apply_to_collab`), 1:1 스레드(`collab_threads`).
- **신고(`reports`):** `create_report`(본인만·중복방지·시간당 20건 제한), 누적 시 자동숨김, 관리자만 조회.

### 7.9 채널 & 팔로우 (`Channel`, `CreatorChannel`, `FollowButton`)
- **팔로우:** `creator_followers`(본인만 insert/delete, 자기팔로우 금지). 팔로워 수 실시간 COUNT.
- **채널:** `get_creator_profile`·`get_creator_videos`(공개 영상만), 구독 피드(`get_my_following_videos`), 인기 크리에이터(`get_popular_creators`), Top 크리에이터 주간.
- **새 영상 알림:** videos insert 트리거 → 팔로워 중 opt-in에게 인앱/푸시/이메일.

### 7.10 크리에이터 대시보드 / 애널리틱스 (`CreatorDashboard`)
- **KPI(phase21):** 총 수익·조회수·좋아요·RPM·대기정산·다음정산일.
- **차트:** 일별 수익/조회수+좋아요/팔로워 증가(phase21·20).
- **분석(phase20):** 시청자 통계(평균 시청률·완주율·유니크), Top 영상(지표별), 길이 구간별 retention.
- **광고 수익:** `get_creator_ad_stats(_by_video)`. **전부 auth.uid() 고정(IDOR 불가).**

### 7.11 마이페이지 (`MyPage`)
- 프로필 편집(display_name/bio/avatar/banner), 비밀번호 변경.
- **정산계좌**(`get_my_payout_info`/`update_my_payout_info` — 본인만, protect 트리거로 직접변경 차단).
- **세금/사업자정보**(`TaxInfoSection` — 본인만), **결제내역**(`get_my_payments`)+**환불요청**(`request_refund` — 본인·completed·7일 청약철회).
- **레퍼럴**(`ReferralCard`), 시청기록(phase17), 플레이리스트(phase18), 차단 사용자(phase24), 데이터 내보내기/계정삭제(phase27).

### 7.12 광고 (자체 + 외부) & 광고주 셀프서비스 (`AdvertiserDashboard`)
- **광고주 플로우:** `advertiser_create_ad`(draft·budget 0 고정) → `advertiser_update_ad`(draft/rejected만) → `advertiser_submit_ad`(pending_review) → 관리자 `admin_review_ad`(승인/반려) → `advertiser_set_active`(승인된 본인 광고만) → 예산충전(`start_payment(ad_budget)` — **본인 광고만**).
- **노출/과금:** `record_ad_impression`·`increment_ad_clicks`(CPM 차감, dedup). 자체 영상광고는 VAST(서명·이스케이프).
- **외부광고:** AdFit/AdSense(`ExternalAdSlot`, IO 지연로드). 매체심사 대기.
- **RLS:** ads 공개 SELECT 제거 → `ads_public` 뷰(민감컬럼 비노출). 이미지 업로드 본인 폴더.
- **⚠️ 이월:** 노출/클릭 과금 fraud dedup(viewer_key 위조·VAST replay)은 [`ad-fraud-hardening-plan.md`](ad-fraud-hardening-plan.md)에서 "광고 시스템 정비 시" 일괄 처리(과금 전 실손해 0).

### 7.13 결제 · 구독 (토스페이먼츠)
- **단건결제:** `start_payment`(구독·라이선스·광고예산 — 서버측 금액·소유권 검증) → 토스 결제창 → Edge `/toss-confirm`(토스 API 서버 재검증·금액대조·멱등) → `confirm_payment`(권한부여, authenticated REVOKE = service_role 전용).
- **자동결제(빌링):** Edge `/billing-auth-confirm`(빌링키 발급·customerKey 검증·3분 멱등) + `/billing-run`(cron, 원자적 claim). 빌링키는 클라 미노출.
- **환불:** 사용자 요청(`request_refund`) → 관리자 Edge `/refund-payment`(is_admin) → `admin_refund_payment`(권한회수 + 자동결제 해지).
- **현황:** 토스 **가맹심사 대기(출시 병목)**. PG 변경(이니시스 등)은 빌링 재개발 비용 큼 → 토스 반려 시에만 검토.

### 7.14 알림 (인앱·이메일·웹푸시) & 실시간
- **인앱(`notifications`):** 본인만 조회/삭제(RLS), Supabase Realtime(RLS 상속 → 본인만 수신).
- **이메일:** Edge `/send-email`(Resend, mail.creaite.net) — 수신자 서버조회, self/admin/actor 타입별 권한, actor는 **서버 템플릿 고정**(피싱 차단). `should_send_notification`(opt-out).
- **웹푸시:** VAPID, `save_push_subscription`(본인만), 정지자 제외.
- **브로드캐스트:** 관리자 Edge `/broadcast-push`·`/broadcast-email`(is_admin 403, 세그먼트·수신거부 제외).
- **종류:** welcome·결제영수증·환불완료·댓글답글·새팔로워·새영상·정산완료·신고결과·광고예산임박.

### 7.15 관리자 패널 (`AdminLayout` + Admin*)
대시보드(통계·`assert_admin` 가드) · 사용자관리(검색/정지/권한부여 `admin_set_admin_role`) · 콘텐츠/댓글 관리 · 모더레이션/신고 · 결제/환불 · **수익정산**(계좌 PII는 assert_admin) · 정책(분배율/CPM) · 공지발송 · 고객/비즈니스 문의 · 버그제보 · 챌린지 · 이벤트배너 · 광고심사 · 메가업로더(마일스톤) · 활동로그(`admin_logs`). **모든 쓰기 서버측 admin 강제.**

### 7.16 정책 페이지 / 고객지원
약관·개인정보·청소년보호·FAQ·공지·회사소개·비즈니스 문의·버그 헌트 이벤트·고객센터(`support_inquiries`, 답변 알림).

---

## 8. 콘텐츠 정책 & 모더레이션
- **연령등급(phase26):** all/13/15/19. 19+ 는 미인증(`age_verified`) 시 블러+잠금(본인 예외). 생년월일 기반 인증.
- **자동 모더레이션(phase25):** 업로드 시 Google Vision SafeSearch → `moderation_status/score`. 관리자 큐.
- **신고→자동숨김:** 누적 임계(기본 3, 서로 다른 신고자) 시 영상/댓글/게시글 `is_hidden`.
- **사용자 정지:** 관리자 `admin_suspend_user` 또는 신고 누적 → `is_suspended` → **전 쓰기 차단**(트리거).
- **콘텐츠 길이/배치:** `content_policy_v2`(show_on_home/cinema/ott 자동 플래그).

---

## 9. 데이터 모델 (주요 테이블)
| 테이블 | 용도 | 핵심 RLS |
|---|---|---|
| `profiles` | 사용자(구독·is_admin·payout_info·세금·레퍼럴) | SELECT 공개컬럼 7종만(컬럼 GRANT), 민감컬럼 비노출. UPDATE 본인+protect 트리거 |
| `videos` | 영상 메타 | public/unlisted+미숨김 OR 본인 OR admin |
| `orders` / `payments` | 라이선스 주문 / 결제 | 본인만, 원장 익명화 보존 |
| `revenue_distributions` | 월 정산 | 본인 OR admin |
| `billing_subscriptions` | 자동결제(빌링키) | 전면 차단(service_role만) |
| `community_posts`/`comments`/`reports` | 커뮤니티 | 본인 쓰기·숨김필터·신고 DEFINER RPC |
| `creator_followers` | 팔로우 | 본인 insert/delete |
| `notifications`/`push_subscriptions` | 알림 | 본인만 |
| `ads`/`ad_*` | 광고·과금 | owner_id·ads_public 뷰·dedup 잠금 |
| `platform_settings` | 분배율·가격 정책 | 조회 공개·변경 admin |
| `challenges`/`event_banners`/`collab_*`/`bug_reports`/`support_inquiries`/`business_inquiries` | 부가 기능 | admin 관리 + 본인/공개 분리 |

> 마이그레이션 전체 목록·적용 상태: [`docs/MIGRATIONS.md`](MIGRATIONS.md), `supabase/_verify_migrations_applied.sql`.

---

## 10. 기술 아키텍처
- **프론트:** React + Vite + TypeScript, Vercel 호스팅(`www.creaite.net`), 다국어(i18next ko/en), Tailwind, motion, video.js.
- **백엔드:** Supabase — Postgres(+RLS), Edge Functions(`server`, **항상 `--no-verify-jwt` 배포**), RPC(SECURITY DEFINER + `search_path` 고정), KV store, Realtime, Storage(아바타/배너/광고이미지/버그스크린샷/썸네일/자막/hero-clips).
- **영상:** Bunny Stream(HLS iframe + Embed Token Auth + TUS 업로드 + direct-url 차단).
- **결제:** Toss Payments(단건 + 빌링).
- **메일/푸시:** Resend(mail.creaite.net) + Web Push(VAPID).
- **AI:** Anthropic(홍보문 생성 `generate-promo`, rate limit), Google Vision(모더레이션).
- **앱:** Android TWA(PWABuilder, 개인 Play 계정 $25, 테스터 12명×14일). iOS는 베타 후. 가이드: `docs/twa-build-guide.md`.
- **타입체크:** `npx tsc --noEmit`(커밋 전).

---

## 11. 보안 모델
- **인가 SSOT:** 클라이언트 값(is_admin/구독)은 **UI 게이팅일 뿐**, 실제 차단은 서버(RLS/Edge/RPC).
- **역할:** anon / authenticated / service_role(Edge) / postgres(admin). 관리자 판별은 `public.is_admin()`/`assert_admin()`(profiles.is_admin 단일 출처).
- **금지선(SSOT, 메모리화):**
  - `protect_subscription_columns` 트리거는 8컬럼(구독3·payout·is_admin·referral3) 전부 유지 — 누락=권한상승 회귀.
  - `GRANT SELECT ON profiles`(컬럼 미지정) 금지 — 전 사용자 PII 유출(C2 컬럼 화이트리스트가 방어선).
- **결제 무결성:** 서버측 금액 검증·멱등·service_role 격리·빌링키 미노출.
- **정지 강제:** 쓰기 트리거 + 업로드 Edge.
- 상세 보안 감사 이력: 2026-06 세션(피드·결제·관리자·광고주·인증·스토리지·검색 전수). 발견·수정분은 git 이력 및 본 PRD 각 절 반영.

---

## 12. 비기능 요구사항
- **성능:** 피드 모듈 캐시(stale-while-revalidate), 이미지 lazy, video.js 지연마운트/dispose, 화면밖 애니메이션 정지, memo/useMemo, RPC 병렬화. (이월: 리스트 가상화, 홈 자동재생 단일 IO — 회귀위험으로 신중.)
- **i18n:** 한/영 전체. 장르·카테고리·알림 다국어.
- **반응형:** 모바일/데스크탑 분기 레이아웃(피드·시네마·OTT 별도 렌더).
- **SEO:** 상세페이지 JSON-LD(VideoObject, uploadDate 포함).
- **접근성:** aria-label, 키보드 네비(부분).
- **재생 안정성:** 하이라이트 클립 우선(deep seek 회피), 토큰 TTL, 포스터 폴백.

---

## 13. 분석 / 핵심 지표 (KPI)
- **공급:** 신규 크리에이터·업로드 수·활성 크리에이터·레퍼럴 전환.
- **수요:** DAU/MAU·시청수(유효)·완주율·구독 전환·재방문.
- **수익:** 라이선스 매출·광고 매출·구독 매출·크리에이터 정산액·RPM.
- **운영:** 신고/모더레이션 큐·정지 수·환불율.
- 관리자 대시보드(`get_admin_dashboard_summary` 등 — assert_admin)에서 실시간 집계.

---

## 14. 출시 계획 & 의존성
- **병목: 토스페이먼츠 가맹심사(1~2개월).** 프리미엄 구독·라이선스 결제가 후행.
- **선출시 가능:** 무료 광고형 티어(토스 무관). 단 자체광고 과금 전이라 광고 fraud 방어는 그때 일괄.
- **AdFit 매체심사** 보류 상태 — 외부광고 노출 조건.
- **앱:** Android TWA 우선(개인 Play 계정, 테스터 12명×14일 후 출시), iOS 베타 후.
- **콘텐츠:** 180+편 적재. 외부 크리에이터 콘텐츠는 결제·트래픽 후행.
- 추적 SSOT: [`docs/launch-checklist.md`](launch-checklist.md), 작업 인계: [`docs/WORK-HANDOFF.md`](WORK-HANDOFF.md).
- **출시 전 잔여:** 토스 live 키 교체, 푸터·햄버거의 **개인 전화번호(010-2797-7009) 제거**, bug-screenshots 비공개 등 보안 마이그레이션 적용 확인.

---

## 15. 알려진 제약 / 이월 항목 (기술 부채)
| 항목 | 내용 | 상태 |
|---|---|---|
| 광고 과금 fraud | viewer_key 위조·VAST replay dedup | 이월(광고 정비 시, 과금 전 실손해 0) |
| 리스트 가상화 | 시네마/OTT/홈 대량 카드 DOM | 보류(memo로 리렌더는 완화) |
| 홈 자동재생 IO 전환 | 카드별 scroll→단일 IntersectionObserver | 보류(자동재생 회귀위험, 전용 테스트 필요) |
| comment_count RPC 통합 | get_home_feed 통합 | 미채택(LIMIT 전 전 후보 count → 오히려 느림) |
| 프리미엄 구독 콘텐츠 잠금 UI | tier 페이월 표시 | 미구현(토스 후행) |
| 챌린지 출품 정규화 | 전용 출품 테이블 | 보류(현재 태그 기반) |
| 재생 시작 지연 추가 단축 | 토큰 prefetch·Bunny 래더·Edge 웜 | 선택(현재 iframe eager까지 적용) |

---

## 16. 용어집
- **티어(tier):** 콘텐츠 길이 구분(home 0~3분 / cinema 3분+ / ott 10분+). 구독 등급(free/basic/premium)과는 별개 개념.
- **하이라이트 클립:** 미리 잘린 30초 미리보기(deep seek 없이 안정 재생).
- **land-grab(베타):** 빈 카테고리도 노출하고 등록 CTA로 크리에이터 선점.
- **협의 판매(negotiation):** 고액(₩1천만+) 라이선스는 직접결제 대신 문의.
- **정산 풀(subscription pool):** 구독료를 크리에이터에 분배하는 재원.

---

*본 PRD는 코드베이스 변경과 함께 갱신되어야 하는 살아있는 문서입니다. 신규 기능/정책 추가 시 해당 절과 §0 개정 이력을 함께 수정하세요.*
