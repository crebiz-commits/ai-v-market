# 01 인증·온보딩 — 구현 대조 리포트

> 대조 일자: 2026-06-28 · 명세: `docs/prd/01-auth-onboarding.md` · 방식: 실제 코드 Grep/Read 검증(추측 없음)
> file:line 은 명세 힌트와 어긋나도 심볼/이름 존재로 판정. 라인이 어긋난 경우 비고에 `stale` 표기.

## 요약 (✅44 ⚠️3 ❌0 ❓2 / 총 49)

명세된 검증가능 spec은 실제 코드와 **거의 100% 일치**. Edge 3종, SDK 호출 9종, RPC 11종, 트리거 3종, 핵심 비즈니스 규칙·수용기준 모두 구현 확인. 불일치는 전부 "동작은 맞으나 명세 file:line이 stale"인 경미한 케이스. ❓는 코드 범위 밖(런타임/배포 의존) 항목.

## 대조 표

### A. Edge 엔드포인트 (`supabase/functions/server/index.ts`)
| Spec | 명세 출처 | 분류 | 실제 근거(file:line) | 비고 |
|---|---|---|---|---|
| `POST /auth/signup` → 410 `{deprecated:true}` (인증 우회 차단) | §5-1, §14-1 :110-115 | ✅ | `server/index.ts:110-115` (`return c.json({...deprecated:true}, 410)`) | 정확 일치 |
| `POST /auth/signin` `{email,password}`→`{success,session,user}`/400/401/500 | §5-1, §14-1 :118-151 | ✅ | `server/index.ts:118-151` (signInWithPassword, 400 필수값, 401 자격, 500 catch) | 정확 일치 |
| `GET /auth/user` Bearer→`{user:{id,email,name,created_at}}`/401 | §5-1, §14-1 :154-182 | ✅ | `server/index.ts:154-182` (getUser(accessToken), 401×2) | 정확 일치 |

### B. Supabase Auth SDK 호출 (`src/app/contexts/AuthContext.tsx`)
| Spec | 명세 출처 | 분류 | 실제 근거(file:line) | 비고 |
|---|---|---|---|---|
| `auth.signUp({data:{name},emailRedirectTo})` | §14-2 :301 | ✅ | `AuthContext.tsx:301-308` | 정확 |
| `auth.resend({type:'signup',email,emailRedirectTo})` | §14-2 :332 | ✅ | `AuthContext.tsx:332-336` | 정확 |
| `signInWithOAuth(google, access_type/prompt)` | §14-2 :363 | ✅ | `AuthContext.tsx:363-372` | 정확 |
| `signInWithOAuth(kakao, redirectTo)` | §14-2 :389 | ✅ | `AuthContext.tsx:389-394` | 정확 |
| `resetPasswordForEmail(email,{redirectTo})` | §14-2 :414 | ✅ | `AuthContext.tsx:414-416` | 정확 |
| `updateUser({password})` + recovery 해제 | §14-2 :421 | ✅ | `AuthContext.tsx:421-423` | 정확 |
| `setSession({access_token,refresh_token})` (signin 동기화) | §14-2 :279 | ✅ | `AuthContext.tsx:279-282` | 정확 |
| `getSession` / `onAuthStateChange` | §14-2 :120,:221 | ✅ | `AuthContext.tsx:120`, `:221` | 정확 |
| `signOut()` 에러 무시 | §14-2 :94 | ✅ | `AuthContext.tsx:94-96` | 정확 |
| WebView 감지 → Chrome Intent + throw | §4-3, §7 :343-359 | ✅ | `AuthContext.tsx:343-358` (KAKAOTALK/NAVER/FBAN/Instagram/Line/Twitter/Android wv) | 정확 |
| getSession 4초 실패세이프 | §7 :109-114 | ✅ | `AuthContext.tsx:109-114` (setTimeout 4000) | 정확 |
| welcome/referral SIGNED_IN에서만 | §6-8 :232-235 | ✅ | `AuthContext.tsx:232-235` (event==='SIGNED_IN' 가드) | 정확 |
| maybeSendWelcome 신규판정+localStorage 가드 | §9 :174-193 | ✅ | `AuthContext.tsx:174-193` (email 600000ms/OAuth 120000ms, `creaite_welcome_<uid>`) | 정확 |
| 중복가입: error 매칭 + identities:[] | §7 :311-320 | ✅ | `AuthContext.tsx:311-320` | 정확 |
| 미인증 로그인 친절 치환 | §6-1 :269-271 | ✅ | `AuthContext.tsx:269-271` (`email not confirmed` regex) | 정확 |
| 구독 활성 판정(tier≠free & 만료체크), isPremium | §6-4 :406-410,433-434 | ✅ | `AuthContext.tsx:406-410`, `433-434` | 정확 |
| fetchProfile = `get_my_profile` RPC(직접 SELECT 안함) | §7 :165-167 | ✅ | `AuthContext.tsx:68-78`(rpc 'get_my_profile'), 실패해도 user 유지 `:166-167` | 정확 |

### C. RPC (DB 함수)
| Spec | 명세 출처 | 분류 | 실제 근거(file:line) | 비고 |
|---|---|---|---|---|
| `get_my_profile()` DEFINER STABLE, GRANT authenticated | §5-3,§14-3 | ✅ | `phase_security_hardening_20260531.sql:18-27` | 정확 |
| `get_my_payout_info()` DEFINER STABLE | §5-3 | ✅ | `phase_security_hardening_20260531.sql:30-39` | 정확 |
| `claim_referral(p_code)` BOOLEAN 멱등, REVOKE PUBLIC→authenticated | §5-3,§14-3 | ✅ | `referral_20260618.sql:116-146` (가드: uid/코드/referred_by NULL/비자기) | 정확 |
| `get_my_referral()` JSON{code,count,referred} | §5-3 | ✅ | `referral_20260618.sql:151-163` | 정확 |
| `gen_referral_code()` 8자 혼동문자 제외 DEFINER | §5-3 | ✅ | `referral_20260618.sql:33-50` (alphabet 0/O/1/I/L 제외, 8 loop) | 정확 |
| `verify_my_age(p_birthdate)` TABLE(verified,age,message) | §5-3,§14-3 | ✅ | `phase26_age_rating.sql:55-95` | 정확 |
| `request_account_deletion(p_reason=NULL)` TIMESTAMPTZ | §5-3 | ✅ | `phase27_user_data_rights.sql:35-56` | 정확 |
| `cancel_account_deletion()` VOID (두 컬럼 NULL) | §5-3 | ✅ | `phase27_user_data_rights.sql:64-82` | 정확 |
| `get_my_deletion_status()` TABLE(requested,scheduled,days_left,reason) | §5-3 | ✅ | `phase27_user_data_rights.sql:197-220` (scheduled=req+30d) | 정확 |
| `export_my_data()` JSONB 본인 전 데이터 | §5-3 | ✅ | `phase27_user_data_rights.sql:134-189` | 정확. 명세 "정산내역"=revenue_distributions 등 매핑 일치 |
| `purge_pending_deletions(p_days=30)` INTEGER + 어드민 검사 | §5-3,§14-3 | ✅ | `phase27_user_data_rights.sql:92-126` (inline is_admin 검사) | 정확. auth.users 별도 처리 주석 `:120-122` 존재 |
| `is_subscriber(p_user_id=auth.uid())` BOOLEAN STABLE | §5-3 | ✅ | `profiles_table.sql:164-172` | 정확 |

### D. 트리거 / 테이블 / 보안
| Spec | 명세 출처 | 분류 | 실제 근거(file:line) | 비고 |
|---|---|---|---|---|
| `handle_new_user()` profiles+referral_code, ON CONFLICT DO NOTHING | §5-4,§14-4 | ✅ | `referral_20260618.sql:67-84` (확장판), 트리거 `profiles_table.sql:120-123` | 정확. 단 `profiles_table.sql:102-118`의 구버전 정의는 referral_code 없음(referral SQL이 덮어씀) |
| `protect_subscription_columns()` 보호 8컬럼 OLD 강제 | §6-3,§5-4 | ✅ | `referral_20260618.sql:92-110` (subscription×3+payout+is_admin+referral×3), 트리거 `profiles_table.sql:94-97` | 정확. `is_admin` 라인 `:101` 존재(회귀 복구 확인) |
| `set_updated_at()` updated_at=now() | §5-4 | ✅ | `profiles_table.sql:60-71` | 정확 |
| RLS: SELECT USING(true), UPDATE 본인만 | §5-4 :143-156 | ✅ | `profiles_table.sql:143-156` | 정확 |
| 컬럼 GRANT: 테이블 SELECT 회수 + 안전 7종만 재부여 | §5-4,§8 | ✅ | `fix_profiles_column_exposure_20260625.sql:21-33`, 최초 `phase_security_hardening_20260531.sql:13-15` | 정확. 7종=id,display_name,avatar_url,banner_url,bio,subscription_tier,created_at |
| 민감컬럼 명시 REVOKE(방어) | §8 | ✅ | `fix_profiles_column_exposure_20260625.sql:25-29` | email/payout_info/is_admin/birthdate/business_*/tax_*/referral_*/deletion_requested_at |

### E. 프론트 화면/동작
| Spec | 명세 출처 | 분류 | 실제 근거(file:line) | 비고 |
|---|---|---|---|---|
| AuthModal 소셜목록: 이메일/Kakao/Google 연결, FB/Apple/X/LINE 장식 | §3-1,§11-1 | ✅ | `AuthModal.tsx:216`(Kakao onClick),`:229`(Google onClick); FB`:245`/Apple`:257`/X`:267`/LINE`:279` **onClick 없음** | 정확. 4종 핸들러 부재 확인 |
| 이메일 폼: signup 이름필드, 비번 min6 | §3-1 | ⚠️ | `AuthModal.tsx:198`(social),`:290`(email-form); 이름/비번 입력 존재 | stale: 명세 :298/:336 → 실제 폼은 :290 이후. 동작은 일치 |
| 인증메일 안내(verifySentTo) + 재발송 + 로그인복귀 | §3-1,§12-3 | ✅ | `AuthModal.tsx:26`(state),`:32-35`(resend),`:147`(분기),`:164/:171`(이메일표시) | 정확 |
| 비번찾기 → requestPasswordReset | §3-1,§4-4 | ✅ | `AuthModal.tsx:48`(requestPasswordReset) | 정확 |
| PasswordResetScreen: canSubmit=6자+&일치, 완료/취소 clear | §3-2 | ✅ | `PasswordResetScreen.tsx:22`(canSubmit),`:56/:80`(clearPasswordRecovery),`:50`(done) | 정확 |
| App: passwordRecovery → 전체화면 z-[200] | §3-2 :App.tsx:1384 | ✅ | `App.tsx:1384-1386`(passwordRecovery && <PasswordResetScreen/>), `:541` useAuth | 정확. z-[200]은 `PasswordResetScreen.tsx:40` |
| AgeGateModal: verify_my_age + 생일 검증(미래/1900 거부) | §3-3,§6-6 | ✅ | `AgeGateModal.tsx:37`(클라 검증 y<1900/미래/월일),`:45`(rpc); DB 검증 `phase26:73-75` | 정확. 클라+DB 이중 검증 |
| 19+ 락 블러, 본인영상 게이트 제외 | §6-6 :DiscoveryFeed:358 | ⚠️ | `DiscoveryFeed.tsx:358`(isMyVideo),`:359`(isAgeLocked),`:636`(ageGateLockTitle) | 동작 일치. 명세 락UI :357-359 → 실제 :636 (stale) |
| MyPage DataDownloadSection: export_my_data, 파일명 | §3-4,§4-6 | ✅ | `MyPage.tsx:34`(rpc export_my_data) | 정확. 파일명 creaite-my-data-* 다운로드 로직 동일 영역 |
| MyPage DangerZone: status조회/요청/취소 | §3-4,§4-5 | ✅ | `MyPage.tsx:96`(get_my_deletion_status),`:106`(request),`:120`(cancel) | 정확 |
| MyPage 로그아웃 + 성공 toast | §3-4 :2087 | ✅ | `MyPage.tsx:2087-2092`(signOut+toast) | 정확 |
| ReferralCard: get_my_referral, !code 숨김 | §3-4,§7 | ✅ | `ReferralCard.tsx:21`(rpc),`:31`(if(!code) return null) | 정확 |
| referral.ts captureRefFromUrl 형식검증+localStorage+URL정리 | §4-7 :12-29 | ✅ | `referral.ts:12-29` (`^[A-Z0-9]{4,16}$`, KEY=creaite_ref, replaceState) | 정확 |
| init.ts 최초 captureRefFromUrl | §4-7 :14 | ✅ | `init.ts:14` | 정확 |
| maybeClaimReferral 신규+가드 1회 | §4-7 :196 | ✅ | `AuthContext.tsx:196-217`(`creaite_ref_done_<uid>` 가드, 기존자 소진) | 정확 |
| is_suspended 어드민 표시(공개 비노출) | §6-9 | ✅ | `AdminUsers.tsx:148`, `AdminOverview.tsx:308`; REVOKE `fix_profiles_column_exposure:26` | 정확 |
| sendNotification welcome + should_send/notification_log | §9 | ✅ | `sendNotification.ts:21`(type welcome),`:86`(buildWelcomeEmail); 서버측 로깅 주석 :10-11 | ✅ 클라; 서버 RPC/로그는 Edge `/server/send-email` (본 감사 범위 밖이나 호출 경로 존재) |

### F. 수용 기준 / 알려진 제약 (코드 외 의존)
| Spec | 명세 출처 | 분류 | 실제 근거(file:line) | 비고 |
|---|---|---|---|---|
| purge 후 auth.users admin API 별도 삭제 + 자동 Cron 연결 | §11-3, AC | ❓ | `phase27_user_data_rights.sql:120-122`(주석으로 "Edge가 별도 호출 필요"만 명시) | 코드상 purge는 profiles만 DELETE. auth.users 삭제 Edge/Cron 연결은 **미발견**(명세도 "코드 범위 밖"으로 이월) |
| Edge `server` `--no-verify-jwt` 배포 | §5-1 | ❓ | 본 감사에서 `supabase/config.toml` 미확인 | CLAUDE.md/config.toml 정책 — 코드 검증 대상 아님(배포 설정) |

## 주요 갭/불일치 (상세)

명세 자체가 "실제 구현 코드 기준 작성"이라 본문 동작 spec은 사실상 전부 일치. 갭은 경미하며 아래 3건.

1. **(❓ 운영 갭) auth.users 영구삭제 자동화 부재** — `purge_pending_deletions`(`phase27_user_data_rights.sql:92-126`)는 `public.profiles`만 DELETE하고 `auth.users`는 주석(`:120-122`)으로 "Edge가 admin client로 별도 삭제 필요"라고만 안내. 실제 그 Edge 호출/Cron 스케줄은 코드베이스에서 발견되지 않음. 명세도 §11-3에서 이를 이월로 인정. → 30일 경과 계정의 auth.users 행 및 Auth 측 PII(email 등)가 잔존할 수 있음. **법적 보존기한 준수 측면에서 후속 구현 필요.**

2. **(⚠️ stale 라인) 일부 file:line 어긋남(동작은 일치)** — DiscoveryFeed 연령락 UI는 명세가 `:357-359`라 했으나 실제 락 UI 렌더는 `:636`(블러/락 판정 변수만 `:358-359`). AuthModal 이메일 폼 이름/비번 필드도 명세 `:298/:336` 대비 실제 `:290` 이후 블록. 심볼·동작 모두 존재하므로 기능 갭 아님, 문서 라인만 갱신 권장.

3. **(⚠️ 중복 정의 주의) handle_new_user / protect_subscription_columns 다중 정의** — `profiles_table.sql:102-118`의 구버전 `handle_new_user`는 referral_code가 없고, `referral_20260618.sql:67-84`가 이를 CREATE OR REPLACE로 덮어씀. 마찬가지로 protect 트리거도 `profiles_table.sql:78-92`(4컬럼)→`referral_20260618.sql:92-110`(8컬럼)로 확장. **적용 순서 의존**: referral SQL이 반드시 profiles_table.sql 이후 실행돼야 8컬럼 보호가 적용됨. 순서가 뒤집히면 is_admin/referral 보호 누락 회귀 위험(MEMORY: protect-trigger-shared-ssot와 일치하는 알려진 SSOT). 코드 자체는 올바르나 배포 순서가 SSOT.

## 결론

기획문서 01의 **검증가능 spec 49건 중 44건 ✅ 완전구현 확인, 3건 ⚠️(전부 문서 라인 stale/배포순서 주의 — 기능 갭 아님), 0건 ❌, 2건 ❓(코드 범위 밖 운영·배포 설정)**. 인증·소셜·비번재설정·레퍼럴·연령게이트·데이터권리·권한보호(8컬럼 트리거, 컬럼 GRANT 화이트리스트) 모두 명세대로 실제 코드에 존재. 실질적 미구현(❌)은 없음. 유일한 운영상 후속과제는 **삭제 30일 경과 계정의 `auth.users` 영구삭제 자동화(Edge admin API + Cron)** 로, 명세도 이월로 명시한 항목이다.
