# 출시 전 다중 점검 결과 (2026-05-31)

8개 영역 병렬 정적 감사 + 적대적 재검증(에이전트 50개). 원발견 42건 중 **확인된 실제 결함 30건**.
중복(같은 이슈 2영역 중복 보고) 제외 시 고유 ~27건. 심각도순.

> 검증 방식: 각 결함은 독립 에이전트가 "반증 시도(다른 곳에서 처리되는지/오해인지 확인)" 후 isReal=true 로 확정한 것만 등재.

---

## 🔴 CRITICAL (2)

### C1. 시청 등급 '12+' 선택 시 게시 전체 실패 + 고아 Bunny 영상
- 위치: `Upload.tsx:64,1230` + `phase26_age_rating.sql:28` + `index.ts:298`
- Upload UI는 2번째 등급 value를 `'12'`로 보내는데 DB CHECK는 `('all','13','15','19')`만 허용 → upsert 제약 위반 → save-metadata 500 → 게시 실패. 이미 Bunny 업로드는 끝나 고아 영상 잔존. 편집모달(VideoEditModal)·읽기측은 모두 `'13'` 표준 → 신규 업로드만 비대칭으로 깨짐.
- 수정: Upload value `'12'→'13'` (label만 "12+" 유지 가능).

### C2. profiles RLS `USING(true)` → 전 사용자 금융 PII(계좌·사업자번호) 공개 노출
- 위치: `profiles_table.sql:146-149` + `payout_info`(31) + `phase32_tax_withholding.sql:19-39`
- SELECT 정책이 모든 행·모든 컬럼을 anon/authenticated에 허용. RLS는 컬럼 제한 불가 → 누구나 PostgREST로 `select payout_info,business_number from profiles where id='<타인UUID>'` 호출해 타인 계좌번호·예금주·사업자등록번호 조회 가능.
- 수정: 민감 컬럼 별도 테이블 분리(본인+어드민 RLS) 또는 공개 컬럼만 노출하는 VIEW/get_public_profile RPC + profiles SELECT 정책 제한 + 컬럼 GRANT.

---

## 🟠 HIGH (11)

### H1. `/send-email` 오픈 릴레이 — 공개 anon key로 임의 to/html 발송 (피싱·스팸)
- 위치: `index.ts:776-869`, 호출측 `sendNotification.ts:60`
- 핸들러가 호출자 인증 0. anon key(번들 공개)만으로 CREAITE 정식 발신주소(SPF/DKIM 통과)로 임의 HTML을 임의 user_id/to에 발송 가능. should_send_notification은 수신거부만 거름.
- 수정: 토큰 인증 추가 + 발신 정책(본인/어드민/service_role) + to 무시하고 user_id→email 서버조회만 + type별 발신주체 화이트리스트 + 레이트리밋.

### H2. update_video_moderation RPC가 authenticated 전체에 GRANT — 모더레이션 위변조
- 위치: `phase25_moderation.sql:50-93`
- SECURITY DEFINER인데 본문에 권한검증 없음 + `GRANT ... TO authenticated`. 임의 유저가 타인 영상을 강제 rejected+숨김 또는 passed로 변조 가능.
- 수정: GRANT에서 authenticated 제거(service_role만) 또는 본문에 권한 가드.

### H3. get_my_revenue_history(p_creator_id) IDOR — 타인 수익 조회
- 위치: `phase8_revenue_distributions.sql:304-329`
- SECURITY DEFINER + `WHERE creator_id = p_creator_id`만, auth.uid() 본인확인 없음. 임의 UUID로 타인 월별 판매/광고/구독 수익 조회 가능.
- 수정: `WHERE creator_id = auth.uid()` 고정 또는 본인/어드민 가드 + REVOKE/GRANT 정리.

### H4. 자동 rejected 영상을 어드민이 '통과'해도 is_hidden=true 잔존 → 영구 숨김
- 위치: `phase25_moderation.sql:168-171` + `AdminModeration.tsx:401`
- resolve_moderation_flag의 pass 분기가 moderation_status만 passed로 바꾸고 is_hidden은 안 풀어줌. '통과 처리됨' 토스트만 떠 어드민은 복원된 줄 오인.
- 수정: pass 분기에 `is_hidden=false` 추가.

### H5. 댓글/커뮤니티글 복원이 RLS에 막혀 조용히 실패
- 위치: `AdminModeration.tsx:144-149` + `features_tables.sql:34-35,125-126`
- comment/community_post 복원이 RPC 아닌 직접 `.from().update()` → UPDATE RLS가 author-scoped라 어드민은 0행 매칭, 에러 없이 success 토스트만. 영상/사용자는 SECURITY DEFINER RPC라 정상.
- 수정: 기존 admin_unhide_comment RPC 사용 + admin_unhide_post RPC 신설.

### H6. 프로필 배너(banner_url)가 프로필 저장 시마다 조용히 삭제
- 위치: `AuthContext.tsx:62` + `MyPage.tsx:946,1149`
- fetchProfile select에 banner_url 누락 → profile.banner_url 항상 undefined → 편집 저장 시 NULL로 덮어씀. 이름만 바꿔도 배너 사라짐.
- 수정: select 문자열에 `banner_url` 추가.

### H7. resetForm의 미선언 setUploadMethod 호출 → '계속 업로드' 클릭 시 크래시
- 위치: `Upload.tsx:780`
- 미선언 식별자 호출 → ReferenceError로 폼 리셋 중단(다음 업로드 불가). (tsc 단계 없어 빌드는 통과 → 런타임만 터짐)
- 수정: line 780 `setUploadMethod(null);` 삭제.

### H8. 비밀번호 재설정 흐름 부재 — 로그인 전 계정 복구 불가
- 위치: `AuthModal.tsx:241`, `MyPage.tsx:966` (i18n 키 forgotPassword만 존재, 미연결)
- resetPasswordForEmail 코드 0건. 비번 분실 시 자력 복구 경로 전무(이메일/비번 가입자 한정).
- 수정: AuthModal에 '비밀번호 찾기' → resetPasswordForEmail + 재설정 페이지/콜백 구현.

### H9. creator_block 확인창이 '차단 해제할까요?'로 반대 안내
- 위치: `CommentPanel.tsx:416,425`
- 차단 RPC인데 confirm 문구가 confirmUnblock('차단 해제할까요?'). 성공 토스트도 버튼 라벨 재사용.
- 수정: 차단 전용 confirm/toast 키 분리.

### H10. 커뮤니티 글쓰기가 DB에 저장 안 됨 (로컬 state placeholder)
- 위치: `Community.tsx:280-303`
- handleWritePost가 `local-${Date.now()}` id로 setPosts만. supabase insert 0건. community_posts 테이블은 실제 존재. 새로고침 시 글 사라짐, 타인에게 안 보임.
- 수정: community_posts insert + 마운트 시 fetch 전환.

### H11. 커뮤니티 댓글이 고아 post_id에 영구 저장
- 위치: `CommentPanel.tsx` + `CommunityPostDetail.tsx:239` + `Community.tsx:282`
- comments.post_id에 FK 없어 목/로컬 post_id로 INSERT 성공 → 고아 댓글 축적 + 어드민 댓글관리(video_id 기준)에서 누락. H10 선결 필요.

---

## 🟡 MEDIUM (9)

- **M1.** `/moderate-video` 인증 부재 → 임의 호출로 Vision API 비용 소모 + 타인 모더레이션 상태 교란 (`index.ts:885-1009`). (보안영역서도 중복 확인)
- **M2.** ✅ OAuth(Google/Kakao) 신규 가입자 welcome 메일 — SIGNED_IN 시 provider!=email + created_at 2분내 + localStorage 가드로 발송 (`AuthContext.tsx`).
- **M3.** 이메일 가입 직후 자동로그인 실패 시 '가입 실패'로 오인 + welcome 누락 (`AuthContext.tsx:235`).
- **M4.** 댓글 heart/block 실패 toast가 버튼 라벨 재사용(조용한 실패) (`CommentPanel.tsx:395,422`).
- **M5.** toggle_pin/heart: videos.creator_id NULL이면 소유자검증 통과 → 임의 유저 핀/하트 (`phase23_comment_management.sql:173,223`).
- **M6.** 신고 그룹 처리 시 대표 신고자에게만 결과 메일 — 나머지 신고자 통지 누락 (`AdminReports.tsx:86`).
- **M7.** 커뮤니티 글 신고 UI 부재(인프라는 완비, 진입점만 누락) (`CommunityPostDetail.tsx`).
- **M8.** resolve_moderation_flag가 admin_logs 미기록(감사추적 갭) (`phase25_moderation.sql:152-173`).
- **M9.** VAST 트래킹 픽셀이 인증 없이 impression 위조 가능 → 광고수익 부풀리기 (`index.ts:592-634` + 정산 `phase8:182-207`). (베타 House Ads 한정)

---

## 🟢 LOW (5)

- **L1.** `AdminRevenueSettlement.tsx:162` 미정의 타입 `SettlementRow` 참조(→ `Distribution`). 오늘 R5 커밋(bd856e0)에서 유입. 런타임 무해, 타입체크만 실패.
- **L2.** ✅ 자동숨김 배지 임계값 — SettingsContext.autoHideThreshold(platform_settings.auto_hide_threshold 동적, fallback 3)로 교체 (`AdminReports.tsx`+`SettingsContext.tsx`).
- **L3.** user 신고 누적 시 자동 숨김 안 되는데 배지는 '자동 숨김됨' 오표시 (`phase10_reports.sql:170` + `AdminReports.tsx:212`).
- **L4.** 댓글 hide/unhide/delete 로그가 활동로그 화면에 라벨·필터 누락 (`AdminActivityLog.tsx:20-39`).
- **L5.** ✅ AI 검토 배지 — 마운트 1회 조회([]의존, 탭전환 중복제거) + cap 도달 시 99+ 표시 (`AdminModeration.tsx`).

---

## 권장 수정 순서

1. **즉시(자명·안전)**: C1(12→13), H6(banner_url select), H7(setUploadMethod 삭제), H9(차단 confirm), L1(타입). 클라/i18n만.
2. **보안 1차(SQL 마이그레이션)**: H2(GRANT), H3(IDOR), H4(is_hidden), C2(profiles PII), H5(복원 RPC). DROP/CREATE·RLS 재설계 → 검증 후 적용.
3. **인증·릴레이**: H1(/send-email), M1(/moderate-video), M9(VAST) — Edge Function 인증 추가(재배포 필요).
4. **기능 갭**: H8(비번 재설정), H10/H11(커뮤니티 DB 배선), M7(글 신고 UI).
5. **정합·UX**: M2~M6, M8, L2~L5.
