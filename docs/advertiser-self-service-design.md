# 📣 광고주 셀프서비스 설계 (Advertiser Self-Service)

> 작성: 2026-06-14 · 상태: **설계안 (구현 전)**
> 목표: 외부 광고주가 직접 가입·광고 등록·예산 충전·성과 조회까지 하고, 어드민은 심사/모더레이션만.
> 핵심 전략: **이미 구축된 자산 최대 재사용** — 신규 인프라 최소화.

---

## 1. 이미 있는 것 (재사용) ✅

| 자산 | 위치 | 셀프서비스에서 역할 |
|---|---|---|
| 광고 서빙 (preroll/midroll/overlay) | `get_ad_for_video`, `pick_random_video_preroll`, `phase28_ad_diversification.sql` | 그대로 — 단 "승인된 광고만" 필터 추가 |
| 예산 회계 (CPM 차감) | `phase8_5_ad_budget_accounting.sql` (`spent_krw += CEIL(cpm/1000)`) | 그대로 |
| **ad_budget Toss 결제** | `start_payment`/`confirm_payment` (`payment_type='ad_budget'` → `ads.budget_krw += amount`) | **예산 충전에 그대로 재사용** |
| ad_budget_low 알림 타입 | `send-email` ADMIN_TYPES, `notification_preferences.email_ad_budget_low` | 수신자(광고주)가 생기면 바로 동작 |
| 어드민 광고 생성·관리 | `AdminDashboard.tsx`, `ads` 테이블 | 어드민 심사 큐로 확장 |
| 광고 통계 | `get_creator_ad_stats`(노출/클릭), `ad_video_events` | 광고주용 통계로 변형 |

→ **빠진 것은 "광고주 = 유저" 층뿐:** 소유권, 승인 워크플로우, 광고주 UI, 광고주용 RLS.

---

## 2. 데이터 모델 변경

### ads 테이블 컬럼 추가
```sql
ALTER TABLE public.ads
  ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- NULL = 레거시 House Ads
  ADD COLUMN status text NOT NULL DEFAULT 'approved'                       -- 레거시는 approved 유지
    CHECK (status IN ('draft','pending_review','approved','rejected','paused')),
  ADD COLUMN review_note text,             -- 반려 사유 (어드민 → 광고주)
  ADD COLUMN reviewed_by uuid,             -- 심사한 어드민
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN submitted_at timestamptz;     -- 심사 제출 시각
CREATE INDEX idx_ads_owner ON public.ads(owner_id);
CREATE INDEX idx_ads_status ON public.ads(status) WHERE status = 'pending_review';
```
- `owner_id` NULL → 기존 House Ads (어드민 관리, status=approved로 마이그레이션).
- `status` 도입으로 `is_active`는 "광고주가 켜고/끔"(일시중지) 의미로 축소. **서빙 조건 = status='approved' AND is_active AND 예산 잔여 AND 기간 내.**

### 광고주 프로필(선택)
별도 테이블 없이 시작 가능. 필요 시 `advertiser_profiles`(상호·사업자번호·정산용) 추가. **MVP는 생략** — 누구나 광고주가 될 수 있게.

---

## 3. 광고 생명주기 (상태 머신)

```
draft ──제출──> pending_review ──어드민 승인──> approved ──(예산 소진/기간 종료)──> (자동 비활성)
  ↑                   │                          │
  └──반려(사유)────────┘            광고주가 일시중지/재개 (is_active)
       rejected → 광고주가 수정 후 재제출
```
- **광고주**: draft 생성·수정 → 제출(pending_review) → (승인 후) 예산 충전 → 노출. is_active로 직접 일시중지/재개.
- **어드민**: pending_review 큐에서 승인/반려(사유). 부적절 광고 강제 paused.
- **서빙**: approved + is_active + 예산>spent + 기간 내 인 광고만.

> 정책: **예산 충전은 승인 후**로 강제할지(반려 시 환불 복잡) vs **충전 먼저, 승인 후 노출**(미승인 환불 가능)? → 결정 필요(§9).

---

## 4. 권한 · RLS

| 행위 | 광고주(owner) | 어드민 | 비고 |
|---|---|---|---|
| 내 광고 조회 | ✅ owner_id=auth.uid() | ✅ 전체 | |
| 광고 생성(draft) | ✅ owner_id 강제 | ✅ | |
| 광고 수정 | ✅ 단 status∈(draft,rejected)일 때만 내용 수정 | ✅ | 승인 후 내용 변경은 재심사 |
| status 변경 | ❌ (제출=draft→pending_review만 RPC로) | ✅ 승인/반려 | **광고주는 approved로 못 바꿈** |
| budget_krw 변경 | ❌ (Toss 결제로만) | ✅ | spent_krw도 직접수정 ❌ |
| is_active 토글 | ✅ (일시중지/재개) | ✅ | |

**구현:** RLS는 단순 정책 + **민감 전이는 SECURITY DEFINER RPC**로:
- `advertiser_create_ad(...)` → owner_id=auth.uid(), status='draft'
- `advertiser_submit_ad(ad_id)` → 본인 draft/rejected → pending_review + submitted_at
- `advertiser_set_active(ad_id, on)` → 본인 approved 광고만
- `admin_review_ad(ad_id, approve bool, note)` → assert_admin, status 전이 + 알림
- budget/spent/status 컬럼은 광고주 UPDATE에서 **컬럼 REVOKE** 또는 트리거로 보호(C1 패턴 재사용).

---

## 5. 결제 · 예산 (기존 ad_budget 재사용)

- 광고주가 "예산 충전" → 기존 `start_payment(payment_type='ad_budget', target_id=ad_id, amount)` → Toss 결제 → `confirm_payment` 가 `ads.budget_krw += amount`. **이미 동작하는 경로.**
- 최소 충전액(예: ₩10,000), 충전 단위 정책만 추가.
- 환불: 미소진 예산 환불은 `admin_refund_payment`(ad_budget 분기 이미 있음 — `budget_krw -= amount`) 재사용.
- CPM: `ad_cpm_krw` platform_setting (현재 2000=₩2/노출). 광고주에게 "예상 노출수 = 예산÷CPM×1000" 표시.

---

## 6. 광고주 UI (신규 컴포넌트)

진입: 마이페이지 또는 별도 `/?tab=advertiser` (Tab 추가).

1. **AdvertiserDashboard** — 내 광고 목록 카드: 상태 배지, 노출/클릭/CTR, 소진/예산 게이지, [수정][일시중지][충전].
2. **AdCreateModal/Form** — 광고명, 소재(이미지 업로드 또는 Bunny 영상), 링크 URL, CTA, 포맷(배너/프리롤/오버레이), 타게팅(tier·카테고리 — 선택), 일정. → 저장(draft) → [심사 제출].
3. **AdBudgetTopupModal** — 충전 금액 입력 → Toss 결제(기존 usePayment 확장 또는 ad_budget 결제 호출).
4. **AdStatsDetail** — 광고별 일자별 노출/클릭 추이(`get_creator_ad_stats_by_video` 변형 → owner 기준).

소재 업로드: 이미지는 기존 ad_images 스토리지(`ad_images_storage.sql`, 현재 admin 한정 → 광고주 본인 폴더 허용으로 RLS 확장). 영상 광고는 Bunny 업로드 재사용.

---

## 7. 어드민 모더레이션

- **AdminAdReview** (신규 또는 AdminDashboard 탭): `status='pending_review'` 큐 → 소재 미리보기 → [승인][반려+사유].
- 승인/반려 시 광고주에게 알림(§8) + admin_logs 기록.
- 강제 중지(부적절 광고): status='paused' + 사유.

---

## 8. 알림 (수신자가 생김)

| 알림 | 트리거 | 채널 |
|---|---|---|
| **광고 승인됨** | admin_review_ad(approve) | 벨 + (선택)이메일 |
| **광고 반려됨**(사유) | admin_review_ad(reject) | 벨 + 이메일 |
| **ad_budget_low** | 예산 차감 트리거가 owner에게(예: spent ≥ 80% budget) | 벨 + 이메일 (이미 타입 존재) |
| 예산 소진(노출 중단) | spent ≥ budget | 벨 |

→ ad_budget_low 트리거는 이제 **owner_id 라는 수신자**가 있으므로 구현 가능. ads UPDATE 트리거에서 80% 도달 시 1회 알림(중복 방지 플래그 `budget_low_notified`).

---

## 9. 결정 필요 (비즈니스)

1. **광고주 온보딩**: 누구나 즉시(오픈) vs 신청·승인제(초대/심사)? → **권장: 오픈 가입 + 광고별 심사** (진입장벽↓, 품질은 광고 심사로 통제)
2. **충전 시점**: 승인 후 충전(환불 단순) vs 선충전(미승인 시 환불)? → **권장: 승인 후 충전**
3. **광고 수익 귀속**: 광고주 결제액이 (a)전액 플랫폼 vs (b)노출된 영상 크리에이터와 분배? → 현재 `revenue_distributions`가 **이미 광고수익을 크리에이터에 분배**. 셀프서비스도 동일 적용? **권장: 동일(크리에이터 분배 유지)** — 크리에이터 유인
4. **광고주가 쓸 수 있는 포맷**: 배너만 vs 프리롤·오버레이까지? → **권장: MVP는 배너+프리롤**
5. **타게팅 노출 범위**: tier/카테고리 선택 허용? → **권장: MVP는 전체노출(타게팅 없음), 후속 추가**
6. **최소 충전액 / 심사 SLA**: 예) 최소 ₩10,000, 심사 1영업일
7. **사업자 정보 수집**: 세금계산서·정산 위해 광고주 사업자정보 필요? → 후속(MVP는 개인도 가능, 영수증만)

---

## 10. 단계별 구현 계획

**Phase 1 — 데이터·권한 (백엔드 기반)**
- ads 컬럼 추가(owner_id, status, review_*), 레거시 마이그레이션(status='approved')
- RLS + RPC(create/submit/set_active/admin_review), 서빙에 status='approved' 필터
- 컬럼 보호(budget/spent/status)

**Phase 2 — 광고주 UI**
- AdvertiserDashboard + AdCreateForm + 소재 업로드 RLS 확장
- 심사 제출 흐름

**Phase 3 — 결제·예산**
- 예산 충전(ad_budget 결제 재사용) + 최소액/예상노출 표시
- 미소진 환불

**Phase 4 — 어드민 심사 + 알림**
- AdminAdReview 큐, 승인/반려
- 알림(승인/반려/budget_low) 트리거

**Phase 5 — 성과·정산**
- 광고별 통계 상세, 크리에이터 ad 수익 분배 검증
- (후속) 타게팅, 사업자정보, 세금계산서

> Phase 1~2 만으로 "광고주가 광고 올리고 심사받는" MVP 동작. Phase 3~4로 과금·운영 완성.

---

## 11. 리스크 · 주의

- **광고 심사 책임**: 부적절/불법 광고 게재 시 플랫폼 책임 → 심사 필수(자동승인 금지). 약관에 광고 정책 추가.
- **예산 어뷰징**: 셀프서비스 도입 시 `increment_ad_impressions` 무인증 차감(감사 High)이 **실위협이 됨** → Phase 1에서 **viewer 세션 dedup + 서버측 차감**으로 반드시 함께 차단.
- **소재 모더레이션**: 이미지/영상 부적절 콘텐츠 — 업로드 시 검토 큐.
- **결제 분쟁**: 미소진 환불 정책 약관 명시.
