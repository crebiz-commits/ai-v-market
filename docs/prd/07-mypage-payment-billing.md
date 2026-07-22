# 07. 마이페이지 · 결제/구독/빌링 — 상세 명세

> 본 문서는 실제 코드를 읽고 `file:line`을 명시해 작성한 심화 명세서입니다. 추측 없이 현행 구현을 기준으로 합니다.
> 주요 대상 파일: `src/app/components/MyPage.tsx`, `PayoutInfoModal.tsx`, `TaxInfoSection.tsx`, `MyPaymentsSection.tsx`, `SubscriptionPage.tsx`, `PaymentResult.tsx`, `BillingResult.tsx`, `src/app/hooks/usePayment.ts`, `supabase/functions/server/index.ts`(Edge), 그리고 다수의 `supabase/*.sql` 마이그레이션.

---

## 1. 개요 / 목적

마이페이지는 사용자(구매자)·크리에이터(판매자) 양쪽 코너를 한 화면에서 제공하는 통합 계정 허브이며, 결제/구독/빌링은 그 안에서 동작하는 수익화 파이프라인이다.

- **마이페이지** (`MyPage.tsx:430`): 모드 선택(`select`/`user`/`creator`, `MyPage.tsx:301-303`, `MyPage.tsx:442-446`) 후 탭 기반 화면을 보여준다. 탭 = 프로필 / 구매내역 / 판매(크리에이터) / 댓글관리 / 시청기록 / 플레이리스트 / 설정 (`MyPage.tsx:1284-1292`).
- **설정 탭**은 레퍼럴 · 알림 · **결제내역 · 세금** · 보안 · 차단관리 · 데이터권리 · 계정삭제를 한곳에 모은다 (`MyPage.tsx:2042-2101`).
- **결제**: 토스페이먼츠 단건 결제(구독/라이선스/광고예산)와 정기 자동결제(빌링키) 두 경로. 클라이언트는 `usePayment.ts`로 토스 SDK를 띄우고, 승인·빌링·환불의 신뢰 경계는 모두 Edge Function(`server/index.ts`)에서 service_role로 처리한다.
- **구독**: 단일 프리미엄 요금제 — **오픈 얼리버드 ₩2,900/월**(정상가 ₩4,900 취소선 표기). 청구가 정본은 `platform_settings.subscription_price_krw`. 무료 광고형 티어는 토스 무관, 프리미엄만 토스 후행(가맹 심사 병목, `CLAUDE.md`).
- **정산/세금**: 크리에이터 정산계좌(`payout_info`)·세금유형(원천징수 3.3%)·환불(청약철회 7일)·관리자 환불·연말 세무 리포트.

목적: 본인 한정 자기서비스(프로필/계좌/세금/결제내역/시청기록/플레이리스트/차단/데이터권리)와 안전한 결제·구독·정산 흐름을 한 번에 제공한다.

---

## 2. 사용자 스토리

- 구매자로서 내 결제 내역을 보고 7일 이내 결제는 환불을 요청하고 싶다.
- 구매자로서 라이선스 구매한 영상을 마이페이지에서 다운로드하고 싶다.
- 사용자로서 프로필(이름/소개/아바타/배너), 이메일(이메일계정 한정), 비밀번호를 바꾸고 싶다.
- 사용자로서 프리미엄을 구독하고, 자동결제를 언제든 해지/재개하고, 만료 임박(D-7) 알림을 받고 싶다.
- 크리에이터로서 정산계좌를 등록/수정하고, 세금유형(비사업자/사업자)을 신고하고, 예상 정산액·수수료를 미리 보고 싶다.
- 사용자로서 시청기록을 보고 개별/전체 삭제하고, 플레이리스트를 관리하고, 특정 사용자를 차단/해제하고 싶다.
- 사용자로서 내 데이터를 JSON으로 내려받고(데이터 이동권), 계정 삭제를 30일 유예로 요청/취소하고 싶다.
- 관리자로서 (별도 어드민 화면에서) 결제를 환불하고 정산을 확정하며 연말 세무 자료를 뽑고 싶다.

---

## 3. 화면 & 상태

### 3.1 마이페이지 진입 / 모드
- 비로그인: 로그인 유도 화면 (`MyPage.tsx:1066-1100`).
- 로딩: 스피너 (`MyPage.tsx:1102-1124`). 재진입 시 모듈 캐시(`myPageCache`, `MyPage.tsx:428`, `MyPage.tsx:784-805`)로 stale-while-revalidate.
- 모드 선택 화면 (`ModeSelectScreen`, `MyPage.tsx:315-378`); 영상 0개로 크리에이터 진입 시 온보딩 안내 (`CreatorOnboardingScreen`, `MyPage.tsx:381-410`, `MyPage.tsx:1138-1140`).
- `isCreator = myProducts.length > 0` (`MyPage.tsx:935`) — 영상 1개 이상이면 크리에이터 탭(판매/댓글) 노출.
- 탭 리스트는 `pageMode`/`isCreator`에 따라 5~6칸으로 구성 (`MyPage.tsx:1281-1316`). 외부 진입(알림 등)은 `initialTab`으로 특정 탭 강제 (`MyPage.tsx:435-441`).

### 3.2 프로필 섹션 (profile 탭)
- 구독 상태 카드: 현재 티어(free/basic/premium) 배지 + 설명 (`tierMeta`, `MyPage.tsx:938-943`, 카드 `MyPage.tsx:1329-1375`). 구독 중이면 만료/다음결제일 표시, D-7 임박 강조 (`MyPage.tsx:1338-1351`). 버튼은 비구독=업그레이드 / 구독=연장 → `onNavigate("subscription")`.
- 계정 정보 카드: 이메일/이름/계정유형(CREATOR 배지) (`MyPage.tsx:1377-1406`).
- 빠른 링크: 멤버십 관리 / 고객센터 / 설정 (`MyPage.tsx:1408-1425`).
- **정산계좌 카드 — 크리에이터에게만** (`MyPage.tsx:1428-1456`): `payoutInfo`(은행·계좌번호) 표시, 등록/변경 버튼 → `PayoutInfoModal`.

### 3.3 정산계좌 모달 (`PayoutInfoModal.tsx`)
- 한국 은행 22종 드롭다운 (`PayoutInfoModal.tsx:17-22`), 계좌번호, 예금주 입력.
- 제출 가능 조건: 은행 선택 + 계좌번호 숫자 6자리 이상 + 예금주 입력 (`PayoutInfoModal.tsx:55-58`). 서버는 **숫자 6~16자리 상·하한** sanity 검증(은행별 자릿수 상이·체크섬 없음, `mypage_input_validation_20260707.sql:111-115`).
- 저장 → `update_my_payout_info` RPC (`PayoutInfoModal.tsx:63-67`), 성공 시 `onSaved()`로 `loadPayoutInfo()` 재조회 (`MyPage.tsx:1155`).

### 3.4 세금 정보 섹션 (`TaxInfoSection.tsx`, 설정 탭)
- 진입 시 `get_my_tax_info`로 로드 (`TaxInfoSection.tsx:63`).
- 세금유형 라디오 4종: individual / business_simple / business_general / business_corp (`TaxInfoSection.tsx:39-44`).
- 사업자 선택 시 추가필드: 사업자등록번호(클라 숫자 10자리 형식검증 `TaxInfoSection.tsx:94-98` + **서버 국세청 체크섬 검증** `is_valid_biz_no`, `mypage_input_validation_20260707.sql:15-40`), 상호, 세금계산서 이메일 (`TaxInfoSection.tsx:189-227`).
- 등록 완료 배지 + `tax_consent_at` 표시 (`TaxInfoSection.tsx:152-159`).
- 저장 → `update_my_tax_info` (`TaxInfoSection.tsx:102-107`).

### 3.5 결제내역 섹션 (`MyPaymentsSection.tsx`, 설정 탭)
- 진입 시 `get_my_payments(p_limit=50, p_offset=0)` (`MyPaymentsSection.tsx:61`).
- 상태 배지 색상 매핑 (`MyPaymentsSection.tsx:36-43`): completed/pending/failed/refunded/cancelled/refund_requested.
- 환불 버튼 활성 조건: `status==='completed' && 결제 후 ≤7일` (`MyPaymentsSection.tsx:147`, 기준일 = `approved_at ?? created_at`, `daysSince` `MyPaymentsSection.tsx:45-48`).
- `refund_requested` 상태는 "검토 중" + 사유 표시, 버튼 비활성 (`MyPaymentsSection.tsx:171-178`).
- 환불 요청 모달: 사유 2자 이상 입력 → `request_refund` (`MyPaymentsSection.tsx:88-112`).

### 3.6 구매내역 섹션 (purchases 탭)
- `orders` 테이블 직접 조회(JOIN videos) (`MyPage.tsx:617-637`). 총지출 합계 표시 (`MyPage.tsx:1463`).
- 다운로드: `log_download` RPC 후 Bunny mp4 해상도 탐색(1080→240p HEAD) 후 새 탭 열기 (`handleDownloadPurchase`, `MyPage.tsx:573-607`).

### 3.7 판매(크리에이터) 섹션 (sales 탭)
- `CreatorDashboard` + 총매출/실정산액(수수료 공제) KPI (`MyPage.tsx:1538-1558`).
- 광고수익 통계(노출/클릭/CTR/예상수익, 분배율 가중평균) (`MyPage.tsx:915-932`, 카드 `MyPage.tsx:1561-1587`).
- 정산 일정(매월 15일 가정) (`MyPage.tsx:1589-1607`), 월별 매출 차트(`MyPage.tsx:1610-1628`), 상품 목록(`MyPage.tsx:1631-1683`).
- 분배정책은 `get_active_platform_settings`로 로드, 미로드 시 기본값(판매 80% / 광고 home50·cinema55·ott60 / CPM 2000 / 정산최소 10000) (`MyPage.tsx:905-910`).

### 3.8 레퍼럴 / 시청기록 / 플레이리스트 / 차단 / 데이터권리 (설정 및 전용 탭)
- 레퍼럴: `ReferralCard` (`MyPage.tsx:2045`).
- 시청기록(history 탭): `get_my_watch_history`/`delete_my_watch_history`(개별/전체) (`MyPage.tsx:807-838`).
- 보관함(playlists 탭, 화면 라벨은 "보관함"): 그리드(카드=커버 썸네일 + 개수 뱃지 + Watch Later 배지) → 카드 클릭 시 **드릴다운 상세**(별도 화면, `activePlaylistId` 기반). Watch Later는 핀고정·삭제 불가 안내.
  - 2026-07-22 추가분: **순서 변경**(상세 행의 위/아래 버튼 → `set_playlist_order`, 낙관적 반영 + 실패 시 서버 재조회), **이름 변경**(카드 연필 → 인라인 입력 → `update_playlist`), **커버 19금 블러**(`preview_age_rating` → `shouldBlur`), **조회 실패/재시도 상태**(빈 상태와 구분), **수량·길이 상한**(100개/500개/60자), 프로필 헤더 "보관함 N" 스탯, 계정 전환 시 state 초기화.
  - 담기(생성 포함) 진입점은 **영상 상세의 북마크 버튼 한 곳**뿐이다(의도된 설계 — 보관함 빈 상태 안내문이 그렇게 유도). 모달 최상단에 **"나중에 보기" 고정 행**(`toggle_watch_later`)이 있어 플레이리스트가 0개여도 저장 가능.
  - ⚠️ 호버 전용 버튼 금지 — 순서/제거/이름변경/삭제 버튼은 `HOVER_REVEAL`(입력장치 기준) 사용. `opacity-0 group-hover:` 로 쓰면 터치 기기에서 영영 못 누른다.
- 차단관리(`BlockedUsersSection`, `MyPage.tsx:213-278`): `get_my_blocked_users` + `unblockUser`.
- **★ 차단 필터 적용 범위 (2026-07-22 결정)** — "차단"은 **추천·탐색에서 안 보이게 하는 것**이지 *내가 저장·기록한 것을 지우는 것*이 아니다.
  - **거는 곳(추천·탐색 표면)**: 홈 피드, 검색 결과·크리에이터·트렌딩·카테고리, 검색 페이지의 **"이어보기"**(`SearchPage.tsx:270`), 커뮤니티, 댓글.
  - **걸지 않는 곳(내 데이터 조회)**: 마이페이지 **기록 탭**, **보관함**(플레이리스트), **구매내역**.
  - 근거: ①보관함은 사용자가 **명시적으로 담은** 항목이라 예고 없이 사라지면 "플레이리스트가 유실됐다"로 읽힌다. ②구매내역은 라이선스 **접근권**이라 가려선 안 된다(재산권). ③기록 탭은 "내가 무엇을 봤나"의 사실 조회다.
  - ⚠️ 검색의 "이어보기"와 마이페이지 기록 탭은 **같은 RPC(`get_my_watch_history`)** 를 쓰지만 목적이 달라 규칙이 다르다(전자=추천, 후자=기록 조회). 감사 시 "같은 데이터인데 한쪽만 필터"를 **버그로 오인하지 말 것** — 의도된 구분이다.
- 데이터 다운로드(`DataDownloadSection`, `MyPage.tsx:27-76`): `export_my_data` → JSON 파일 저장.
- 위험영역 계정삭제(`DangerZoneSection`, `MyPage.tsx:86-210`): `get_my_deletion_status`/`request_account_deletion`/`cancel_account_deletion` (30일 유예).

### 3.9 구독 페이지 (`SubscriptionPage.tsx`)
- Free vs Premium 2카드 비교 (`SubscriptionPage.tsx:144-215`). 프리미엄 카드는 **얼리버드 특가 ₩2,900 + 정상가 ₩4,900 취소선** + 얼리버드 배지/종료예고 표기 (`SubscriptionPage.tsx:173-184`). 표시가=청구가(₩2,900) 일관 — UI·i18n·FAQ·폴백 전수 확인됨(2026-07-13).
- 현재 프리미엄+자동결제 상태/카드 끝4자리/자동결제 ON·OFF 토글 (`get_my_billing`/`set_my_auto_renew`, `SubscriptionPage.tsx:44-80`, `SubscriptionPage.tsx:110-133`).
- 자동결제 동의 체크박스(전자상거래법) 미동의 시 구독 버튼 비활성 (`SubscriptionPage.tsx:179-187`).
- 앱래퍼(리더앱)에서는 IAP 수수료 회피 위해 웹 결제로 유도 (`SubscriptionPage.tsx:56-61`).

### 3.10 결제 결과 화면
- 단건 결제 결과(`PaymentResult.tsx`): `?payment=success|fail`. processing/success/failed 3상태 (`PaymentResult.tsx:27`). 성공 시 `toss-confirm` 호출 후 영수증 메일(fire-and-forget, `PaymentResult.tsx:94-121`). **BillingResult 패턴 이식(2026-07-13)**: `processedRef` 가드 + paymentKey/orderId **URL 즉시 제거**(`PaymentResult.tsx:172-175`), `credsRef` 보관으로 재확인 가능, **세션복원 재시도 `getAccessTokenWithRetry`**(최대 ~2초, `PaymentResult.tsx:46-53`) + 실패 시 **'다시 시도' 버튼**(`canRetry`, 서버 멱등이라 재호출 안전) — 토스 복귀 직후 세션 미복원으로 인한 401 "결제 실패" 오판 해소.
- 자동결제 카드등록 결과(`BillingResult.tsx`): `?billing=success|fail`. 성공 시 `billing-auth-confirm` 호출. 새로고침 이중청구 방지 위해 authKey URL 즉시 제거 + `processedRef` 가드 (`BillingResult.tsx:28-33`, `BillingResult.tsx:53-55`).

---

## 4. 동작 흐름

### 4.1 프로필 편집
1. 편집 버튼 → 모달 오픈, 현재값 prefill (`MyPage.tsx:1230-1245`).
2. 아바타(≤2MB)/배너(≤5MB) 업로드 → Supabase Storage `user-avatars`/`user-banners`, 캐시버스터 `?t=` 부여 (`MyPage.tsx:501-558`).
3. 저장: `auth.updateUser({data:{name}})` + `profiles` upsert(display_name/bio/avatar_url/banner_url) (`MyPage.tsx:1017-1046`).
4. 이메일 변경(이메일계정만, `identities`에 provider==='email' 확인 `MyPage.tsx:985-994`): `auth.updateUser({email})` → 확인메일 링크 클릭 시 확정 (`MyPage.tsx:996-1015`).
5. 비밀번호 변경: 6자 이상·일치 검증 → `auth.updateUser({password})` (`MyPage.tsx:1048-1064`).

### 4.2 정산계좌 등록
모달 입력 → `update_my_payout_info(bank,account,holder)` → 성공 토스트 → `get_my_payout_info` 재조회 → 카드 갱신.

### 4.3 세금 정보
라디오 선택 → (사업자면) 사업자번호 형식검증(클라 10자리) → `update_my_tax_info(...)`가 서버에서 국세청 체크섬까지 검증 → `tax_consent_at` 갱신 → 등록완료 배지.

### 4.4 결제내역 / 환불 요청
1. `get_my_payments` 로드.
2. 환불 버튼 클릭 시 클라이언트에서 7일 초과 선차단 (`MyPaymentsSection.tsx:77-86`).
3. 사유(≥2자) 입력 → `request_refund(p_payment_id, p_reason)` → status `completed`→`refund_requested`.
4. 실제 환불(토스 cancel + 권한 회수)은 관리자가 어드민 화면에서 `refund-payment` Edge → `admin_refund_payment` RPC로 수행. 이미 지급완료(paid)된 월의 라이선스 환불은 **클로백 원장(`settlement_clawbacks`)에 자동 등록**되어 수동 차감을 추적(F3, `settlement_clawbacks_20260711.sql`).

### 4.5 구독 — 자동결제(정기) 흐름 (권장 경로)
1. `SubscriptionPage.subscribe()` → 동의 체크 후 `startAutoBilling({customerKey:user.id, email})` (`SubscriptionPage.tsx:52-72`).
2. `usePayment.startAutoBilling` → `startBillingAuth` → 토스 `requestBillingAuth("카드", {customerKey, successUrl:?billing=success, failUrl:?billing=fail})` (`usePayment.ts:64-78`, `usePayment.ts:139-142`).
3. 토스 카드등록 완료 → `?billing=success&authKey=&customerKey=` 리다이렉트 → `BillingResult` 가 `billing-auth-confirm` 호출.
4. Edge `billing-auth-confirm` (`server/index.ts:1439-1537`): 토큰 인증 → customerKey==user.id 검증 → **결제 게이트**(`payments_enabled`<1이면 503, B-2, `:1452-1461`) → **활성 프리미엄 스킵**(P5, 이미 premium+만료 미도래면 첫 결제 재실행 없이 `idempotent:true` 반환 — 기존 3분 시간창 대체, `:1463-1472`) → authKey로 billingKey 발급(`:1479-1489`) → 금액 정책 조회(폴백 2,900, `:1491-1496`) → **결정적 orderId(`sub_{uid8}_first_{yyyymmdd}`) + `Idempotency-Key` 헤더**로 첫 결제(P3, 동시/재제출 이중청구 차단, `:1498-1509`) → `billing_apply_charge` RPC로 구독 +30일 + billing 저장(`:1514-1519`). **apply 실패 시 토스 청구 자동 취소(void)** 후 재시도 유도(P4, `:1520-1530`).
5. 이후 매월 cron(`billing-run`)이 자동 청구.

### 4.6 자동결제 정기 청구 (cron)
1. pg_cron `billing-run-daily`(매일 02:00 UTC)이 `billing-run` Edge 호출(헤더 `x-cron-secret`) (`billing_cron_20260612.sql:12-22`).
2. Edge `billing-run` (`server/index.ts:1543-1608`): 시크릿 검증 → **만료 1일 전**(`dueBefore`)까지 대상 → `billing_claim_due`로 원자적 claim(FOR UPDATE SKIP LOCKED, next_charge_at 포함 5컬럼 반환) → 각 건 **주기 결정적 orderId(`sub_{uid8}_{next_charge_at 일자}`) + `Idempotency-Key`**로 토스 빌링 청구(P3, 같은 주기 재시도=같은 orderId → 이중청구 차단, `:1563-1572`) → 성공 `billing_apply_charge` / 실패 `billing_mark_failed`. **apply 실패 시 토스 청구 자동 취소(void)** — 다음 cron이 깨끗이 재시도(P4, `:1586-1596`).

### 4.7 자동결제 해지/재개
`SubscriptionPage.setAutoRenew(on)` → `set_my_auto_renew(p_on)` (`SubscriptionPage.tsx:76-82`). OFF=다음 결제일부터 미청구, 현재 구독은 만료일까지 유지. **재개(ON) 시 status='failed'였던 구독은 'active'+fail_count=0으로 복구**되어 다음 스케줄에서 재청구됨(복구 없이는 재개가 무효였던 버그 수정, `set_my_auto_renew_resume_failed_20260710.sql`).

### 4.8 단건 결제 (토스 일반결제) 흐름
1. `usePayment.startTossPayment` → `start_payment(type, amount, target_id)` RPC로 pending 행 + order_id 발급 (`usePayment.ts:29-61`). RPC가 `payments_enabled` 게이트로 결제 생성 자체를 차단(B-2). 빌링 경로는 `startBillingAuth`가 카드창 열기 전 같은 게이트를 **UX용 사전 차단**으로 조회(`usePayment.ts:69-81`, 서버 게이트가 최종 방어선).
2. 토스 `requestPayment("카드", {amount, orderId, successUrl:?payment=success, failUrl:?payment=fail})`.
3. 성공 리다이렉트 → `PaymentResult` 가 paymentKey/orderId URL 즉시 제거 후 `toss-confirm` Edge 호출(**Bearer 필수** — 세션복원 재시도 후 토큰 확보, §3.10).
4. Edge `toss-confirm` (`server/index.ts:1296-1433`): **Bearer 인증 필수**(P2, `:1304-1312`) → payments 조회 → **소유자 바인딩**(payments.user_id==호출자, 유출된 paymentKey로 타인 결제 confirm 차단, `:1335-1339`) → **금액 위변조 검증**(`:1341-1344`) → 멱등(completed면 통과 `:1346-1349`) → pending 상태 가드(`:1351-1353`) → 토스 confirm API(클라값 아닌 **저장금액을 단일 출처**로 전송, M2, `:1355-1365`) → 성공 `confirm_payment` / 실패 `fail_payment`. 토스가 `ALREADY_PROCESSED_PAYMENT`를 반환하면 실패로 뒤집지 않고 **성공으로 수렴**(C1, confirm_payment 멱등이라 안전, `:1370-1378`).
5. 실패 리다이렉트 → `fail_payment` 직접 호출(`PaymentResult.tsx:146-154`).

---

## 5. 데이터 / RPC / Edge 계약

> 별도 표기 없으면 모두 `SECURITY DEFINER`. 본인 한정 RPC는 `auth.uid()` 기준.

### 5.1 결제 코어 RPC
- **`start_payment(p_payment_type TEXT, p_amount INTEGER, p_target_id TEXT DEFAULT NULL) RETURNS TEXT`** — ★ 정본 `payment_amount_standard_only_20260711.sql:22-95` (SECURITY DEFINER, `SET search_path=public`). pending 행 + order_id 발급. **결제 게이트**: `payments_enabled`<1이면 전 결제 생성 차단(B-2, 행 없으면 허용). **서버측 금액검증**: 구독=platform_settings `subscription_price_krw` 일치, 라이선스=**해당 영상의 `price_standard` 단일 일치**(기존 IN(standard/commercial/exclusive)은 저가 tier 위조결제 허용 → 2026-07-11 단일화), 광고예산=`ads.owner_id=uid` 소유 검증. **재구매 차단**: 이미 completed 주문이 있는 영상은 결제 생성 거부(A3). **⚠️ 2026-07-13 `::uuid` 캐스트 버그 수정 — `videos.id`는 TEXT라 캐스트 시 라이선스 결제 시작 전면 실패(42883). 수정본 재적용 필요.** 구버전(재실행 금지): `start_payment_ad_owner_20260624.sql` → `payments_gate_20260708.sql`, 초기 v1 `phase9_payments.sql:92-128`(금액검증 無), v2 `payment_hardening_20260612.sql:10-55`.
- **`confirm_payment(p_order_id TEXT, p_payment_key TEXT, p_method TEXT, p_approved_at TIMESTAMPTZ, p_raw_response JSONB) RETURNS VOID`** — `phase9_payments.sql:143-223`. 멱등(completed면 no-op `:166-169`), pending→completed 가드(`:171-173`). 구독: `subscription_expires_at = GREATEST(COALESCE(expires, now()), now()) + INTERVAL '30 days'`(누적, `:191-202`). 라이선스: orders INSERT(license_type='standard', ON CONFLICT DO NOTHING). 광고: `ads.budget_krw += amount`.
- **`fail_payment(p_order_id TEXT, p_failure_code TEXT, p_failure_reason TEXT) RETURNS VOID`** — `phase9_payments.sql:231-249`. `WHERE order_id=? AND status='pending'`만 갱신(완료건 덮어쓰기 방지).
- **`get_my_payments(p_limit INTEGER=50, p_offset INTEGER=0) RETURNS TABLE(...)`** — 정본 `phase_user_payment_history.sql:48-95`, GRANT `authenticated`(`:97`). 본인 행만 created_at DESC. 반환: id,order_id,payment_type,target_id,amount,method,status,approved_at,created_at,failure_reason,refund_reason,refund_requested_at.
- **`request_refund(p_payment_id BIGINT, p_reason TEXT) RETURNS VOID`** — `phase_user_payment_history.sql:117-174`, GRANT `authenticated`(`:176`). 소유검증, status='completed'만, **7일(청약철회) 초과 차단**(`:155-159`), 사유 2자 이상. → status='refund_requested'.
- **`admin_refund_payment(p_payment_id BIGINT, p_admin_note TEXT=NULL) RETURNS TEXT`** — ★ 정본 `settlement_clawbacks_20260711.sql:134-265`(`assert_admin()` 게이트). completed/refund_requested만, status→'refunded', 권한 회수(구독→free+expires NULL **+ billing_subscriptions auto_renew=false/status='canceled'**, 라이선스 orders→refunded, 광고예산 차감 floor0), `admin_logs` 기록, **확정 정산 겹침 경고 TEXT 반환**(R6). **지급완료(paid) 월 라이선스 환불은 `settlement_clawbacks` 원장에 자동 등록**(F3, 회수액=판매액×분배율 스냅샷, 어드민이 applied/waived 처리; 미지급(pending/deferred) 월은 `calculate_monthly_revenue` 재계산으로 자동 반영). 구버전(재실행 금지): `phase_user_payment_history.sql:184-244` → `refund_cancel_billing_20260614.sql:9-93` → `refund_settlement_reversal_20260703.sql`.
- **`admin_get_all_payments(p_status='all', p_payment_type='all', p_limit=100, p_offset=0)`** — `phase_admin_payments_refund_reason.sql:22-77`(assert_admin, STABLE). refund_reason/refund_requested_at 포함.

### 5.2 정산계좌 / 세금 RPC
- **`get_my_payout_info() RETURNS JSONB`** — `phase_security_hardening_20260531.sql:30-38`, GRANT `authenticated`(`:39`). `SELECT payout_info FROM profiles WHERE id=auth.uid()`. (MyPage `loadPayoutInfo`에서 호출, `MyPage.tsx:452-460`.)
- **`update_my_payout_info(p_bank_name TEXT, p_account_number TEXT, p_account_holder TEXT) RETURNS JSONB`** — ★ 정본 `mypage_input_validation_20260707.sql:88-135`, GRANT `authenticated`. 로그인·은행·예금주 검증 + **계좌번호 숫자 6~16자리 상·하한** sanity(은행별 자릿수 상이·체크섬 없음 → 느슨하게). JSONB로 `profiles.payout_info` 저장(SECURITY DEFINER로 protect 트리거 우회). 구버전 `phase_payout_info.sql:20-66`(하한 6자리만).
- **`get_my_tax_info() RETURNS TABLE(tax_type, business_number, business_name, tax_invoice_email, tax_consent_at)`** — `phase32_tax_withholding.sql:125-152`, GRANT `authenticated`.
- **`update_my_tax_info(p_tax_type TEXT, p_business_number TEXT=NULL, p_business_name TEXT=NULL, p_tax_invoice_email TEXT=NULL) RETURNS VOID`** — ★ 정본 `mypage_input_validation_20260707.sql:43-85`, GRANT `authenticated`. tax_type 4종 검증, business_* 면 사업자번호 필수 + **국세청 체크섬 검증(`is_valid_biz_no`, 가중치 [1,3,7,1,3,7,1,3,5] + 9번째×5 십의자리)** 통과해야 저장, 항상 `tax_consent_at=now()`. 구버전 `phase32_tax_withholding.sql:157-195`(10자리 형식만).
- **`mark_revenue_paid(p_distribution_id BIGINT) RETURNS VOID`** — `phase32_tax_withholding.sql:64-118`(assert_admin). **원천징수**: individual(또는 NULL)이면 `tax_withholding=FLOOR(total*0.033)`, 사업자면 0. `WHERE id=? AND payout_status='pending'`만(멱등). GRANT authenticated이나 내부 assert_admin.
- **`admin_get_tax_annual_report(p_year INTEGER)`**, **`get_revenue_distributions_by_period(p_year, p_month)`** — 관리자 정산/세무용. 후자는 `payout_info`에서 bank/account/holder 추출해 어드민에 노출. ★ 정본 `fix_revenue_period_guard_20260625.sql:15-37`(**`assert_admin()` 가드본** — 무가드 구버전 `phase_settlement_payout_account.sql:21-60` 재실행 금지=전 크리에이터 계좌 유출).

### 5.3 빌링(자동결제) RPC
- **`get_my_billing() RETURNS TABLE(card_company, card_last4, auto_renew, status, amount, next_charge_at)`** — `billing_subscriptions_20260612.sql:36-51`, GRANT `authenticated`. **billing_key/customer_key 의도적 제외**.
- **`set_my_auto_renew(p_on BOOLEAN) RETURNS void`** — ★ 정본 `set_my_auto_renew_resume_failed_20260710.sql:15-30`, GRANT `authenticated`. **재개(true) 시 status='failed'면 'active'+fail_count=0 복구**(스케줄러가 `auto_renew AND status='active'`만 청구 → 복구 없이는 재개 무효). 구버전 `billing_subscriptions_20260612.sql:54-65`.
- **`billing_apply_charge(p_user_id, p_billing_key, p_customer_key, p_card_company, p_card_last4, p_amount, p_order_id, p_payment_key, p_approved_at, p_raw) RETURNS void`** — ★ 정본 `billing_idempotency_20260705.sql:42-81`, GRANT **service_role 한정**. 멱등(order_id completed면 RETURN), payments INSERT(ON CONFLICT DO NOTHING), 구독 +30일 GREATEST, billing_subscriptions upsert(next_charge_at=신규만료, fail_count=0, **charging_at=NULL 명시 초기화=락 즉시 해제**). 구버전 `billing_charge_rpcs_20260612.sql:8-68`.
- **`billing_mark_failed(p_user_id, p_reason) RETURNS void`** — ★ 정본 `billing_idempotency_20260705.sql:84-107`, GRANT **service_role**. fail_count+1, **3회 이상 시 status='failed' + auto_renew=false**, **next_charge_at=+3days 백오프**(P10, 기존 +1day는 24h due 윈도우와 겹쳐 매일 재시도), charging_at=NULL(락 해제). 구버전 `billing_charge_rpcs_20260612.sql:71-92`.
- **`billing_claim_due(p_limit=200, p_due_before=now()) RETURNS TABLE(user_id, billing_key, customer_key, amount, next_charge_at)`** — ★ 정본 `billing_idempotency_20260705.sql:17-39`(**5컬럼 — next_charge_at 추가**로 주기 결정적 orderId 생성 지원, 반환타입 변경이라 DROP 후 재생성), **REVOKE PUBLIC/anon/authenticated + GRANT service_role**. `charging_at` 갱신으로 원자 claim, `FOR UPDATE SKIP LOCKED`, 15분 staleness 자동복구. billing_key를 반환하는 유일한 경로(Edge 전용). 구버전 `billing_claim_due_20260616.sql:14-33`(4컬럼).

### 5.4 시청기록 / 플레이리스트 / 차단 / 데이터권리 RPC
- 시청기록: `get_my_watch_history(p_limit=50, p_offset=0)`(`phase17_watch_history.sql:7-70`, DISTINCT ON video_id 최신, 삭제·숨김 영상 제외), `delete_my_watch_history(p_video_id TEXT=NULL) RETURNS INTEGER`(`:78-102`, NULL=전체삭제).
- 보관함(플레이리스트) — ⚠️ **RPC 본문 정본이 `phase18_playlists.sql` 이 아니다**(2026-07-22 감사로 4개 파일에 분산 이관). phase18 헤더에 `⛔ 재실행 금지 — 부분 정본` 경고가 붙어 있으니 **이 문서만 보고 phase18 을 재실행하지 말 것**(시리즈 2화+ 증발·19금 커버 무블러·소유자 미검증 UPDATE 회귀).
  - `get_my_playlists()` → **`playlist_cover_age_rating_20260722.sql`** (Watch Later 핀고정, 커버 19금 판정용 `preview_age_rating` 반환, 개수·커버가 목록과 **같은 노출가능 필터**)
  - `get_playlist_videos(uuid)` · `remove_from_playlist` · `toggle_watch_later` → **`playlist_hardening_20260722.sql`** (소유검증, 피드뷰 대신 videos 직접 조인 = 시리즈 대표작 접힘 미적용, `resolve_display_name` 표시이름)
  - `create_playlist` · `set_playlist_order(uuid, TEXT[])` → **`playlist_limits_reorder_20260722.sql`** (사용자당 100개·리스트당 500개·이름 60자 상한 / 순서 재배열)
  - `add_to_playlist` · `update_playlist` · `delete_playlist`(**Watch Later 삭제 불가**) · `get_playlist_memberships` → **`playlist_audit2_20260722.sql`** (담기 시 노출가능 검증, 이름 60자 상한 + Watch Later 이름변경 차단 + 설명 보존)
  - 테이블 · 인덱스 · RLS(본인 소유만)만 `phase18_playlists.sql` 이 정본.
  - 적용 상태 점검 `_verify_playlist_applied_20260722.sql` / 런타임 동작 검증 `_runtime_playlist_behavior_20260722.sql`.
- 차단: `get_my_blocked_users()`(`phase24_user_blocks.sql:87-104`), `block_user`/`unblock_user`(`:44-82`), `get_my_blocked_user_ids() RETURNS UUID[]`(클라 필터용 `:109-119`). 뷰어측 차단(필터 client-side).
- 데이터권리: `export_my_data() RETURNS JSONB`(16개 데이터 섹션, `phase27_user_data_rights.sql:134-189`), `request_account_deletion(p_reason=NULL)`/`cancel_account_deletion()`/`get_my_deletion_status()`(30일, `:35-220`), `purge_pending_deletions(p_days=30)`(어드민/cron, profiles만 삭제 — auth.users는 Edge가 처리).

### 5.5 Edge Function 계약 (`supabase/functions/server/index.ts`)
- **`POST /toss-confirm`** (`:1296`): body `{orderId, paymentKey, amount}`. **인증: Bearer 필수(P2)** — 토큰 인증 후 **소유자 바인딩**(payments.user_id==호출자 아니면 403). service_role로 payments 조회→금액검증(토스 confirm은 저장금액 단일 출처, M2)→토스 confirm→`confirm_payment`/`fail_payment`. 토스 `ALREADY_PROCESSED_PAYMENT`는 성공으로 수렴(C1). [기록] 클라 `PaymentResult`는 2026-07-13 세션복원 재시도(`getAccessTokenWithRetry`)+`credsRef`+'다시 시도' 버튼 추가됨(BillingResult 패턴 이식) — 토스 복귀 직후 401 오판 해소.
- **`POST /billing-auth-confirm`** (`:1439`): Bearer 인증 필수, body `{authKey, customerKey}`, customerKey==user.id. `payments_enabled` 게이트(B-2) → **활성 프리미엄 스킵(P5, 3분 시간창 대체)** → billingKey 발급 → **결정적 orderId+`Idempotency-Key`로 첫결제(P3)** → `billing_apply_charge`. apply 실패 시 토스 청구 자동 취소(void, P4).
- **`POST /billing-run`** (`:1543`): 헤더 `x-cron-secret` 검증(cron 전용). `billing_claim_due`(5컬럼)→주기 결정적 orderId+`Idempotency-Key`로 토스 빌링 청구(P3)→apply/mark_failed. apply 실패 시 토스 청구 자동 취소(void, P4).
- **`POST /refund-payment`** (`:2353`): Bearer(어드민) 인증 + `profiles.is_admin` 확인(`:2370-2377`). payments.payment_key로 토스 cancel→`admin_refund_payment`(어드민 토큰 클라이언트로 assert_admin 통과, `:2436-2446`). 정산겹침 경고/메일발송용 정보 반환.
- **`POST /purge-deletions`** (`:1619`): `x-cron-secret` 검증. 30일+ 경과 삭제요청자 `auth.admin.deleteUser`(CASCADE 파기).
- 모든 server Edge는 공개 엔드포인트 포함 → `--no-verify-jwt` 배포(`CLAUDE.md`, `supabase/config.toml`).

---

## 6. 비즈니스 규칙

- **구독가/티어**: 프리미엄 **오픈 얼리버드 ₩2,900/월**(정상가 ₩4,900 취소선 표기, 단일 요금제). 가격 정본은 `platform_settings.subscription_price_krw`(클라/Edge 모두 조회, `usePayment.ts:96-105`, `server/index.ts:1491-1496`) — **폴백도 실청구가와 같은 2,900**(설정 조회 실패 시 과청구 방지). 표시=청구 일관: UI·i18n·FAQ·폴백 전수 확인됨(2026-07-13). 가격 변경/얼리버드 종료 시 여러 곳 하드코딩 전부 손대야 함(MEMORY `subscription-early-bird-pricing`). 티어 free/basic/premium(`MyPage.tsx:938-942`).
- **결제 게이트(payments_enabled)**: 토스 live 키 전환 전에는 `start_payment`·`billing-auth-confirm`이 서버 단에서 결제 생성/첫 청구를 차단(B-2, 행 없으면 허용). 클라 `startBillingAuth`는 카드창 열기 전 같은 게이트를 UX용으로 사전 조회(`usePayment.ts:69-81`).
- **구독 갱신(누적)**: 결제 시 만료일 = `GREATEST(기존만료, now()) + 30일` — 남은 기간을 깎지 않고 누적(`confirm_payment` / `billing_apply_charge`).
- **만료 강등**: `reset_expired_subscriptions`(cron 03:00) premium→free(`payment_hardening_20260612.sql:58-69`). 환불 시도 즉시 강등.
- **청약철회 7일**: `request_refund`가 `approved_at ?? created_at` 기준 7일 초과 차단(전자상거래법). 클라이언트도 선차단.
- **원천징수 3.3%**: 비사업자(individual/미등록)는 정산 확정 시 `tax_withholding=FLOOR(total*0.033)`, 사업자(business_*)는 0(세금계산서 별도). `mark_revenue_paid`.
- **정산 최소액**: 화면 가이드 표기 ₩10,000(`PAYOUT_MIN_KRW`, `MyPage.tsx:910`, 표기 `:1702`) — platform_settings `payout_minimum_krw` 기반. **정산 RPC에서도 강제됨**: 누적액이 최소액 미만이면 `payout_status='deferred'`로 이월(`phase8_revenue_distributions.sql:251-253`).
- **분배율**: 판매 80% / 광고 home50·cinema55·ott60(기본값, platform_settings로 변경, `MyPage.tsx:905-909`).
- **협의 판매(라이선스)**: 가격은 **영상별 `price_standard` 단일 일치**여야 결제 성립(`start_payment` 검증, 2026-07-11 IN 3종→단일화로 저가 위조결제 차단). 이미 구매한 영상은 재구매 차단(A3).
- **멱등성**: 단건=order_id UNIQUE + confirm_payment completed no-op + toss-confirm completed 통과 + **ALREADY_PROCESSED 성공 수렴**(C1) + PaymentResult `processedRef`/URL 즉시 제거. 빌링=order_id completed RETURN + **활성 프리미엄 스킵(P5)** + **결정적 orderId+토스 `Idempotency-Key`(P3)** + BillingResult `processedRef`/authKey 제거.
- **빌링키 미노출**: `billing_subscriptions` RLS 정책 없음 + `REVOKE ALL FROM anon, authenticated`(`billing_subscriptions_20260612.sql:30-33`). `get_my_billing`은 카드사·끝4자리만 반환. billing_key는 service_role(`billing_claim_due`/`billing_apply_charge`)만 접근.

---

## 7. 엣지 케이스 & 에러 처리

- **결제 중복 확정**: toss-confirm이 completed면 `alreadyProcessed:true`로 통과(`server/index.ts:1346-1349`); 토스 측 `ALREADY_PROCESSED_PAYMENT`(동시 confirm 레이스)도 실패로 뒤집지 않고 성공 수렴(`:1370-1378`); confirm_payment도 no-op. 클라도 PaymentResult `processedRef`+URL 즉시 제거로 재confirm 차단.
- **타인 결제 confirm 시도**: toss-confirm Bearer 필수 + 소유자 바인딩 — paymentKey/orderId가 URL로 유출돼도 본인 아니면 403(`:1335-1339`).
- **토스 복귀 직후 세션 미복원(401 오판)**: PaymentResult가 `getAccessTokenWithRetry`(최대 ~2초)로 토큰 확보 후 호출, 실패 시 "결제는 안전" 안내 + '다시 시도' 버튼(서버 멱등이라 재호출 안전, 2026-07-13).
- **금액 위변조**: payments.amount ≠ 토스 amount면 400 차단(`:1341-1344`); start_payment 단계에서도 서버 금액검증(라이선스=price_standard 단일).
- **잘못된 상태**: pending 아닌 건 confirm 거부(`:1351-1353`), fail_payment는 pending만 갱신.
- **DB 갱신 실패(토스만 성공)**: 단건 toss-confirm은 500 + 고객센터 안내 유지(`:1401-1409`); **빌링 경로(billing-auth-confirm/billing-run)는 토스 청구 자동 취소(void) 후 재시도 유도**(P4, "돈만 나가고 미부여" 방지, `:1520-1530`, `:1586-1596`); refund-payment는 `toss_canceled:true` + 운영팀 알림 안내(`:2448-2457`).
- **환불 상태머신**: completed→refund_requested(사용자)→refunded(관리자). refund_requested/refunded 재요청 시 구분 메시지(`phase_user_payment_history.sql:146-152`). 환불 후 빌링 auto_renew=false/canceled로 cron 재청구 차단.
- **빌링 동시청구**: `billing_claim_due`의 `FOR UPDATE SKIP LOCKED` + charging_at 15분 창 + **주기 결정적 orderId·`Idempotency-Key`**(P3, "토스 성공+apply 실패/크래시" 재시도가 같은 orderId라 같은 달 이중과금 불가)로 cron 중복 실행 시 이중청구 방지.
- **빌링 연속 실패**: 3회 누적 시 자동결제 중단(auto_renew=false), 사용자 알림(`billing_mark_failed`). 재시도 백오프 **+3days**(P10). 사용자가 재개하면 `set_my_auto_renew(true)`가 failed→active 복구해 재청구 재개.
- **다운로드**: Bunny 해상도별 HEAD 탐색 실패 시 "인코딩 처리 중" 안내(`MyPage.tsx:598`).
- **부분 데이터 로드**: 각 쿼리 독립 try/catch, 개별 테이블 누락은 console.warn만(빈 화면 대신 부분표시, `MyPage.tsx:609-780`).
- **잘못된 결제 결과 진입**: success/fail 외 outcome은 실패 처리(`PaymentResult.tsx:138-141`).
- **고객센터**: 결제/환불 문의 → 1:1 문의 또는 support@creaite.net(`SubscriptionPage.tsx:206`).

---

## 8. 권한 / 보안

- **본인 한정**: get_my_*/update_my_*/request_refund 등은 `auth.uid()` 기반, GRANT `authenticated`. 결제내역·계좌·세금·시청기록·플레이리스트·차단·데이터 모두 본인 것만 반환/수정.
- **protect_subscription_columns 트리거**: 일반 세션의 `profiles` 직접 UPDATE에서 보호컬럼 8개(subscription_tier/started_at/expires_at, **payout_info**, **is_admin**, referral_code/referred_by/referral_count)를 OLD로 되돌림(`fix_protect_is_admin_20260624.sql:13-35`). is_admin 포함 필수(누락=권한상승 회귀, MEMORY `protect-trigger-shared-ssot`). payout_info 갱신은 SECURITY DEFINER RPC(`update_my_payout_info`)로만.
- **confirm/billing은 service_role**: toss-confirm/billing-run은 service_role 클라이언트(`getSupabaseClient(true)`)로 RLS 우회 + DEFINER RPC 호출. **toss-confirm은 처리 전 호출자 Bearer 인증 + 소유자 바인딩 필수**(P2). billing_apply_charge/mark_failed/claim_due는 GRANT service_role 한정.
- **is_admin 환불**: refund-payment Edge가 토큰→`profiles.is_admin` 확인 후만 진행(`server/index.ts:2370-2377`), RPC도 `assert_admin()`.
- **계좌 PII**: 클라이언트는 본인 `get_my_payout_info`만. 타 사용자 계좌는 관리자 정산 RPC(`get_revenue_distributions_by_period`)로만 노출. billing_key/customer_key는 어떤 클라 경로로도 미노출.
- **cron 비밀**: billing-run/purge-deletions는 `x-cron-secret`(BILLING_CRON_SECRET)로 보호.

---

## 9. 분석 / 이벤트

- **결제 전환**: start_payment(pending) 대비 confirm_payment(completed) 비율, 24시간 미승인 자동 failed(`cleanup_stale_payments`, pg_cron `cleanup-stale-payments` **매일 02:30**, `payment_hardening_20260612.sql:87`)로 이탈 추적 가능.
- **구독 지표**: get_my_billing/billing_subscriptions(status, fail_count, next_charge_at)로 활성/실패/해지(auto_renew) 코호트.
- **환불율**: payments.status 분포(refund_requested/refunded) + admin_logs `refund_payment` 기록(was_user_requested 플래그).
- **영수증 메일**: 결제 성공 시 `subscription_receipt` 알림 발송(`PaymentResult.tsx:113-125`).
- **크리에이터 수익**: 광고 노출/클릭/CTR/예상수익, 월별 매출 차트(sales 탭).
- (전용 GA/이벤트 트래커 코드는 본 범위 파일에서 미확인 — 지표는 DB 상태 기반.)

---

## 10. 수용 기준 (체크리스트)

- [ ] 비크리에이터는 정산계좌 카드/판매 탭이 보이지 않고, 영상 1개 등록 시 노출된다.
- [ ] 정산계좌 저장 시 6자리 미만·16자리 초과 계좌번호/빈 은행/빈 예금주는 거부된다.
- [ ] 세금유형 사업자 선택 시 사업자번호 10자리 + 서버 국세청 체크섬 검증을 통과해야 저장된다.
- [ ] 결제내역에서 7일 초과 결제는 환불 버튼이 보이지 않거나 클릭 시 차단된다.
- [ ] 환불 요청 시 status가 refund_requested로 바뀌고 "검토 중" 배지가 뜬다.
- [ ] 구독 결제 성공 시 만료일이 기존 만료일에 +30일 누적된다(깎이지 않음).
- [ ] 자동결제 ON 상태에서 만료 1일 전 cron이 자동 청구하고, OFF면 만료일까지만 유지된다.
- [ ] 동일 order_id 재확정(새로고침 포함)으로 이중 청구/이중 권한부여가 발생하지 않는다.
- [ ] Bearer 토큰 없이 또는 타인 토큰으로 toss-confirm 호출 시 401/403이다.
- [ ] 활성 프리미엄 상태에서 카드 재등록(billing-auth-confirm) 시 첫 결제가 재실행되지 않는다(idempotent 응답).
- [ ] 구독 페이지·결제창·청구 금액이 모두 얼리버드 ₩2,900으로 일치한다(정상가 ₩4,900은 취소선 표기만).
- [ ] 빌링 연속 3회 실패 시 자동결제가 중단되고 사용자 알림이 가며, 재개 시 failed 구독이 active로 복구된다.
- [ ] 클라이언트 어떤 경로로도 billing_key/customer_key가 반환되지 않는다(get_my_billing은 끝4자리만).
- [ ] 일반 사용자가 profiles 직접 UPDATE로 subscription_tier/is_admin/payout_info를 바꿀 수 없다(트리거 되돌림).
- [ ] 비관리자 토큰으로 refund-payment 호출 시 403.
- [ ] 정산 확정 시 비사업자는 3.3% 원천징수, 사업자는 0이 기록된다.
- [ ] 데이터 다운로드가 16개 섹션 JSON을 생성한다.
- [ ] 계정 삭제 요청 후 30일 유예 표시, 취소 가능, 미취소 시 cron 파기된다.

---

## 11. 알려진 제약 / 이월

- **토스 가맹 심사 병목**: 프리미엄 구독·라이선스 결제는 토스페이먼츠 가맹 심사(1~2개월) 후행. 무료 광고형 티어는 토스 무관 선출시 가능(`CLAUDE.md`).
- **PG 종속**: 빌링이 토스 기반. PG 변경(이니시스 등)은 빌링 재개발 비용 큼 → 토스 반려 시에만 검토(`CLAUDE.md`).
- **앱(IAP) 회피**: 앱래퍼에서는 구독을 웹(creaite.net)으로 유도(`SubscriptionPage.tsx:56-61`). iOS는 베타 후.
- **2FA 미구현**: 보안 섹션에 "준비 중" 버튼 비노출(`MyPage.tsx:2070`).
- **정산 최소액 강제 (확인됨 2026-06-28)**: 화면 가이드(₩10,000)뿐 아니라 정산 RPC도 강제 — 미달 시 `payout_status='deferred'`로 이월(`phase8_revenue_distributions.sql:251-253`), `v_payout_min`은 platform_settings 기반.
- **basic 티어**: tierMeta에 정의되어 있으나 현재 요금제는 free/premium 2단(`SubscriptionPage.tsx`). basic 활성 경로 미구현.
- **search_path 누락**: phase17/phase18 RPC 일부에 `SET search_path` 미지정(타 마이그레이션은 명시) — 하드닝 보강 후보.
- **정리 후보(죽은 코드, 2026-07-13 기록)**: ① i18n 키 `subscriptionModal.tierBasicPrice`(월 ₩2,900)/`tierPremiumPrice`(월 ₩9,900)는 어디서도 참조되지 않는 죽은 키 — 현행 요금제(얼리버드 ₩2,900 단일)와 불일치한 잔재라 오인 위험. ② `MyPage.tsx`의 `SubscriptionModal`(`MyPage.tsx:1230-1235`)은 `showSubscribe`를 true로 만드는 경로가 없어 **열 수 없는 죽은 코드**.
- **2026-06-16 교훈**(MEMORY): 외부·지역 사실(수수료·세율·정책)은 단정 금지, 최신값 검증 우선.

---

## 와이어프레임 (텍스트 목업)

### 마이페이지 — 프로필 탭 (`MyPage.tsx:1329-1456`)

```
┌──────────────────────────────────────────────────────────────┐
│  [배너 이미지]                                        [프로필 편집]│
│   (●아바타)  홍길동  creator@creaite.net   [CREATOR]            │
├──────────────────────────────────────────────────────────────┤
│  ┌── 구독 상태 ─────────────────────────────────────────────┐ │
│  │ [PREMIUM] 프리미엄 회원                                    │ │
│  │ 다음 결제일: 2026-07-25  (만료까지 27일)                   │ │
│  │ ⚠ 만료 임박 (D-7 이내일 때 강조)                          │ │
│  │                                    [ 구독 연장/관리 → ]   │ │
│  └──────────────────────────────────────────────────────────┘ │
│  ┌── 계정 정보 ───────────┐  ┌── 빠른 링크 ─────────────────┐ │
│  │ 이메일  creator@…       │  │ ▸ 멤버십 관리                │ │
│  │ 이름    홍길동          │  │ ▸ 고객센터                   │ │
│  │ 유형    [CREATOR]       │  │ ▸ 설정                       │ │
│  └────────────────────────┘  └──────────────────────────────┘ │
│  ┌── 정산 계좌 (크리에이터 전용) ───────────────────────────┐ │
│  │ 국민은행  123456-**-****  홍길동                          │ │
│  │                                  [ 등록/변경 → 모달 ]    │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
탭: [프로필][구매내역][판매][댓글관리][시청기록][플레이리스트][설정]
```

### 정산 계좌 모달 (`PayoutInfoModal.tsx`)

```
┌──────────── 정산 계좌 등록 ─────────────┐
│  은행        [ 국민은행        ▼ ]      │  ← 22종 드롭다운
│  계좌번호    [ 12345678901      ]       │  ← 숫자 6자리 이상
│  예금주      [ 홍길동           ]       │
│  ──────────────────────────────────────│
│  ⓘ 정산은 매월 15일, 최소 ₩10,000부터  │
│              [ 취소 ]   [ 저장 ]        │  ← 조건 미충족 시 비활성
└─────────────────────────────────────────┘
```

### 세금 정보 섹션 (`TaxInfoSection.tsx`, 설정 탭)

```
┌──────────── 세금 정보 ────────────────────────────┐
│ 세금 유형                                          │
│  (◉) 비사업자 (원천징수 3.3%)                      │
│  ( ) 간이과세 사업자                               │
│  ( ) 일반과세 사업자                               │
│  ( ) 법인 사업자                                   │
│ ─ 사업자 선택 시 펼침 ────────────────────────────│
│  사업자등록번호 [ 123-45-67890 ]  ← 숫자 10자리    │
│  상호           [ (주)크레비즈   ]                 │
│  세금계산서 이메일 [ tax@…        ]                │
│ ──────────────────────────────────────────────────│
│  [✓ 등록 완료]  동의일 2026-06-01    [ 저장 ]      │
└────────────────────────────────────────────────────┘
```

### 결제 내역 섹션 (`MyPaymentsSection.tsx`, 설정 탭)

```
┌──────────── 결제 내역 ─────────────────────────────────────┐
│ 2026-06-20  프리미엄 구독   ₩4,900  [완료]    [환불 요청]   │ ← ≤7일
│ 2026-06-10  라이선스 구매   ₩50,000 [완료]    (7일 초과,    │
│                                                버튼 없음)   │
│ 2026-06-18  광고 예산 충전  ₩30,000 [검토 중] 사유: 단순변심│ ← refund_requested
│ 2026-05-30  프리미엄 구독   ₩4,900  [환불됨]                │
│ 2026-05-12  라이선스 구매   ₩20,000 [실패]   사유: 한도초과 │
└────────────────────────────────────────────────────────────┘
배지색: 완료=초록 대기=노랑 실패=빨강 환불됨=회색 검토중=주황
```

### 레퍼럴 / 시청기록 / 플레이리스트 / 차단 (설정 및 전용 탭)

```
[설정 탭]                          [시청기록 탭]
┌── 레퍼럴 카드 ──────────┐        ┌──────────────────────────┐
│ 내 추천코드  CR-AB12      │        │ 영상A  2026-06-24  [삭제] │
│ 가입 3명 · 적립 ₩X        │        │ 영상B  2026-06-23  [삭제] │
│ [코드 복사] [공유]        │        │            [ 전체 삭제 ] │
└──────────────────────────┘        └──────────────────────────┘
[플레이리스트 탭]                   [차단 관리 (설정 탭)]
┌──────────────────────────┐        ┌──────────────────────────┐
│ 📌 나중에 볼 영상 (삭제X)  │        │ user_xyz       [차단해제] │
│ 내 모음집 1     [삭제]     │        │ user_abc       [차단해제] │
│  └ 영상 목록 [개별 제거]   │        └──────────────────────────┘
└──────────────────────────┘
```

### 구독 페이지 (`SubscriptionPage.tsx`)

```
┌──────────────── 멤버십 ────────────────┐
│ ┌── FREE ──────┐   ┌── PREMIUM ──────┐ │
│ │ ₩0           │   │ [얼리버드 특가]  │ │
│ │              │   │ ~₩4,900~ ₩2,900/월│ │  ← 정상가 취소선
│ │ • 광고 시청   │   │ • 광고 없음      │ │
│ │ • 기본 화질   │   │ • 시네마/OTT 무제한│ │
│ │              │   │ • 고화질         │ │
│ │  [현재 등급]  │   │ [✓] 자동결제 동의 │ │  ← 미동의 시 버튼 비활성
│ │              │   │ [ 구독하기 ]     │ │
│ └──────────────┘   └─────────────────┘ │
│ ── 현재 자동결제 상태 (프리미엄 회원) ──│
│  카드  국민카드 ****1234                 │
│  자동결제  [ ON ●——○ OFF ]  토글        │
│  다음 결제  2026-07-25                   │
│  문의: support@creaite.net               │
└──────────────────────────────────────────┘
```

### 결제 결과 화면 (`PaymentResult.tsx` / `BillingResult.tsx`)

```
[단건 결제 ?payment=success]        [실패 ?payment=fail]
┌──────────────────────────┐        ┌──────────────────────────┐
│   ⏳ 결제 확인 중…         │        │   ❌ 결제 실패            │
│   (toss-confirm 호출)      │        │   사유: 카드 한도 초과    │
│        ↓                   │        │   [ 다시 시도 ] [ 홈 ]   │
│   ✅ 결제 완료!            │        └──────────────────────────┘
│   프리미엄 활성화 (30일)   │
│   영수증 메일 발송됨        │        [자동결제 카드등록 ?billing=success]
│   [ 마이페이지 ] [ 홈 ]   │        │ ⏳ 카드 등록 처리 중…     │
└──────────────────────────┘        │ (billing-auth-confirm,    │
                                     │  authKey URL 즉시 제거)   │
                                     │ ✅ 자동결제 등록 완료     │
```

---

## 시퀀스 다이어그램

### 단건 결제 (start_payment → 토스 → toss-confirm → confirm_payment, 멱등)

```mermaid
sequenceDiagram
    autonumber
    participant U as 사용자
    participant C as Client (usePayment.ts)
    participant DB as Supabase RPC
    participant T as 토스 SDK/API
    participant E as Edge toss-confirm
    U->>C: 결제 클릭 (구독/라이선스/광고)
    C->>DB: start_payment(type, amount, target_id)
    Note over DB: 서버측 금액검증<br/>pending 행 + order_id 발급
    DB-->>C: order_id
    C->>T: requestPayment(카드, {amount, orderId, successUrl, failUrl})
    T-->>U: 토스 결제창
    U->>T: 카드 인증/승인
    T-->>C: redirect ?payment=success&paymentKey&orderId&amount
    Note over C: PaymentResult: paymentKey/orderId URL 즉시 제거<br/>+ processedRef 가드 + credsRef 보관<br/>세션복원 재시도(getAccessTokenWithRetry) 후 호출
    C->>E: POST /toss-confirm {orderId, paymentKey, amount} (Bearer 필수)
    E->>E: Bearer 토큰 인증 (없으면 401)
    E->>DB: payments 조회 (amount,status,user_id)
    alt 소유자 불일치 (P2)
        E-->>C: 403 본인 결제만 승인 가능
    else 금액 불일치
        E-->>C: 400 변조 차단
    else status=completed (멱등)
        E-->>C: alreadyProcessed:true
    else status≠pending
        E-->>C: 400 잘못된 상태
    else 정상 pending
        E->>T: POST /v1/payments/confirm (저장금액 단일 출처)
        alt 토스 ALREADY_PROCESSED_PAYMENT (C1)
            E->>DB: confirm_payment(...) (멱등)
            E-->>C: alreadyProcessed:true (성공 수렴)
        else 토스 실패
            E->>DB: fail_payment(order_id, code, reason)
            E-->>C: 400 실패 (클라 '다시 시도' 노출)
        else 토스 성공
            E->>DB: confirm_payment(...)
            Note over DB: completed 갱신 + 권한부여<br/>(구독 +30일 GREATEST / orders / ad budget)
            alt DB 갱신 실패
                E-->>C: 500 "승인됐으나 DB실패, 고객센터"
            else 성공
                E-->>C: 200 success
                C-->>U: 완료 화면 + 영수증 메일
            end
        end
    end
```

### 자동결제 설정 (billing-auth-confirm: 빌링키 + 첫 결제)

```mermaid
sequenceDiagram
    autonumber
    participant U as 사용자
    participant C as Client (usePayment.ts)
    participant T as 토스 SDK/API
    participant E as Edge billing-auth-confirm
    participant DB as Supabase RPC
    U->>C: 구독하기 (자동결제 동의 체크)
    C->>T: requestBillingAuth(카드, {customerKey:user.id, successUrl:?billing=success, failUrl})
    T-->>U: 카드 등록창
    U->>T: 카드 등록
    T-->>C: redirect ?billing=success&authKey&customerKey
    Note over C: BillingResult: authKey URL 즉시 제거<br/>processedRef 가드 (이중청구 방지)
    C->>E: POST /billing-auth-confirm {authKey, customerKey} (Bearer)
    E->>E: 토큰 인증 + customerKey==user.id 검증
    E->>DB: payments_enabled 게이트 조회 (B-2, <1이면 503)
    E->>DB: profiles 조회 (활성 프리미엄?)
    alt 이미 활성 프리미엄 (P5, 3분창 대체)
        E-->>C: idempotent:true (첫 결제 재실행 없음)
    else
        E->>T: authKey → billingKey 발급
        E->>DB: 금액 정책 조회 (subscription_price_krw, 폴백 2,900)
        E->>T: 빌링키로 첫 결제 (결정적 orderId + Idempotency-Key, P3)
        E->>DB: billing_apply_charge(...)
        Note over DB: 구독 +30일 + billing_subscriptions upsert<br/>(card_last4, next_charge_at, fail_count=0)
        alt apply 실패 (P4)
            E->>T: 토스 청구 자동 취소(void)
            E-->>C: 500 "취소되었습니다. 다시 시도해 주세요"
        else 성공
            E-->>C: 200 자동결제 등록 완료
            C-->>U: 완료 화면
        end
    end
```

### 정기 청구 (billing-run cron)

```mermaid
sequenceDiagram
    autonumber
    participant Cron as pg_cron (billing-run-daily 02:00 UTC)
    participant E as Edge billing-run
    participant DB as Supabase RPC
    participant T as 토스 빌링 API
    Cron->>E: POST /billing-run (헤더 x-cron-secret)
    E->>E: 시크릿 검증
    E->>DB: billing_claim_due(limit=200, due_before=now+1day)
    Note over DB: FOR UPDATE SKIP LOCKED<br/>charging_at 갱신(원자 claim)<br/>15분 staleness 복구
    DB-->>E: 대상 목록 [{user_id, billing_key, customer_key, amount, next_charge_at}] (5컬럼)
    loop 각 대상
        E->>T: POST /v1/billing/{billingKey}<br/>(주기 결정적 orderId=sub_{uid8}_{주기일자} + Idempotency-Key, P3)
        alt 청구 성공
            E->>DB: billing_apply_charge(...) → 구독 +30일
            alt apply 실패 (P4)
                E->>T: 토스 청구 자동 취소(void)
                Note over E: 다음 cron이 같은 orderId로<br/>깨끗이 재시도 (이중과금 없음)
            end
        else 청구 실패
            E->>DB: billing_mark_failed(user_id, reason)
            Note over DB: fail_count+1, 3회↑ status=failed<br/>+ auto_renew=false, 백오프 +3days(P10)
        end
    end
    E-->>Cron: {charged, failed, total}
```

### 환불 (request_refund → admin Edge → admin_refund_payment)

```mermaid
sequenceDiagram
    autonumber
    participant U as 사용자
    participant Cs as Client (MyPaymentsSection)
    participant DB as Supabase RPC
    participant A as 관리자
    participant Ca as Admin Client
    participant E as Edge refund-payment
    participant T as 토스 cancel API
    U->>Cs: 환불 요청 (사유 ≥2자)
    Cs->>Cs: 7일 초과 선차단 (approved_at?? created_at)
    Cs->>DB: request_refund(payment_id, reason)
    Note over DB: 소유검증, completed만, 7일 검증<br/>status→refund_requested
    DB-->>U: 검토 중 배지
    A->>Ca: 어드민 화면에서 환불 승인
    Ca->>E: POST /refund-payment (Bearer 어드민)
    E->>E: profiles.is_admin 확인
    E->>T: payment_key로 토스 cancel
    alt 토스 cancel 성공
        E->>DB: admin_refund_payment(payment_id, note)
        Note over DB: status→refunded, 권한 회수<br/>(구독→free+billing auto_renew=false)<br/>admin_logs 기록, 정산겹침 경고<br/>지급완료(paid) 월 라이선스면 클로백 원장 자동 등록(F3)
        E-->>A: 200 (+ 정산겹침 경고)
    else 토스만 성공 / DB 실패
        E-->>A: toss_canceled:true + 운영팀 알림
    end
```

### 정산 계좌 등록 (update_my_payout_info)

```mermaid
sequenceDiagram
    autonumber
    participant U as 크리에이터
    participant M as PayoutInfoModal
    participant DB as Supabase RPC
    participant MP as MyPage
    U->>M: 은행/계좌번호/예금주 입력
    M->>M: 제출조건 검증 (은행+6자리+예금주)
    M->>DB: update_my_payout_info(bank, account, holder)
    Note over DB: 서버 검증 숫자 6~16자리 상·하한<br/>SECURITY DEFINER로 protect 트리거 우회<br/>profiles.payout_info JSONB 저장
    DB-->>M: 성공 JSONB
    M->>MP: onSaved()
    MP->>DB: get_my_payout_info()
    DB-->>MP: payout_info
    MP-->>U: 정산계좌 카드 갱신
```

---

## API / RPC / Edge 레퍼런스

### 본인 조회/수정 RPC (GRANT authenticated, auth.uid() 기준)

| 이름 | 인자 | 반환 | 권한 | file:line |
|---|---|---|---|---|
| `get_my_payout_info` | (없음) | `JSONB` (payout_info) | authenticated, DEFINER | `phase_security_hardening_20260531.sql:30-39` |
| `update_my_payout_info` | `p_bank_name TEXT, p_account_number TEXT, p_account_holder TEXT` | `JSONB` | authenticated, DEFINER (protect 우회), 계좌 6~16자리 | `mypage_input_validation_20260707.sql:88-135` (구 `phase_payout_info.sql:20-68`) |
| `get_my_tax_info` | (없음) | `TABLE(tax_type, business_number, business_name, tax_invoice_email, tax_consent_at)` | authenticated | `phase32_tax_withholding.sql:125-152` |
| `update_my_tax_info` | `p_tax_type TEXT, p_business_number TEXT=NULL, p_business_name TEXT=NULL, p_tax_invoice_email TEXT=NULL` | `VOID` | authenticated, 국세청 체크섬(`is_valid_biz_no`) | `mypage_input_validation_20260707.sql:43-85` (구 `phase32_tax_withholding.sql:157-195`) |
| `get_my_payments` | `p_limit INTEGER=50, p_offset INTEGER=0` | `TABLE(id, order_id, payment_type, target_id, amount, method, status, approved_at, created_at, failure_reason, refund_reason, refund_requested_at)` | authenticated | `phase_user_payment_history.sql:48-97` |
| `request_refund` | `p_payment_id BIGINT, p_reason TEXT` | `VOID` | authenticated (소유+7일 검증) | `phase_user_payment_history.sql:117-176` |
| `get_my_billing` | (없음) | `TABLE(card_company, card_last4, auto_renew, status, amount, next_charge_at)` | authenticated (billing_key 제외) | `billing_subscriptions_20260612.sql:36-51` |
| `set_my_auto_renew` | `p_on BOOLEAN` | `void` | authenticated (재개 시 failed→active 복구) | `set_my_auto_renew_resume_failed_20260710.sql:15-30` (구 `billing_subscriptions_20260612.sql:54-65`) |

### 결제 코어 RPC

| 이름 | 인자 | 반환 | 권한 | file:line |
|---|---|---|---|---|
| `start_payment` | `p_payment_type TEXT, p_amount INTEGER, p_target_id TEXT=NULL` | `TEXT` (order_id) | authenticated, DEFINER, 서버 금액검증(라이선스=price_standard 단일)·payments_enabled 게이트·재구매 차단 | `payment_amount_standard_only_20260711.sql:22-95` (::uuid 버그 2026-07-13 수정본, 구 `start_payment_ad_owner_20260624.sql` 등 재실행 금지) |
| `confirm_payment` | `p_order_id TEXT, p_payment_key TEXT, p_method TEXT, p_approved_at TIMESTAMPTZ, p_raw_response JSONB` | `VOID` | DEFINER (멱등, pending→completed) | `phase9_payments.sql:143-223` |
| `fail_payment` | `p_order_id TEXT, p_failure_code TEXT, p_failure_reason TEXT` | `VOID` | DEFINER (pending만 갱신) | `phase9_payments.sql:231-249` |
| `admin_refund_payment` | `p_payment_id BIGINT, p_admin_note TEXT=NULL` | `TEXT` (정산겹침 경고) | assert_admin(), paid 월 라이선스 환불 시 클로백 원장 등록 | `settlement_clawbacks_20260711.sql:134-265` (구 `refund_cancel_billing_20260614.sql:9-93`) |
| `admin_get_all_payments` | `p_status='all', p_payment_type='all', p_limit=100, p_offset=0` | `TABLE(...)` | assert_admin, STABLE | `phase_admin_payments_refund_reason.sql:22-77` |
| `mark_revenue_paid` | `p_distribution_id BIGINT` | `VOID` | 내부 assert_admin (3.3% 원천징수) | `phase32_tax_withholding.sql:64-118` |

### 빌링 코어 RPC (service_role 한정 — Edge 전용)

| 이름 | 인자 | 반환 | 권한 | file:line |
|---|---|---|---|---|
| `billing_claim_due` | `p_limit=200, p_due_before=now()` | `TABLE(user_id, billing_key, customer_key, amount, next_charge_at)` — **5컬럼** | service_role (REVOKE public/anon/authenticated), FOR UPDATE SKIP LOCKED | `billing_idempotency_20260705.sql:17-39` (구 `billing_claim_due_20260616.sql:14-33`, 4컬럼) |
| `billing_apply_charge` | `p_user_id, p_billing_key, p_customer_key, p_card_company, p_card_last4, p_amount, p_order_id, p_payment_key, p_approved_at, p_raw` | `void` | service_role (멱등, 구독 +30일, charging_at=NULL 락해제) | `billing_idempotency_20260705.sql:42-81` (구 `billing_charge_rpcs_20260612.sql:8-68`) |
| `billing_mark_failed` | `p_user_id, p_reason` | `void` | service_role (fail_count+1, 3회↑ 중단, **백오프 +3days**) | `billing_idempotency_20260705.sql:84-107` (구 `billing_charge_rpcs_20260612.sql:71-92`) |

### Edge Function (`supabase/functions/server/index.ts`)

| 엔드포인트 | 인자(body/header) | 반환 | 권한 | file:line |
|---|---|---|---|---|
| `POST /toss-confirm` | `{orderId, paymentKey, amount}`, Bearer | `{success, message, paymentType, alreadyProcessed?}` / 4xx·5xx | **Bearer 필수 + 소유자 바인딩(P2)**, service_role 처리, ALREADY_PROCESSED 성공 수렴 | `server/index.ts:1296-1433` |
| `POST /billing-auth-confirm` | `{authKey, customerKey}`, Bearer | `{success, idempotent?}` / 4xx·5xx | Bearer 필수, customerKey==user.id, payments_enabled 게이트, **활성 프리미엄 스킵(P5)** + 결정적 orderId·Idempotency-Key(P3), apply 실패 시 void(P4) | `server/index.ts:1439-1537` |
| `POST /billing-run` | header `x-cron-secret` | `{charged, failed, total}` | cron 시크릿 (BILLING_CRON_SECRET), 주기 결정적 orderId(P3), apply 실패 시 void(P4) | `server/index.ts:1543-1608` |
| `POST /refund-payment` | (어드민 body), Bearer | `{success, ...정산겹침/toss_canceled}` | Bearer + profiles.is_admin | `server/index.ts:2353-2480` |

### 클라이언트 훅 / 호출부

| 함수 | 역할 | file:line |
|---|---|---|
| `usePayment.startTossPayment` | start_payment → 토스 requestPayment | `usePayment.ts:29-61` |
| `usePayment.startAutoBilling` / `startBillingAuth` | requestBillingAuth (빌링키 등록) + payments_enabled UX 사전 차단 | `usePayment.ts:64-91, 153-155` |
| `PaymentResult` | toss-confirm 호출(Bearer, 세션복원 재시도) + processedRef/URL 즉시 제거 + '다시 시도' + 영수증 메일 | `PaymentResult.tsx:46-53, 129-185` |
| `BillingResult` | billing-auth-confirm 호출 + 멱등 가드 | `BillingResult.tsx:28-55` |

---

## 테스트 케이스

### 프로필 편집

```gherkin
Feature: 프로필 편집
  Scenario: 이름·소개·아바타 저장
    Given 로그인한 사용자가 프로필 편집 모달을 연다
    When 이름과 소개를 수정하고 2MB 이하 아바타를 업로드한 뒤 저장한다
    Then auth.updateUser({data:{name}})와 profiles upsert가 호출되고
    And 아바타 URL에 캐시버스터 ?t= 가 붙어 즉시 반영된다

  Scenario: 이메일 변경은 이메일 계정만 가능
    Given OAuth(구글) 로그인 사용자
    When 프로필 편집을 연다
    Then 이메일 변경 필드가 노출되지 않는다 (identities provider!='email')

  Scenario: 비밀번호 6자 미만 거부
    When 비밀번호를 "12345"로 입력한다
    Then 6자 이상·일치 검증에 막혀 저장되지 않는다
```

### 정산 계좌

```gherkin
Feature: 정산 계좌 등록
  Scenario: 정상 저장
    Given 크리에이터(영상 1개 이상)
    When 은행 선택 + 계좌번호 11자리 + 예금주 입력 후 저장
    Then update_my_payout_info가 호출되고 정산계좌 카드가 갱신된다

  Scenario Outline: 입력 검증 거부
    When <필드>를 <값>으로 두고 제출을 시도한다
    Then 저장 버튼이 비활성이거나 RPC가 거부한다
    Examples:
      | 필드     | 값        |
      | 계좌번호 | 12345 (5자리) |
      | 계좌번호 | 17자리 (서버 상한 16 초과) |
      | 은행     | (미선택)  |
      | 예금주   | (빈값)    |
```

### 세금 정보

```gherkin
Feature: 세금 정보 등록
  Scenario: 사업자번호 체크섬 검증
    Given 세금유형을 사업자로 선택함
    When 10자리이지만 검증번호가 틀린 사업자번호(예: 123-45-67890)를 저장한다
    Then update_my_tax_info가 국세청 체크섬(is_valid_biz_no) 불일치로 거부한다
```

### 결제 (단건)

```gherkin
Feature: 단건 결제
  Scenario: 구독 결제 성공
    Given start_payment로 pending payment와 order_id가 생성됨
    When 토스 승인 후 toss-confirm이 호출된다 (Bearer 필수)
    Then 소유자 바인딩·금액검증 통과 → 토스 confirm → confirm_payment 실행
    And subscription_expires_at = GREATEST(기존만료, now()) + 30일 로 누적된다
    And subscription_receipt 영수증 메일이 발송된다

  Scenario: 타인 결제 confirm 시도 차단 (P2)
    Given 사용자 A의 pending 결제 orderId/paymentKey가 유출됨
    When 사용자 B의 Bearer 토큰으로 toss-confirm을 호출한다
    Then 소유자 불일치로 403이 반환되고 결제는 승인되지 않는다

  Scenario: 토스 복귀 직후 세션 미복원 (2026-07-13)
    Given ?payment=success 복귀 직후 Supabase 세션이 아직 복원되지 않음
    When PaymentResult가 getAccessTokenWithRetry로 최대 ~2초 재시도한다
    Then 토큰 확보 후 confirm하거나, 실패 시 "결제는 안전" 안내 + '다시 시도' 버튼이 노출된다 (서버 멱등이라 재호출 안전)

  Scenario: 라이선스 저가 위조결제 차단 (2026-07-11)
    Given price_commercial이 price_standard보다 낮게 설정된 영상
    When commercial 금액으로 start_payment('license', ...)를 호출한다
    Then price_standard 단일 검증에 걸려 결제 생성이 거부된다

  Scenario: 결제 실패 리다이렉트
    Given ?payment=fail 로 진입
    When fail_payment가 호출된다
    Then 해당 order_id의 status가 failed로 기록된다 (pending만 갱신)
```

### 구독 / 자동결제

```gherkin
Feature: 구독 및 자동결제
  Scenario: 자동결제 등록 (빌링키 발급)
    Given 자동결제 동의 체크박스를 선택함
    When requestBillingAuth 후 billing-auth-confirm이 호출된다
    Then authKey로 billingKey 발급 → 첫 결제 → billing_apply_charge
    And get_my_billing은 카드사·끝4자리만 반환하고 billing_key는 절대 노출하지 않는다

  Scenario: 활성 프리미엄 카드 재등록 스킵 (P5)
    Given 이미 프리미엄(만료 미도래)인 사용자
    When 카드 재등록 후 billing-auth-confirm이 호출된다
    Then 첫 결제가 재실행되지 않고 idempotent:true가 반환된다 (이중 +30일 없음)

  Scenario: 자동결제 OFF
    Given 프리미엄 + 자동결제 ON 사용자
    When set_my_auto_renew(false)를 호출한다
    Then 다음 결제일부터 청구되지 않고 현재 구독은 만료일까지 유지된다

  Scenario: 실패 구독 재개 복구 (2026-07-10)
    Given 3회 실패로 status='failed'가 된 구독
    When set_my_auto_renew(true)를 호출한다
    Then status='active' + fail_count=0으로 복구되어 다음 cron이 재청구한다

  Scenario: 정기 청구 (cron)
    Given 만료 1일 전인 활성 구독
    When billing-run이 실행된다
    Then billing_claim_due로 claim → 주기 결정적 orderId+Idempotency-Key로 토스 빌링 청구 → 구독 +30일 누적
```

### 환불

```gherkin
Feature: 환불
  Scenario: 7일 이내 환불 요청
    Given completed 상태이고 결제 후 5일 경과한 결제
    When 사유 2자 이상으로 환불을 요청한다
    Then status가 refund_requested로 바뀌고 "검토 중" 배지가 뜬다

  Scenario: 관리자 환불 승인
    Given refund_requested 결제
    When 관리자가 refund-payment Edge를 호출한다
    Then 토스 cancel 후 admin_refund_payment로 status→refunded
    And 구독은 free로 강등되고 billing auto_renew=false로 cron 재청구가 차단된다
```

### 엣지 케이스

```gherkin
Feature: 엣지 케이스
  Scenario: 중복 확정 (새로고침 포함)
    Given 이미 completed된 order_id
    When toss-confirm이 다시 호출된다
    Then alreadyProcessed:true로 통과하고 confirm_payment는 no-op (이중 권한부여 없음)
    And 클라이언트는 processedRef + URL 즉시 제거로 재confirm 자체를 차단한다

  Scenario: 동시 confirm 레이스 (ALREADY_PROCESSED 수렴, C1)
    Given 같은 결제가 거의 동시에 두 번 confirm됨
    When 토스가 두 번째 호출에 ALREADY_PROCESSED_PAYMENT를 반환한다
    Then 실패로 뒤집지 않고 confirm_payment(멱등) 후 성공으로 수렴한다

  Scenario: 동시 청구 방지
    Given billing-run cron이 동시에 두 번 실행됨
    When 같은 대상을 claim하려 한다
    Then FOR UPDATE SKIP LOCKED + charging_at 창으로 한 번만 청구된다
    And 주기 결정적 orderId + Idempotency-Key로 같은 주기 재청구도 차단된다 (P3)

  Scenario: DB 갱신 실패 — 단건 (토스만 성공)
    Given 토스 confirm은 성공했으나 confirm_payment RPC가 실패
    Then 500과 함께 "승인됐으나 DB 처리 실패, 고객센터 문의" 안내가 반환된다

  Scenario: DB 갱신 실패 — 빌링 (토스 청구 자동 취소, P4)
    Given 토스 빌링 청구는 성공했으나 billing_apply_charge가 실패
    Then 토스 청구가 자동 취소(void)되고 "취소되었습니다. 다시 시도해 주세요"가 반환된다 ("돈만 나가고 미부여" 없음)

  Scenario: 청약철회 7일 초과
    Given 결제 후 8일 경과한 completed 결제
    When 환불을 요청한다
    Then 클라이언트 선차단 또는 request_refund가 7일 초과로 거부한다

  Scenario: 정산 최소액
    Given 누적 정산액이 ₩10,000 미만
    Then 화면 가이드에 최소 정산액 ₩10,000이 표기된다
    And 정산 RPC가 해당 분배를 payout_status='deferred'로 이월한다 (phase8_revenue_distributions.sql:251-253)

  Scenario: 빌링 연속 3회 실패
    Given 자동결제 청구가 2회 연속 실패한 구독
    When 3번째 청구도 실패한다
    Then billing_mark_failed로 status=failed + auto_renew=false 처리되고 사용자에게 알림 (재시도 백오프 +3days)
```

### 수용 기준 (요약)

- [ ] 모든 본인 한정 RPC가 auth.uid() 기준으로만 데이터를 반환/수정한다.
- [ ] 구독 만료일은 항상 GREATEST로 누적되어 남은 기간이 깎이지 않는다.
- [ ] 어떤 클라이언트 경로로도 billing_key/customer_key가 노출되지 않는다.
- [ ] 동일 order_id 재확정 시 이중 청구·이중 권한부여가 없다.
- [ ] toss-confirm은 Bearer 없이 401, 타인 토큰이면 403이다 (소유자 바인딩).
- [ ] 표시가·결제창·실청구가 모두 얼리버드 ₩2,900으로 일치한다.
- [ ] 7일 초과 결제는 환불이 차단된다.
- [ ] 비관리자 토큰의 refund-payment 호출은 403이다.
- [ ] 비사업자 정산 확정 시 3.3% 원천징수가 기록된다.

---

## 개정 이력

| 일자 | 내용 |
|---|---|
| 2026-07-13 | 전수 감사 반영 — toss-confirm Bearer 필수·정본 교체·얼리버드 등 |
