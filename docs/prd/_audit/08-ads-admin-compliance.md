# 08. 광고 · 광고주 · 관리자 — 명세↔코드 준수 감사

> 대상 명세: `docs/prd/08-ads-advertiser-admin.md` (명세 점검 기준일 2026-06-28)
> 감사 방법: 명세가 인용한 SQL/Edge/프론트 파일을 **실제로 읽어** file:line 대조. 추측 없음.
> 감사 실행일: 2026-06-28. 분류: ✅정합 / ⚠️부분·주의 / ❌불일치 / ❓미확인.

---

## 1. 요약 표 (명세 항목별 대조)

| # | 명세 항목 | 분류 | 근거 (file:line) |
|---|---|---|---|
| 1 | 광고 생성 기본값 draft/비활성/예산0 | ✅ | `advertiser_self_service_phase1_20260614.sql:109-115` (`'draft', false … 0, 0`) |
| 2 | 상태머신 draft/rejected→submit→pending_review | ✅ | phase1:145-147 (`status='pending_review'`, `WHERE … status IN ('draft','rejected')`) |
| 3 | admin_review_ad approve→approved / reject→rejected + 알림 | ✅ | phase1:189-203 (`CASE WHEN p_approve THEN 'approved' ELSE 'rejected'`, notifications INSERT) |
| 4 | **승인본 수정→재심사 자동 전환** (approved→pending_review, review_* NULL, is_active 보존) | ✅ | `advertiser_edit_approved_rereview_20260615.sql:37-42` (CASE WHEN status='approved' THEN 'pending_review'; review_note/reviewed_by/reviewed_at→NULL; is_active 미변경) |
| 5 | 재심사 모드 프론트 단일 [저장 후 재심사] 버튼·재submit 금지 | ✅ | `AdCreateModal.tsx:58` (`reReview = status approved\|pending_review`), `:317-321` (단일 버튼 `save(false)`), submit은 reReview 시 미호출 |
| 6 | pending_review 상태 수정해도 pending 유지 | ✅ | rereview:25,37 (CASE는 approved만 전환 → pending_review는 그대로 유지) |
| 7 | 노출 게이트(승인+활성+기간+예산미소진) | ✅ | phase1:65-73 (`status='approved' AND is_active … AND (budget_krw IS NULL OR spent_krw<budget_krw)`); preroll 동일 phase1:86-92 |
| 8 | advertiser_set_active 승인 본인 광고만 | ✅ | phase1:158-160 (`WHERE … owner_id=v_uid AND status='approved'`) |
| 9 | **start_payment ad_budget 분기 owner_id=auth.uid()** | ✅ | `start_payment_ad_owner_20260624.sql:52-59` (`a.owner_id = v_user_id` 아니면 예외 "본인 소유의 광고에만…") |
| 10 | CPM 차감 CEIL(cpm/1000), 기본 2000→₩2 | ✅ | `advertiser_self_service_phase5_20260614.sql:46-48` (`CEIL(v_cpm/1000.0)`, 기본 2000) |
| 11 | 노출 dedup (광고,뷰어,1시간) 1회 집계+과금 | ✅ | phase5:21-32 (`v_bucket=date_trunc('hour',now())`, `ON CONFLICT DO NOTHING; IF NOT FOUND THEN RETURN`) |
| 12 | House Ads(budget NULL) 과금없이 무중단 | ✅ | phase5:28(`v_budget IS NOT NULL`만 dedup), :46(budget NULL이면 차감 skip) |
| 13 | **increment_ad_clicks dedup (광고,뷰어,1시간)** + 구 1-파라미터 DROP | ✅ | `home_security_20260620.sql:51`(`DROP FUNCTION … increment_ad_clicks(uuid)`), :52-68 (2-파라미터 dedup `ad_click_dedup`) |
| 14 | increment_ad_impressions dedup | ✅ | `ad_charge_dedup_phase3_20260614.sql:22-48` |
| 15 | dedup 테이블 RLS on + 정책없음 + REVOKE | ✅ | dedup_phase3:18-20, home_security:47-48 (`REVOKE ALL … FROM anon, authenticated`) |
| 16 | admin_review_ad / admin_list_pending_ads assert_admin | ✅ | phase1:185, `advertiser_self_service_phase4_admin_review_20260614.sql:9` |
| 17 | admin_list_pending_ads pending_review·submitted_at ASC | ✅ | phase4:15-16 (`WHERE status='pending_review' ORDER BY submitted_at ASC NULLS LAST`) |
| 18 | AdminAdReview 반려 사유 필수(빈값 차단) | ✅ | `AdminAdReview.tsx:37-39` (`window.prompt`, 빈값 시 `toast.error … return`) |
| 19 | admin_suspend_user 본인 정지 차단 + 로그 | ✅ | `phase10_7_broadcast_and_logs.sql:175-188` (`IF p_user_id=auth.uid() THEN RAISE`, admin_logs INSERT) |
| 20 | admin_set_admin_role 본인 권한 회수 차단 | ✅ | phase10_7:330-332 (`IF p_user_id=auth.uid() AND p_is_admin=false THEN RAISE`) |
| 21 | mark_revenue_paid assert_admin + 개인3.3%/사업자0% + WHERE pending | ✅ | `phase32_tax_withholding.sql:79`(assert_admin), :7-8 (individual 3.3% / business 0%) |
| 22 | assert_admin / is_admin 정의 | ✅ | `phase10_6_admin_management.sql:18-34`, `admin_rls_is_admin_function.sql:21-25` |
| 23 | 모든 phase10_7 변경 RPC assert_admin | ✅ | phase10_7:28,130,175,198,217,235,252,273,330 (전부 `PERFORM assert_admin`) |
| 24 | ads RLS: 승인+활성 공개 / 본인 / 어드민, 직접 쓰기 정책 없음 | ✅ | phase1:26-40, `ads_public_view_20260620.sql:36-43` |
| 25 | ads_public 뷰 안전컬럼만 + 승인·활성·기간 필터 | ✅ | ads_public_view:20-30 (budget/spent/owner_id/review_note 미포함, `WHERE status='approved'`) |
| 26 | ad-images 본인 폴더 업로드 | ✅ | `ad_images_advertiser_upload_20260615.sql` (foldername[1]=auth.uid) — 명세 인용 일치 |
| 27 | VAST 빈 응답 폴백 | ✅ | `supabase/functions/server/index.ts:861,944` (`<VAST version="2.0"></VAST>`) |
| 28 | VAST CDATA 탈출 무력화 + 클릭링크 http(s)만 | ✅ | index.ts:889 (`cd()` `]]>`치환), :890 (`safeLink = /^https?:\/\//i.test … ? link : '#'`) |
| 29 | VAST 트래킹 HMAC 서명(service_role, 만료) | ✅ | index.ts:839 (`vastSign`), :880, 검증 :991 |
| 30 | record_ad_click ad_clicks + ad_video_events + clicks++ | ✅ | `phase28_ad_revenue_distribution_fix.sql:75-103` |
| 31 | advertiser_my_ads video_url 포함(정본) | ✅ | `advertiser_my_ads_add_video_url_20260615.sql:7-15` (phase1 버전을 DROP 후 재정의) |
| 32 | 상태배지 5종(draft/pending/approved/rejected/paused) | ✅ | `AdvertiserDashboard.tsx:70-74` |
| 33 | 예산 충전 기능 실제 결선(usePayment ad_budget) | ✅ | `AdvertiserDashboard.tsx:175,208` → `AdTopupModal.tsx:40` → `usePayment.ts:122-130` |
| 34 | **get_admin_dashboard_summary 등 8종 assert_admin 부재** (명세가 지적한 갭) | ❌(명세 stale) | 갭이 **이미 폐쇄됨** — `admin_dashboard_assert_admin_20260624.sql:27,76,99,120,140,162,185,207` 전부 `PERFORM assert_admin` (명세는 미반영) |
| 35 | advertiser_update_ad 3중 정의 | ✅(실재) | phase1:121 / `advertiser_update_ad_media_coalesce_20260615.sql:3` / rereview:12 — 동일 시그니처 3회 정의 확인 |
| 36 | paused는 CHECK엔 있으나 status 경로 미사용(일시중지=is_active) | ✅ | phase1:16 CHECK 포함, 토글은 `AdvertiserDashboard.tsx:184` is_active |

---

## 2. 중점 확인 5건 결론

1. **광고 상태머신·승인본 수정→재심사 전환** — ✅ 정합. `advertiser_edit_approved_rereview_20260615.sql:37-42`가 approved일 때만 pending_review로 전환하고 review_note/reviewed_by/reviewed_at를 NULL로 초기화, **is_active는 명시적으로 미변경(보존)**. 프론트도 reReview 시 단일 `save(false)`만 호출해 재submit을 피한다(`AdCreateModal.tsx:317-321`). 노출 게이트가 `status='approved'`(phase1:65)라 재심사 동안 자동 노출 중단, 재승인 시 is_active 보존으로 자동 재개. 명세대로 동작.

2. **start_payment ad_budget 분기 owner_id=auth.uid()** — ✅ 정합. `start_payment_ad_owner_20260624.sql:52-59`가 ad_budget 분기에서 `EXISTS(… ads WHERE id=p_target_id AND owner_id=v_user_id)` 미충족 시 "본인 소유의 광고에만 예산을 충전할 수 있습니다" 예외. 결제 생성 단계 차단이므로 confirm_payment의 budget 증액은 항상 소유권 보장됨.

3. **increment_ad_clicks dedup (광고,뷰어,1시간)** — ✅ 정합. `home_security_20260620.sql:51`이 구 1-파라미터 함수를 `DROP FUNCTION` 후, :52-68에서 `ad_click_dedup`(PK ad_id,viewer_key,bucket) `date_trunc('hour',now())` 버킷으로 `ON CONFLICT DO NOTHING; IF NOT FOUND → skip`. 노출 측(phase5:28-32)·임프레션(dedup_phase3:33-37)도 동일 패턴.

4. **모든 admin_* assert_admin / is_admin 게이트** — ✅ 정합(개선 포함). 심사(phase1:185, phase4:9), 운영(phase10_7 전 함수 :28~:330), 정산(phase32:79), 통계(phase10_5 → **admin_dashboard_assert_admin_20260624.sql에서 8종 전부 assert_admin 추가**). 일부 조회/정책 RPC(calculate_monthly_revenue, update_platform_setting)는 `is_admin()` 분기 체크 사용 — 명세 표기와 일치.

5. **명세가 지적한 잠재 갭 실재 여부**
   - `get_admin_dashboard_summary` 계열 assert_admin 부재 → **❌ 명세 stale**. 명세 §8/§11이 "강건화 후보(미적용)"로 남겨뒀으나, 실제로는 `admin_dashboard_assert_admin_20260624.sql`(2026-06-24)이 8종 전부에 `PERFORM public.assert_admin()`를 추가해 **이미 폐쇄**됨. 명세는 이 파일을 미참조.
   - `advertiser_update_ad` 3중 정의 → **✅ 실재**. phase1:121, media_coalesce:3, rereview:12 동일 시그니처 3회. 정본은 rereview(최신, 재심사 전환 포함)이나 **배포 순서 의존**이라는 명세 경고는 타당.

---

## 3. 발견된 갭 (3건)

### G1. [명세 오류·우선순위 中] dashboard 통계 RPC assert_admin "미적용" 기술이 stale
- **위치**: 명세 §8(277행), §11(330행), §A5 인접 서술.
- **실상**: `admin_dashboard_assert_admin_20260624.sql`(2026-06-24)이 `get_admin_dashboard_summary / get_daily_revenue / get_daily_user_growth / get_daily_views / get_top_videos / get_top_creators / get_ad_performance_summary / get_report_stats` 8종을 SQL→plpgsql 전환하며 본문 첫 줄 `PERFORM public.assert_admin()` 추가(파일 :27,76,99,120,140,162,185,207). 코드는 안전, **명세만 미반영**.
- **조치**: 명세 §8/§11/§A5에서 해당 항목을 "폐쇄됨(2026-06-24)"으로 갱신. 수용기준 §10 "모든 admin_* … assert_admin"은 이제 통계 RPC 포함 충족.

### G2. [기술부채 中] `advertiser_update_ad` 3중 정의 — 배포 순서 의존
- **위치**: phase1:121 / media_coalesce:3 / rereview:12 (동일 시그니처 `(uuid,text,text,text,text,text,text)`).
- **위험**: 멱등 재실행 시 마지막 적용 파일이 정본이 됨. rereview(재심사 전환+미디어 COALESCE)가 정본이어야 하나, 누군가 media_coalesce를 나중에 재실행하면 **재심사 전환 로직이 사라지고 draft/rejected만 수정 가능**으로 회귀(승인본 수정 시 G4 재심사가 깨짐). 명세 §11에 이미 명시됨(실재 확인).
- **조치**: 구 정의(phase1, media_coalesce)에 "DEPRECATED — rereview가 정본" 주석 추가, 또는 정본 1파일로 통합. 배포 SSOT에 적용 순서 고정.

### G3. [프론트 주석 stale 低] AdvertiserDashboard 충전 "준비 중" 주석 vs 실제 결선
- **위치**: `AdvertiserDashboard.tsx:5` 주석 "예산 충전은 Phase 3 … 현재는 승인 후 '준비 중' 안내".
- **실상**: 충전은 완전 결선됨 — `:175` [충전] 버튼 → `:208` AdTopupModal → `AdTopupModal.tsx:40` `startAdBudgetTopUp` → `usePayment.ts:122-130` ad_budget Toss 결제. 코드는 명세대로 기능. **헤더 주석만 과거 상태**(혼동 유발).
- **조치**: 주석 갱신(충전 결선 완료). 실제 노출/충전 활성은 토스 가맹 심사 완료에 의존(CLAUDE.md 출시 의존 순서) — 이는 코드 갭이 아닌 운영 의존성.

---

## 4. 결론

명세 08의 핵심 계약(상태머신, 재심사 전환, 노출 게이트, 소유권 검증, dedup 과금/클릭, 전 admin_* assert_admin, VAST 보안, RLS/뷰 격리)은 **실코드와 정합(✅ 36항 중 34항)**. 핵심 5중점 모두 확인됨.

- **❌(명세 stale) 1건(G1)**: 명세가 "미적용 갭"으로 남긴 dashboard 통계 RPC assert_admin이 실제로는 2026-06-24에 폐쇄됨 → 명세가 코드보다 보수적으로 stale. 보안상 위험 없음(코드가 더 안전).
- **⚠️ 기술부채 1건(G2)**: advertiser_update_ad 3중 정의의 배포 순서 의존(명세도 인지).
- **⚠️ 주석 stale 1건(G3)**: 충전 "준비 중" 주석 vs 실제 완전 결선.

코드 측 실보안/기능 결함은 발견되지 않음. 조치는 (1) 명세 G1 갱신, (2) update_ad 정의 통합/주석, (3) Dashboard 주석 갱신 — 모두 문서/정리 작업이며 런타임 버그 아님.
