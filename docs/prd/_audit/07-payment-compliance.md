# 07 마이페이지·결제·구독 — 명세 ↔ 구현 대조 감사

> 대상 기획서: `docs/prd/07-mypage-payment-billing.md`
> 감사 일자: 2026-06-28 · 방식: 실제 코드(SQL·Edge·프론트) Read/Grep 직접 검증. 추측 없음.
> 범위: 결제 코어 RPC, 빌링(자동결제), 정산/세금, 환불, 멱등성, 권한/보안.
> 판정: ✅ 명세=구현 일치 · ⚠️ 부분/주의 · ❌ 불일치/미구현 · ❓ 미확인

---

## 1. 요약

기획서 07은 **실제 구현과 거의 정확히 일치**한다. 핵심 5개 검증 항목(멱등성·빌링키 미노출·protect 8컬럼·원천징수·정산최소액) 모두 코드에서 실재 확인됨. 특히 기획서가 "※미확인"으로 남겨둔 **정산 최소액 SQL 강제 여부**는 실제로 `phase8_revenue_distributions.sql:252-253`에서 `deferred` 분기로 **강제되고 있음**이 확인되어, 명세의 미확인 표기가 stale(과소기술)임을 확정했다.

대부분의 갭은 "명세가 더 보수적/조심스럽게 적은 것"이며, 구현 결함은 발견되지 않았다. file:line 표기는 대체로 정확하나 일부 라인 범위에 ±수 라인 드리프트가 있다(아래 표 참고).

---

## 2. 핵심 5개 검증 항목 (사용자 지정)

| # | 검증 항목 | 명세 주장 | 실제 코드 | 판정 | 근거 (file:line) |
|---|---|---|---|---|---|
| ① | 멱등 — order_id UNIQUE | `payments.order_id ... UNIQUE` | `order_id TEXT NOT NULL UNIQUE` | ✅ | `phase9_payments.sql:25` |
| ① | 멱등 — confirm completed no-op | completed면 RETURN | `IF v_payment.status='completed' THEN RETURN` | ✅ | `phase9_payments.sql:166-169` |
| ① | 멱등 — Edge toss-confirm 가드 | completed 통과 + pending 가드 | completed→`alreadyProcessed:true`, ≠pending→400 | ✅ | `server/index.ts:1080-1087` |
| ① | 멱등 — 빌링 apply completed RETURN | completed면 RETURN(이중 +30일 방지) | `IF EXISTS(... status='completed') THEN RETURN` | ✅ | `billing_charge_rpcs_20260612.sql:26-28` |
| ① | 멱등 — billing-auth-confirm 3분창 | 3분 멱등 | `(Date.now()-lastChargeTs)<3*60*1000 → idempotent` | ✅ | `server/index.ts:1176-1188` |
| ② | 빌링키 미노출 — RLS 정책 0 | 정책 하나도 안 만듦 | `ENABLE ROW LEVEL SECURITY` + 정책 정의 없음 | ✅ | `billing_subscriptions_20260612.sql:30-31` |
| ② | 빌링키 미노출 — REVOKE | `REVOKE ALL FROM anon, authenticated` | 동일 문구 존재 | ✅ | `billing_subscriptions_20260612.sql:33` |
| ② | 빌링키 미노출 — get_my_billing | billing_key/customer_key 제외 | 반환 6컬럼에 billing_key/customer_key 없음 | ✅ | `billing_subscriptions_20260612.sql:36-50` |
| ② | 빌링키 — claim_due service_role 한정 | REVOKE public/anon/authenticated + GRANT service_role | 동일 | ✅ | `billing_claim_due_20260616.sql:36-37` |
| ③ | protect 8컬럼 (is_admin 포함) | sub3 + payout_info + is_admin + referral3 = 8 | 8컬럼 전부 OLD 복원, **is_admin 포함** | ✅ | `fix_protect_is_admin_20260624.sql:21-31` |
| ③ | protect — service_role 우회 허용 | Dashboard/Edge만 허용 | `current_user NOT IN(postgres,supabase_admin,service_role)` 가드 | ✅ | `fix_protect_is_admin_20260624.sql:18-19` |
| ④ | 원천징수 — individual만 3.3% | individual(또는 NULL)=FLOOR(total*0.033), 사업자=0 | `COALESCE(tax_type,'individual')`; individual→FLOOR(*0.033), ELSE 0 | ✅ | `phase32_tax_withholding.sql:92-103` |
| ④ | 원천징수 — 멱등 | pending만 갱신 | `WHERE id=? AND payout_status='pending'` | ✅ | `phase32_tax_withholding.sql:115-116` |
| ⑤ | 정산최소액 — SQL 강제 여부 | **명세: "강제 로직 미확인"** (§6, §11) | **강제됨**: `>= v_payout_min → 'pending' ELSE 'deferred'` | ⚠️→✅ | `phase8_revenue_distributions.sql:106, 252-253` |

**⑤ 결론(미확인 항목 확정):** 정산 최소액은 **SQL에서 강제된다.** 월정산 함수가 크리에이터 합계(`sale_rev+ad_rev+sub_rev`)를 `payout_minimum_krw`(기본 10000, `phase8_platform_settings.sql:59`)와 비교해 미달 시 `payout_status='deferred'`로 다음 달 이월 처리한다. 기획서 §6/§11/§10-와이어 주석의 "정산 RPC에 최소액 임계 차단 로직은 미확인"은 **stale이며 정정 대상**이다. 다만 `mark_revenue_paid`(지급 확정)는 `payout_status='pending'`만 지급하므로 `deferred` 건은 자동으로 지급에서 제외된다 — 즉 "지급 시점 재검증"이 아니라 "정산 산출 시점 분류"로 강제되는 구조다.

---

## 3. API/RPC/Edge 레퍼런스 대조 (명세 §5, §레퍼런스표)

| 객체 | 명세 표기 | 실제 검증 | 판정 | 비고 (file:line) |
|---|---|---|---|---|
| `start_payment` | `start_payment_ad_owner_20260624.sql:15-67`, 서버 금액검증, DEFINER, search_path | 일치. sub=platform_settings, license=영상가격 IN, ad_budget=owner_id 검증 | ✅ | `start_payment_ad_owner_20260624.sql:15-67` |
| `confirm_payment` | `phase9_payments.sql:143-223`, 멱등, +30일 GREATEST | 일치 | ✅ | `phase9_payments.sql:143-223` |
| `fail_payment` | pending만 갱신 | `WHERE order_id=? AND status='pending'` | ✅ | `phase9_payments.sql:241-247` (명세 :231-249 ≈ 정의 헤더 포함) |
| `get_my_payments` | `phase_user_payment_history.sql:48-97`, 12컬럼 반환 | 12컬럼 정확 일치, GRANT authenticated | ✅ | `phase_user_payment_history.sql:48-97` |
| `request_refund` | 7일 초과 차단, 소유, 2자 이상 | `>7` 차단, 소유검증, `LENGTH(TRIM)<2` 거부 | ✅ | `phase_user_payment_history.sql:155-164` |
| `admin_refund_payment` | 최신=`refund_cancel_billing_20260614.sql:9-93`, billing 해지, 정산겹침 경고 TEXT | 일치. sub→free+expires NULL+billing auto_renew=false/canceled, R6 경고 | ✅ | `refund_cancel_billing_20260614.sql:35-43, 63-70, 91` |
| `get_my_payout_info` | `phase_security_hardening_20260531.sql:30-39`, JSONB | 일치 | ✅ | `phase_security_hardening_20260531.sql:30-39` |
| `get_my_tax_info` / `update_my_tax_info` | `phase32:125-152 / 157-195`, 4종 검증, 사업자번호 필수 | 일치. `business_%`면 사업자번호 필수, 항상 tax_consent_at=now() | ✅ | `phase32_tax_withholding.sql:125-195` |
| `mark_revenue_paid` | assert_admin, 3.3%, pending만 | 일치 | ✅ | `phase32_tax_withholding.sql:79, 97-116` |
| `get_my_billing` / `set_my_auto_renew` | `billing_subscriptions_20260612.sql:36-51 / 54-65` | 정확 일치 | ✅ | 동 파일 36-65 |
| `billing_apply_charge` | service_role, 멱등, +30일, upsert | 일치, GRANT service_role | ✅ | `billing_charge_rpcs_20260612.sql:8-68` |
| `billing_mark_failed` | fail_count+1, 3회↑ status=failed+auto_renew=false | 일치 (`>= 3`) | ✅ | `billing_charge_rpcs_20260612.sql:79-80` |
| `billing_claim_due` | service_role, FOR UPDATE SKIP LOCKED, 15분 stale | 일치 | ✅ | `billing_claim_due_20260616.sql:20-37` |
| Edge `POST /toss-confirm` | `:1046-1157`, 금액검증→confirm/fail | 일치 | ✅ | `server/index.ts:1046-1157` |
| Edge `POST /billing-auth-confirm` | `:1163-1246`, Bearer, customerKey==user.id, 3분 멱등 | 일치 | ✅ | `server/index.ts:1163-1246` |
| Edge `POST /billing-run` | `:1252-1302`, x-cron-secret, claim→청구→apply/fail, dueBefore=now+1day | 일치 | ✅ | `server/index.ts:1252-1302` |
| Edge `POST /refund-payment` | `:1833-1937`, Bearer + is_admin 확인, 토스 cancel→admin_refund_payment | 일치. 비관리자=403 | ✅ | `server/index.ts:1850-1857, 1923-1926` |

---

## 4. 프론트엔드 대조

| 항목 | 명세 | 실제 | 판정 | file:line |
|---|---|---|---|---|
| 자동결제 동의 체크박스 → 미동의 시 버튼 비활성 | §3.9, §6 | `disabled={paying||isPremium||(!isPremium && !agreed)}` | ✅ | `SubscriptionPage.tsx:181, 187` |
| 앱래퍼 IAP 회피 — 웹 결제 유도 | §3.9 | `if(isAppWrapper()){openWebSubscribe()}` | ✅ | `SubscriptionPage.tsx:57-61` |
| get_my_billing 로드 / set_my_auto_renew 토글 | §3.9 | `supabase.rpc("get_my_billing")` / `set_my_auto_renew` | ✅ | `SubscriptionPage.tsx:46, 76` |
| 가격 정본 platform_settings 조회 | §6 | `get_platform_setting('subscription_price_krw')` 클라+Edge | ✅ | `usePayment.ts:86-89`, `server/index.ts:1210` |
| startAutoBilling → requestBillingAuth (?billing=success) | §4.5 | 일치 | ✅ | `usePayment.ts:64-78, 140-142` |
| 환불 버튼 7일 선차단 (approved_at ?? created_at) | §3.5 | `refDate = p.approved_at || p.created_at; daysSince` | ✅ | `MyPaymentsSection.tsx:78-79, 145-146` |

---

## 5. 발견된 갭 / 정정 필요 (3건)

### 갭 1 — [정정·중요] 정산 최소액 "미확인" 표기가 stale (명세가 구현을 과소기술)
- 명세 §6: "(SQL 정산 RPC에 강제 임계 로직은 미확인.)" / §11: "정산 RPC에 최소액 임계 차단 로직은 본 범위 SQL에서 미확인" / §10 와이어 주석 동일.
- 실제: `phase8_revenue_distributions.sql:252-253`에서 `total >= v_payout_min ? 'pending' : 'deferred'`로 **명확히 강제**. 기본값 10000은 `phase8_platform_settings.sql:59`.
- 영향: 기획서의 "알려진 제약(이월 검증 필요)"이 실제로는 이미 해소된 상태. 해당 3곳을 "강제됨(deferred 이월)"으로 정정 권고. (감사 §2-⑤ 참조)

### 갭 2 — [경미] file:line 라인 드리프트 (문서 정확도)
- 예: 명세 `fail_payment` "phase9_payments.sql:231-249"는 함수 헤더 포함 범위이고 실제 본문 UPDATE는 `:241-247`. `admin_refund_payment` 구버전 라인(`phase_user_payment_history.sql:184-244`)은 존재하나 정본은 `refund_cancel_billing_20260614.sql`이 덮어씀(명세도 이를 정본으로 표기 — OK).
- 영향: 기능 영향 없음. 마이그레이션 재적용 순서상 `refund_cancel_billing_20260614.sql`(C6)와 `fix_protect_is_admin_20260624.sql`이 최종본임을 셋업 가이드에 분명히 둘 것(둘 다 멱등).

### 갭 3 — [주의·이월 유효] basic 티어 / search_path 누락은 여전히 유효한 제약
- basic 티어: `tierMeta`엔 정의되나 SubscriptionPage는 free/premium 2단만 — 명세 §11 표기대로 미구현 경로(❓ 활성 경로 없음). 결제·구독 흐름에는 영향 없음.
- search_path: 핵심 결제/빌링/세금 RPC는 모두 `SET search_path` 명시 확인(검증 통과). 명세가 지목한 phase17/phase18(시청기록·플레이리스트)은 본 감사 코어 범위 밖이라 미재검증(❓) — 하드닝 후보로 이월 유효.
- 영향: 결제 컴플라이언스에는 무관. 보안 하드닝 백로그에 유지.

---

## 6. 결론

- 기획서 07은 **구현과 일치하며 신뢰 가능**. 핵심 5개 항목(멱등·빌링키·protect 8컬럼·원천징수·정산최소액) 전부 코드 실재 확인 ✅.
- 유일한 실질 정정: **정산 최소액은 SQL에서 강제된다** — 명세의 "미확인" 표기 3곳을 갱신할 것(갭 1). 이는 명세를 더 정확하게 만드는 정정이지 구현 결함이 아니다.
- 보안 회귀 위험 항목(is_admin protect 누락)은 `fix_protect_is_admin_20260624.sql`로 복구 완료 확인. 셋업/재적용 시 이 파일과 `refund_cancel_billing_20260614.sql`을 최종본으로 반드시 함께 적용(갭 2).
- 구현 측 결함·보안 구멍은 본 감사 범위에서 **발견되지 않음.**
