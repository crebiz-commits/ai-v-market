# 04. 검색 · 영상상세 · 재생 · 라이선스 — 상세 명세

> 본 문서는 실제 코드를 읽고 작성한 심화 명세서다. 모든 동작·계약은 아래 파일을 근거로 한다(file:line).
> - 검색 UI: `src/app/components/SearchPage.tsx`
> - 영상상세/재생/광고/구매 진입: `src/app/components/ProductDetail.tsx`
> - 검색 RPC: `supabase/phase12_search_enhancements.sql`
> - 재생 토큰 Edge: `supabase/functions/server/index.ts` (`/video-play-token`, L311–353)
> - 라이선스 가격 정책: `src/app/utils/licensePricing.ts`
> - 결제 훅: `src/app/hooks/usePayment.ts`
> - 상세 광고 fetch/impression/click: `src/app/utils/adFetch.ts`
> - 다운로드 로그 RPC: `supabase/phase29_download_logs.sql` (`log_download`)
> - 다운로드 트리거 UI: `src/app/components/MyPage.tsx` (`handleDownloadPurchase`, L573–607)
> - 결제 확정: `src/app/components/PaymentResult.tsx` (`toss-confirm` 호출, L21·L81–88)

---

## 1. 개요 / 목적

CREAITE의 콘텐츠 탐색–시청–수익화 핵심 경로를 담당하는 3개 영역의 통합 명세.

1. **통합 검색** — 영상/크리에이터를 제목·태그·크리에이터명으로 ilike 매칭, 자동완성·인기검색어·검색기록·필터·정렬·페이지네이션 제공. (`SearchPage.tsx`)
2. **영상상세 + 재생** — Bunny Stream iframe 플레이어를 서버 재생토큰(페이월)으로 게이팅하고, 비구독자에게 1분 미리보기·광고(프리롤/범퍼/미드롤/오버레이/포스트롤)·연속재생을 제공. (`ProductDetail.tsx`)
3. **라이선스 구매 + 다운로드** — 단일가(All-in-One) 라이선스를 토스페이먼츠로 결제하고, ₩1,000만 이상은 1:1 협의 판매로 분기. 구매 완료 후 MyPage에서 권한 검증을 거쳐 Bunny mp4를 다운로드. (`usePayment.ts`, `licensePricing.ts`, `log_download`)

**목표:** URL 추출로 프리미엄 콘텐츠를 우회 시청하거나 무단 다운로드하지 못하도록 서버 측 권한 판정(재생토큰·다운로드 RPC)을 강제하면서, 비구독자 유입(미리보기·광고)과 결제 전환을 극대화한다.

---

## 2. 사용자 스토리

- 방문자로서, 검색어 2글자 이상 입력 시 자동완성(제목 prefix/포함, 크리에이터명)을 보고 싶다.
- 방문자로서, 검색창이 비어 있을 때 최근 검색기록과 실시간 인기검색어를 보고 싶다.
- 사용자로서, 카테고리·AI도구·길이로 결과를 좁히고 관련도/최신/조회수/좋아요로 정렬하고 싶다.
- 사용자로서, 결과가 많으면 "더 보기"로 다음 60개를 이어 보고 싶다.
- 비구독자로서, 어떤 영상이든 1분 미리보기를 본 뒤 구독 유도를 받고 싶다.
- 프리미엄 구독자/영상 소유자/라이선스 구매자/관리자로서, 컷오프 없이 전체를 시청하고 싶다.
- 시청자로서, 영상 종료 시 다음 추천 영상이 자동으로 이어지길 원한다.
- 구매자로서, 라이선스를 즉시 구매(장바구니 우회)하고 결제 후 다운로드하고 싶다.
- 고가 라이선스 구매 희망자로서, 직접 결제 대신 운영팀과 협의할 창구를 원한다.
- 운영자로서, 무단 공유 분쟁 시 누가/언제/어떤 브라우저로 다운로드했는지 추적하고 싶다.

---

## 3. 화면 & 상태

### 3.1 검색 (`SearchPage.tsx`)

- **검색 입력 헤더** (L383–521): sticky 상단, 검색 input + 닫기(onClose 있을 때) + 필터 토글 버튼.
- **자동완성/기록/인기 드롭다운** (L420–506):
  - 입력 ≥2자 → `suggestions` 렌더 (source가 `creator`면 배지 표시, L440–442).
  - 입력 <2자 → `history`(최근검색, 개별 X·전체삭제) + `popular`(인기, 순위·hit_count) 렌더.
  - 드롭다운 노출 조건: `showDropdown && (입력≥2 ? suggestions>0 : history>0 || popular>0)` (L421).
- **필터 패널** (L524–557): `FilterChips`로 카테고리(`CATEGORY_OPTIONS`, L94)·AI도구(`AI_TOOL_OPTIONS`, L95–99)·길이(`DURATION_OPTIONS`, L100–106).
- **탭 + 정렬** (L560–595): `videos`/`creators` 탭(각 결과 개수 표시), 정렬 select(`SORT_OPTIONS`, L107–112). creators 탭은 `submittedQuery` 없으면 disabled(L573).
- **결과 영역** (L599–652):
  - 로딩: 스피너(L600–603).
  - 초기상태(`showInitialState`, L378): `EmptyInitial` — 인기검색어 Top5 (L780–808).
  - 영상 결과 비었음: `EmptyResult`(L607–608).
  - 영상 그리드: 2/3/4열 반응형 `VideoCard`(L611–626) + "더 보기" 버튼(L627–637).
  - 크리에이터 결과: `CreatorRow` 리스트(L645–649) 또는 `EmptyResult`(subject=크리에이터).

**상태 변수** (L141–172): `query`, `submittedQuery`, `tab`, `category`/`aiTool`/`durationIdx`/`sort`/`showFilters`, `videos`/`creators`/`loading`/`hasMore`/`loadingMore`, `suggestions`/`history`/`popular`/`showDropdown`. race 가드 `searchSeqRef`·`suggestSeqRef`(L171–172), debounce `debounceRef`(L170).

### 3.2 영상상세 (`ProductDetail.tsx`)

- **플레이어 영역** (L1193–1390, aspect-video, max-h 40vh 모바일/65vh 데스크탑):
  - `iframeBlocked`이면 페이월 차단 화면(블러 썸네일 + 구독 CTA, L1194–1228).
  - `bunnyEmbedUrl` 있으면 iframe(L1229–1240, `loading="eager"`, `onLoad={startPreviewCutoffWatch}`).
  - `!tokenReady`이면 썸네일 + 로딩 스피너(L1241–1252).
  - 그 외(토큰 발급 완료·임베드 URL 없음)이면 "재생 불가" 안내(L1253–1265).
  - 오버레이/미드롤/포스트롤/범퍼/프리롤 광고 슬롯(L1270–1327), 연속재생 `NextVideoOverlay`(L1329–1341), AUTOPLAY 인디케이터(L1343–1349), 길이 배지(L1352–1354), 스폰서 배지(L1356–1372), 1분 미리보기 배지 + 닫기 X(L1374–1389).
- **메타 영역**: 제목/연령배지/길이/조회수/좋아요/OTT 배지(L1396–1429), 크리에이터(아바타·이름·팔로우·편집)(L1430–1465).
- **헤더 액션**: 비구독자 "구독하고 전체 보기" CTA(L1470–1485) + 좋아요/댓글/공유/저장/신고 5원형(L1487–1558).
- **줄거리 + 사이드 메타**(L1562–1594), **시리즈 회차 목록**(L1597–1644), **챕터 리스트**(L1647–1671), **자막 안내**(L1674–1679).
- **라이선스 카드** (L1682–1831): 판매가능(`isLicensable`)이면 단일가 박스 + 9개 특전 + 장바구니/구매(또는 협의 문의), 청약철회 고지; 비판매(₩0)이면 회색 비활성 카드.
- **태그**(L1836–1850), **시네마 크레딧**(L1853–1903), **AI 제작 상세**(L1906–1937), **출처·라이선스**(L1940–1957), **함께 시청된 콘텐츠 캐러셀**(L1963–1974).
- **댓글 패널**: 데스크탑 사이드 패널(L1979–1998) / 모바일 시트(L2001–2020).
- **모달들**: 구독(L2025–2030), 신고(L2033–2040), 영상편집(본인, L2043–2086), 연령게이트(L2089–2099)·19+ 잠금 오버레이(L2102–2118), 공유(L2121–2128), 플레이리스트(L2131–2143).

---

## 4. 동작 흐름

### 4.1 검색 흐름

- **자동완성(debounce + race)** (L199–214): `query` 변경 → 250ms(`DEBOUNCE_MS`, L43) debounce → `get_search_suggestions` 호출. `suggestSeqRef`로 늦게 도착한 이전 입력 폐기(L208). 입력 <2자면 즉시 비움(L201–204).
- **검색 실행 `runSearch`** (L216–278):
  1. `searchSeqRef` 증가, `submittedQuery` 설정, 드롭다운 닫기(L217–220).
  2. trim된 검색어가 있으면 `saveHistory`(L223) + `log_search_query` 백그라운드 호출(실패 무시, L226).
  3. `rpcParams` 구성: `p_query/p_sort/p_limit=60/p_offset=0` + (전체 아님일 때만) `p_category/p_ai_tool/p_min_duration/p_max_duration`(L231–235).
  4. `Promise.all`로 `search_videos` + (검색어 있을 때만)`search_creators` 병렬 호출(L237–242).
  5. **race 가드**: `seq !== searchSeqRef.current`이면 결과 폐기(L244).
  6. 결과 세팅. showcase(관리자)면 mock도 검색어로 필터해 머지(L254–264). `hasMore`는 RPC 원본 길이 ≥60 여부(L266).
- **필터/정렬 변경 자동 재검색** (L311–316): `submittedQuery!=="" || hasActiveFilter`일 때만 `runSearch(submittedQuery)`.
- **초기 검색어 자동 검색** (L319–322): `initialQuery` 있으면 마운트 1회.
- **더 보기 `loadMoreResults`** (L281–302): `p_offset=videos.length`로 다음 60개 호출, **중복 id 제외**하며 append(L293–296), `hasMore` 갱신.

### 4.2 상세: 토큰 발급 → iframe → 재생 → 컷오프 → 광고 → 연속재생

- **재생토큰 발급** (L650–680): `product.id` 변경 시 `tokenReady=false`로 리셋 후 `PLAY_TOKEN_ENDPOINT`(L48) POST.
  - 헤더: `apikey`(anon), `Authorization: Bearer <session access_token || anonKey>`(L661–665).
  - 응답 `{token, expires, fullAccess}`을 `playToken`·`playFullAccess`에 반영(L670–671). 실패해도 `tokenReady=true`로 마무리(L675).
- **임베드 URL 구성** (L682–684): `BUNNY_LIBRARY_ID && product.id && tokenReady`일 때만 생성. `autoplay=true&loop=false&muted=true&preload=true&responsive=true` + (token 있으면)`&token=...&expires=...`. token이 null이면 토큰 없이 재생(무중단 전환, L647).
- **미리보기 컷오프** (L466–519, 보강 L521–556):
  - `needsPreviewCutoff = durationSeconds > previewSeconds && !isSubscriber && !playFullAccess`(L450).
  - player.js `postMessage`로 `timeupdate` 구독, `seconds >= previewSeconds` 도달 시 `cinemaCutoffTriggered=true` + 페이월 모달(L504–512). **영상 시간 기준**이라 시킹 점프도 즉시 차단(L465).
  - 보강: iframe `onLoad`마다 `startPreviewCutoffWatch` — ready 레이스 대비 400ms×10회 능동 재구독(L546–549) + `(previewSeconds+2)초` 월클록 백스톱(L550–554).
- **광고**:
  - **프리롤**(L689–730): 1분+ & 비프리미엄 영상에서 영상 변경 시 1회 `pick_random_video_preroll` RPC. m3u8→720p mp4 치환(L712–714). basic은 5초 후 skip, 그 외 skip 불가(L710). preroll 잡히면 bumper 취소(L967).
  - **범퍼**(L945–964): 비프리미엄 시작 직후, `fetchAdForVideo(...,'bumper')`, basic=5초 skip/free=skip불가(L959), 본편 pause.
  - **오버레이**(L780–854): 1분+, 25% 지점부터 fetch, 광고의 `trigger_position_pct`(기본 30%) 도달 시 하단 배너 노출 + `recordAdImpression`(L840–843).
  - **미드롤**(L857–922): 10분+(`minDurationForMidroll`||600) & 비구독자, 48%부터 fetch, `trigger_position_pct`(기본 50%) 도달 시 본편 pause + 풀스크린 광고(L908–911).
  - **포스트롤**(L1049–1057): 영상 종료 후 비구독자에게 `fetchAdForVideo(...,'postroll')`, 광고 종료 콜백에서 `NextVideoOverlay` 노출.
- **연속재생**(L982–1098): player.js `ended`(+`timeupdate` 폴백, 종료 0.6초 전) 구독 → `triggerNext`(L1008): similar→trending(24h)→new(30일) 3단 폴백으로 다음 영상 선정(L1013–1038) → (비구독자)포스트롤 후 → `NextVideoOverlay` 8초 카운트다운(L1333).

### 4.3 구매 흐름: start_payment → 토스 → confirm → 다운로드

- **즉시 구매 `handleBuyNow`** (L1104–1137):
  1. 미인증이면 `onSignInClick`(L1105–1108).
  2. `price<=0`이면 "라이선스 미판매" 토스트(L1109–1112).
  3. `isNegotiationOnly(price)`이면 `licenseInquiryMailto`로 메일 창(L1113–1117).
  4. `startLicensePurchase`(L1121–1127) — 성공 시 토스 결제창으로 이동(이후 코드 미실행). 취소(`USER_CANCEL`)/실패 처리(L1129–1136).
- **결제 SDK 흐름 `usePayment.ts`**:
  - `start_payment` RPC로 pending 주문 + `orderId` 발급(L36–45) → 실패 시 throw.
  - `loadTossPayments` → `requestPayment("카드", {...})`(L48–60), `successUrl=/?payment=success`, `failUrl=/?payment=fail`.
  - `startLicensePurchase`(L104–119): `paymentType:"license"`, `orderName:"라이선스 — <title>"`, `targetId:videoId`.
- **결제 확정 `PaymentResult.tsx`**: 성공 리다이렉트의 `orderId/paymentKey/amount`로 `toss-confirm` Edge 호출(L21·L81–88). 실패/취소 리다이렉트는 `fail_payment` RPC(L51).
- **다운로드 `MyPage.handleDownloadPurchase`** (L573–607):
  1. `log_download(p_order_id, p_user_agent=navigator.userAgent)`(L577–580) — 권한검증 + 로그 INSERT + `video_id` 반환.
  2. Bunny 호스트(`VITE_BUNNY_HOSTNAME`||`vz-<libId>.b-cdn.net`, L585)로 1080p→240p 순서 HEAD 요청해 실제 존재하는 mp4 선택(L589–597).
  3. `window.open(mp4Url, '_blank', 'noopener,noreferrer')` + 성공 토스트(L599–600). cross-origin이라 `<a download>` 무시될 수 있어 새 탭 방식(L572).

---

## 5. 데이터 / RPC 계약

### 5.1 검색 RPC (`phase12_search_enhancements.sql`)

- **`search_videos`** (L145–250) — 인자: `p_query=''`, `p_category=NULL`, `p_ai_tool=NULL`, `p_min_duration/p_max_duration=NULL`, `p_max_price=NULL`, `p_sort='relevance'`, `p_limit=30`, `p_offset=0`. 반환(L156–175): `id,title,thumbnail,video_url,creator,creator_id,creator_display_name,creator_avatar,category,tags,ai_tool,duration,duration_seconds,views_count,likes,price_standard,created_at,match_score`. 소스는 `v_available_videos` 뷰(숨김/비공개 사전 제외). match_score: 제목 prefix=3 / 제목 포함=2 / 태그·크리에이터 포함=1(L208–215). 정렬은 `p_sort`별 CASE(L227–243). `SECURITY DEFINER STABLE`.
- **`search_creators`** (L255–286) — 인자: `p_query`, `p_limit=20`. 반환: `creator_id,display_name,avatar_url,bio,video_count,follower_count`. `display_name` ilike + `is_suspended=false`(L282–283), 팔로워→영상 수 순(L284). 빈 쿼리(`lq=''`)면 결과 없음(L281).
- **`get_search_suggestions`** (L97–140) — 인자: `p_query`, `p_limit=8`. 반환: `suggestion,source('title'|'creator')`. 제목 prefix(rank1)/포함(rank2)/크리에이터 포함(rank3) UNION 후 `DISTINCT ON (lower(suggestion))` 최선 rank만, rank→가나다 정렬(L133–139, prefix 상위 보장 — 2026-06-25 버그픽스 주석).
- **`get_popular_searches`** (L72–92) — 인자: `p_limit=10`, `p_days=7`. 반환: `query,hit_count`. `search_logs` 최근 N일 lower(query) 집계, hit_count→최근순(L85–91).
- **`log_search_query`** (L49–64) — 인자: `p_query`. 2–100자만 INSERT(`auth.uid()` 포함), 그 외 무시(L59–61). `SECURITY DEFINER`.
- **`search_logs` 테이블**(L24–43): `query` 2–100자 CHECK, RLS는 본인 SELECT만, INSERT는 RPC만(L40–44).

### 5.2 재생 토큰 Edge (`/video-play-token`, `index.ts` L311–353)

- **요청**: POST body `{videoId}`. 헤더 `Authorization: Bearer <token>`(선택).
- **응답**: `{token, expires, fullAccess}`.
  - `BUNNY_TOKEN_AUTH_KEY` 미설정 → `{token:null, expires:null, fullAccess:false}`(L317, 무중단 전환).
  - `fullAccess` 판정(L319–342): 인증 사용자 중 ① 프리미엄(tier='premium' & expires 미래) 또는 is_admin(L328–331), ② 영상 소유자(`videos.creator_id===user.id`, L333–335), ③ 라이선스 구매자(`orders` buyer_id+video_id+status='completed', L337–339).
  - **TTL**: `fullAccess`면 4시간, 아니면 150초(L345). `expires=now+ttl`(초), `token=sha256Hex(securityKey+videoId+expires)`(L346–347).
- 클라이언트 매핑(L670–671): `playToken={token,expires}`, `playFullAccess=!!fullAccess`.

### 5.3 가격 / 라이선스 (`licensePricing.ts`)

- `LICENSE_DIRECT_MAX = 10_000_000`(L9) — 직접 결제 상한(미만).
- `isNegotiationOnly(price)`(L12–14) — `price >= 10,000,000`이면 true.
- `licenseInquiryMailto(title, price)`(L17–25) — `support@creaite.net` 사전입력 메일 링크.

### 5.4 다운로드 (`log_download`, `phase29_download_logs.sql` L63–106)

- 인자: `p_order_id uuid`, `p_user_agent text=NULL`. 반환: `video_id text, download_count integer`.
- 권한검증: `orders.id=p_order_id AND buyer_id=auth.uid() AND status='completed'`(L85–89). 미해당 시 예외(L91–93). 미로그인 시 예외(L80–82).
- `download_logs` INSERT(L96–97) 후 해당 주문 누적 다운로드 수 반환(L100–104). `SECURITY DEFINER`, `GRANT ... TO authenticated`(L108).
- `download_logs` 테이블(L30–47): order/video/user FK + user_agent + downloaded_at. RLS는 본인 SELECT만(L54–57), INSERT는 RPC만.

### 5.5 상세 광고 RPC (`adFetch.ts`)

- `fetchAdForVideo(videoId, format)`(L30–57) — `get_ad_for_video(p_video_id, p_format)` 1개 반환, **1분 TTL 모듈 캐시**(null도 캐시, L26–51).
- `recordAdImpression(...)`(L59–79) — `record_ad_impression` (position/completed/skipped + `p_viewer_key`=session key, L74).
- `recordAdClick(...)`(L81–92) — `record_ad_click`.
- 프리롤은 별도 RPC `pick_random_video_preroll(p_source_video_id)`(ProductDetail L705).

---

## 6. 비즈니스 규칙

- **미리보기 1분 통일** (정책 v2, ProductDetail L50): 비구독자는 모든 영상 1분(`cinemaPreviewSeconds`, 동적, fallback 60초 L53·443) 미리보기. OTT도 즉시 차단 대신 1분 미리보기(카드엔 🔒 프리미엄 배지, L451).
- **풀액세스 면제**: 프리미엄·소유자·라이선스 구매자·관리자(서버 `/video-play-token` 판정 L328–339, 클라 `playFullAccess`로 컷오프 면제 L450).
- **연령 게이트** (Phase 26): `age_rating==='19'` & 미인증 & 비소유자면 진입 시 자동 게이트(L365–367) + 19+ 잠금 오버레이(L2102). 검색 카드에도 19+ 블러+잠금(SearchPage L724–732).
- **티어별 토큰 TTL**: 풀액세스 4시간 / 비구독자 150초(index.ts L345). 150초는 1분 미리보기를 충분히 커버하면서 URL 추출 후 장편 우회 시청을 차단.
- **단일가 / 협의 판매**: 단일가(All-in-One) 라이선스. ₩1,000만 이상은 토스 한도로 직접결제 불가 → 1:1 협의 판매(licensePricing.ts L1–14, ProductDetail L1745–1756).
- **₩0 영상 판매불가**: `isLicensable = price>0`(L441). ₩0은 무료 시청 전용, 라이선스 미판매 회색 카드(L1817–1830).
- **광고 티어 정책**: Premium=광고 제거 / Basic=5초 후 skip / Free=skip 불가(프리롤 L710, 범퍼 L959). 미드롤·포스트롤은 구독자(`isSubscriber`) 제외(L865·1050).
- **청약철회 제한**: 다운로드·시청 시작 시 청약철회 제한 고지(전자상거래법 제17조, 결제 버튼 하단 L1797–1803).
- **3분 미만 판매불가**: 본 코드 경로에서는 강제 게이트가 확인되지 않음 — 업로드 측 규칙으로 추정되며 본 영역에서는 미구현(상세 §12 참조). ※ 검증 필요.

---

## 7. 엣지 케이스 & 에러 처리

- **검색 빈 쿼리**: `runSearch('')`는 creators를 호출하지 않고 `[]` 반환(L239–241). `search_videos`는 빈 쿼리(`v_lq=''`)면 전체를 match_score=0으로 반환(필터만 적용, sql L218).
- **검색 race**: 자동완성·검색 모두 seq 가드로 늦게 도착한 응답 폐기(L208·244). `finally`도 최신 seq일 때만 `setLoading(false)`(L276).
- **검색 실패**: `search_videos` 에러 시 토스트 + 결과 비움(L246–250); `search_creators` 에러는 조용히 `[]`(L269–271).
- **토큰 발급 실패/콜드스타트**: fetch 예외여도 `token=null`로 두고 `tokenReady=true`(L673–676) → 토큰 없이 재생 시도. Token Auth 미활성 단계에서는 항상 token=null(index.ts L317).
- **토큰 발급 중 UI**: `!tokenReady`면 차단 화면 대신 썸네일+스피너(L1241–1252).
- **광고 동시 노출 방지**: preroll 잡히면 bumper 취소(L967); overlay는 midroll 표시 중 숨김(L1271); 스폰서 배지는 bumper/midroll/postroll 중 숨김(L929). 영상 전환 중 stale 광고는 `cancelled` 가드로 차단(L835·904).
- **player.js ready 레이스**: timeupdate 구독을 ready 이벤트 + 능동 재구독(interval) + 즉시 시도로 3중 방어(컷오프 L526–549, 기타 슬롯 `setTimeout(subscribe,500)`).
- **ended 미발생 영상**: `timeupdate`로 종료 0.6초 전 폴백 감지(L1084–1090).
- **자막/챕터 없음**: `videoMeta.chapters.length>0` / `subtitle_url` 조건부 렌더 → 없으면 섹션 미표시(L1647·1674).
- **다운로드 mp4 없음**: 전 해상도 HEAD 실패 시 "인코딩 처리 중" 에러 throw(L598).
- **showcase 머지**: 관리자(`shouldShowShowcase`)만 mock 결과를 검색어로 필터해 추가(L168·254–264).

---

## 8. 성능

- **검색 debounce 250ms** + seq 가드로 과도 RPC·결과 깜빡임 방지(L43·199–214).
- **페이지네이션**: 60개 단위 offset, 중복 id Set 제거로 append(L281–302).
- **연령등급 일괄 조회**: 카드용 `useAgeRatings(allVideoIds)` 1회(L376), demo- 접두 제외(L373).
- **visible 필터 useMemo**: 차단 사용자 필터를 타이핑마다 재계산 않도록 메모(L362–369).
- **iframe `loading="eager"`**(L1233): 토큰 준비되면 즉시 로드 — 재생 시작 지연 최소화.
- **광고 1분 캐시**(adFetch L26–51): 재시청 시 `get_ad_for_video` 중복 호출 제거(null도 캐시).
- **재생 시작 지연 요인**: ① 토큰 Edge 왕복(콜드스타트 가능) → tokenReady 게이트, ② 프리롤/범퍼 광고가 본편 앞에 풀스크린, ③ player.js ready 대기. 토큰은 `product.id`마다 매번 재발급(prefetch 없음 — §12).

---

## 9. 권한 / 보안

- **재생 페이월**: 토큰 TTL을 서버가 권한별 차등 발급(150초/4시간, index.ts L345). Bunny Embed Token Auth 활성 시 토큰 없으면 재생 불가 → URL 추출 우회 차단(주석 L646).
- **임베드 토큰 인증**: `token=sha256Hex(securityKey+videoId+expires)`(L347) — securityKey는 서버 환경변수, 클라엔 미노출.
- **fullAccess 서버 판정**: 프리미엄/소유자/구매자/관리자 모두 admin 클라이언트(service role)로 DB 직접 확인(L324–339) — 클라 위변조 불가.
- **숨김/비공개 누출 방지**: 검색은 `v_available_videos` 뷰만 조회(sql L216·278) → 숨김/비공개 영상 결과 미노출. `search_creators`는 `is_suspended` 제외(L283).
- **다운로드 소유검증**: `log_download`가 `buyer_id=auth.uid() & status='completed'`를 RPC 내부에서 검증(L85–93), `download_logs` INSERT는 SECURITY DEFINER RPC만(RLS INSERT 정책 없음).
- **상세 메타 fetch**: `videos` 테이블 직접 select(L303–315)는 RLS 의존 — 비공개 영상 보호는 테이블 RLS 책임(본 컴포넌트는 별도 검증 안 함). ※ 검증 권장.

---

## 10. 분석 / 이벤트

- **검색 로그**: `log_search_query(trimmed)` 검색 시 백그라운드(실패 무시, L226) → `search_logs` → `get_popular_searches` 집계.
- **조회수**: 페이월 통과 시청 시 30% 도달 1회 `trackVideoView`(L620–623), 미달이어도 5초+면 unmount 시 기록(L630–632). 상세 진입 시 카운트 최신화(L362–363).
- **다운로드**: `log_download`로 `download_logs` 적재 + 누적 횟수 반환(분쟁 추적 근거, phase29 L46–47).
- **광고**: `record_ad_impression`(viewer_key dedup) / `record_ad_click`(adFetch L59–92).

---

## 11. 수용 기준 (체크리스트)

- [ ] 입력 2자 이상 시 250ms 후 자동완성 표시, 빠른 연속 입력 시 이전 응답이 최신을 덮지 않음.
- [ ] 입력 비움 시 최근검색(개별/전체 삭제 동작) + 인기검색어 표시.
- [ ] 카테고리·AI도구·길이 필터 + 4종 정렬 적용 시 자동 재검색.
- [ ] "더 보기"가 60개 단위로 중복 없이 이어붙고, <60개면 버튼 사라짐.
- [ ] 검색 결과/크리에이터에 숨김·비공개·정지 사용자 영상이 노출되지 않음.
- [ ] 비구독자: 임의 영상에서 정확히 1분(또는 동적 previewSeconds) 시점·시킹 점프 모두 차단되고 구독 모달 표시.
- [ ] 프리미엄/소유자/라이선스 구매자/관리자: 컷오프 없이 전체 시청(서버 fullAccess=true).
- [ ] 토큰 발급 지연 중 차단 화면이 아닌 썸네일+스피너 표시, 발급 후 자동 재생.
- [ ] 19+ 영상 미인증 진입 시 연령 게이트 + 잠금 오버레이.
- [ ] 광고: Free skip 불가 / Basic 5초 skip / Premium 광고 없음. preroll·bumper 동시 노출 안 됨.
- [ ] 영상 종료 시 다음 추천(3단 폴백) 오버레이 8초 카운트다운, 비구독자는 postroll 후 노출.
- [ ] ₩0 영상은 비활성 라이선스 카드(구매 불가), ₩1,000만 이상은 1:1 문의 버튼.
- [ ] 즉시 구매 → start_payment(orderId 발급) → 토스 결제창 → success → toss-confirm 처리.
- [ ] 결제 완료 주문만 다운로드 가능(log_download 권한검증), 미완료/타인 주문은 예외.
- [ ] 다운로드 시 실제 존재하는 최고 해상도 mp4가 새 탭으로 열림.

---

## 12. 알려진 제약 / 이월

- **토큰 prefetch 없음**: `product.id`마다 매 진입 시 토큰을 동기 발급(L650–680) — Edge 콜드스타트 시 재생 시작 지연. 이전 영상에서 다음 후보 토큰을 미리 받는 prefetch 미구현.
- **Bunny Token Auth 미활성 단계**: `BUNNY_TOKEN_AUTH_KEY` 미설정이면 token=null로 토큰 없이 재생(index.ts L317) — 즉, 키 설정 전까지는 재생 페이월이 클라이언트 컷오프(player.js)에만 의존. 다운로드 mp4 URL도 출시 직전까지 public(phase29 L17–21 보안모델 주석).
- **다운로드 cross-origin**: `<a download>` 미지원으로 새 탭 열기 → 사용자 우클릭 저장 안내 필요(L572).
- **VAST 폐기 이력**: Bunny iframe `vastTagUrl`이 1분 미만 차단 정책 적용 불가로 폐기, 자체 광고 컴포넌트로 전환(정책 v4, L639–643).
- **3분 미만 판매불가 규칙**: 본 영역 코드에서 강제 게이트 미확인 — 업로드/등록 단계 규칙으로 추정. 적용 위치 확인 필요(템플릿 명시 항목, 본 명세 §6 ※표시).
- **상세 메타 직접 select RLS 의존**: 비공개 영상 보호가 `videos` 테이블 RLS에 의존 — 정책 명시 검증 권장(§9).
- **검색 매칭 방식**: ilike 부분일치(한국어 적합, sql L12)로 형태소/오타 보정·동의어 미지원.
