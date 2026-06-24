# 🛡️ 광고 노출/클릭 사기 방어 강화 계획 (#2 — 홈피드 감사 잔여)

> 작성 2026-06-20. **광고 결제(토스) 라이브 전 반드시 처리.** 지금은 자체광고 OFF·과금 전이라 실손해 0.
> 관련: [`launch-checklist.md`](launch-checklist.md), 홈피드 감사(#1·#5는 처리됨), `supabase/ad_charge_dedup_phase3_20260614.sql`.

## 문제 (감사 #2)
`increment_ad_impressions(ad_id, p_viewer_key, ...)`의 dedup 키가 **클라이언트 생성 세션키**(localStorage).
공격자가 매 요청마다 키를 바꾸면 dedup이 뚫려 **경쟁사 광고 노출 부풀리기·예산 소진(클릭사기)** 가능.
`spent_krw`가 CPM으로 차감되므로 결제 라이브 시 실금전 피해.

## 검증된 제약 (2026-06-20)
- Supabase RPC는 `current_setting('request.headers', true)::json->>'x-forwarded-for'` 로 클라 IP 열람 가능.
  하지만 **x-forwarded-for는 스푸핑 가능**(보안 단독 신뢰 불가). 출처: Supabase Discussion #27002, #34647, securing-your-api 문서.
- **브라우저는 XFF를 못 설정**(forbidden header) → IP 기반은 브라우저/캐주얼 어뷰징은 막지만 **스크립트(curl) XFF 위조는 못 막음.**
- **순진한 IP dedup은 한국 CGNAT에서 모바일 노출 과소집계** → 단순 "키→IP 스왑"은 새 버그(과금/통계 왜곡)라 채택 금지.

## 채택 설계 (Edge 기반, 결제 라이브 전 구현)
1. **집계를 Edge `server` 함수 뒤로 이전**: 프론트는 raw RPC 대신 `POST /server/ad-event {ad_id, type, video_id?}` 호출.
   Edge 런타임이 주는 **신뢰 가능한 클라 IP**(또는 플랫폼 헤더)를 사용 — XFF 위조 무력화.
2. **dedup 키 우선순위**: 로그인 = `auth.uid()`(위조 불가·정확). 익명 = 클라 세션키(정확) **+ IP별 키 다양성 레이트리밋**
   (예: 같은 IP가 1시간에 한 광고로 생성하는 distinct 키 ≤ N개). → CGNAT 과소집계 없이 키 회전 폭주만 차단.
3. **raw RPC 잠금**: `REVOKE EXECUTE ON increment_ad_impressions / increment_ad_clicks FROM anon, authenticated;`
   → Edge(service_role)만 호출. 클라 직접 호출 경로 제거.
4. (선택) 짧은 TTL **서명 토큰**(HMAC) 발급 후 제출 — 봇 난이도 추가.

## 영향 범위 메모
- 같은 클래스의 영상광고 경로(`record_ad_impression`, adFetch.ts)도 동일 점검 필요 — 함께 Edge로 정리 권장.
- 빌링 정합(`spent_krw`·정산)과 얽히므로 테스트 데이터로 검증 후 적용.

## 현재까지 한 것 (부분 완화)
- `ad_charge_dedup_phase3_20260614.sql`: (광고, 키, 1시간) dedup — **단순 반복은 막힘**, 키 회전은 못 막음.
- `home_security_20260620.sql`: `increment_ad_clicks`에도 동일 dedup 추가(#1).
- → **남은 건 "키 회전/스크립트 위조" 차단 = 위 Edge 설계.**

## 광고주 셀프서비스 감사 추가 확인 (2026-06-24)
위 설계로 함께 처리할 구체 항목(광고주 감사에서 재확인):
- **A. `track_video_ad_event`(VAST 영상광고 프리롤 과금)에 dedup이 아예 없음** — `phase8_5_ad_budget_accounting.sql:58-99`. Edge `/vast-track`(`index.ts:957-984`)이 `(ad_id,source_video_id,exp)` 서명만 검증 → exp 만료 전 동일 URL 반복 GET 시 매번 과금. `p_viewer_user_id=null`이라 뷰어 dedup도 불가. **increment_* 보다 더 무방비(중)** → Edge 일괄 정리 시 dedup + 짧은 exp 필수.
- **C/D. 비로그인 viewer_key 위조 + `increment_*`/`record_ad_impression` anon 직접 호출** — 위 §2·§3 설계로 커버(로그인은 auth.uid()로 이미 안전).
- **#5. `advertiser_create_ad` 생성 한도 없음** — 로그인 사용자가 draft 광고 무제한 생성 가능(노출/과금은 승인+예산 필요라 피해는 DB 누적 한정). per-user 광고 수 상한 또는 시간당 생성 제한 추가 권장(낮음).

> ✅ 광고주 감사에서 **이미 안전 확인된 것**(여기 미포함): IDOR(본인 광고만 수정/제출/활성화/통계), 심사 우회 차단(create=draft/budget=0 고정, set_active=approved만, admin_review_ad=assert_admin), ads RLS+ads_public 뷰(민감컬럼 비노출), 이미지 업로드 본인폴더만. **#B(타인 광고 예산 충전)는 `start_payment_ad_owner_20260624.sql`로 즉시 수정 완료.**

## 트리거 / 결정 (2026-06-20 사용자 확정)
**광고 시스템을 정비할 때 함께 처리한다.** (단독으로 지금 급히 하지 않음 — 자체광고 OFF·과금 전이라 실손해 0.)
구체 시점: 광고 결제(토스) 승인이 가까워지거나, 자체광고 `HOME_FEED_SELF_ADS=true` 전환 전,
또는 영상광고(`record_ad_impression`) 등 광고 집계 경로를 손볼 때 — **이 설계대로 Edge 기반으로 일괄 구현.**
