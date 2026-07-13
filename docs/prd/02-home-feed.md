# 02. 홈 피드(Discovery) — 상세 명세

> 본 문서는 추측이 아니라 실제 코드를 읽고 작성됨. 근거는 `파일:줄` 형식으로 표기한다.
>
> **📌 개정 2026-07-08 — 페이지네이션 "순서 고정(frozen order)" 전환 반영.**
> 이전 판은 `get_home_feed(p_limit, p_offset, p_filter)`(limit/offset 페이징)을 기준으로 서술했으나,
> 현행 코드는 **세션 시작 시 랭킹된 id 배열을 1회 확정**(`get_home_feed_order`)하고 그 순서를 클라가
> 고정 보관하며 12개씩 잘라 상세를 배치 조회(`get_home_feed_by_ids`, 입력 순서 보존)하는 방식이다
> (`home_feed_frozen_order_20260704.sql`). 이로써 페이지 경계 누락·중복이 수학적으로 0이 됨. 광고
> 집계도 raw RPC 대신 Edge `/ad-event`(`sendAdEvent`) 경유로 바뀜(위조/키회전 방어). 아래 §4.2·§5·§14·§15
> 는 현행 기준이며, 인용 라인은 개정일자 시점의 근사치(파일이 계속 자라 미세 오차 가능 — 표/함수명이 정본).
>
> **📌 개정 2026-07-13 — 전수 감사 반영.** ① 시리즈 대표작 "1화만" → **"첫 노출가능 에피소드"**(1화 숨김 시
> 다음 화가 대표작, `fix_series_feed_representative_20260712.sql` + frozen order 수정본) + `get_home_feed_count`
> 동일 규칙 동기화(2026-07-13) ② 광고 클릭은 `openAdLinkSafe` 동기 선행 → 집계 fire-and-forget 후행
> ③ 칩 라벨 `t()` i18n 전환 ④ 전체화면 페이월 `settings.cinemaPreviewSeconds` + 연령게이트 선행
> ⑤ 캐시 90초 fresh + 30분 SWR + localStorage 콜드스타트 ⑥ 19+ 잠금 영상 플레이어 미생성 등 — 각 절 및 말미 개정 이력 참조.
>
> 핵심 구현 파일:
> - `src/app/components/DiscoveryFeed.tsx` (전체 ~2000줄+)
> - `supabase/home_feed_frozen_order_20260704.sql` (**현행 페이지네이션 정본** — `get_home_feed_order(text)` + `get_home_feed_by_ids(text[])`. 2026-07-12 시리즈 대표작 규칙 수정본)
> - `supabase/fix_series_feed_representative_20260712.sql` (시리즈 대표작 = "첫 노출가능 에피소드" — `v_available_videos` 새 정본, 홈피드 order 와 동일 규칙)
> - `supabase/get_home_feed_safe_columns_20260620.sql` (`v_home_feed_public` 안전 뷰 정의 + 구버전 `get_home_feed(limit/offset)` — **프론트 미사용**, 랭킹식 근거로만 참조. 시리즈 필터는 구식 1화-only 잔존)
> - `supabase/home_feed_chip_filter_20260611.sql` (`get_home_feed_count(text)` 배지 카운트 정본 — 2026-07-13 대표작 규칙 동기화 수정본)
> - `supabase/ads_public_view_20260620.sql` (`ads_public` 안전 뷰)
> - `src/app/utils/adEvent.ts` (`sendAdEvent` → Edge `/ad-event`. raw `increment_ad_*` RPC 는 anon 회수됨: `supabase/ad_fraud_hardening_edge_20260628.sql`)
> - `supabase/ad_charge_dedup_phase3_20260614.sql`, `supabase/home_security_20260620.sql` (광고 노출/클릭 dedup 원자로직 — 현재는 Edge 가 이 함수들을 호출) + `video_likes`/`comments` RLS
> - `src/app/components/CommentPanel.tsx`, `src/app/components/ExternalAdSlot.tsx`

---

## 1. 개요 / 목적

홈 피드(Discovery)는 CREAITE의 첫 화면이자 모든 공개 영상의 "하이라이트 코너"다. 컴포넌트는 `DiscoveryFeed`(`src/app/components/DiscoveryFeed.tsx:814`).

- 목적: `show_on_home=true`인 모든 공개 영상을 우선순위(개인화/인기/최신)대로 끊김 없이 노출한다. 주석 명시: "홈 피드는 모든 영상의 하이라이트 코너이므로 100편이든 10000편이든 전부 노출"(`DiscoveryFeed.tsx:930`).
- 두 가지 레이아웃을 한 컴포넌트가 CSS 미디어쿼리(≥1024px)로 분기한다: 모바일 = TikTok식 세로 스냅 피드(`mobile-feed-container`, `DiscoveryFeed.tsx:1219`), 데스크탑 = 카드 그리드(`desktop-feed-container`, `DiscoveryFeed.tsx:1264`). 표시 전환은 순수 CSS이며 둘 다 DOM에 렌더링된다(`DiscoveryFeed.tsx:1445`-`1449`).
- 수익화: 영상 사이에 광고를 주기적으로 삽입한다. 정책 플래그 `HOME_FEED_SELF_ADS=false`(`DiscoveryFeed.tsx:54`)로 현재는 외부 네트워크(애드핏/애드센스)만 사용한다.

상단 첫 화면이라 푸터가 없으므로, SEO/OAuth 브랜딩 인증용 약관 링크를 `sr-only` nav로 별도 삽입한다(`DiscoveryFeed.tsx:1211`-`1218`).

---

## 2. 사용자 스토리

- 방문자(비로그인)로서, 첫 화면에서 인기+최신 기반 영상을 바로 스크롤해 보고 싶다(개인화 이력 없으면 인기/최신 폴백, `home_feed_frozen_order_20260704.sql:62`).
- 로그인 사용자로서, 내 좋아요·시청·팔로우 이력을 반영한 개인화 피드를 보고 싶다(`...:106`-`155`).
- 시청자로서, 칩(전체/인기/최신/무료/소장가능/시네마급)으로 빠르게 필터링하고 싶다(`DiscoveryFeed.tsx:110`-`117`).
- 시청자로서, 세로 스와이프로 자동재생되는 영상을 끊김 없이 넘기고 싶다(스냅 + 자동재생, `DiscoveryFeed.tsx:1221`, `490`-`532`).
- 시청자로서, 영상에 좋아요/댓글/공유/팔로우를 즉시 하고 싶다(`ActionButtons`, `DiscoveryFeed.tsx:219`).
- 19+ 미성년/미인증자로서, 연령 제한 영상은 잠금 처리되길 원한다(`isAgeLocked`, `DiscoveryFeed.tsx:359`).
- 구매 의향 시청자로서, 가격/협의 여부를 보고 상세로 진입하고 싶다(`DiscoveryFeed.tsx:679`-`704`).
- 크리에이터로서(BETA), 상단 배너로 바로 등록 페이지로 가고 싶다(`DiscoveryFeed.tsx:1194`-`1209`).
- 광고주로서, 노출/클릭이 사기 없이 1시간 1회로 집계되길 원한다(dedup, `ad_charge_dedup_phase3_20260614.sql`, `home_security_20260620.sql:52`).

---

## 3. 화면 & 상태

### 3.1 레이아웃 분기 (모바일 세로피드 / 데스크탑 그리드)
- CSS 미디어쿼리 ≥1024px(=Tailwind `lg`)로 전환. 모바일 컨테이너는 `display:none` @1024px+, 데스크탑 컨테이너는 그 반대(`DiscoveryFeed.tsx:1445`-`1449`).
- 댓글 패널 분기(JS)는 별도로 `matchMedia("(min-width: 1024px)")`로 판단(`isDesktop`, `DiscoveryFeed.tsx:764`-`772`). 이는 모바일 시트와 데스크탑 모달의 **이중 마운트**(이중 fetch/구독)를 막기 위함(`DiscoveryFeed.tsx:762`-`763`).
- 모바일: 세로 스냅(`snap-y snap-mandatory`), 한 화면에 영상 2개(섹션 높이 `calc(50% - 1.5px)`, `DiscoveryFeed.tsx:1393`-`1394`). 컨테이너 높이 `calc(100dvh - 136px)`(`...:1387`).
- 데스크탑: 반응형 그리드 `grid-cols-1 / md:2 / xl:3 / 2xl:4`(`DiscoveryFeed.tsx:1339`), 상단 sticky 헤더(DISCOVERY FILMS 타이틀 + 칩 바 + 검색바 + VIDEOS 카운트 배지, `...:1267`-`1338`).

### 3.2 로딩 / 빈 / 에러
- 초기 로딩: 전체 화면 스피너(`loading` true, `DiscoveryFeed.tsx:1186`).
- 빈 피드: `videos.length === 0` → "표시할 영상이 없습니다."(`DiscoveryFeed.tsx:1187`).
- 추가 로딩(무한스크롤): 하단 스피너(`loadingMore`, `DiscoveryFeed.tsx:1256`-`1258`, 데스크탑 `1375`-`1377`).
- 피드 끝: "END OF FEED"(모바일 `1259`-`1261`) / "End of Feed"(데스크탑 `1378`-`1380`).
- 영상 재생 에러(2회 재시도 실패): 카드 위 "영상 처리 중..." 오버레이 + 스피너(`MovieSection`, `DiscoveryFeed.tsx:558`-`563`).

### 3.3 온보딩 게이트(연령)
- 19+/제한 영상은 `shouldBlur(age_rating, ageVerified)`로 잠금 판정. **본인 영상은 게이트 제외**(`isMyVideo`, `DiscoveryFeed.tsx:358`-`359`).
- 잠금 시 카드 전체에 흐림+자물쇠 오버레이, 탭하면 `onVideoClick`으로 ProductDetail 진입(거기서 실제 게이트, `DiscoveryFeed.tsx:627`-`639`).
- 연령 배지(`AgeBadge`)는 잠금과 무관하게 항상 표시(`DiscoveryFeed.tsx:675`, 데스크탑 `1698`-`1700`).

### 3.4 칩 필터 바
- 칩 6종: `all/popular/new/free/paid/cinema` — `HOME_CHIPS`(`DiscoveryFeed.tsx:116`-`123`). 라벨은 `t("discoveryFeed.chips.*")` i18n(`...:1412`, `:1498`) — `HOME_CHIPS`의 `ko`/`en` 필드는 **데드 필드**(렌더에서 미사용, `key`만 사용).
- 데스크탑 sticky 헤더 + **모바일 상단 바 양쪽 렌더**. 데스크탑은 넘치면 유튜브식 좌우 화살표(`chipArrows`, `updateChipArrows`, `DiscoveryFeed.tsx:1174`-`1190`, `1482`-`1521`). 화살표 표시 판정은 `scrollLeft`/`clientWidth`/`scrollWidth` 기준, 리사이즈/스크롤 시 갱신.
- 모바일 칩 바: 피드 컨테이너 위 상시 노출, 가로 스크롤(`lg:hidden`, `...:1400`-`1416`). 데스크탑과 동일 `chip` state 공유(기본값 `"all"`) — §12 (해결됨 2026-07-08) 참조.

---

## 4. 동작 흐름

### 4.1 초기 로드 (`user.id`/`chip` 변경 시 재시작, `DiscoveryFeed.tsx:1075`-`1151`)
1. 캐시 키 `${user?.id ?? "anon"}:${chip}` 계산(`...:1077`).
2. **캐시 히트 — fresh(90초 이내)**: 리로드/스피너 없이 즉시 복원(videos/ads/commentCounts/offset/hasMore/**order**/activeId 세팅, `loading=false`) 후 **확정**(재검증 없음). `sessionSeqRef++`로 in-flight loadMore 무효화. 좋아요/댓글수는 전역 `LikesContext`에 seed(별도 fetch 없음). `stateKeyRef=cacheKey`로 저장 가드 해제(`...:1080`-`1101`).
3. **캐시 히트 — stale(90초 초과 ~ 30분 이내, SWR)**: 위와 동일하게 **즉시 표시**(스피너 없음)하되 `stateKeyRef=null`로 두고 **배경 재검증** — 새 순서 확정 후 첫 페이지가 도착하면 `from===0` 교체 스왑으로 매끄럽게 갱신(`...:1102`-`1118`, 스왑 `:1016`-`1018`). 재검증 실패 시 화면 유지(에러 미표시, `:1144`-`1145`). 모듈 로드 시 `localStorage`(`aivm_homefeed_v1`)에서 1회 hydrate → 새로고침/앱 재실행 **콜드스타트도 즉시 페인트**(§8).
4. 캐시 미스(30분 초과 포함) 시: `setLoading(true)` → `stateKeyRef=null` + `sessionSeqRef++` → state 리셋(offset 0, hasMore true, **order []**, videos []) → `ads_public` 광고 조회는 **비블로킹 병렬**(await 안 함 — 첫 영상 페인트에 불필요, `...:1121`-`1127`) → **`get_home_feed_order(chip)`로 이 세션의 랭킹 id 배열을 1회 확정(`orderRef`)** → `loadMore()` 첫 페이지 → 첫 페이지 성공 후 `stateKeyRef=cacheKey`(`...:1105`-`1141`).
5. `cancelled` 플래그로 언마운트/재실행 시 stale setState 차단(`...:1076`, `1150`); `sessionSeqRef`로 유저/칩 전환 race 이중 차단.

### 4.2 무한 스크롤 (`loadMore`, `DiscoveryFeed.tsx:987`-`1058`)
- **순서 고정 슬라이싱**: 세션 시작 시 확정한 랭킹 id 배열 `orderRef`(§4.1·§5.2)에서 `from = offsetRef.current`부터 12개 id 를 잘라(`pageIds`) 상세를 배치 조회한다. limit/offset SQL 페이징이 아니라 "고정 배열 슬라이스"라 페이지 경계가 흔들리지 않는다(누락·중복 0).
- 가드: `fetchingRef`(중복 호출 방지) + `hasMoreRef`(`...:988`). 요청 시점 칩을 `reqChip`, 세션을 `mySeq=sessionSeqRef`로 스냅샷(`...:991`-`992`).
- `pageIds.length === 0`이면 `hasMore=false` 후 종료(`...:1000`).
- `supabase.rpc("get_home_feed_by_ids", { p_ids: pageIds })`(`...:1001`). 이 RPC 는 `ORDER BY array_position(p_ids, id)`로 **입력 순서를 그대로 보존**(§5.1)하고, 그 사이 숨겨진 영상만 제외(→ 페이지가 12보다 짧을 수 있음).
- 응답 후 `reqChip !== chipRef.current || mySeq !== sessionSeqRef.current`면 결과 폐기(칩 전환·유저 전환 race 방지, `...:1005`).
- `offsetRef = from + pageIds.length`(**반환 행수 아님 → 그 사이 숨겨진 영상도 한 번만 건너뜀**). `offset >= order.length`면 `hasMore=false`(`...:1008`-`1009`).
- 매핑(`mapVideoRow`) 후 **id 기반 dedup**으로 누적(`seen` Set — 단 첫 페이지 `from===0`은 교체 스왑: SWR 스테일→신선 전환, `...:1016`-`1021`). 좋아요 수는 전역 `LikesContext`에 seed-once(`...:1015`).
- `activeId`가 비어있으면 첫 영상으로 세팅(`...:1022`).
- 새 페이지 영상에 대해서만 댓글 수 조회(`comments` where `parent_id is null` **AND `is_hidden=false`** — 숨김 댓글 카운트 제외)를 **비블로킹**으로 뒤채움: 영상은 이미 `setVideos` 됐으므로 첫 페인트를 막지 않는다(fire-and-forget, `...:1023`-`1041`). 누적 병합 + 스토어 seed. 병합도 칩/세션 변경 시 폐기(`...:1033`).
- 실패 시 무한 재시도 루프를 끊고 `feedError`(재시도 버튼) 표시(H5, `...:1043`-`1050`). 완료 처리도 세션 일치(`mySeq === sessionSeqRef.current`)일 때만 `fetchingRef/loadingMore` 정리(H10, `...:1051`-`1057`).
- sentinel(`.feed-load-sentinel`)이 `rootMargin:"800px 0px"`로 보이면 `loadMore` 트리거(`DiscoveryFeed.tsx:1204`-`1213`). sentinel은 모바일/데스크탑 각각 존재(`:1461` 등).

### 4.3 자동재생 — 마운트 / dispose (모바일 `MovieSection`, `DiscoveryFeed.tsx:312`-`711`)
- **지연 마운트(`inView`)**: 비가상화 피드라 모든 섹션이 동시에 플레이어를 만들면 메모리 폭발("Aw Snap" 크래시) → ±1화면 이내일 때만 플레이어 생성(`...:361`-`394`).
  - 판정은 IntersectionObserver가 아니라 `getBoundingClientRect()` 기반. 이유: 이전 IO(root:null)가 내부 스크롤 레이아웃에서 항상 false를 보고해 플레이어가 안 생기던 버그 수정(`...:364`-`366`).
  - 스크롤 컨테이너(`.mobile-feed-container`)에 passive scroll 리스너 + rAF throttle. 초기 레이아웃 안정 대비 120ms/500ms 재시도(`...:380`-`387`). 크기 0/vh 미확정이면 판정 보류(false로 덮지 않음, `...:377`).
  - 임계: `r.top < vh*2 && r.bottom > -vh`(`...:378`).
- **Effect 1 — 플레이어 생성/dispose**(`...:399`-`548`): `inView && container && videoUrl && !isAgeLocked`일 때만. **19+ 미인증 잠금 영상은 플레이어 자체를 만들지 않음**(블러 뒤 자동재생·대역폭 소비 차단, `...:462`-`464`) — 인증되면 `isAgeLocked`가 풀려 deps 재실행으로 생성(deps `[video.id, video.videoUrl, inView, isAgeLocked]`, `...:548`). `video` 엘리먼트를 React 밖에서 `document.createElement`로 만들어 append → dispose 시 React removeChild 충돌 방지(`...:405`-`409`). video.js 옵션: autoplay false, controls false, loop true, muted true, fill, preload metadata, crossOrigin anonymous, m3u8면 HLS 타입. cleanup에서 `dispose()` → inView false 시 dispose로 메모리 회수.
  - 재시도: `error` 이벤트에서 code 2(NETWORK)/4(SRC_NOT_SUPPORTED)면 1.5초 후 src 재설정+재생, 최대 2회. 실패 시 `hasError`(`...:439`-`464`).
  - 하이라이트 루프: `timeupdate`에서 `highlightStart`~`highlightEnd`(기본 start+30, 영상길이 초과 시 클램프) 구간만 반복(`...:466`-`476`).
- **Effect 2 — 활성/비활성 전환**(`...:490`-`532`): `isActive=false`면 일시정지+`currentTime(highlightStart)`(전체화면 중이면 예외, `...:491`-`500`). `isActive=true && playerReady`면 재생. `play()` 거부 대비 muted 강제 재시도 + `seeked`/`canplay` 이벤트로 재시도 보강(`...:512`-`523`). cleanup에서 미발화 리스너 해제(빠른 스크롤 시 늦게 도착한 이벤트가 비활성 영상 재생/소리내는 것 방지, `...:524`-`531`).
- **Effect 3 — 뮤트 반영**(`...:534`-`539`).
- **활성 감지**(`DiscoveryFeed.tsx:1080`-`1129`): `scrollTop / sectionHeight` 반올림으로 상단 섹션 인덱스 산출 → 그 섹션의 `data-video-id`로 `activeId` 세팅. 광고 카드는 `data-video-id` 없음 → null → 모든 영상 정지(`...:1103`-`1106`). `scrollend`(신규 브라우저) + `scroll` 디바운스 350ms(iOS/휠 폴백, `...:1109`-`1118`). 전체화면 중엔 자동 변경 금지(`...:1086`-`1088`).
- 데스크탑(`DesktopMovieCard`, `DiscoveryFeed.tsx:1850`~): 호버 시에만 플레이어 생성/재생, 호버 해제 시 일시정지, **언마운트 시에만 dispose**. **19+ 미인증 잠금 영상은 호버해도 플레이어 미생성**(`isAgeLocked` 게이트, `...:1871`) — 모바일 Effect 1 과 동일 규칙.

### 4.4 좋아요 / 팔로우 / 댓글 / 공유
- **좋아요**(`toggleLike`, `DiscoveryFeed.tsx:1321`-`1327`): **전역 `LikesContext.toggleLike`(스토어) 경유** — 낙관적 반영·실패 롤백·중복방지는 스토어가 처리하고 모든 피드(홈/시네마/검색 등)에 동시 반영(§10). 컴포넌트는 결과만 처리: `needAuth` → `onSignInClick`(로그인 유도), `error` → 토스트.
- **팔로우**: `FollowButton`(`creatorId` 전달, `DiscoveryFeed.tsx:672`-`674`, 데스크탑 `1724`-`1726`).
- **댓글**: 버튼 → `setCommentVideo(v)`(`DiscoveryFeed.tsx:1242`). showcase 영상이면 차단(`handleShowcaseClick`). 패널은 모바일 시트/데스크탑 모달로 분기(§ CommentPanel 연동).
- **공유**(`handleShare`, `DiscoveryFeed.tsx:1168`-`1184`): URL `${origin}?video=${id}`. 모바일은 `navigator.share` 우선(AbortError는 무시), 미지원/데스크탑은 `ShareModal`(`...:1492`-`1500`).
- **전체화면**(`openFullscreenGated`, `DiscoveryFeed.tsx:898`-`910`): ① **H4 연령게이트 선행** — 본인 영상이 아니고 `shouldBlur(age_rating, ageVerified)`면 ProductDetail로 우회(`VideoFullscreen`은 자체 연령/페이월 게이트가 없음). ② 페이월 — 비구독자 + (길이 미상 또는 **`settings.cinemaPreviewSeconds`(기본 60) 초과**)면 ProductDetail로 우회(60 하드코딩이면 어드민이 프리뷰를 낮췄을 때 (previewSec, 60] 유료영상이 무료 전체재생되던 누수 — ProductDetail 페이월과 동일 기준). 구독자거나 확실한 previewSec 이하 숏폼만 직접 `VideoFullscreen`. 진입 직전 모든 `<video>`를 pause+mute. 전체화면 동안 피드 자동재생 차단(play 이벤트 즉시 재pause + resize/orientation 백업).

### 4.5 광고 삽입
- **모바일**(`feedItems`, `DiscoveryFeed.tsx:1033`-`1052`): 주기 = self-ads ON이면 `interval_count`(기본 4), OFF면 고정 5(`...:1035`). `(i+1) % interval === 0`마다 슬롯. self-ad 우선(스위치 ON 시) → 없으면 `extad`(외부) → 둘 다 없으면 슬롯 생략(빈 섹션 방지, `...:1040`-`1049`).
- **데스크탑**(`desktopItems`, `DiscoveryFeed.tsx:1060`-`1078`): 영상 6개마다 1개(`DESKTOP_AD_INTERVAL=6`, `...:1059`). 주기 7(=6영상+1광고)이 2/3/4열과 서로소라 광고가 같은 열에 쏠리지 않고 대각선 회전(`...:1054`-`1058`).
- **노출 트래킹**(`handleAdImpression`, `DiscoveryFeed.tsx:1141`-`1143`): 카드가 화면에 들어오면(IntersectionObserver threshold 0.5, 1회만) `sendAdEvent("feed_impression", ad.id)` → **Edge `/ad-event`**(`AdCard` `...:185`-`204`, 데스크탑 `DesktopAdCard` `1716`-`1730`). raw RPC 직접호출이 아니라 Edge 가 신뢰 IP·`auth.uid` 식별·IP다양성 가드 후 내부에서 `increment_ad_impressions` dedup 집계(§9·§10).
- **클릭**: **`openAdLinkSafe`(http(s)만) 동기 선행 → `sendAdEvent("feed_click", ad.id)` fire-and-forget 후행**. 사용자 제스처와 동기적으로 새 탭을 먼저 연다 — Safari/팝업차단이 await 이후의 `window.open`을 막아 광고주 랜딩이 안 열리던 문제 방지(`DiscoveryFeed.tsx:126`-`134`; AdCard 클릭 `209`-`214`, DesktopAdCard 클릭 `1808`-`1813`).
- 외부 광고는 `ExternalAdSlot`(애드핏/애드센스, 300×250 고정, index로 네트워크 로테이션, `ExternalAdSlot.tsx`).

---

## 5. 데이터 / RPC 계약

### 5.1 페이지네이션 RPC 2종 — `home_feed_frozen_order_20260704.sql`

현행 홈피드는 **"랭킹 순서 확정 → id 배열 슬라이스 → 배치 상세조회"** 2단계다. 랭킹 로직(칩 분기·개인화 정렬식)은 구버전 `get_home_feed`(`get_home_feed_safe_columns_20260620.sql`)와 동일하되, **시리즈 필터는 frozen order 수정본(2026-07-12)만 "첫 노출가능 에피소드" 규칙**이고 구 함수엔 1화-only 가 잔존한다(프론트 미사용이라 무해 — 랭킹식 근거로만 참조).

#### (a) `get_home_feed_order(p_filter text DEFAULT 'all')` → `SETOF text` — `:19`
- 현재 칩/개인화 랭킹으로 정렬된 **video_id 전체 목록(LIMIT 없음)**. 세션당 1회 호출로 클라가 이 순서를 고정(`orderRef`). id 만 반환이라 가볍다.
- 프론트 호출: 초기 로드 `DiscoveryFeed.tsx:1130`, 에러 후 재확정 `:1066`.
- 보안: `STABLE SECURITY DEFINER SET search_path='public'`(`:21`), `GRANT EXECUTE → anon, authenticated`(`:128`).

#### (b) `get_home_feed_by_ids(p_ids text[])` → `SETOF v_home_feed_public` — `:134`
- 주어진 id 배열의 상세를 `ORDER BY array_position(p_ids, id)`로 **입력 순서 그대로** 안전뷰로 반환(`:143`). 공개/비숨김 조건은 재확인(그 사이 숨겨진 영상은 제외 → 페이지가 살짝 짧을 수 있음, `:140`-`142`).
- 반환 뷰 `v_home_feed_public`은 `videos`의 공개 안전 컬럼만 투영하고 `moderation_*`(status/score/categories/error) 내부필드는 제외. `seed/prompt/ai_model_version`은 AI 증빙으로 의도적 공개(뷰 정의 `get_home_feed_safe_columns_20260620.sql:10`-`33`).
- 프론트 호출: `DiscoveryFeed.tsx:1001`(12개 슬라이스마다).
- 보안: `STABLE SECURITY DEFINER SET search_path='public'`(`:136`), `GRANT EXECUTE → anon, authenticated`(`:146`). 뷰 자체는 anon 에 GRANT 안 함(함수 내부에서만 읽음).

#### 칩 필터 매핑 (`p_filter` → `get_home_feed_order` 분기)
- 공통 WHERE(모든 분기): `show_on_home=true AND (visibility='public' OR NULL) AND COALESCE(is_hidden,false)=false AND (series_id IS NULL OR NOT EXISTS(더 앞의 노출가능 에피소드))` — **시리즈는 "첫 노출가능 에피소드"(대표작)만**(`:31`-`41` 등). 1화가 숨김(재검수 대기·관리자 숨김 등)이면 다음 화가 자동 대표작 — 구식 `episode_number=1` 규칙은 1화 숨김 시 시리즈 전체가 피드에서 증발하던 버그(2026-07-12 수정, `fix_series_feed_representative_20260712.sql`과 동일 규칙).
- `new`: 위 + `ORDER BY created_at DESC, id`.
- `popular`/`free`/`paid`/`cinema`: 인기점수 정렬. `free` → `price_standard=0`, `paid` → `price_standard>0`, `cinema` → `show_on_ott=true`. 정렬식: `likes*1.0 + (최근 7일 유효 조회수)*2.0` DESC, created_at DESC, id.
- `all`(기본) → 개인화(§ 6).

### 5.2 개인화 정렬(`all`) — `home_feed_frozen_order_20260704.sql:55`-`124` (구 `get_home_feed_safe_columns_20260620.sql:84`-`155` 와 동일 로직)
- 이력 판단: `auth.uid()`가 있고 `video_likes` 또는 유효 `video_views`가 있으면 `v_has_history=true`(`:56`-`60`).
- 비로그인 OR 무이력 → 인기/최신 폴백(인기점수식 동일, `:62`-`74`).
- 이력 있음 → CTE 4종 가중합:
  - `cat_pref`: 좋아요 카테고리 +3, 조회 카테고리 +1(`:77`-`85`).
  - `genre_pref`: 좋아요 장르 +3, 조회 장르 +1(`:86`-`94`).
  - `creator_pref`: 좋아요 크리에이터 +3, **팔로우 크리에이터 +5**(`:95`-`103`).
  - `viewed`: 이미 본 영상(`:104`-`107`).
  - 최종 점수: `cat*1.0 + genre*1.0 + creator*1.0 + likes*0.05 - (본 영상이면 4)` DESC, created_at DESC, id(`:118`-`124`). 본 영상은 -4로 강등.

### 5.3 `get_home_feed_count(p_filter)` — `home_feed_chip_filter_20260611.sql` (2026-07-13 수정본)
- 시그니처 `(p_filter text DEFAULT 'all')` → 배지용 총 건수. 프론트 호출 `rpc("get_home_feed_count", { p_filter: chip })`(`DiscoveryFeed.tsx:1196`).
- count WHERE 는 `get_home_feed_order`와 **동일 조건**: `show_on_home=true AND public(or null) AND not hidden AND 시리즈 대표작(첫 노출가능 에피소드) AND (free→=0 / paid→>0 / cinema→ott)` → 배지 수 = 실제 피드 노출 수. (시리즈 필터 연혁: 2026-06-28 1화 필터 추가로 배지 **과대**표시 해소 → 2026-07-13 대표작 규칙(NOT EXISTS)으로 재동기화. 구식 1화-only 를 count 에만 두면 1화 숨김 시리즈를 0으로 세어 배지 **과소**표시 — order 와 규칙을 함께 유지할 것.)

### 5.4 페이지네이션 / dedup (순서 고정)
- 페이지 크기 `FEED_PAGE_SIZE = 12`(`DiscoveryFeed.tsx:805`). **offset 은 고정 배열 `orderRef` 인덱스** — `offsetRef = from + pageIds.length`(요청한 id 개수 기준, 반환 행수 아님, `...:952`). 그 사이 숨겨진 영상도 정확히 한 번만 건너뛴다.
- 순서 안정성: 랭킹은 세션 시작 시 `orderRef`에 **얼려짐** → 실시간 7일 조회수·`now()` 변동에 페이지 경계가 흔들리지 않음. `get_home_feed_by_ids`가 `array_position`으로 페이지 내 순서 보존. **누락·중복 수학적으로 0**(새로고침 때만 순서 재확정).
- 프론트 dedup(이중 안전): 누적 시 id Set으로 중복 제거(`...:960`-`963`).
- 랭킹식 자체의 안정 정렬: 모든 분기가 마지막에 `id` 타이브레이커.

### 5.5 `mapVideoRow` 매핑 — `DiscoveryFeed.tsx:714`-`749`
DB row(뷰 컬럼) → `Video` 인터페이스. 주요 매핑:
- `price`/`priceStandard` ← `price_standard`(`...:722`, `733`), `tool` ← `ai_tool`(`...:726`), `creatorId` ← `creator_id`(`...:718`).
- `durationSeconds` ← `duration_seconds`(페이월 게이트용, `...:723`).
- `tags`: 배열이면 그대로, 문자열이면 콤마 분리(`...:732`).
- `age_rating` 기본 "all"(`...:730`), `highlightEnd` 기본 `highlightStart+30`(`...:746`), `seriesId` ← `series_id`(`...:747`).

### 5.6 광고 조회 — `DiscoveryFeed.tsx:1121`-`1127`
- `supabase.from("ads_public").select("id,title,advertiser,image_url,video_url,thumbnail_url,link_url,cta_text,interval_count,ad_type").or("ad_type.eq.feed_display,ad_type.is.null")`. **비블로킹 병렬** — 광고는 첫 영상 페인트에 불필요(피드 interleaving 용)하므로 순서 조회(`get_home_feed_order`) 앞에서 await 하지 않고 `.then` 으로 도착 시 반영. `ads_public` 뷰가 승인·활성·노출기간 필터를 강제하고 민감컬럼(budget/spent/owner) 비노출(`ads_public_view_20260620.sql:20`-`30`). (현재 `HOME_FEED_SELF_ADS=false`라 자체광고는 노출 안 되고 외부 네트워크만 사용 — §6.)

---

## 6. 비즈니스 규칙

- **개인화 가중치**(`all`, 이력 있음): 카테고리/장르/크리에이터 각 1.0 비중(좋아요 3 / 조회 1 / 팔로우 5 가중) + likes 0.05 − 기시청 4(`home_feed_frozen_order_20260704.sql:118`-`124`). 팔로우(5)가 단일 신호로는 최강.
- **인기점수**(popular/free/paid/cinema 및 폴백): `likes + 최근7일유효조회수×2`(`...:74`-`79`).
- **시리즈 대표작(첫 노출가능 에피소드)**: `series_id IS NULL OR NOT EXISTS(더 앞의 노출가능 화)` — 시리즈당 노출가능(공개·비숨김) 에피소드 중 **가장 앞 화 1편만** 피드에 노출(후속화 제외). 1화 숨김 시 2화가 자동 대표작(구 1화-only 규칙의 "시리즈 증발" 버그 수정, 2026-07-12). 카드에 "시리즈" 배지 — 라벨은 `t("discoveryFeed.seriesBadge")`(2026-07-13 하드코딩 → t() 전환, `DiscoveryFeed.tsx:655`, 데스크탑 `1954`).
- **길이 게이팅(페이월)**: 전체화면 진입 시 **H4 연령게이트 선행** 후, 비구독자 + (길이 미상 또는 `settings.cinemaPreviewSeconds`(기본 60) 초과) → 직접 재생 차단, ProductDetail로(`DiscoveryFeed.tsx:898`-`910`, §4.4).
- **광고 주기**: 모바일 외부광고 5칸, self-ads ON 시 `interval_count`(기본 4)(`...:1035`); 데스크탑 6칸(`...:1059`).
- **티어/정책 플래그**: `HOME_FEED_SELF_ADS=false`(외부 광고만, `...:54`), `BETA_MODE`(상단 등록 배너, `...:1194`), `EXTERNAL_ADS_ACTIVE`(외부 광고 슬롯 삽입 가드, `ExternalAdSlot.tsx:41`).
- **가격 표시**: `price>0`면 "상업용 다운로드/₩금액" 또는 협의(`isNegotiationOnly`), `price=0`이면 "무료 시청/라이선스 미판매"(`DiscoveryFeed.tsx:679`-`696`, 데스크탑 `1731`-`1743`).
- **차단 사용자**: 차단한 크리에이터 영상은 피드에서 제외(클라, `visibleVideos`, `DiscoveryFeed.tsx:830`-`833`).

---

## 7. 엣지 케이스 & 에러 처리

- **칩 전환 race**: 응답 시점 `reqChip !== chipRef.current`면 결과 폐기(영상·댓글수 둘 다, `DiscoveryFeed.tsx:883`, `901`). 칩 변경은 초기 effect가 새로 로드(`...:944`-`966`).
- **중복 영상**: 누적 시 id Set으로 dedup(`...:960`-`963`); 랭킹 정렬에 id 타이브레이커 + 순서 고정(`orderRef`)으로 페이지 경계 안정(`home_feed_frozen_order_20260704.sql:124`).
- **빈 피드**: "표시할 영상이 없습니다."(`DiscoveryFeed.tsx:1187`); 광고 데이터 없으면 슬롯 생략(빈 섹션 방지, `...:1040`-`1049`).
- **자동재생 실패**: code 2/4면 1.5초 후 2회 재시도 → 실패 시 "영상 처리 중..." 오버레이(`...:439`-`464`, `558`-`563`). `play()` 거부는 muted 강제 재시도 + seeked/canplay 보강(`...:512`-`523`).
- **늦게 도착한 이벤트**: 비활성/언마운트 시 seeked/canplay 리스너 해제 → 빠른 스크롤 후 비활성 영상이 소리내는 것 방지(`...:524`-`531`).
- **다중 소리**: 전체화면 진입 시 모든 `<video>` pause+mute(`...:604`-`609`, `843`-`863`).
- **캐시 오염**: 저장은 비로딩 + `stateKeyRef`(현재 state 가 속한 캐시 키)와 현재 키가 **일치할 때만**(`...:1153`-`1159`) — 유저/칩 전환 커밋 직후 이전 세션 videos 가 새 키로 저장되는 포이즈닝 차단. 캐시 키에 `user.id`와 `chip` 포함 → 사용자/필터 전환 시 격리. 스테일(SWR) 재검증 중엔 `stateKeyRef=null`로 저장 차단, 완료 후 허용. 복원 시 좋아요·댓글수는 전역 `LikesContext`에 seed(별도 재조회 없음). localStorage 스냅샷(`aivm_homefeed_v1`)은 30분(스테일 상한) 지난 것은 hydrate 시 버림(§8).
- **잘못된 광고 링크**: `openAdLinkSafe`가 `new URL()` 파싱 + http(s) 스킴만 허용(javascript:/data: 차단, `...:119`-`128`).
- **광고/클릭 위조**: RPC dedup으로 (광고,뷰어,1시간) 1회만 과금(§ 9).

---

## 8. 성능

- **모듈 캐시 + SWR + localStorage 콜드스타트**(`homeFeedCache`, `DiscoveryFeed.tsx:822`-`864`): 키 `${userId}:${chip}`, 무한스크롤 누적분 통째 보관. **90초 이내(fresh)** 는 재검증 없이 즉시 복원(스피너 없음), **90초~30분(stale)** 은 SWR — 즉시 표시 후 배경 재검증(첫 페이지 도착 시 `from===0` 교체 스왑). 모듈 로드 시 **`localStorage`(`aivm_homefeed_v1`)에서 1회 hydrate** → 새로고침/앱 재실행 콜드스타트도 즉시 페인트. 지속 저장은 최근 4키 × 첫 페이지 12개 + 광고 6개만(쿼터/직렬화 비용 최소화, `persistHomeCacheToLS`). 메모리 캐시 엔트리 상한 8(`HOME_CACHE_MAX`). 저장은 비로딩 + `stateKeyRef` 일치 시에만(§7).
- **useMemo**: `visibleVideos`(차단 필터, `...:830`), `creatorIds`(`...:835`), `feedItems`(`...:1033`), `desktopItems`(`...:1060`) — 사소한 state 변경 시 전배열 재계산 방지.
- **lazy 이미지**: 썸네일 `loading="lazy" decoding="async"`(`...:553`-`554`, 데스크탑 `1684`).
- **지연 마운트**: 비가상화 피드에서 ±1화면 섹션만 video.js 생성, 멀어지면 dispose로 메모리 회수(`...:361`-`394`, `485`). 데스크탑은 호버 시에만 생성(`...:1635`-`1657`).
- **sentinel + rootMargin 800px**: 끝 도달 전 미리 다음 페이지 로드(`...:1019`-`1021`).
- **rAF throttle**: 지연마운트 스크롤 판정(`...:380`), 활성감지 scroll 디바운스 350ms(`...:1113`-`1117`).
- **댓글 수 증분 조회**: 새 페이지 영상 id만(`is_hidden=false` 최상위 댓글) **비블로킹**으로 조회해 병합 — 첫 페인트를 막지 않음(전체 재조회 안 함, `...:1023`-`1041`). 광고 조회도 비블로킹 병렬(§5.6) — 초기 로드 크리티컬 패스는 `get_home_feed_order` + 첫 `get_home_feed_by_ids` 뿐.

---

## 9. 권한 / 보안

- **안전 뷰**: `get_home_feed_by_ids`(및 구 `get_home_feed`)는 `v_home_feed_public`만 반환 → `moderation_*` 내부필드 anon 비노출(뷰 정의 `get_home_feed_safe_columns_20260620.sql:7`-`33`). 광고는 `ads_public` 뷰로 민감컬럼(budget/spent/owner) 차단하고 base `ads` 공개 SELECT 정책은 제거됨(`ads_public_view_20260620.sql:20`-`37`).
- **광고 집계 경로(2026-06-28 이후)**: 클라는 raw RPC 를 직접 호출하지 않는다. `sendAdEvent` → **Edge `/ad-event`** 가 신뢰 IP·`auth.uid` 식별·IP다양성 가드 후 내부에서 dedup 집계 함수를 호출한다. raw `increment_ad_*` 는 anon 에서 EXECUTE 회수됨(`ad_fraud_hardening_edge_20260628.sql`) → 클라 우회 차단.
- **viewer_key dedup(Edge 내부에서 호출)**:
  - 노출: `increment_ad_impressions(...)` — `COALESCE(auth.uid(), 세션키)` + `date_trunc('hour')` 버킷, (광고,뷰어,1시간) 1회만 CPM 과금(`ad_charge_dedup_phase3_20260614.sql:22`-`48`). dedup 테이블은 RLS on + 정책 없음(DEFINER 함수만 기록, `...:18`-`20`).
  - 클릭: `increment_ad_clicks(...)` — 동일 dedup, 구 1-파라미터 함수는 DROP(우회 차단, `home_security_20260620.sql:50`-`70`).
  - 세션키: `getViewerSessionKey()`(localStorage)로 비로그인도 식별 → `sendAdEvent`가 `viewer_key`로 Edge 에 전달(`adEvent.ts:35`).
- **video_likes RLS**: 본인 행만 select/insert/delete(`home_security_20260620.sql:24`-`33`).
- **comments SELECT RLS**: 숨김 댓글은 작성자/관리자/영상소유자만 열람(`home_security_20260620.sql:90`-`100`).
- **외부 링크 안전**: http(s) 스킴만 `window.open(... noopener,noreferrer)`(`DiscoveryFeed.tsx:119`-`128`).

---

## 10. 분석 / 이벤트

- **광고 노출**: 카드 50% 가시 1회 → `sendAdEvent("feed_impression")` → Edge → `increment_ad_impressions`(impressions+1, spent_krw += CEIL(CPM/1000), `ad_charge_dedup_phase3_20260614.sql:40`-`46`). CPM은 플랫폼 설정 `ad_cpm_krw`(기본 2000, `...:41`).
- **광고 클릭**: `sendAdEvent("feed_click")` → Edge → `increment_ad_clicks`(clicks+1, dedup, `home_security_20260620.sql:66`-`68`).
- **좋아요**: 전역 `LikesContext.toggleLike` 경유(낙관+롤백+중복방지) → `video_likes` insert/delete(`DiscoveryFeed.tsx:1247`-`1252`).
- **개인화 신호 원천**: `video_likes`, `video_views`(is_valid), `creator_followers` — `get_home_feed_order`가 이들을 읽어 랭킹(§ 5.2).
- **인기 신호**: 최근 7일 `video_views.is_valid=true` 카운트(`home_feed_frozen_order_20260704.sql:48`-`50`).
- **조회수 표시(2026-07-12 추가)**: 홈 카드에 조회수 표시 — `videos.views`(SSOT)를 전역 스토어 `displayViews`/`seedViews`(seed-once)로 시네마·OTT·검색과 통일 표시(`DiscoveryFeed.tsx:414`-`417`, 데스크탑 `1857`-`1858`).
- (홈피드 자체 영상 조회수 **기록** 호출은 여전히 본 컴포넌트엔 없음 — 조회 기록은 상세/플레이어 경로에서 발생. 본 피드는 자동재생 미리보기.)

---

## 11. 수용 기준 (체크리스트)

- [ ] 비로그인 시 인기/최신 폴백, 로그인+이력 시 개인화 순서로 노출(`home_feed_frozen_order_20260704.sql:62`, `76`).
- [ ] 칩 6종 각각 올바른 필터/정렬(new=최신, popular=인기, free=무료, paid=유료, cinema=ott, all=개인화).
- [ ] 시리즈는 **첫 노출가능 에피소드(대표작)만** 피드/카운트에 노출(1화 숨김 시 다음 화가 대표작 — 시리즈 증발 없음), 카드에 "시리즈" 배지.
- [ ] 무한스크롤: 12개 단위 로드, 끝에서 "END OF FEED", 중복 영상 없음.
- [ ] 칩 전환 직후 이전 칩 응답이 섞이지 않음(race 폐기).
- [ ] 모바일 세로 스냅: 상단 영상만 활성·자동재생, 나머지 정지/뮤트.
- [ ] ±1화면 밖 섹션은 플레이어 dispose(메모리 회수), 광고 카드 활성 시 모든 영상 정지.
- [ ] 좋아요 낙관적 업데이트 + 실패 롤백(전역 LikesContext 경유 — 모든 피드 동시 반영), 비로그인 시 로그인 유도.
- [ ] 댓글 패널: 모바일 시트/데스크탑 모달 중 하나만 마운트(이중 fetch 없음).
- [ ] 공유: 모바일 네이티브 공유 → 미지원 시 ShareModal, URL `?video=id`.
- [ ] 19+ 잠금: 미인증 시 오버레이 + **플레이어 자체 미생성**(모바일 Effect1·데스크탑 호버 모두), 본인 영상은 잠금 제외.
- [ ] 전체화면: **연령게이트 선행** 후 비구독자 + (길이미상 또는 `cinemaPreviewSeconds` 초과)는 ProductDetail로 우회.
- [ ] 광고: 모바일 5칸/데스크탑 6칸 주기 삽입, 데이터 없으면 빈 슬롯 없음.
- [ ] 광고 노출/클릭이 (광고,뷰어,1시간) 1회만 집계(dedup).
- [ ] `ads_public`/`v_home_feed_public`이 민감/모더레이션 컬럼 비노출.
- [ ] 탭 복귀 시 모듈 캐시로 스피너 없이 직전 상태 복원(90초 fresh / 30분 SWR), 새로고침 콜드스타트도 localStorage 스냅샷으로 즉시 페인트.
- [ ] 외부 광고 링크는 http(s)만 새 탭(noopener) 오픈.

---

## 12. 알려진 제약 / 이월

- **비가상화 피드**: DOM에 전 카드 유지 + 지연 마운트로 메모리만 방어. 향후 가상화(react-virtual 등) 전환 검토(`DiscoveryFeed.tsx:415`).
- **자동재생 IO 미사용**: 지연 마운트는 `getBoundingClientRect`+scroll 리스너로 구현(IO root:null이 내부 스크롤에서 오작동했던 이력, `...:418`-`420`). 스크롤 컨테이너를 root로 지정한 IO 전환은 이월.
- **(해결됨) 순서 고정 페이지네이션**: 구 limit/offset 페이징의 페이지 경계 흔들림(누락)을 `get_home_feed_order`+`get_home_feed_by_ids`로 제거(§4.2·§5.4, `home_feed_frozen_order_20260704.sql`). 새로고침 때만 순서 재확정.
- **(해결됨 2026-07-12) 시리즈 대표작 — 1화 숨김 시 시리즈 증발**: 구 "1화만" 규칙은 1화가 숨김(재검수 대기·관리자 숨김 등)이면 2·3화가 멀쩡해도 시리즈 카드가 피드에서 사라짐 → "첫 노출가능 에피소드" 규칙으로 교체(`fix_series_feed_representative_20260712.sql` + `home_feed_frozen_order_20260704.sql` 수정본, §5.1·§6).
- **(해결됨 2026-06-28 → 2026-07-13 재동기화) count 조건 일치**: `get_home_feed_count` 에 시리즈 필터를 추가해 `get_home_feed_order`와 조건 일치(배지 과대표시 해소). 2026-07-13 대표작 규칙(NOT EXISTS)으로 order 와 재동기화 — 배지 수 = 실제 노출 수 유지(정본 `home_feed_chip_filter_20260611.sql` 수정본, §5.3).
- **(해결됨 2026-07-13) 데스크탑 시리즈/AD 배지 하드코딩**: 배지 라벨을 `t("discoveryFeed.seriesBadge")`/`t("discoveryFeed.adBadge")` i18n 으로 전환(모바일·데스크탑 공통).
- **(추가 2026-07-12) 홈 카드 조회수 표시**: `videos.views`(SSOT) 전역 스토어 seed-once 통일 표시(§10).
- **(해결됨 2026-07-08) 모바일 칩 UI**: 모바일 상단 칩 필터 바 추가(`DiscoveryFeed.tsx:1321`-`1339`). `lg:hidden`으로 <1024px 전 구간 노출(태블릿 768~1023px 사각지대 포함) — 데스크탑 그리드(≥1024px)는 자체 sticky 헤더 칩. 이전 "모바일 칩 부재" 이월 해소.
- **데스크탑 자동재생**: 호버 기반(터치 데스크탑/키보드 사용자 비호버 시 미리보기 없음). 재호버 시 하이라이트 시작점부터 재생 재개(`...:1788`-`1835`).
- **댓글 수 정합**: 작성 시 +1 낙관 증가(전역 `LikesContext`), 삭제 반영은 없음(증분만) → 새로고침 전까지 과대 가능.

---

## 13. 와이어프레임 (텍스트 목업)

> 실제 CSS/구조 근거: 모바일 세로 스냅(`DiscoveryFeed.tsx:1219`-`1262`), 데스크탑 그리드(`...:1264`-`1383`), 칩 바(`...:1290`-`1315`), 연령 게이트(`...:627`-`639`), 광고 슬롯(`...:1033`-`1078`).

### 13.1 모바일 세로 피드 카드 (1화면 2영상, snap-y mandatory)

```
┌─────────────────────────────┐
│  [BETA] 크리에이터 등록 →     │
│ [전체][🔥인기][✨최신][🆓..] │  ← 모바일 칩 바(lg:hidden, 가로 스크롤, 2026-07-08)
├─────────────────────────────┤  ← 피드 컨테이너 높이 calc(100dvh - 136px)
│                             │     (.mobile-feed-container, snap-y)
│ ▓▓▓▓▓ MovieSection #1 ▓▓▓▓▓ │  ← 섹션 높이 calc(50% - 1.5px)
│ ▓ (video.js, muted, loop)  ▓ │     snap-start, data-video-id=#1
│ ▓                          ▓ │     → 상단 = activeId → 자동재생
│ ▓  [12]                    ▓ │  ← AgeBadge(좌상단, 잠금무관 항상)
│ ▓                  ❤  1.2k  ▓ │
│ ▓                  💬   34  ▓ │  ← ActionButtons(우측 세로)
│ ▓                  ↗ 공유   ▓ │
│ ▓                  +팔로우  ▓ │
│ ▓ @creator · 제목           ▓ │
│ ▓ 🎬 상업용 다운로드 ₩30,000 ▓│  ← price>0: 가격 / price=0: 무료시청
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │
├─────────────────────────────┤  ← snap 경계(1.5px gap)
│ ░░░░░ MovieSection #2 ░░░░░ │  ← inView=±1화면 → 마운트, 비활성=정지+mute
│ ░  (썸네일 lazy, 정지)      ░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└─────────────────────────────┘
                ↓ 스크롤
┌─────────────────────────────┐
│  연령 잠금 카드 예시         │
│  🔲🔲🔲 (blur) 🔒 19+ 🔲🔲🔲 │  ← shouldBlur(age_rating, ageVerified)
│   탭 → ProductDetail(실게이트)│     본인 영상(isMyVideo)은 제외
└─────────────────────────────┘
                ↓ (i+1)%5==0 위치
┌─────────────────────────────┐
│  📢 광고 슬롯 (AdCard/extad) │  ← self-ad OFF → 외부광고, 둘 다 없으면 슬롯 생략
│     data-video-id 없음       │     → activeId=null → 모든 영상 정지
└─────────────────────────────┘
   ...
┌─────────────────────────────┐
│   ⟳ (loadingMore 스피너)     │  ← .feed-load-sentinel (rootMargin 800px)
│        END OF FEED           │  ← hasMore=false
└─────────────────────────────┘
```

### 13.2 데스크탑 그리드 (sticky 헤더 + 반응형 그리드)

```
┌──────────────────────────────────────────────────────────────┐
│ DISCOVERY FILMS                              [🔍 검색바      ] │  ← sticky 헤더
│ ◀ [전체][🔥인기][✨최신][🆓무료시청][💎소장가능][🎬시네마급] ▶ │  ← 칩 바(넘치면 ◀▶)
│                                                  VIDEOS: 1,234 │  ← get_home_feed_count 배지
├──────────────────────────────────────────────────────────────┤
│  grid-cols-1 / md:2 / xl:3 / 2xl:4                            │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐                │
│  │ card 1 │ │ card 2 │ │ card 3 │ │ card 4 │  ← 호버 시에만 재생 │
│  │ [12]   │ │        │ │ 시리즈 │ │        │                │
│  │@cr ❤34 │ │@cr     │ │@cr     │ │@cr     │                │
│  │₩30,000 │ │ 무료   │ │ 협의   │ │₩5,000  │                │
│  └────────┘ └────────┘ └────────┘ └────────┘                │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────────────────┐    │
│  │ card 5 │ │ card 6 │ │ card 7 │ │ 📢 DesktopAdCard    │    │  ← 6영상마다 1광고
│  └────────┘ └────────┘ └────────┘ │  (300×250 / extad) │    │     주기 7=2/3/4열 서로소
│                                    └────────────────────┘    │     → 대각선 회전
│                          ...                                  │
│                  ⟳ loadingMore / "End of Feed"                │  ← .feed-load-sentinel
└──────────────────────────────────────────────────────────────┘
```

### 13.3 칩 필터 바 (데스크탑 sticky 헤더 + 모바일 상단 바)

```
컨테이너 좌측 끝(scrollLeft<=0): 좌화살표 숨김
┌──────────────────────────────────────────────────────────────┐
│   [전체*][🔥 인기][✨ 최신][🆓 무료시청][💎 소장가능][🎬 ..▶ │  ← 우측 넘침 → ▶ 표시(데스크탑)
└──────────────────────────────────────────────────────────────┘
   * = chip state 활성(기본 "all"). 클릭 → setChip → 초기 effect 재로드
   라벨 = t("discoveryFeed.chips.*") i18n (HOME_CHIPS ko/en 필드는 데드 필드)
   화살표 표시 판정: scrollLeft / clientWidth / scrollWidth (리사이즈·스크롤 시 갱신)
   모바일: 상단 칩 바 렌더(lg:hidden, 화살표 없이 가로 스크롤) — §12 해결됨(2026-07-08)
```

### 13.4 온보딩 게이트(연령) 오버레이

```
┌─────────────────────────────┐
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │  ← 카드 전체 blur
│ ▒▒▒▒▒▒▒    🔒     ▒▒▒▒▒▒▒▒▒ │
│ ▒▒▒▒▒  19+ 인증 필요  ▒▒▒▒▒ │  ← shouldBlur(age_rating, ageVerified)==true
│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │
│ [12]                        │  ← AgeBadge는 blur 위에 항상 노출
└─────────────────────────────┘
   탭 → onVideoClick → ProductDetail(실제 게이트 판정)
   예외: isMyVideo==true → blur 안 함(본인 영상)
```

### 13.5 광고 슬롯 배치 규칙

```
모바일(interval=5, self-ads OFF):
  [V][V][V][V][AD][V][V][V][V][AD]...   ← (i+1)%5==0
  AD 우선순위: self-ad(ON일 때) → extad(외부) → 없으면 슬롯 생략

데스크탑(DESKTOP_AD_INTERVAL=6, 주기 7):
  열4 기준:  [V][V][V][V]
             [V][V][AD][V]   ← 7주기가 4열과 서로소 → AD 위치 대각 회전
             [V][V][V][V]
             [AD][V][V][V]
```

---

## 14. 시퀀스 다이어그램

### 14.1 초기 로드 (캐시 → 광고 → 좋아요 → RPC 첫 페이지)

```mermaid
sequenceDiagram
    autonumber
    participant U as 사용자/탭
    participant DF as DiscoveryFeed
    participant C as homeFeedCache(모듈)
    participant SB as Supabase
    participant ORD as get_home_feed_order
    participant IDS as get_home_feed_by_ids

    U->>DF: 마운트 / user.id·chip 변경
    note over C: 모듈 로드 시 localStorage(aivm_homefeed_v1)에서 1회 hydrate (콜드스타트 즉시 페인트)
    DF->>DF: cacheKey = `${user?.id ?? "anon"}:${chip}` (1077)
    DF->>C: get(cacheKey)
    alt 캐시 히트 · fresh(90초 이내) (1080-1101)
        C-->>DF: {videos, ads, commentCounts, offset, hasMore, order, activeId}
        DF->>DF: 즉시 복원·확정, sessionSeqRef++, loading=false (스피너·재검증 없음)
        note over DF: 좋아요/댓글수는 전역 LikesContext 에 seed (별도 fetch 없음)
    else 캐시 히트 · stale(90초~30분, SWR) (1102-1118)
        C-->>DF: 스냅샷 즉시 표시 (스피너 없음, stateKeyRef=null 로 저장 차단)
        DF->>DF: 아래 "일반 로드" 흐름을 배경 재검증으로 수행 → 첫 페이지 from===0 교체 스왑
    else 캐시 미스 (1105-1141)
        DF->>DF: loading=true, sessionSeqRef++, state 리셋(offset 0, order [], videos [])
        DF-->>SB: from("ads_public").or(feed_display/null) — 비블로킹 병렬, await 없음 (1121-1127)
        DF->>ORD: get_home_feed_order(p_filter:chip) (1130)
        ORD-->>DF: 랭킹된 id 전체 배열 → orderRef 고정 (1134)
        DF->>DF: loadMore() 첫 페이지 (1139)
        DF->>IDS: get_home_feed_by_ids(orderRef.slice(0,12)) (1001)
        IDS-->>DF: rows[] (array_position 순서 보존)
        DF->>DF: mapVideoRow → id dedup 누적, activeId=첫영상 (1010-1022)
        DF-->>SB: comments count(parent_id null, is_hidden=false) — 신규 id만, 비블로킹 (1030-1041)
        SB-->>DF: commentCounts 병합 + 스토어 seed (뒤채움)
        DF->>DF: stateKeyRef=cacheKey, loading=false
    end
    note over DF: cancelled + sessionSeqRef 로 언마운트/유저·칩 전환 시 stale setState 차단 (1076,1150)
```

### 14.2 무한 스크롤

```mermaid
sequenceDiagram
    autonumber
    participant IO as Sentinel IO(rootMargin 800px)
    participant DF as DiscoveryFeed.loadMore
    participant IDS as get_home_feed_by_ids

    IO->>DF: sentinel 진입 → loadMore() (1129-1138)
    DF->>DF: 가드 fetchingRef / hasMoreRef (932)
    alt 이미 fetch중 or hasMore=false
        DF-->>IO: return (무시)
    else 진행
        DF->>DF: reqChip=chipRef, mySeq=sessionSeqRef 스냅샷 (935-936)
        DF->>DF: pageIds = orderRef.slice(from, from+12) (943)
        alt pageIds.length === 0
            DF->>DF: hasMore=false, return (944)
        else
            DF->>IDS: get_home_feed_by_ids(pageIds) (945)
            IDS-->>DF: rows[] (array_position 순서 보존, 숨김분 제외)
            alt reqChip 또는 mySeq 불일치 (949)
                DF->>DF: 결과 폐기(칩·유저 전환 race)
            else 유효
                DF->>DF: offsetRef = from + pageIds.length (952)
                DF->>DF: offset >= order.length → hasMore=false (953)
                DF->>DF: mapVideoRow → seen Set dedup 누적 (1016-1021)
                DF->>DF: 신규 id 댓글 수 비블로킹 뒤채움·병합(칩/세션 변경 시 폐기) (1023-1041)
            end
        end
    end
```

### 14.3 자동재생 마운트 / dispose (MovieSection)

```mermaid
sequenceDiagram
    autonumber
    participant S as Scroll(.mobile-feed-container)
    participant MS as MovieSection
    participant VJS as video.js

    S->>MS: passive scroll + rAF throttle (380)
    MS->>MS: getBoundingClientRect() 판정 (364-378)
    note over MS: 크기 0/vh 미확정이면 보류(false로 안 덮음) (377)
    alt r.top < vh*2 && r.bottom > -vh (inView true)
        MS->>MS: Effect1: inView && container && videoUrl (399)
        MS->>VJS: document.createElement(video) append (405-409)
        MS->>VJS: videojs(autoplay:false, muted:true, loop, fill, HLS) (411-425)
        opt error code 2/4
            VJS-->>MS: error → 1.5s 후 src 재설정 재생, 최대 2회 (439-464)
        end
        MS->>VJS: timeupdate → highlightStart~End 루프 (466-476)
    else inView false
        MS->>VJS: cleanup dispose() → 메모리 회수 (478-485)
    end
    note over MS: deps [video.id, video.videoUrl, inView]
```

### 14.4 활성/비활성 전환 (Effect 2)

```mermaid
sequenceDiagram
    autonumber
    participant DF as DiscoveryFeed(활성감지)
    participant MS as MovieSection.Effect2
    participant VJS as video.js

    DF->>DF: scrollTop/sectionHeight 반올림 → 상단 섹션 (1080-1106)
    alt 광고 카드(data-video-id 없음)
        DF->>DF: activeId=null → 모든 영상 정지
    else 영상 섹션
        DF->>DF: activeId = data-video-id
    end
    note over DF: scrollend + scroll 디바운스 350ms (1109-1118)
    DF->>MS: isActive 전파
    alt isActive=false (491-500)
        MS->>VJS: pause + currentTime(highlightStart) (전체화면 중 예외)
    else isActive=true && playerReady (512-523)
        MS->>VJS: play()
        opt play() 거부
            MS->>VJS: muted 강제 재시도 + seeked/canplay 보강
        end
    end
    MS->>VJS: cleanup: 미발화 seeked/canplay 해제 (524-531)
```

### 14.5 칩 전환

```mermaid
sequenceDiagram
    autonumber
    participant U as 사용자
    participant DF as DiscoveryFeed
    participant E as 초기 effect
    participant RPC as get_home_feed

    U->>DF: 칩 클릭 → setChip(key)
    DF->>DF: chipRef.current = key
    DF->>E: chip 변경 → 초기 effect 재실행 (916-974)
    E->>E: cacheKey = `${uid}:${chip}` 새 키
    alt 새 칩 캐시 히트
        E->>DF: 즉시 복원
    else 미스
        E->>E: state 리셋 → loadMore() 첫 페이지
        E->>RPC: rpc(p_filter:newChip)
        RPC-->>E: rows[]
    end
    note over DF: 진행 중이던 이전 칩 응답은<br/>reqChip !== chipRef.current 로 폐기 (883,901)
```

### 14.6 좋아요 낙관적 업데이트 + 롤백 (전역 LikesContext 경유)

```mermaid
sequenceDiagram
    autonumber
    participant U as 사용자
    participant DF as DiscoveryFeed.toggleLike (1321-1327)
    participant LC as LikesContext(전역 스토어)
    participant SB as video_likes

    U->>DF: 좋아요 탭
    DF->>LC: toggleLikeStore(videoId, base)
    alt 비로그인
        LC-->>DF: "needAuth"
        DF->>U: onSignInClick (로그인 유도)
    else 로그인
        LC->>LC: 낙관적 토글 + 카운트 ±1 (중복방지 포함, 모든 피드 동시 반영)
        alt 새로 좋아요
            LC->>SB: insert(video_id, user_id)
        else 좋아요 해제
            LC->>SB: delete where video_id & user_id
        end
        alt 실패
            SB-->>LC: error
            LC->>LC: 롤백: 토글/카운트 원복
            LC-->>DF: "error" → 토스트(discoveryFeed.likeFailed)
        else 성공
            SB-->>LC: ok (낙관 유지)
        end
    end
```

---

## 15. API / RPC 레퍼런스

### 15.1 RPC / 뷰 조회 표

| 호출 | 인자 | 반환 | 권한 | 정의 위치(file:line) | 호출부(file:line) |
|---|---|---|---|---|---|
| `get_home_feed_order` | `p_filter text='all'` | `SETOF text`(랭킹된 id 전체, LIMIT 없음) | `SECURITY DEFINER`, `GRANT EXECUTE → anon, authenticated` | `home_feed_frozen_order_20260704.sql:19`-`21`(2026-07-12 대표작 규칙 수정본) | `DiscoveryFeed.tsx:1130`(초기), `:1066`(재시도) |
| `get_home_feed_by_ids` | `p_ids text[]` | `SETOF v_home_feed_public`(입력 순서 보존 `array_position`) | `SECURITY DEFINER`, `GRANT EXECUTE → anon, authenticated` | `home_feed_frozen_order_20260704.sql`(§5.1 (b)) | `DiscoveryFeed.tsx:1001`(12개 슬라이스마다) |
| `get_home_feed_count` | `p_filter text='all'` | `integer`(배지 총 건수 — 시리즈는 대표작 1편으로 카운트, order 와 동일 규칙) | `GRANT EXECUTE → anon, authenticated`(현행 칩 버전) | `home_feed_chip_filter_20260611.sql`(2026-07-13 대표작 규칙 동기화 수정본) | `DiscoveryFeed.tsx:1196` |
| `ads_public` 조회 | `.select(...).or("ad_type.eq.feed_display,ad_type.is.null")` | 승인·활성·기간내 광고 행(민감컬럼 제외) | 안전 뷰(budget/spent/owner 비노출, base `ads` 공개 SELECT 제거) | `ads_public_view_20260620.sql:20`-`37` | `DiscoveryFeed.tsx:1051`-`1054` |
| `sendAdEvent("feed_impression")` → Edge `/ad-event` | `{ad_id, type, viewer_key, ...}` | `void`(Edge 가 dedup 후 `increment_ad_impressions`: impressions+1, spent_krw += CEIL(CPM/1000)) | Edge 신뢰IP·auth.uid·IP다양성 가드. raw RPC 는 anon EXECUTE 회수 | `adEvent.ts:11`-`47`; dedup `ad_charge_dedup_phase3_20260614.sql:22`-`48` | `DiscoveryFeed.tsx:1141`(handleAdImpression) |
| `sendAdEvent("feed_click")` → Edge `/ad-event` | `{ad_id, type, viewer_key}` | `void` fire-and-forget — **클릭은 `openAdLinkSafe` 동기 선행 → 집계 후행**(Safari 팝업차단 회피). Edge → `increment_ad_clicks`(clicks+1, dedup) | 동상. 구 1-파라미터 함수 DROP | `adEvent.ts:11`-`47`; dedup `home_security_20260620.sql:50`-`70` | `DiscoveryFeed.tsx:209`-`214`(AdCard), `1808`-`1813`(DesktopAdCard) |
| `video_likes` insert/delete (via `LikesContext`) | `video_id`, `user_id`(insert) | 행 | RLS: 본인 행만 select/insert/delete | `home_security_20260620.sql:24`-`33` | `DiscoveryFeed.tsx:1321`-`1327`(toggleLike → 전역 스토어 경유) |
| `comments` count | `.in(video_id).is(parent_id, null).eq(is_hidden, false)` | rows→클라 카운트(**비블로킹 뒤채움** — 첫 페인트 안 막음) | comments SELECT RLS(숨김은 작성자/관리자/소유자) | `home_security_20260620.sql:90`-`100` | `DiscoveryFeed.tsx:1030`-`1041` |

비고:
- `viewer_key`는 `getViewerSessionKey()`(localStorage). `sendAdEvent`가 Edge 로 전달하고, Edge 내부 dedup 함수가 `COALESCE(auth.uid(), 세션키)` + `date_trunc('hour')` 버킷으로 (광고,뷰어,1시간) 1회 집계(`adEvent.ts:35`; `ad_charge_dedup_phase3_20260614.sql:22`-`48`).
- `get_home_feed_order`의 `all` 필터는 `auth.uid()` 이력 유무로 개인화/폴백 분기(§ 5.2, `home_feed_frozen_order_20260704.sql:55`-`124`).

### 15.2 `mapVideoRow` 필드 매핑 표 — `DiscoveryFeed.tsx:714`-`749`

| `Video` 필드 | DB 뷰 컬럼 | 기본/변환 | 줄 |
|---|---|---|---|
| `id` | `id` | 그대로 | 716 |
| `thumbnail` | `thumbnail` | 그대로 | 717 |
| `title` | `title` | 그대로 | 718 |
| `creator` | `creator` | `\|\| "AI Creator"` | 719 |
| `creatorId` | `creator_id` | `\|\| undefined` | 720 |
| `likes` | `likes` | `\|\| 0` | 721 |
| `price` | `price_standard` | `\|\| 0` | 722 |
| `duration` | `duration` | `\|\| "0:00"` | 723 |
| `durationSeconds` | `duration_seconds` | `\|\| 0`(페이월 게이트용) | 724 |
| `resolution` | `resolution` | `\|\| undefined` | 725 |
| `tool` | `ai_tool` | `\|\| "AI Tool"` | 726 |
| `category` | `category` | `\|\| undefined` | 727 |
| `genre` | `genre` | `\|\| undefined` | 728 |
| `videoUrl` | `video_url` | `\|\| ""` | 729 |
| `age_rating` | `age_rating` | `\|\| "all"` | 730 |
| `description` | `description` | `\|\| undefined` | 731 |
| `tags` | `tags` | 배열이면 그대로 / 문자열이면 콤마 분리 trim filter | 732 |
| `priceStandard` | `price_standard` | `\|\| 0` | 733 |
| `aiModelVersion` | `ai_model_version` | `\|\| undefined`(AI 증빙) | 734 |
| `prompt` | `prompt` | `\|\| undefined`(AI 증빙) | 735 |
| `seed` | `seed` | `\|\| undefined`(AI 증빙) | 736 |
| `director` | `director` | `\|\| undefined` | 737 |
| `writer` | `writer` | `\|\| undefined` | 738 |
| `composer` | `composer` | `\|\| undefined` | 739 |
| `castCredits` | `cast_credits` | `\|\| undefined` | 740 |
| `productionYear` | `production_year` | `\|\| undefined` | 741 |
| `language` | `language` | `\|\| undefined` | 742 |
| `subtitleLanguage` | `subtitle_language` | `\|\| undefined` | 743 |
| `visibility` | `visibility` | `\|\| "public"` | 744 |
| `highlightStart` | `highlight_start` | `\|\| 0` | 745 |
| `highlightEnd` | `highlight_end` | `\|\| (highlightStart+30)` | 746 |
| `seriesId` | `series_id` | `\|\| undefined` | 747 |

---

## 16. 테스트 케이스 (Gherkin)

> 각 시나리오 끝에 매핑되는 § 11 수용 기준을 표기한다.

### 16.1 정상 경로

```gherkin
Feature: 홈 피드 정상 동작

  Scenario: 무한 스크롤로 다음 페이지 로드
    Given 로그인 사용자가 "전체" 칩의 홈 피드를 본다
    And 첫 페이지 12개 영상이 로드되어 있다
    When sentinel(.feed-load-sentinel)이 화면 800px 이내로 들어온다
    Then loadMore가 orderRef.slice(12,24)의 id 로 get_home_feed_by_ids 를 호출한다
    And 새 12개가 array_position 순서 그대로 id 기준 중복 없이 누적된다
    And offsetRef가 24로 갱신된다
    # 수용기준: §11 "무한스크롤: 12개 단위 로드 ... 중복 영상 없음"

  Scenario: 상단 영상만 자동재생
    Given 모바일 세로 피드에서 영상 #1이 상단에 스냅되어 있다
    When 활성 감지가 scrollTop/sectionHeight로 #1을 활성으로 산출한다
    Then #1만 play() 되고 나머지 섹션은 pause + mute 된다
    And #1의 재생은 highlightStart~highlightEnd 구간을 루프한다
    # 수용기준: §11 "상단 영상만 활성·자동재생, 나머지 정지/뮤트"

  Scenario: 좋아요 낙관적 업데이트
    Given 로그인 사용자가 영상 #1을 본다
    When 좋아요 버튼을 탭한다
    Then 전역 LikesContext 스토어에 좋아요 상태와 likes 카운트가 즉시 +1 반영된다 (모든 피드 동시)
    And video_likes에 (video_id, user_id) insert가 발생한다
    # 수용기준: §11 "좋아요 낙관적 업데이트 + 실패 롤백"

  Scenario: 칩 전환으로 필터 변경
    Given 사용자가 "전체" 칩을 보고 있다
    When "🆓 무료시청" 칩을 클릭한다
    Then chip state가 "free"로 바뀌고 초기 effect가 재실행된다
    And get_home_feed_order(p_filter:"free")로 price_standard=0 영상 순서를 확정 후 로드된다
    # 수용기준: §11 "칩 6종 각각 올바른 필터/정렬"

  Scenario: 광고 슬롯 주기 삽입
    Given 모바일 피드에 self-ads가 OFF이고 외부광고 데이터가 있다
    When 피드가 렌더링된다
    Then (i+1)%5==0 위치마다 광고 슬롯이 삽입된다
    And 광고 카드가 50% 보이면 increment_ad_impressions가 1회 호출된다
    # 수용기준: §11 "광고: 모바일 5칸/데스크탑 6칸 주기 삽입" + "노출/클릭 dedup"
```

### 16.2 엣지 케이스

```gherkin
Feature: 홈 피드 엣지 케이스

  Scenario: 칩 전환 race — 이전 칩 응답 폐기
    Given "전체" 칩 loadMore 요청이 in-flight 이다 (reqChip="all")
    When 응답 도착 전에 사용자가 "🔥 인기" 칩으로 바꾼다 (chipRef.current="popular")
    And "전체" 응답이 뒤늦게 도착한다
    Then reqChip("all") !== chipRef.current("popular") 이므로 결과가 폐기된다
    And 댓글 수 병합도 동일하게 폐기된다
    # 수용기준: §11 "칩 전환 직후 이전 칩 응답이 섞이지 않음"

  Scenario: 페이지 경계 중복 영상 dedup
    Given 두 페이지의 경계에 동일 id 영상이 반환될 수 있다
    When 새 페이지가 누적된다
    Then seen Set으로 이미 있는 id는 제외되어 중복 없이 병합된다
    And DB 정렬은 마지막 id 타이브레이커로 페이지 경계가 안정적이다
    # 수용기준: §11 "중복 영상 없음"

  Scenario: 빈 피드
    Given get_home_feed가 0건을 반환한다
    When 로딩이 끝난다 (videos.length === 0)
    Then "표시할 영상이 없습니다." 가 표시된다
    And 광고 데이터가 없으면 빈 광고 슬롯이 만들어지지 않는다
    # 수용기준: §11 "광고 데이터 없으면 빈 슬롯 없음"

  Scenario: 자동재생 실패(네트워크/소스)
    Given 영상 src error code가 2(NETWORK) 또는 4(SRC_NOT_SUPPORTED) 이다
    When 자동재생이 시도된다
    Then 1.5초 후 src 재설정 + 재생을 최대 2회 재시도한다
    And 2회 실패 시 "영상 처리 중..." 오버레이 + 스피너가 표시된다

  Scenario: play() 정책 거부
    Given 브라우저 자동재생 정책이 play()를 거부한다
    When 활성 섹션이 재생을 시도한다
    Then muted를 강제하고 재시도하며 seeked/canplay 이벤트로 보강한다

  Scenario: 캐시 오염 방지
    Given 초기 로딩(loading=true)이 진행 중이다
    When 캐시 저장 시점이 도달한다
    Then loading 중에는 homeFeedCache에 기록하지 않는다
    And 캐시 키는 `${user.id}:${chip}` 로 사용자/필터가 격리된다
    And 캐시 복원 시 좋아요·댓글수는 전역 LikesContext에 seed되어 통일 표시된다
    # 수용기준: §11 "탭 복귀 시 모듈 캐시로 스피너 없이 직전 상태 복원"

  Scenario: 광고 카드가 활성 위치일 때
    Given 모바일에서 광고 카드(data-video-id 없음)가 상단에 스냅된다
    When 활성 감지가 실행된다
    Then activeId=null 이 되어 모든 영상이 정지된다
    # 수용기준: §11 "광고 카드 활성 시 모든 영상 정지"

  Scenario: 위조/잘못된 광고 링크 차단
    Given 광고 link_url이 "javascript:alert(1)" 이다
    When 광고 카드를 클릭한다
    Then openAdLinkSafe가 http(s) 스킴이 아니므로 창을 열지 않는다
    # 수용기준: §11 "외부 광고 링크는 http(s)만 새 탭(noopener) 오픈"

  Scenario: 늦게 도착한 이벤트로 비활성 영상 재생 방지
    Given 사용자가 빠르게 스크롤해 #1이 비활성/언마운트 되었다
    When #1의 seeked/canplay 이벤트가 뒤늦게 발화한다
    Then cleanup으로 리스너가 해제되어 비활성 영상이 소리내지 않는다
    # 수용기준: §11 "±1화면 밖 섹션은 플레이어 dispose"
```

---

## 개정 이력

| 날짜 | 내용 |
|---|---|
| 2026-07-08 | 페이지네이션 "순서 고정(frozen order)" 전환 반영(`get_home_feed_order` + `get_home_feed_by_ids`), 광고 집계 Edge `/ad-event` 경유, 모바일 칩 바 추가 반영 |
| 2026-07-13 | 전수 감사 반영 — 시리즈 대표작·count 동기화·SWR 캐시 등 |
