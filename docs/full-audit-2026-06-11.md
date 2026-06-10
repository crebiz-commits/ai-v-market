# 전체 감사 보고서 (2026-06-11)

6개 영역 병렬 정적 감사 (기존감사 잔존 / 결제·환불·구독 / 광고·수익분배 / 인증·보안 / 페이지 연결·딥링크 / 디자인·코드품질)
+ 핵심 주장 직접 코드 재검증 (에이전트 오탐 6건 제외 완료).

## A. 지난 감사(5/31, 30건) 잔존 현황

- ✅ 수정 완료: **27건** (C1, C2, H1~H10, M1~M8, L1~L5)
- ❌ 잔존: **H11** (comments.post_id FK 부재 → 글 삭제 시 고아 댓글), **M9** (VAST 트래킹 무인증 — 베타 House Ads 한정 수용 중)
- ⚠️ 부분: **M3** (가입 후 자동로그인 실패 시 안내 메시지만 — UX 미흡)

## B. 신규 확인 결함 (직접 검증 완료 표시 ✔)

### 🔴 R1. Bunny 라이브러리 API Key가 클라이언트에 반환됨 ✔
- `supabase/functions/server/index.ts:284` — `/videos/create-upload` 응답에 `apiKey: apiKey` 포함 ("Client side upload needs this").
- 이 키는 Bunny Stream **라이브러리 전체 관리 키** — 로그인한 누구나 업로드 시작만 해도 키를 획득, 이 키로 라이브러리의 **모든 영상 삭제/변조 가능**.
- 수정: TUS presigned signature(서버에서 SHA256 서명 생성) 방식으로 전환, apiKey 응답 제거.

### 🟠 R2. 회원가입 이메일 검증 비활성 (`email_confirm: true`) ✔
- `index.ts:123` — 주석에 "실제 서비스에서는 제거 필요" 명시된 테스트 모드가 그대로 남음.
- 영향: 가짜/오타 이메일로 무제한 가입, 타인 이메일 도용 가입, 알림 메일 오발송.
- 수정: email_confirm 제거 + 확인 메일 흐름(redirect URL) 정비. 출시 전 필수.

### 🟠 R3. 공유 딥링크 2종 미작동 ✔
- 커뮤니티 글 공유 `?post=<id>` (CommunityPostDetail.tsx:96), 챌린지 공유 `?challenge=<id>` (CommunityChallengeDetail.tsx:113) 링크를 만들지만 App.tsx 에 처리 핸들러 없음 (`?post=`는 `tab=community&sub=collab` 조합만 처리).
- 영향: 공유받은 링크 → 홈만 열림. 소셜 공유 기능 무효.
- 수정: App.tsx 파라미터 처리 + Community에 initialPostId/initialChallengeId prop (협업 딥링크와 동일 패턴).

### 🟠 R4. 구독 자동갱신 부재 + 만료 안내 없음
- 빌링키/정기결제 미구현 — 구독은 30일 단건. 만료 시 조용히 free 전환(클라이언트 expires_at 검사 ✔ 정상), 만료 임박/만료 알림과 갱신 유도 UI 없음.
- 영향: 갱신율 급락 + "어느날 갑자기 광고 나옴" CS.
- 수정(단계): ① 만료 D-3/당일 알림 + 마이페이지 갱신 버튼 → ② 토스 빌링키 정기결제 (정식 출시 전).

### 🟠 R5. 구독풀 분배가 OTT 시청시간만 기준 — 시네마 크리에이터 0원 (정책 확인 필요) ✔
- `phase8_revenue_distributions.sql:158-165, 209-230` — 분배 공식 자체는 정확(합계=풀, 초과분배 불가 ✔). 단 분모·분자 모두 `show_on_ott=true` 영상의 시청만 집계.
- 그런데 구독 혜택은 시네마 미리보기 컷오프 해제에도 적용됨(ProductDetail.tsx:413) → 시네마 전용 크리에이터는 구독 수익 기여하고도 분배 0.
- 결정 필요: (a) OTT 전용 분배가 의도면 유지, (b) 아니면 `show_on_ott` 조건을 시네마 포함으로 확장.

### 🟡 R6. 정산 확정 후 환불 시 자동 역차감 없음 ✔
- 환불은 orders.status='refunded' 처리 ✔ → 정산 **전** 환불은 자동 제외 ✔. 정산 **후** 환불은 해당 월 재계산(어드민 수동 재실행) 필요. 이미 'paid' 행은 status 보존하되 금액이 갱신돼 장부 불일치 가능 (`phase8:253-262`).
- 수정: 환불 RPC에 "정산 행 존재 시 어드민 경고" 또는 운영 절차 문서화.

### 🟡 R7. 최소정산(₩10,000) 미달 'deferred' 이월 합산 자동화 없음
- 월별 독립 행이라 매달 ₩5,000 버는 크리에이터는 영원히 미지급. 수동 합산 지급만 가능.
- 수정: 정산 실행 시 이전 deferred 누계 합산해 허들 판정.

### 🟡 R8. 커뮤니티 글 삭제 시 댓글 고아 (H11 잔존)
- comments.post_id FK 없음. 글 삭제해도 댓글 잔존(화면엔 안 보이나 DB 누적·어드민 댓글관리 혼선).
- 수정: 글 삭제 RPC에서 댓글 일괄 삭제(SECURITY DEFINER) 또는 uuid 형식 행에 FK+CASCADE.

### 🟡 R9. 커뮤니티 글 댓글 답글 알림에 딥링크 없음 ✔
- CommentPanel.tsx 답글 알림 link가 `videoId ? "/?video=..." : undefined` — 커뮤니티 글 답글 알림은 클릭해도 이동 못 함.
- 수정: 글 댓글이면 `/?tab=community&sub=posts&post=<id>` (R3과 함께).

### 🟡 R10. 레거시 주문 환불 미스매치 가능
- `admin_refund_payment`의 orders 매칭이 `payment_id = payment_key` 단일 조건 (`phase_user_payment_history.sql:220-224`). 신규 주문은 confirm_payment가 payment_id 저장해 정상 ✔, 5/27 통일 이전 payment_id NULL 주문만 환불 시 상태 안 뒤집힘.

### 🟢 R11~ 소소 (모아서)
- 결제 confirm 성공 후 DB 갱신 실패 시 자동 복구 없음 (고객센터 안내만) — 발생 시 어드민 수동 처리 절차 필요.
- `/auth/signup` 레이트리밋/캡차 없음 (가입 봇).
- collab 알림 본문에 메시지 원문 200자 노출 — 민감 대화 일부가 알림함에 남음 (정책 판단).
- AgeGateModal 등 일부 저대비 텍스트(text-gray-600 on dark), timeAgo 유틸 3곳 중복, MyPage 일부 조회 실패가 toast 없이 조용히 넘어감, overlay/midroll 광고 setTimeout이 unmount 시 미클리어(무해한 경고 수준), 통화 표기 ₩/원 혼용.

## C. 정상 확인 (광고·분배 — 사용자 질의 핵심) ✔ 직접 검증

| 항목 | 결과 |
|---|---|
| 광고 예산 차감 | 노출당 CEIL(CPM/1000)=₩2 정확, 예산 소진 시 노출 중단 ✓ |
| 피드 광고 수익 | `increment_ad_impressions`만 호출 → 분배 테이블(ad_video_events) 미기록 = **플랫폼 100% 정책과 일치** ✓ |
| 영상 광고 분배율 | home 50% / cinema 55% / OTT 60%, platform_settings 동적 + 정산 시점 스냅샷 보존 ✓ |
| 판매 분배 | 80%, FLOOR 처리 ✓ |
| 구독 분배 | 구독자수×₩4,900×50% 풀 → OTT 시청시간 비례, 합계=풀 정확(초과분배 불가) ✓ (범위만 R5 확인 필요) |
| 원천징수 | 지급 시 3.3% FLOOR 계산 ✓ |
| SKIP 정책 | Premium은 광고 자체 제거(`isSubscriber` 가드), skip_after_seconds 기반 스킵 ✓ |
| 결제 보안 | 금액 서버검증, orderId 멱등성, Toss 시크릿 서버측만 ✓ |
| 신규 테이블 RLS | collab/challenges/post_bookmarks/push 모두 적절 ✓ |
| XSS | 사용자 입력 dangerouslySetInnerHTML 0건, 메일 escapeHtml ✓ |

## D. 권장 수정 순서

1. **즉시**: R1(Bunny 키), R2(email_confirm) — Edge Function 수정+재배포
2. **출시 전**: R3+R9(딥링크), R4①(만료 알림), R5(분배 범위 정책 결정)
3. **운영 안정화**: R6, R7, R8, R10
4. **자잘한 정돈**: R11~ (기존 J-목록과 함께)
