# 06. 커뮤니티 · 채널/팔로우 · 알림 — 명세 ↔ 구현 대조 감사

> 대상 명세: `docs/prd/06-community-channel-notifications.md`
> 감사일: 2026-06-28 · 방식: 실제 SQL/Edge/프론트 파일 Read·Grep 검증(추측 없음)
> 범례: ✅ 일치 · ⚠️ 부분/주의 · ❌ 불일치 · ❓ 미확인

---

## 1. 우선 확인 5항목 (지시 ①~⑤)

| # | 항목 | 분류 | 근거(file:line) |
|---|---|---|---|
| ① | `tg_force_post_author` 트리거 실재 (작성자명 서버 강제) | ✅ | 함수 `community_security_20260621.sql:11-19`, 트리거 community_posts `:21-24` / collab_posts `:26-29`. INSERT·UPDATE 양쪽, `display_name` 없으면 `'CREAITE'` 강제 |
| ② | 신고 rate-limit + 자동숨김 | ✅ | rate-limit 1h 20건 `community_security_20260621.sql:69-72`; 자동숨김 임계 `get_platform_setting('auto_hide_threshold')` 기본 3 `:93-99`, 대상별 UPDATE `:99-113`. user 타입은 자동정지 안 함 `phase10_reports.sql:170` |
| ③ | 새 영상 팬아웃 opt-in 기본 OFF | ✅ | 정본 트리거 `medium_fixes_db_20260614.sql:34-58`, opt-in 게이트 `COALESCE(np.email_new_video_from_followed, false) = true` `:55`, 자기 제외 `:53`. 컬럼 DEFAULT false `new_video_follower_notify_20260612.sql:15-17`. (⚠ 구버전 `:44`는 `,true`였으나 06-14본이 덮어씀 — 적용 순서 주의) |
| ④ | `notifications.type` collab 추가 + 프론트 union 일치 | ✅ | DB CHECK에 collab 포함 `collab_space.sql:93-95`; 프론트 `Notification.type` union에 `"collab"` 포함 `NotificationPanel.tsx:11`, 아이콘/배경 맵에도 `:81,92`. → 명세 §11 "union 미포함" 주석은 **STALE**(이미 수정됨) |
| ⑤ | send-email actor 서버 템플릿 고정 | ✅ | actor 판정 `index.ts:1418`, 고정 subject `:1419-1423`, `buildSafeEmail` 고정 html `:1425-1436`, actor면 클라 subject/html/link 무시 `:1438-1445`. 수신자 항상 user_id 서버 조회 `:1390-1396` |

---

## 2. 비즈니스 규칙 (명세 §6) 대조

| 규칙 | 분류 | 근거 |
|---|---|---|
| 1. 작성자명 서버 강제 | ✅ | `community_security_20260621.sql:11-29` (①과 동일) |
| 2. 공지는 관리자만 | ✅ | 클라 `is_notice: !!profile?.is_admin && writeNotice` `Community.tsx:768`; 공지 항상 최상단 정렬 `:849`. (RLS admin 게이트는 `community_upgrade_20260610.sql` — 본 감사 범위 외 파일, 명세 인용 유지) |
| 3. 숨김 글/댓글 비노출 | ✅ | posts_select 숨김 게이트(본인·admin 예외) `community_security_20260621.sql:35-41`; 댓글은 코드 필터(명세 §5.1, CommentPanel) |
| 4. 신고 자동숨김 + rate-limit | ✅ | ② 참조 |
| 5. 자기 팔로우 금지 | ✅ | DB CHECK `no_self_follow` `creator_followers.sql:21`; 클라 가드 `useFollows.ts:65`; 버튼 미렌더 `FollowButton.tsx:30` |
| 6. 알림 opt-in (should_send 게이트) | ✅ | `should_send_notification` 채널검증+컬럼동적조회, 미지정=false `phase34_notifications.sql:183-205`; send-email이 발송 전 호출 `index.ts:1460-1472`; 답글/새영상 이메일 기본 OFF `new_video_follower_notify_20260612.sql:11,15-17` |
| 7. 정지자 처리 | ⚠️ | moderate remove가 user면 `is_suspended=true` `phase10_reports.sql:247-250`. 단 **쓰기 차단(is_suspended 게이트) 자체**는 본 감사 파일들엔 없음 — 명세는 `phase10_reports.sql:38` 컬럼만 인용, 실제 쓰기 차단 RLS 위치는 미확인 |
| 8. 자기 글 지원/문의 금지 | ✅ | apply `collab_space.sql:124-126`; inquire `collab_inquiries.sql:69` |
| 9. 마감 협업 지원/문의 불가 | ✅ | apply `collab_space.sql:127-129` (closed 예외). inquire는 status 미검사(get-or-create만) — 메시지 전송 단계에서 막지 않음 ⚠ (아래 갭) |
| 10. actor 이메일 서버 템플릿 | ✅ | ⑤ 참조 |

---

## 3. RPC / 테이블 계약 대조

| 대상 | 분류 | 근거 |
|---|---|---|
| `create_report(text,text,text,text?)→bigint` DEFINER | ✅ | `community_security_20260621.sql:48-117` (정본, rate-limit 포함). 사유 7종·대상 4종 검증 `:74-80` |
| `moderate_report(bigint,text,text?)` admin 전용 | ✅ | `phase10_reports.sql:183-268`. keep=복원 `:215-229`, remove=숨김/user정지 `:231-251`, dismiss=단건 `:253-258` |
| dedup unique index | ✅ | `idx_reports_dedup` `phase10_reports.sql:86-88` → 23505 |
| `apply_to_collab(uuid,text?)→'ok'\|'already'` DEFINER | ✅ | `collab_space.sql:100-159`, 작성자 알림 type='collab' `:148-155` |
| `collab_inquire(uuid)→uuid` get-or-create | ✅ | `collab_inquiries.sql:62-75` |
| `collab_thread_send` 원문 비노출 알림 | ✅ | 정본 `collab_notify_privacy_20260614.sql:12-45`; body=글 제목만 `:38-40`, last_message는 당사자만(200자) `:33` |
| `save_push_subscription` endpoint upsert | ✅ | `phase_web_push_20260531.sql:31-53`, ON CONFLICT(endpoint) `:49-50` |
| `delete_push_subscription` | ✅ | `:56-67` |
| `should_send_notification(uuid,text,'email'\|'push')→bool` | ✅ | `phase34_notifications.sql:168-209` |
| `log_notification(...)` | ✅ | `:212-244` |
| creator_followers RLS (SELECT all, INSERT/DELETE 본인) | ✅ | `creator_followers.sql:32-44` |
| collab_threads/messages RLS (참여자만) | ✅ | threads `:29-34`, messages `:49-58` |
| push_subscriptions RLS (SELECT 본인, 변경 RPC만) | ✅ | `phase_web_push_20260531.sql:25-28` |
| Realtime publication 등록 | ✅ | notifications `phase_notifications_realtime.sql:21`; collab_messages `collab_inquiries.sql:156` (명세 인용 :155-157 → 실제 :156) |

---

## 4. 프론트 동작 대조

| 항목 | 분류 | 근거 |
|---|---|---|
| Realtime 벨 수신(`notif-<id>`, INSERT, user 필터, +1, 토스트) | ✅ | `App.tsx:592-605` (filter `user_id=eq.${user.id}` `:595`, 미읽음+1 `:598`, 토스트 `:599`) |
| 푸시 클릭 SPA 네비(`push-navigate`) | ✅ | `App.tsx:483` |
| 좋아요/북마크 upsert ignoreDuplicates | ✅ | `Community.tsx:708,736` |
| delete_community_post + 폴백 | ✅ | `Community.tsx:824-828` |
| 새 팔로워 알림 INSERT 성공 시 1회 | ✅ | `useFollows.ts:84,88-105` (23505 무시·미발송 `:84,88`) |
| FollowButton 자기 자신 미렌더 | ✅ | `FollowButton.tsx:30` |

---

## 5. 갭 / 불일치 상세

### G1. (⚠️) 명세 §11 "알림 타입 enum 분산" 주석 STALE
명세 §11(`:283`)·§3.7은 "프론트 `Notification` 타입 union에 `collab` 미포함"이라고 적었으나, 실제 `NotificationPanel.tsx:11`의 union에 `"collab"`이 **이미 포함**됨(방금 수정 반영). → 명세 텍스트가 코드보다 뒤처짐. 명세 §11 해당 항목 삭제/갱신 필요.

### G2. (⚠️) `reports.status` 값 표기 불일치 (명세 §9)
명세 §9(`:249`)는 status를 `pending/kept/removed/dismissed`로 기재하나, 실제 코드는 `reviewed_kept`/`reviewed_removed`/`dismissed`(`phase10_reports.sql:217,233,256`). 자동숨김 집계는 `status='pending'` 기준(`community_security_20260621.sql:97`)이라 동작엔 영향 없으나, 명세의 상태값 라벨이 부정확.

### G3. (⚠️) 마감(closed) 협업 — 문의 스레드 시작은 status 미검사
명세 규칙 9·테스트 "마감 협업 지원/문의 차단"은 apply_to_collab만 closed 예외(`collab_space.sql:127-129`)로 강제. `collab_inquire`(`collab_inquiries.sql:62-75`)·`collab_thread_send`(`collab_notify_privacy_20260614.sql:12-45`)는 status='closed' 검사 없음 → DB 레벨에선 마감 글에도 문의 스레드 생성/메시지 전송 가능. 명세는 "UI 비활성(`CollabInquiryModal.tsx:263`)"으로만 막는다고 인정하나, 규칙을 "DB 이중 차단"으로 읽으면 불일치. (지원=DB강제, 문의=UI만)

---

## 6. 결론

- 명세 **06 문서의 핵심 보안·계약은 코드와 일치**한다. 우선 확인 5항목(작성자 강제 트리거 / 신고 rate-limit·자동숨김 / 새영상 팬아웃 opt-in 기본 OFF / notifications.type=collab + 프론트 union / actor 서버 템플릿) **전부 ✅**.
- 갭은 모두 ⚠️(경미)이며 보안 결함 아님: ①명세 §11 stale 주석(코드가 더 앞섬), ②`reports.status` 라벨 표기 부정확, ③마감 협업 "문의" 경로는 UI만 차단(지원은 DB 강제).
- ❌(중대 불일치)·❓(검증불가) 없음. §6.7 정지자 "쓰기 차단" RLS 게이트 위치만 본 감사 파일 범위 밖이라 미추적(컬럼·정지 액션은 존재).
