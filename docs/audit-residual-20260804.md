# 전수 감사 잔여·보류 항목 (2026-08-04)

> 전 코드베이스(226파일·61k라인) 8도메인 병렬 감사 → 라이브 재검증 → 확정 결함 수정(커밋
> 3af91b1·ccc9aa9·354ef3d·6111b04). 아래는 **의도적으로 보류**했거나 **백엔드가 필요**해
> 이번에 안 고친 것 — 조용히 누락 방지용 기록.

## 백엔드 필요 (클라 단독 수정 불가)
- **B#2 · OTT featured/select 직접쿼리 is_suspended 미필터** — `Ott.tsx:271-276`(셀렉트)·`394-402`(featured).
  admin 이 큐레이션에 넣은 크리에이터가 이후 정지돼도 히어로/셀렉트 행에 계속 노출. **클라는
  profiles.is_suspended 를 못 읽어(컬럼 GRANT 잠금) 필터 불가** → 서버 RPC/뷰가 정지·hidden 을
  걸러 반환해야 함. admin 큐레이션 한정·저노출이라 보류. 처리 시 `v_available_videos` 경유 또는
  전용 RPC(`get_videos_by_ids_safe`) 신설.

## 결제 게이트 OFF 라 잠재 (live 전환 시 활성)
- **E#1 · 구독 첫 결제 영수증 미발송** — `BillingResult.tsx` + Edge `billing-auth-confirm`.
  일회성 결제(license/ad)는 PaymentResult 가 영수증 발송하나, 구독(startAutoBilling→BillingResult)은
  sendNotification/알림이 없음. 전자상거래법 정기결제 고지·과금확인 UX. **결제 OFF 라 현재 미발현** →
  live 개통 시 billing-auth-confirm 성공응답에 영수증정보 포함 + BillingResult 에서 sendNotification.

## UX 개선 (기능 파손 아님 — 반쪽 구현 리스크로 보류)
- **D#3 · 업로드 진행 중 취소 버튼 없음** — abort 인프라(uploadAbortRef)는 있으나 UI 취소 버튼 부재
  (중단 수단이 탭 이탈뿐). 취소 시 abort→reject→catch 이중토스트·상태꼬임을 신중히 다뤄야 해 보류.
- **F#3 · B2B 글 소유자 마감/재오픈 UI 없음** — 서버(status UPDATE)는 허용, 협업과 달리 UI 만 부재.
  기능 비대칭(버그 아님). 상세 모달에 소유자용 토글 추가로 처리 가능.

## 스케일 잠재 (현재 21편 무영향 — [scale-performance-backlog](scale-performance-backlog-20260725.md) 계열)
- **Community#1 · 카테고리 필터·정렬이 로드된 50편만 대상**(클라). 50편 초과 시 인기순·카테고리 어긋남.
  서버 정렬/필터 이관 필요. 페이지네이션 SSOT.

## 미세 정리(데드코드·주석 — 무해, 미처리)
- `Upload.creativityDescription`(D#5) 미사용 필드 · `usePayment.startSubscription`(E#2) 死코드 ·
  `DangerZoneSection.onSignOut`(E#5) 미사용 prop · Footer "Vision"=about 중복(A#3)·"Investor / IR"
  하드코딩(A#4) · Cinema 헤더주석의 "이어보기" 행 미렌더(B#5) · AdminBugReports.saveNote 감사로그 우회(G#3)
  · AdminLayout 배지 currentPage 의존 재조회(G#4) · AdvertiserDashboard img onError visibility(H#4).
  전부 기능 영향 없음.

## 이번에 수정 완료 (참고)
데이터손실(MyPage 편집 메타 삭제) · ?info= Footer 죽은네비 5페이지 · ProductDetail 광고/연속재생
metaReady 레이스 · 챕터 클릭 seek · 검색 추천크리에이터 차단필터 · OTT 단일히어로 정지 ·
챌린지 딥링크 폴백 · 글자수 임계 불일치(레거시글 수정불가) · useFollows 언팔 카운트 · 광고 feed 타겟
stale · 이메일 리다이렉트 · 탭 뒤로가기 fallback · 스테일 주석 다수.
