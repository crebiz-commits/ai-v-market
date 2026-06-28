# PRD ↔ 구현 자동 대조 리포트 (2026-06-28)

> 기획문서 `docs/prd/01~09` 의 검증 가능한 spec(API/RPC/Edge 레퍼런스·비즈니스 규칙·수용기준)을 **실제 코드(SQL·Edge·프론트)와 1:1 대조**한 결과.
> 분류: ✅구현확인 / ⚠️경미·불일치(대부분 명세 stale) / ❌미구현 / ❓확인불가.
> 영역별 상세: 같은 폴더의 `NN-*-compliance.md`.

## 종합 대시보드

| 영역 | ✅ | ⚠️ | ❌ | ❓ | 핵심 결론 |
|---|---|---|---|---|---|
| [01 인증·온보딩](01-auth-compliance.md) | 44 | 3 | 0 | 2 | 명세대로 전부 구현. auth.users 영구삭제 자동화만 미구현(이월) |
| [02 홈피드](02-home-feed-compliance.md) | 30 | 6 | 0 | 1 | 코드 정상. ⚠️는 전부 명세 문서 stale(코드가 더 최신) |
| [03 시네마·OTT](03-cinema-ott-compliance.md) | 21 | 4 | 0 | 0 | RPC 5종·뷰·편성 실재. 분석 이벤트 전무, 신장르 편성 미가중 |
| [04 검색·상세·라이선스](04-search-detail-compliance.md) | 높음 | 3 | 0 | 0 | 페이월·5종광고·미리보기컷오프 실재. 3분게이트 클라 UI-only |
| [05 업로드·대시보드](05-upload-dashboard-compliance.md) | 높음 | 3 | 0 | 0 | 대시보드 RPC 8종·서버강제·재시도 전부 실재. 라인 stale |
| [06 커뮤니티·알림](06-community-compliance.md) | 다수 | 3 | 0 | 0 | 작성자강제·rate-limit·팬아웃·collab union 전부 실재 |
| [07 마이페이지·결제](07-payment-compliance.md) | 다수 | 3 | 0 | 0 | 멱등·빌링키미노출·protect8·원천징수·정산최소액 전부 실재 |
| [08 광고·관리자](08-ads-admin-compliance.md) | 34 | 2 | 0 | 0 | 상태머신·dedup·admin게이트 실재. 코드가 명세보다 안전 |
| [09 정책·보안·데이터](09-policy-security-compliance.md) | 19 | 4 | 1 | 0 | 금지선 미위반(현재). 적용순서 의존·ad-fraud Edge 미구현 |

**총평:** 명세가 "코드를 읽고 쓴 as-built 문서"라 **구현 일치도가 매우 높음**. 실질 미구현(❌)은 **1건**(09 ad-fraud Edge 재설계 — 광고 유료결제 라이브 전 게이트, 현재 과금 전이라 실손해 0). 명세 허위·과장 없음.

---

## 🔴 교차 발견 — 가장 중요한 구조적 리스크

### 1. 마이그레이션 "적용 순서" 의존 (01·07·08·09 공통) — 최우선
보안·기능 핵심 함수가 **여러 SQL 파일에 중복 정의**되어, "fix 파일이 마지막에 적용돼야" 안전한 상태가 됨. 순서 역전 시 회귀:
- `protect_subscription_columns` — `profiles_table.sql`(구 4컬럼) vs `fix_protect_is_admin_20260624.sql`(8컬럼·is_admin). **역전 시 권한상승+PII덤프 재발**(과거 실제 사고).
- `handle_new_user` — `profiles_table.sql` vs `referral_20260618.sql`.
- `advertiser_update_ad` — phase1 / media_coalesce / rereview 3중 정의. 역전 시 재심사 전환 회귀.
- `get_home_feed` — 이번에 chip_filter footgun 제거로 정본 일원화(✅ 해결됨).
- **권장:** ① base 파일에 fix 병합(SSOT 단일화) 또는 ② `_verify_migrations_applied.sql` 게이트(`pg_get_functiondef`/`role_column_grants` 검사) 추가.

### 2. 명세 문서 stale (코드가 더 최신 — 문서 정정 필요)
- 02: count 시리즈필터 "이월/미적용" 서술 → 실제 이미 적용됨(2026-06-28).
- 06: "프론트 Notification union에 collab 미포함" → 실제 포함됨(수정 반영).
- 07: 정산최소액 "미확인" → 실제 `phase8_revenue_distributions.sql:252-253`에서 강제됨.
- 08: get_admin_dashboard_summary 등 통계 8종 "assert_admin 부재 갭" → 실제 `admin_dashboard_assert_admin_20260624.sql`에서 이미 폐쇄.

### 3. 경미한 실제 갭(기능)
- 04: 3분미만 판매불가가 **업로드 클라 UI 차단만** — 서버/RLS 하드검증 없어 API 직접호출 시 우회 가능(경미).
- 03: nature/abstract 장르가 OTT 시간대 편성 order에 없어 항상 중립랭크 / Cinema·OTT 분석 이벤트 전무.
- 06: 협업 마감(closed) 시 "지원"은 DB강제·"문의"는 UI-only (비대칭).
- 09: `assert_admin()` 인라인 `SET search_path` 누락(일괄 ALTER 의존) / 01: auth.users purge 자동화 미구현.

---

## 권장 조치 우선순위
1. **(보안·구조) 마이그레이션 적용순서 검증 게이트** 도입 → 회귀 영구 차단.
2. **(문서) 명세 stale 4건 정정** → 위 §2.
3. **(경미·기능) 3분 게이트 서버검증 / assert_admin search_path 인라인 / 신장르 편성** → 백로그.
4. **(출시 게이트) ad-fraud Edge** → 광고 유료결제 활성화 전 선행.
