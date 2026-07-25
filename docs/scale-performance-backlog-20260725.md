# 스케일·성능 백로그 (2026-07-25 C 심층감사)

> **성격**: 아래는 **현재(콘텐츠 21편) 무영향**, 데이터가 쌓이면(수천~수만 행) 느려지거나
> 조용히 부정확해지는 지점들이다. C 심층감사(읽기전용 에이전트)가 코드로 확증했고, 라이브
> 재검증을 거쳐 여기 남긴다. **토스 개통(~2개월)까지 예상 규모(수십~수백 편)에선 발동하지
> 않으므로** 지금 대규모 재설계(롤업 테이블/전문검색/가상화)를 하면 검증 불가 + 회귀 리스크만
> 크다 → **성장 임박 시** 실데이터로 착수한다. (2026-07-25 즉시 처리한 값싼 예방은 하단 ✅.)

## ✅ 2026-07-25 즉시 처리 (값싸고 안전, 이미 적용/커밋)
- **videos.tags GIN 인덱스** (`audit_c_hardening_20260725.sql`) — 챌린지 참여작 수
  (`videos.tags @> …`)의 seq scan 제거. findings 6·8 근본 완화.
- **confirm_payment search_path 고정** — DEFINER 하드닝 정합(게이트 #60).

## 🔴 높음 — 수천 행에서 이미 위험 (성장 시 최우선)
1. **`get_home_feed_order`** (`feed_home_exclude_suspended_20260722.sql`) — 정렬키가 행마다
   `(SELECT COUNT(*) FROM video_views WHERE video_id=… AND occurred_at>=now()-7d)` 상관 서브쿼리
   + **LIMIT 없이 매칭 영상 ID 전체 반환**. 로그아웃/신규(최다 트래픽)의 기본 인기순 경로.
   → **권장**: 7일 조회수를 롤업 테이블/머티리얼라이즈드 뷰(크론 갱신)로 미리 집계 + order 상위 N(예 500) 캡.
2. **`v_available_videos` 뷰** (`feed_exclude_suspended_20260722.sql`) — 행마다 상관 서브쿼리 2개
   (`series_episode_count` COUNT + 시리즈 대표작 `NOT EXISTS`). 홈·시네마·OTT·트렌딩·검색·유사영상
   공통 베이스라 모든 소비처가 행당 비용을 곱함. **★ 피드 SSOT라 고위험 — 변경 시 전 피드 회귀 재검증 필수.**
   → **권장**: `series_episode_count`를 베이스 뷰에서 빼고 필요한 곳만 조인/윈도우 집계.
3. **`search_videos`** (`search_feed_audit2_20260710.sql`) — 선행 와일드카드 `LIKE '%'||q||'%'` →
   인덱스 불가 → `v_available_videos` 전체 seq scan + 심층 OFFSET.
   → **권장**: `pg_trgm` GIN 또는 `tsvector` 전문검색 인덱스, OFFSET→keyset.

## 🟡 중간 — 수만 행에서 체감
4. **`get_trending_videos`** (`cinema_rpc_hardening_20260708.sql`) — 시네마 "이달의 BEST"가
   `p_hours=720`(30일) 조회를 전 영상에 조인·`COUNT(DISTINCT)`·GROUP BY. → 조회수 롤업 사용.
5. **DiscoveryFeed 댓글수** (`DiscoveryFeed.tsx:1077-1088`) — `comments`를 LIMIT 없이 받아 JS 카운트.
   **PostgREST 1000행 상한 → 페이지 합 1000 초과 시 과소집계**(코드에 2026-07-08 수용 명시).
   → **권장**: `video_id→count` 그룹집계 RPC. (표시≠실제 성격이라 스케일 임박 시 우선.)
6. **Community 챌린지 참여작 N+1** (`Community.tsx:593-603`) — 챌린지당(≤24) `videos.tags @> …` COUNT.
   → GIN 인덱스(✅ 적용)로 완화됨. 완전 해결은 단일 그룹집계 RPC.
7. **`orderRef` 무제한 배열** (`DiscoveryFeed.tsx:1112-1115`) — `get_home_feed_order` 전체 ID를 프런트 보관.
   카탈로그 성장에 비례해 페이로드·메모리 증가. → order 길이 캡 또는 서버 keyset.
8. **`CommunityChallengeDetail.tsx:60`·`AdminChallenges.tsx:97`** — 동일 `tags @>` (GIN ✅로 완화).

## ⚪ 낮음 — 성장 시 확실하나 당장 여유
9. `LikesContext.tsx:67` — 사용자 전체 좋아요 LIMIT 없이 로드(파워유저 수만). 가시영상 단위 지연로드 검토.
10. `useFollows.ts:30-33` — 전체 팔로우 LIMIT 없이 로드.
11. `Community.tsx:622-625` — `post_likes`/`post_bookmarks` 사용자 전체 select.
12. `Community.tsx:636-640` — `collab_posts` `limit(100)` 고정(초과 조용히 누락) → 페이지네이션.
13. `DiscoveryFeed` 렌더 — 무한스크롤 누적분 가상화 없이 `.map`. → `react-window` 등.

## 오탐 아님으로 확인(재검증 완료)
- **폴링 과다 없음** — setInterval 은 광고/다음영상 카운트다운·마퀴·Bunny 이벤트 폴링뿐, 데이터 재조회 폴링 아님.
  알림 미읽음은 `count head:true` 서버집계 + realtime 구독.
- MyPage·CommentPanel·NotificationPanel·AdminModeration·AdminUsers·Ott·Cinema — 이미 서버 페이지네이션/집계 적용.

## 공통 처방 (성장 임박 시)
위 높음 3건은 대부분 **① 최근 조회수 롤업 테이블(크론 갱신) + ② `videos.tags` GIN(✅) + ③ 전문검색 인덱스**로 근본 해결된다.
착수 시 실데이터/부하로 before/after 측정하고 피드 SSOT(v_available_videos) 변경은 전 피드 회귀 게이트로 검증할 것.
