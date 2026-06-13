# 🔍 CREAITE 전체 감사 — 2026-06-14

> 작업 폴더 전수 감사. 6개 영역(보안·결제정산·프론트엔드·DB/SQL·미완성기능·인프라) 병렬 조사 후 종합.
> 🔬 표시 항목은 **운영 DB에 직접 쿼리해 사실 확인**한 것. 나머지는 코드/SQL 정적 분석.
> 이전 감사 [full-audit-2026-06-11.md](full-audit-2026-06-11.md) 와 [launch-checklist.md](launch-checklist.md) 의 기해결 항목(R1~R11 등)은 제외.

## 요약

| 심각도 | 건수 | 핵심 |
|---|---|---|
| 🔴 Critical | 6 | **권한상승(어드민 승격)**, **정산계좌 노출**, **결제RPC 노출**, **회계 CASCADE 소실**, 빌링 이중청구, 환불 후 재청구 |
| 🟠 High | 11 | 추천 깨짐, 광고예산 위조, 통계 IDOR, 타입검사 전무, react-router 취약점, 보안헤더 전무 등 |
| 🟡 Medium | ~20 | effect 취소가드, 조용한 실패, 구독풀 과소분배, 가입 트리거 롤백, Market 정렬 등 |
| 🟢 Low/정리 | ~12 | 죽은 파일 5개, 404/오프라인 부재, console 노이즈, i18n 인라인 등 |

**실결제 베타 출시 블로커: C1~C4 (보안 4건).** 인증된 일반 사용자가 즉시 악용 가능. 나머지는 출시 후 순차 가능하나 결제 버그(C5·C6)는 돈과 직결.

---

## 🔴 CRITICAL — 출시 전 즉시 수정

### C1. 권한 상승 — 누구나 자신을 어드민으로 승격 🔬
- **위치**: `profiles_table.sql` (is_admin 컬럼·protect 트리거·UPDATE 정책), `phase8_platform_settings.sql:127`
- **확인**: 운영 DB 쿼리 결과 — `authenticated`·`anon` 모두 `profiles` 테이블 + `is_admin` **컬럼 UPDATE 권한 보유**, `protect_subscription_columns` 트리거는 is_admin 미보호(검증: 함수 본문에 'is_admin' 없음), RLS UPDATE 정책은 본인 행 허용.
- **악용**: 로그인 사용자가 `UPDATE profiles SET is_admin=true WHERE id=auth.uid()` → 어드민 패널 전체(환불·사용자관리·정산·브로드캐스트·모더레이션·광고) 장악.
- **수정**: `REVOKE UPDATE (is_admin, subscription_tier, subscription_expires_at, subscription_started_at, payout_*) ON public.profiles FROM anon, authenticated;` + protect 트리거에 `NEW.is_admin := OLD.is_admin;` 추가.

### C2. 정산 계좌번호 전체 노출 🔬
- **위치**: `phase_settlement_payout_account.sql:23-60` (`get_revenue_distributions_by_period`)
- **확인**: ACL `anon=X, authenticated=X` (PUBLIC 실행 가능) + 함수 본문에 admin 가드 없음.
- **악용**: 임의 authenticated 사용자가 RPC 호출 → 모든 크리에이터 `payout_bank`/`payout_account`(계좌번호)/`payout_holder` + 전체 매출 조회.
- **수정**: 함수 첫 줄 `PERFORM public.assert_admin();` + `REVOKE EXECUTE ON FUNCTION ... FROM anon, authenticated;`

### C3. 결제 승인 RPC가 인증 사용자에게 직접 노출 🔬
- **위치**: `phase29_license_type_unify.sql` (`confirm_payment`), `phase9_payments.sql:231` (`fail_payment`)
- **확인**: ACL `confirm_payment`·`fail_payment` 모두 `authenticated=X`. (보안 에이전트는 "service_role 전용"이라 했으나 실제 ACL은 노출 상태 — **불일치, DB가 정답**.)
- **악용 위험**: confirm_payment가 Toss 검증 없이 주문을 completed로 만들고 라이선스/구독을 부여한다면, 임의 사용자가 자기 pending 주문을 직접 승인해 **무료로 콘텐츠/구독 취득** 가능. Edge `toss-confirm`은 Toss 검증 후 호출하지만 직접 RPC는 그 검증을 우회. fail_payment는 타인 결제 방해(N5).
- **수정**: 두 함수를 service_role 전용으로 `REVOKE EXECUTE ... FROM anon, authenticated;` (Edge Function만 호출). **함수 본문이 Toss 검증 없이 권한 부여하는지 즉시 확인.**

### C4. 결제·정산 회계 이력이 계정 삭제 시 CASCADE 영구 소실 🔬
- **위치**: `phase9_payments.sql:29` (payments.user_id), `phase8_revenue_distributions.sql:20` (revenue_distributions.creator_id)
- **확인**: FK 둘 다 `auth.users ON DELETE CASCADE`(confdeltype='c'). orders는 buyer_id=NO ACTION, seller_id=SET NULL, video_id=NO ACTION (orders는 상대적으로 안전).
- **영향**: **2026-06-14 배포한 `/purge-deletions` cron이 auth.users를 삭제 → 결제·정산 원장이 함께 삭제됨.** 전자상거래법(결제·청약철회 기록 5년 보존) 위반 + 정산 분쟁 근거 소실.
- **현재 리스크**: 삭제 대상 0건이라 즉시 사고는 아니나, 삭제 요청이 30일 누적되기 전 반드시 처리.
- **수정**: `payments.user_id`·`revenue_distributions.creator_id` FK를 `ON DELETE SET NULL`(컬럼 nullable화)로 변경, 또는 purge 전 익명화 보존 단계 추가.

### C5. 자동결제(빌링) 첫 결제 멱등성 부재 — 이중 청구
- **위치**: `functions/server/index.ts:953-1022` (billing-auth-confirm), `BillingResult.tsx:48-73`
- **문제**: orderId를 매 호출 `sub_{uid8}_{Date.now()}`로 생성 → `billing_apply_charge`의 order_id 멱등성 무력화. success URL 새로고침/effect 재실행 시 동일 billingKey로 **₩4,900 이중 청구 + 구독 +60일**. (toss-confirm 일반결제는 orderId 고정이라 안전 — 빌링 경로만 구멍.)
- **수정**: 진입 시 최근(5분) completed 자동결제 있으면 멱등 반환, 또는 authKey를 멱등키로 기록. 클라이언트도 처리 후 URL 파라미터 즉시 제거.

### C6. 구독 환불 시 빌링 자동결제 미해지 — 환불 후 재청구
- **위치**: `fixes_audit_20260611.sql:52-55` (admin_refund_payment subscription 분기)
- **문제**: 환불 시 profiles만 free로 내리고 `billing_subscriptions`는 `auto_renew=true, status=active`로 남음 → 다음 billing-run cron이 카드 재청구. 환불로 expires_at=NULL 되어 만료 알림 대상에서도 누락.
- **수정**: 환불 분기에 `UPDATE billing_subscriptions SET auto_renew=false, status='canceled' WHERE user_id=...` 추가.

---

## 🟠 HIGH

### 보안·DB
- **추천 기능 깨짐** 🔬 — `phase31_carousel_genre_likes.sql:66` `get_recommended_videos`에 `#variable_conflict use_column` pragma 없음(DB 확인). OUT 파라미터 `category`와 CTE 컬럼 충돌 → 로그인+이력 사용자 추천 호출 ambiguous 실패. 수정: 본문 첫 줄 pragma 추가.
- **광고 예산 차감 RPC 무인증 위조** 🔬 — `phase8_5_ad_budget_accounting.sql:107` `increment_ad_impressions` ACL `anon/authenticated=X`, 중복·소유권·레이트리밋 검증 없음. 클라이언트가 직접 호출(`DiscoveryFeed.tsx:881`). 경쟁 광고 예산 고갈/자기 노출 부풀리기 가능. 수정: 서버(Edge)에서만 차감 또는 dedup+레이트리밋.
- **크리에이터 통계 IDOR** 🔬 — `get_creator_view_stats`·`get_creator_ad_stats` ACL anon/authenticated=X, `p_creator_id` 본인 강제 없음 → 타인 시청·광고 통계 조회. 수정: 본인 강제 또는 admin 체크.
- **SECURITY DEFINER search_path 미고정** — 2026-05-24 이후 재정의된 `confirm_payment`(결제!), 추천 5종, `track_video_ad_event` 등이 search_path 없음(1회성 보강 DO 블록이 재정의로 풀림). search_path 하이재킹 위험. 수정: 각 함수에 `SET search_path = public` 명시.
- **ad_video_events(source_video_id) 인덱스 누락** — `ads_video_preroll.sql:49`. 정산·광고통계가 source_video_id를 핵심 조인키로 쓰는데 인덱스 없어 풀스캔. 수정: 부분 인덱스 추가.

### 인프라
- **빌드 타입검사 전무** — `package.json` build가 `vite build`뿐, **typescript 미설치**, `tsconfig` strict:false. 타입 버그가 무검증으로 배포됨. 수정: `npm i -D typescript` + `"build":"tsc --noEmit && vite build"`.
- **react-router high 취약점** — `react-router 7.13.0` (오픈 리다이렉트 등). 출하 번들의 유일한 런타임 취약점. 수정: 패치 버전 업그레이드.
- **Vercel 보안헤더 전무** — `vercel.json`에 Cache-Control만. CSP·HSTS·X-Frame-Options·X-Content-Type-Options 없음. 결제+OTT 서비스에 부적절. 수정: 최소 nosniff·HSTS·SAMEORIGIN 추가(Bunny iframe·Toss 도메인 화이트리스트 고려).
- **미사용 거대 의존성 5개** — `react-slick`·`swiper`·`react-dnd`·`react-dnd-html5-backend`·`react-responsive-masonry` import 0건. 제거 권장.

### 프론트엔드
- **장르 라벨 오역** — `Upload.tsx:1942` 미리보기가 `getCategoryLabel`(→ `getGenreLabel`이어야) 사용 → 영어 로케일에서 장르가 한글로 노출.
- **handleAddToCart 실패 무반응** — `ProductDetail.tsx:1010` onAddToCart falsy 시 피드백 없음(미로그인은 App 측 토스트로 일부 커버).

---

## 🟡 MEDIUM

### 결제·정산
- **billing-run 청구 직전 상태 재확인 없음** (race) — `index.ts:1041`. 조회 후 청구 사이 사용자가 auto_renew off 해도 청구됨.
- **구독풀 과소분배** — `phase8_revenue_distributions.sql:149`. 정산월 중간 만료자를 cron이 free로 강등하면 그 달 구독료 냈어도 풀 분자에서 누락 → 크리에이터 분배 과소. 수정: 풀을 profiles.tier가 아닌 해당월 payments(completed subscription) 매출 기준으로.
- **환불 DB 갱신 실패 시 자동복구 없음** — `index.ts:1608`. Toss cancel 성공 후 RPC 실패하면 장부 불일치(돈은 환불, 권한 유지). 수정: 실패 시 Sentry/운영알림.
- **부분 환불 미지원** — `index.ts:1572` cancelAmount 미전송(전액만). 약관에 일할 환불 명시했다면 불일치(정책 확인).
- **원천징수 범위** — `phase32_tax_withholding.sql:97` total 전체에 3.3%(판매·광고·구독분배 혼재). 세무 검토 권장.

### DB
- **handle_new_user 트리거 실패 시 가입 전체 롤백** — `profiles_table.sql:102`. EXCEPTION 미처리. 같은 흐름 알림 트리거엔 안전망 있는데 이건 없음. 수정: `EXCEPTION WHEN OTHERS THEN NULL` 래핑.
- **팔로워 알림 opt-in/opt-out 불일치** — `new_video_follower_notify_20260612.sql:44`. 주석은 opt-in인데 `COALESCE(...,true)`로 opt-out 동작. 의도 확정 필요.
- **collab 알림 CHECK 순서 의존** — `collab_space.sql:93`이 먼저 적용 안 되면 협업 메시지가 CHECK 위반 롤백.
- **get_home_feed 오버로드 잔존 위험** — 2-arg vs 3-arg, 적용 순서 의존.
- **video_likes 테이블 정의 부재** — 리포에 CREATE 없음. `(user_id,video_id)` UNIQUE 미보장 시 좋아요 중복→카운트 과다. 운영 DB 확인 + 정의 파일 추가.
- **동일 함수 다중 정의** — get_recommended_videos(4파일) 등. 정본 파일 명시 필요.

### 프론트엔드
- **effect 취소가드 누락** — MyPage 플레이리스트 영상(`:828`), ProductDetail 광고 await(`:716`), Cinema deps `[tier]`만(showcase 누락 `:177`). 빠른 전환 시 stale 응답/광고 적용.
- **조용한 실패** — Cinema/Ott 캐러셀 로딩 실패 무음(빈 화면), MyPage loadPayoutInfo·영상편집 메타 error 미검사.
- **SearchPage 결과 race** — `:210` cancel/seq 가드 없음.
- **댓글 삭제 카운트 비대칭** — 작성은 +1 하나 삭제 시 부모 통지 없어 과대 표시.
- **CommentItem 매 렌더 리마운트** — `CommentPanel.tsx:436` 내부 정의 → 인라인 수정 중 포커스/초안 유실.
- **Market 정렬/필터 버그** (단, Market은 죽은 코드 → 삭제로 해소).

### 미완성·인프라
- **2FA "준비 중" 버튼 노출** — `MyPage.tsx:1999`. 클릭 시 토스트만. 베타에선 숨김 권장.
- **이메일 변경 기능 부재** — updateUser({email}) 흐름 없음(비번 재설정은 있음).
- **과대 청크 1MB** — index 1MB·video-js 695KB·BarChart 393KB. manualChunks/lazy 권장.
- **프로덕션 console.log 노이즈** — src 41건 + 부팅 배너. `esbuild.drop:['console']`(프로덕션) 권장.
- **`.claude/settings.local.json` gitignore 누락** — 향후 실수 커밋 위험. .gitignore 추가.

---

## 🟢 LOW / 정리

- **죽은 파일 5개 삭제** 🔬(import 0건 확인): `AuthModalNew.tsx`(빈 스텁), `Market.tsx`, `PremiumOTT.tsx`, `EmailConfirmationBanner.tsx`, `figma/ImageWithFallback.tsx`.
- **오래된 트리거 search_path 미설정** — update_updated_at_column 등. 일관성 차원.
- **comments UPDATE 정책 WITH CHECK 누락** — `features_tables.sql:34`. 실위험 낮음(USING이 커버), 일관성.
- **전역 404 화면·오프라인 처리 부재** — 현재 쿼리라우팅 폴백은 동작(블로커 아님).
- **로고/icon-512.png 미추적** — 의도면 커밋.
- **i18n 인라인 삼항 다수** — ko/en은 정합(1341키)이나 ja/zh 확장 시 부채. 백로그 "다국어"와 함께.
- **정산 라운딩 손실/광고예산 race 소폭** — 금액 미미, 수용 가능(기록만).

---

## 양호 확인 (직접 검증)
- 시크릿 위생 깨끗 — 커밋된 실키 0건, .env gitignore, 클라이언트는 publishable 키만.
- Edge Function 인증 — billing/purge(cron-secret), send-email(호출자+권한), refund/broadcast(admin) 가드 적절.
- 결제 서버검증 — start_payment 금액 서버검증, toss-confirm 멱등(일반결제), billing_subscriptions 빌링키 REVOKE 이중차단.
- Storage RLS — 본인 폴더 한정. XSS — dangerouslySetInnerHTML 전부 정적 텍스트.
- PWA/SW — 캐싱 전략 안전(stale 청크 없음), 청크에러 자동복구, Sentry env 게이트 견고.
- Vercel SPA fallback·멀티도메인 리다이렉트·캐시정책 정상.

---

## 권장 처리 순서
1. **즉시(출시 블로커)**: C1·C2·C3 (보안 패치 1개 SQL로 묶음) + C4(FK, cron 가동 전).
2. **출시 전(돈)**: C5·C6(빌링 멱등성·환불 해지), N4(라이선스 중복구매).
3. **출시 전(기능)**: 추천 pragma, 광고예산 위조, 통계 IDOR, 빌드 타입검사.
4. **출시 직후**: 보안헤더, react-router 업그레이드, effect 가드, 조용한 실패, 2FA 버튼 숨김.
5. **정리**: 죽은 파일 5개, 미사용 deps 5개, console.log, i18n.
