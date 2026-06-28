# 감사: 09 콘텐츠정책·보안·데이터모델·기술 — 명세 ↔ 코드 대조

> 대상 명세: `docs/prd/09-policy-security-data-tech.md`
> 방식: 명세의 `파일:줄` 근거를 **실제 SQL/Edge 코드를 Read·Grep 으로 실측**. 추측 없음.
> 분류: ✅ 명세=코드 일치 / ⚠️ 일치하나 단서(stale 줄·운영 주의) / ❌ 불일치·미구현 / ❓ 미확인
> 핵심 목적: **보안 회귀 방지 — protect 8컬럼 / profiles GRANT 화이트리스트 / 금지선 현재 위반 여부 실측.**

---

## 1. 명세 항목별 대조표

| # | 명세 항목 (§) | 명세 근거 | 실측 결과 | 분류 |
|---|---|---|---|---|
| 1 | protect 트리거 8컬럼(특히 is_admin) | §3.1, fix_protect_is_admin_20260624.sql:18-32 | `fix_protect_is_admin_20260624.sql:18-31` 에 구독3+payout_info+**is_admin(:27)**+referral3 = **8컬럼 전부** 존재. SECURITY DEFINER + `SET search_path='public','pg_temp'`(:14) | ✅ |
| 2 | 트리거 연결(BEFORE UPDATE) | §3.1, profiles_table.sql:94-97 | `profiles_table.sql:94-97` `profiles_protect_subscription BEFORE UPDATE ... protect_subscription_columns()` 실측 일치 | ✅ |
| 3 | profiles 테이블 SELECT 통째 REVOKE | §3.2, fix_profiles_column_exposure_20260625.sql | `:21-22` `REVOKE SELECT ON public.profiles FROM anon, authenticated` + `FROM PUBLIC`. 방어적 13컬럼 명시 REVOKE(:25-29) | ✅ |
| 4 | 안전 7컬럼만 재GRANT | §3.2 (id,display_name,avatar_url,banner_url,bio,subscription_tier,created_at) | `fix_profiles_column_exposure_20260625.sql:32-33` 정확히 7컬럼. `phase_security_hardening_20260531.sql:14-15` 동일 7컬럼(1차) | ✅ |
| 5 | 테이블 전체 GRANT(컬럼없이) 부재 = 금지선 미위반 | §3.2 🚫금지선 | profiles 에 `GRANT SELECT`(컬럼 미지정)는 코드 어디에도 없음. fix 파일이 마지막 SSOT. **현재 금지선 위반 없음** | ✅ |
| 6 | is_admin() SQL DEFINER (RLS 내부용) | §2.2, admin_rls_is_admin_function.sql:21-27 | `admin_rls_is_admin_function.sql:21-25` SQL STABLE SECURITY DEFINER, `SET search_path=public`(:24). anon/authenticated EXECUTE(:27) | ✅ |
| 7 | assert_admin() plpgsql DEFINER (RPC 가드) | §2.2, phase10_6_admin_management.sql:18-34 | `phase10_6_admin_management.sql:18-34` 존재. 미인증→예외(:26-28), 비어드민→예외(:30-32) | ⚠️ |
| 8 | 신고 자동숨김 임계값(3) → video/comment/community_post | §1.4, phase10_reports.sql:155-171 | `phase10_reports.sql:149` threshold=COALESCE(...,3), `:155-169` pending≥threshold 시 3종 자동 is_hidden. **user 자동정지 안 함(:170)** 일치 | ✅ |
| 9 | moderate_report keep/remove/dismiss (remove+user면 is_suspended) | §1.4, phase10_reports.sql:215-266 | `phase10_reports.sql:215-267` keep=복원+pending일괄, remove=숨김(+user면 is_suspended=true :247-251), dismiss=단건(:253-258) | ⚠️ |
| 10 | 정지 사용자 쓰기 차단 트리거 8개 | §1.5, block_suspended_writes_20260625.sql | `block_suspended_writes_20260625.sql` `is_self_suspended()`(:16-21)+`tg_block_suspended()`(:23-34). 트리거 8개: comments/community_posts/collab_posts/creator_followers/post_likes/comment_likes/video_likes/reports(:37-69) | ✅ |
| 11 | 정지 계정 업로드 Edge 403 (트리거 미적용 경로 보강) | §1.5, index.ts:220-222 | `functions/server/index.ts:220-222` `if(_rlProf?.is_suspended) return 403`. create-upload 라우트 내부 | ✅ |
| 12 | 연령등급 컬럼·CHECK(all/13/15/19)·부분인덱스 | §1.2, phase26_age_rating.sql:18-37 | `phase26_age_rating.sql:18-19` DEFAULT 'all', CHECK(:26-28), 부분인덱스 `age_rating<>'all'`(:35-37) | ✅ |
| 13 | verify_my_age DEFINER + 자가입력 MVP | §1.2, phase26_age_rating.sql:50-95 | `phase26_age_rating.sql:50` MVP 코멘트, `:55-` DEFINER+search_path. 실명/통신사 인증 미구현(부채 §9) | ⚠️ |
| 14 | 모더레이션 점수→상태 규칙(≥90 reject+숨김 / 70~90 flag / <70 pass) | §1.3, phase25_moderation.sql:50-91 | `phase25_moderation.sql:67-77` error/NULL→pending, ≥90 rejected+hide, ≥70 flagged, else passed. is_hidden CASE(:85) 일치 | ✅ |
| 15 | update_video_moderation service_role 전용 | §1.3 / §10, phase25_moderation.sql:93-94 | `phase25_moderation.sql:93-94` 코멘트+`GRANT EXECUTE ... TO service_role`. authenticated REVOKE는 `phase_security_hardening_20260531.sql:48` | ✅ |
| 16 | 영상 길이별 광고 게이팅(1분 미만/10분 미만 차단) | §1.1, content_policy_v2.sql:143-151 | `content_policy_v2.sql:143-151` preroll/overlay/postroll/bumper<60s RETURN, midroll<600s RETURN | ✅ |
| 17 | platform_settings 6키 기본값 | §1.1, content_policy_v2.sql:25-32 | `content_policy_v2.sql:25-32` 6키(30/60/600/60/60/600) 정확 일치 | ✅ |
| 18 | Bunny TTL 페이월(비구독 150s / 풀 4h) | §1.1, index.ts:345 | `functions/server/index.ts:345` `const ttl = fullAccess ? 4*3600 : 150` 정확 일치 | ✅ |
| 19 | 토스 confirm DB금액 대조 + 멱등 | §4.1, index.ts:1075-1082 | `index.ts:1075-1078` 금액 불일치 400 거부, `:1080-1082` completed면 alreadyProcessed | ✅ |
| 20 | 빌링 cron-secret 검증 + 원자적 claim | §4.2, index.ts:1254-1267 | `index.ts:1254-1256` x-cron-secret 검증 401, `:1266-1267` billing_claim_due RPC(FOR UPDATE SKIP LOCKED) | ✅ |
| 21 | search_path 일괄 보강 마이그레이션 | §2.3, security_definer_search_path_fix.sql:26-66 | `security_definer_search_path_fix.sql:26-66` pg_proc 스캔 후 미설정 DEFINER 함수에 ALTER SET search_path 적용. 검증쿼리 동봉(:71-82) | ✅ |
| 22 | Edge `server` --no-verify-jwt | §6 / §10, config.toml | `supabase/config.toml:7-8` `[functions.server] verify_jwt = false`. 배포 주석 경고 동봉(:4) | ✅ |
| 23 | videos SELECT RLS(공개/본인/관리자) | §3.3, videos_select_rls_20260620.sql:27-32 | `videos_select_rls_20260620.sql:27-32` `(visibility IN public,unlisted AND is_hidden=false) OR creator_id=auth.uid() OR is_admin()` 일치 | ✅ |
| 24 | 커뮤니티 작성자 위장 차단(추가 발견) | (명세 미기재) community_security_20260621.sql | `community_security_20260621.sql:11-29` tg_force_post_author 가 author_name/avatar 를 profiles 값으로 강제 덮어씀 | ✅ |

---

## 2. 보안 회귀/금지선 실측 (감사 핵심)

### 2.1 protect 트리거 — is_admin 보호 (권한상승 회귀)
- **현재 SSOT(`fix_protect_is_admin_20260624.sql`)는 8컬럼 완전판.** is_admin 보호 줄 실측됨(:27).
- **그러나 동일 트리거를 덮는 OLD 정의가 작업트리에 2곳 잔존:**
  - `profiles_table.sql:78-92` — **구독3+payout_info 4컬럼만. is_admin·referral 누락.** (가장 오래된 정의)
  - `referral_20260618.sql:92-103` — 현재는 is_admin 줄 **포함(:101)**으로 패치돼 있음(역사적 회귀가 파일에 반영 복구됨).
- **회귀 조건(현존 위험):** `profiles_table.sql` 을 `fix_protect_is_admin_20260624.sql` **이후**에 재적용하면 트리거가 4컬럼판으로 되돌아가 → 일반 사용자 `UPDATE profiles SET is_admin=true` 가능 = 권한 탈취. 명세 §8/§10의 "fix 가 마지막" 순서 규칙이 **운영상 필수 방어선**.
- **현재 코드 자체에 금지선 위반은 없음**(fix 파일이 SSOT로 존재). 위험은 "적용 순서" 운영 절차에만 의존.

### 2.2 profiles 컬럼 GRANT 화이트리스트 (PII 유출 금지선)
- `GRANT SELECT ON public.profiles`(컬럼 미지정) 패턴 **코드 전체에 없음.** 금지선 미위반.
- 안전 7컬럼 GRANT 가 `fix_profiles_column_exposure_20260625.sql:32-33`(최신) 과 `phase_security_hardening_20260531.sql:14-15`(1차) **양쪽 동일**.
- **회귀 조건:** 새 PII 컬럼을 7컬럼 목록에 추가하거나, 테이블 단위 GRANT 를 fix 이후 실행하면 재유출. §3.2 금지선 준수 = 운영 절차 의존.

### 2.3 update_video_moderation 권한
- authenticated REVOKE(`phase_security_hardening_20260531.sql:48`) + service_role GRANT(`phase25_moderation.sql:94`) **둘 다 실측.** 위변조 차단 유효.

---

## 3. ⚠️ 단서(stale 줄 / 명세-코드 미세 불일치)

1. **`assert_admin()` 의 search_path 인라인 미설정** — `phase10_6_admin_management.sql:18-34` 정의에는 `SET search_path` 가 **없다.** 명세 §2.3 "모든 DEFINER 함수에 SET search_path" 는 이 함수의 경우 **별도 인라인이 아니라 `security_definer_search_path_fix.sql` 의 일괄 ALTER 에 의존**한다(검증쿼리로 0행 확인 필요). 신규 환경에서 search_path fix 미적용 시 이 함수만 search_path 비고정 상태가 됨 → 출시 체크리스트 4번이 실제 방어선.
2. **`moderate_report` 어드민 가드는 inline** — 명세 시퀀스(b)·§1.4 는 "assert_admin 선행"으로 묘사하나, 실제 `phase10_reports.sql:199-201` 은 `SELECT is_admin INTO ...` 인라인 체크다(기능 동등, but assert_admin 호출 아님). 명세 표현이 약간 stale. `resolve_moderation_flag`/`admin_unhide_post` 는 실제 `assert_admin()` 호출(phase_security_hardening:90,118).
3. **`phase26_age_rating.sql` 줄번호 미세 shift** — 명세가 인용한 `:55-95`(verify_my_age) 범위는 실측상 함수가 `:55` 부터 시작하나 본문 끝줄은 파일 길이에 따라 약간 다를 수 있음(시작점·DEFINER·search_path는 일치 확인). 등급 컬럼/CHECK/인덱스(:18-37)는 정확.

---

## 4. 출시 전 보안 체크리스트(§10) 충족표

| 체크 항목 | 코드 근거 | 충족 |
|---|---|---|
| protect 8컬럼(is_admin 포함) | fix_protect_is_admin_20260624.sql:18-31 | ✅ (단 적용순서 의존) |
| profiles GRANT = 안전 7개만 | fix_profiles_column_exposure_20260625.sql:32 | ✅ (단 적용순서 의존) |
| videos SELECT RLS 공개/본인/관리자 | videos_select_rls_20260620.sql:27-32 | ✅ |
| 모든 DEFINER search_path 설정 | security_definer_search_path_fix.sql:26-66 | ⚠️ 일괄 ALTER 적용·검증쿼리 0행 필요(assert_admin 등 인라인 미설정 함수 존재) |
| confirm_payment REVOKE / update_video_moderation service_role 전용 | phase25_moderation.sql:94, phase_security_hardening_20260531.sql:48 | ✅ (confirm_payment REVOKE 는 본 감사 미실측 — §5 참조) |
| billing_subscriptions 테이블 REVOKE(billing_key 0노출) | (billing_subscriptions_20260612.sql — 본 감사 미실측) | ❓ |
| payments/revenue/orders FK SET NULL | (security_patch_critical_20260614.sql — 본 감사 미실측) | ❓ |
| Edge --no-verify-jwt + 시크릿 전체 | config.toml:7-8 | ✅ (시크릿 실재 여부는 런타임 — 미확인) |
| 정지 쓰기 차단 트리거 8개 | block_suspended_writes_20260625.sql:37-69 | ✅ |
| ad-fraud Edge 재설계(토스 라이브 전) | (ad-fraud-hardening-plan.md — 미구현 부채) | ❌ (계획만, 결제 라이브 전 필수) |
| 적용 순서 fix 파일 마지막 | §8 운영 절차 | ⚠️ 코드 강제 불가, 절차 의존 |

---

## 5. 결론

- **명세 09 의 보안 핵심 주장은 실제 코드와 광범위하게 일치(✅ 19/24).** 특히 회귀방지 SSOT 3종(protect 8컬럼·profiles GRANT 7컬럼·update_video_moderation service_role)이 모두 최신 fix 파일에 실측 존재하며, **현재 작업트리 코드에 금지선 위반은 발견되지 않음.**
- **단, 두 금지선(protect / profiles GRANT)의 방어는 "코드"가 아니라 "적용 순서 운영 절차"에 의존한다.** `profiles_table.sql:78-92` 에 4컬럼짜리 OLD protect 정의가, 그 외 여러 파일에 OLD GRANT 가 잠재해 있어, fix 파일이 마지막으로 적용되지 않으면 권한상승·PII 유출이 재발한다.
- search_path 고정은 일괄 ALTER 마이그레이션에 의존하며 일부 함수(assert_admin)는 인라인 미설정 → 신규 환경 셋업 시 반드시 검증쿼리 0행 확인 필요.

### 갭 3개 (우선순위순)

1. **[보안 회귀 — 적용순서 의존, 코드강제 없음]** `protect_subscription_columns` 의 OLD 4컬럼판(`profiles_table.sql:78-92`)과 profiles 안전7컬럼 이전의 GRANT 정의가 작업트리에 공존. 운영자가 `fix_protect_is_admin_20260624.sql` / `fix_profiles_column_exposure_20260625.sql` 를 **마지막에** 적용하지 않으면 `is_admin` 자가승격·전사 PII 덤프가 재발(과거 실제 사고). 권장: 두 fix 의 내용을 base 파일(`profiles_table.sql`)에 병합해 SSOT 단일화하거나, `_verify_migrations_applied.sql` 에 `pg_get_functiondef` is_admin 줄 검사 + `role_column_grants` 7컬럼 검사를 게이트로 박을 것.

2. **[search_path 인라인 누락]** `assert_admin()`(phase10_6_admin_management.sql:18-34) 등 일부 SECURITY DEFINER 함수가 인라인 `SET search_path` 없이 일괄 ALTER(`security_definer_search_path_fix.sql`)에만 의존. 신규/재구축 환경에서 그 마이그레이션 누락 시 search_path hijacking 노출. 권장: assert_admin 정의에 `SET search_path = public, pg_temp` 인라인 추가(멱등).

3. **[ad-fraud 미구현 — 결제 라이브 차단 항목]** §10 "광고 결제 토스 라이브 전 ad-fraud Edge 재설계"는 계획문서(ad-fraud-hardening-plan.md)만 있고 미구현(❌). 현재 자체광고 OFF·과금 전이라 실손해 0이나, 토스 광고결제 활성화 전 반드시 선행해야 하는 출시 게이트.
