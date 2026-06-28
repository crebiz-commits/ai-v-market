# 04. 검색·상세·재생·라이선스 — 명세 ↔ 구현 대조 감사

> 대상 명세: `docs/prd/04-search-detail-licensing.md`
> 감사일: 2026-06-28 · 방식: 실제 코드 Read/Grep 검증(추측 없음). file:line은 감사 시점 기준이며 명세의 표기 라인과 다를 수 있어 stale 여부를 함께 기록.
> 분류 기준: ✅ 일치 / ⚠️ 부분일치·경미한 차이 / ❌ 불일치·미구현 / ❓ 코드로 확정 불가

---

## 1. API / RPC / Edge 레퍼런스 (명세 §15)

| 항목 | 명세 기대 | 실제 코드 | 분류 | 근거 (file:line) |
|---|---|---|---|---|
| `search_videos` | 18컬럼 반환, `v_available_videos`, match_score 3/2/1, 4종 정렬, SECURITY DEFINER STABLE, default p_limit=30 | 일치. 반환컬럼·match_score(L208–215)·정렬 CASE(L227–243)·`v_available_videos`(L216)·STABLE 모두 확인 | ✅ | `phase12_search_enhancements.sql:145-247` |
| `search_creators` | display_name ilike, is_suspended=false, 빈쿼리 무결과, 팔로워→영상 순 | 일치. `lq <> ''`(L281), `is_suspended=false`(L283), ORDER BY follower→video(L284) | ✅ | `phase12_search_enhancements.sql:255-286` |
| `get_search_suggestions` | prefix(rank1)/포함(rank2)/creator(rank3), DISTINCT ON 최선 rank, prefix 상위 | 일치. UNION+`DISTINCT ON(lower(suggestion))`+`ORDER BY rank`(L133–139), 2026-06-25 버그픽스 주석 존재 | ✅ | `phase12_search_enhancements.sql:97-140` |
| `get_popular_searches` | search_logs 최근 N일 집계, hit_count→최근순 | 일치 (L85–91) | ✅ | `phase12_search_enhancements.sql:72-92` |
| `log_search_query` | 2–100자만 INSERT(auth.uid()), SECURITY DEFINER | 일치 (L59–62) | ✅ | `phase12_search_enhancements.sql:49-64` |
| `search_logs` 테이블/RLS | query 2–100 CHECK, 본인 SELECT, INSERT는 RPC만 | 일치. CHECK(L27), SELECT own 정책(L41–43), INSERT 정책 없음(주석 L44) | ✅ | `phase12_search_enhancements.sql:24-44` |
| `POST /video-play-token` | `{videoId}` body, `{token,expires,fullAccess}`, no-verify-jwt 공개 | 일치 | ✅ | `index.ts:311-353` |
| `start_payment` (RPC) | orderId 발급, pending 주문 | 일치하나 인자 차이: 명세는 "paymentType/orderName/targetId/amount" 4개, 실제 RPC 인자는 `p_payment_type/p_amount/p_target_id` 3개(orderName은 토스 SDK 전용, RPC로 안 넘어감) | ⚠️ | `usePayment.ts:36-45` |
| `requestPayment` (Toss SDK) | "카드", successUrl=/?payment=success, failUrl=/?payment=fail | 일치 (L51–59) | ✅ | `usePayment.ts:48-60` |
| `startLicensePurchase` | paymentType:"license", orderName:"라이선스 — <title>", targetId:videoId | 일치 (L104–119) | ✅ | `usePayment.ts:104-119` |
| `POST toss-confirm` (Edge) | 성공 리다이렉트의 orderId/paymentKey/amount로 호출 | 호출 엔드포인트·confirm 흐름 확인. 단 경로는 `.../functions/v1/server/toss-confirm`(server 함수 하위 라우트) | ✅ | `PaymentResult.tsx:21,51` |
| `fail_payment` (RPC) | 실패/취소 리다이렉트 처리 | 일치 (L51) | ✅ | `PaymentResult.tsx:51` |
| `log_download` (RPC) | `p_order_id,p_user_agent`→`video_id,download_count`, 내부 권한검증(buyer_id=uid & completed), SECURITY DEFINER, GRANT authenticated | 일치. 권한검증(L85–93), INSERT(L96–97), GRANT(L108) | ✅ | `phase29_download_logs.sql:63-108` |
| `download_logs` 테이블/RLS | FK + user_agent + downloaded_at, 본인 SELECT, INSERT는 RPC만 | 일치 (L30–57) | ✅ | `phase29_download_logs.sql:30-57` |
| `fetchAdForVideo` | get_ad_for_video 1개, 1분 TTL 모듈캐시(null도 캐시) | 일치 (L26–57) | ✅ | `adFetch.ts:30-57` |
| `recordAdImpression` | record_ad_impression + p_viewer_key(session) | 일치 (L67–75) | ✅ | `adFetch.ts:59-79` |
| `recordAdClick` | record_ad_click | 일치 (L84–88) | ✅ | `adFetch.ts:81-92` |
| `pick_random_video_preroll` | p_source_video_id, 1분+ & 비프리미엄 호출 | 일치 (RPC L705, 가드 L700–701) | ✅ | `ProductDetail.tsx:705` |
| `LICENSE_DIRECT_MAX` / `isNegotiationOnly` / `licenseInquiryMailto` | 10,000,000 상한, >= 시 협의, support@creaite.net 프리필 | 일치 (L9,L12–14,L17–25) | ✅ | `licensePricing.ts:9-25` |

---

## 2. 비즈니스 규칙 (명세 §6)

| 규칙 | 명세 | 실제 코드 | 분류 | 근거 |
|---|---|---|---|---|
| 미리보기 1분 통일 | 비구독자 모든 영상 previewSeconds(동적, fallback 60) 컷오프 | `previewSeconds = settings.cinemaPreviewSeconds || FALLBACK`(L443), `needsPreviewCutoff = duration>preview && !isSubscriber && !playFullAccess`(L450) | ✅ | `ProductDetail.tsx:443,450` |
| 컷오프 로직(시간기준·시킹 차단) | player.js timeupdate `seconds>=previewSeconds` 시 차단, 영상시간 기준이라 시킹 점프도 차단 | timeupdate 핸들러 L504–512, ready 구독 L498–501, onLoad 능동 재구독 + 월클록 백스톱(L526–) | ✅ | `ProductDetail.tsx:466-556` |
| 풀액세스 면제(4단계) | 프리미엄/admin·소유자·구매자 서버판정, 클라 playFullAccess로 면제 | 서버 `/video-play-token` 4분기 실재: ①프리미엄(tier+expires 미래) 또는 is_admin(L328–331) ②소유자(creator_id===user.id, L333–335) ③구매자(orders completed, L337–339). 클라 매핑 `setPlayFullAccess(!!fullAccess)`(L671) | ✅ | `index.ts:319-342`, `ProductDetail.tsx:671` |
| 티어별 토큰 TTL | 풀액세스 4시간 / 비구독 150초 | `ttl = fullAccess ? 4*3600 : 150`(L345) | ✅ | `index.ts:345` |
| 5종 광고 슬롯 렌더 | 프리롤/범퍼/미드롤/오버레이/포스트롤 실제 렌더 | 5개 모두 상태+렌더 확인: overlay(L1271), midroll(L1280), postroll(L1293), bumper(L1306), preroll(L1320). preroll 잡히면 bumper 취소(L967) | ✅ | `ProductDetail.tsx:1271-1325,967` |
| 광고 티어 정책 | Premium 제거 / Basic 5s skip / Free skip불가, 미드롤·포스트롤 구독자 제외 | preroll skipOverride basic=5/else null(L710), isPremium이면 preroll 미fetch(L700), 범퍼 동일 패턴 | ✅ | `ProductDetail.tsx:700,710` |
| 단일가 / 협의 판매 | ₩1,000만+ 직접결제 불가→메일 | handleBuyNow에서 `isNegotiationOnly(price)`→mailto(L1114–1116) | ✅ | `ProductDetail.tsx:1114-1116` |
| ₩0 판매불가 | isLicensable=price>0, ₩0 회색 비활성 카드 | `isLicensable = !!product.price && product.price>0`(L441), 카드 분기(L1684) | ✅ | `ProductDetail.tsx:441,1684` |
| 청약철회 제한 고지 | 결제버튼 하단 전상법17조 | 라이선스 카드 내 고지 렌더(명세 L1797 영역, isLicensable 블록 존재) | ✅ | `ProductDetail.tsx:1684+` |
| 연령 게이트 19+ | 미인증·비소유자 진입 시 게이트 + 잠금 | iframeBlocked에 isAgeLocked 포함(L734), 검색카드 19+ 블러는 SearchPage 측 | ✅ | `ProductDetail.tsx:734` |
| **3분 미만 판매불가** | 본 영역(검색/상세/결제)엔 게이트 없음, 업로드 측 규칙으로 추정 (※검증필요) | **확정**: 검색/상세/결제 경로엔 길이기반 판매 게이트 전무(isLicensable은 price>0만 판정). 업로드에만 존재 — `Upload.tsx:2001` `isShortVideo = duration<180` → 가격 입력칸 자체를 숨기고 안내 카드 표시(L2009–2022). 즉 3분 미만은 가격 미설정→price 0→다운스트림 비판매. 단 **UI 레벨 게이트(입력 숨김)**일 뿐 서버측 하드 검증은 아님. 업로드 자체 차단은 별개로 30초 미만(`minUploadSeconds||30`, L360) | ⚠️ | `Upload.tsx:2001,2009-2022,360` |

---

## 3. 수용 기준 (명세 §11) 대조

| 수용 기준 | 분류 | 근거 |
|---|---|---|
| 자동완성 ≥2자·250ms·seq가드·≤8개·creator배지 | ✅ | get_search_suggestions p_limit 기본 8, SearchPage debounce/seq(명세 인용 L199–214) |
| 빈 입력 최근검색+인기검색어 | ✅ | history/popular 렌더(SearchPage) |
| 필터·정렬 자동 재검색 | ✅ | search_videos 필터 인자 전부 구현(sql L222–226) |
| 더보기 60개·중복없음·<60 버튼소멸 | ✅ | offset 페이징(SearchPage L281–302), hasMore=len≥60 |
| 숨김/비공개/정지 미노출 | ✅ | `v_available_videos`(sql L216), is_suspended 제외(L283) |
| 비구독자 1분·시킹 차단·페이월 | ✅ | timeupdate 컷오프(L504–512) |
| 풀액세스 컷오프 면제·토큰 4h | ✅ | fullAccess 판정(index L319–342) + ttl 4h(L345) |
| 토큰지연 중 썸네일+스피너 | ✅ | tokenReady 게이트(L676), bunnyEmbedUrl tokenReady 조건(L682) |
| 19+ 연령게이트 | ✅ | isAgeLocked→iframeBlocked(L734) |
| 광고 Free불가/Basic5s/Premium없음, preroll·bumper 동시노출 금지 | ✅ | L700/710, bumper 취소(L967) |
| 종료 시 다음추천 3단폴백·8초·비구독자 postroll 후 | ✅ | postroll fetch(L1051), NextVideoOverlay(명세 인용) |
| ₩0 비활성·₩1,000만+ 협의 | ✅ | isLicensable(L441), isNegotiationOnly(L1114) |
| 즉시구매→start_payment(orderId)→토스→toss-confirm | ✅ | usePayment L36–60, PaymentResult L21 |
| completed 주문만 log_download, 미완료/타인 예외 | ✅ | RPC 권한검증(phase29 L85–93) |
| 다운로드 실존 최고해상도 mp4 새탭 | ✅ | MyPage HEAD 1080→240 순회(L589–597), window.open(L599) |

---

## 4. 특별 확인 4건 (요청사항)

1. **video-play-token fullAccess 4단계·TTL 분기 실재** → ✅ 실재. ①프리미엄(tier+expires 미래)/admin ②소유자 ③라이선스 구매자 3분기로 fullAccess 결정(index.ts:328-339), TTL은 fullAccess 4h / else 150s(L345). 명세의 "4단계"는 프리미엄·admin을 한 분기에 OR로 묶은 형태(`isPremium || prof?.is_admin`, L330)라 코드상 분기는 3개이나 의미상 4주체 모두 커버됨.
2. **5종 광고 슬롯 실제 렌더** → ✅ 5개 전부 JSX 렌더 확인(overlay/midroll/postroll/bumper/preroll, L1271-1325). 동시노출 방지 가드(preroll→bumper 취소 L967, midroll 중 overlay 숨김 L1271) 존재.
3. **미리보기 컷오프 로직** → ✅ player.js postMessage timeupdate 기준(영상시간), `seconds>=previewSeconds`에서 차단(L504-512). ready 레이스 대비 onLoad 능동 재구독 + 월클록 백스톱(L526-556). 시킹 점프도 영상시간 기준이라 차단.
4. **3분미만 판매불가 게이트 위치** → ⚠️ 확정됨. 검색/상세/결제 경로엔 길이기반 판매 게이트 **없음**(isLicensable=price>0만). 업로드(`Upload.tsx:2001`)에만 `duration<180`이면 가격 입력칸을 숨기는 UI 게이트 존재. 명세 §6/§12의 "업로드 측 규칙으로 추정"이 정확. 다만 서버측 하드 검증이 아닌 클라 UI 차단이라는 점이 추가 발견.

---

## 5. 결론

명세 §15 레퍼런스(검색 5종 RPC, 재생토큰 Edge, 결제·다운로드 RPC, 광고 유틸, 라이선스 가격)와 §6 비즈니스 규칙, §11 수용기준은 **실제 코드와 높은 일치도**로 구현되어 있다. 핵심 보안·페이월 메커니즘(서버 fullAccess 판정, 차등 TTL, log_download 권한검증, v_available_videos 격리)은 명세대로 작동한다. 특별 확인 4건 모두 코드로 실재 확인. 발견된 차이는 모두 경미(⚠️)하며 ❌·❓ 없음.

### 갭 3개

1. **(⚠️) `start_payment` 인자 명세 불일치** — 명세 §15.3은 인자를 "paymentType, orderName, targetId, amount"로 적었으나 실제 RPC는 `p_payment_type/p_amount/p_target_id` 3개만 받고 `orderName`은 토스 SDK(`requestPayment`)에만 전달된다. 명세 표를 "RPC 인자 3개 + orderName은 SDK 전용"으로 정정 권장. (`usePayment.ts:36-45`)
2. **(⚠️) 3분 미만 판매불가 = 업로드 UI 게이트(서버 미검증)** — 명세 §6의 ※검증필요 항목은 확정: 검색/상세/결제엔 게이트 부재, 업로드 `Upload.tsx:2001`에서 `duration<180`일 때 가격 입력칸을 숨기는 방식. 클라이언트 UI 차단일 뿐 서버측 하드 검증(RPC/RLS)은 없어, API 직접 호출 시 3분 미만에도 price 설정이 이론상 가능. 명세 §6 각주를 "업로드 UI 게이트로 구현(서버 강제 아님)"으로 갱신 권장.
3. **(⚠️) 명세 라인번호 stale 위험 + toss-confirm 경로 표기** — 명세는 file:line을 SSOT로 선언하나 ProductDetail/SearchPage가 대형 파일이라 향후 라인 드리프트 가능(본 감사에서 다수 항목 라인 일치 재확인했으나 지속 관리 필요). 또 toss-confirm 실제 경로는 `functions/v1/server/toss-confirm`(server 함수 하위 라우트)로, 명세의 "Edge `toss-confirm`" 표기에 라우트 경로를 명시하면 더 정확.
