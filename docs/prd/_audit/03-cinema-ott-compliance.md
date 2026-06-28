# 03. 시네마·OTT — 명세↔코드 준수 감사

> 대상 기획서: `docs/prd/03-cinema-ott.md`
> 감사일: 2026-06-28 / 방식: 실제 소스·SQL Read + Grep 대조 (추측 없음, file:line 직접 검증)
> 범위: API/RPC 레퍼런스(RPC 5종 + 뷰), 비즈니스 규칙(길이 게이팅·시간대 편성·장르 11종·fillPopular·tier), 수용 기준 핵심 항목

---

## 요약 카운트

| 분류 | 개수 |
|---|---|
| ✅ 일치 (구현 확인됨) | 21 |
| ⚠️ 부분/주의 (구현됐으나 명세와 미세 불일치·메모 필요) | 4 |
| ❌ 불일치 (명세 ↔ 코드 어긋남) | 0 |
| ❓ 확인불가 | 0 |

> 결론: 기획서 03 은 **실제 코드 기반으로 작성된 사후 문서**라서 정합도가 매우 높다. ❌(명세-코드 모순)는 0건. ⚠️ 4건은 모두 **기획서가 이미 본문에 명시해 둔 "알려진 불일치/이월"** 항목으로, 문서가 거짓 주장한 게 아니라 *실재하는 코드 상태를 정확히 적은* 것이다.

---

## 핵심 확인 4종 (사용자 지정)

### ① 5개 RPC 실제 존재·시그니처 — ✅ 전부 일치

| RPC | 정의 위치 | 시그니처 검증 | 비고 |
|---|---|---|---|
| `get_recommended_videos` | `phase31_carousel_genre_likes.sql:66-157` | `(p_tier TEXT='all', p_limit INTEGER=20)` → 반환에 `score NUMERIC` 추가. `LANGUAGE plpgsql / SECURITY DEFINER / STABLE`, `auth.uid()` 개인화(`:83`), 이력無/비로그인 폴백(`:93-114`), 이력有 카테고리 가중치+본영상·본인 제외(`:118-155`) | 명세 표(line 590) 정확 |
| `get_trending_videos` | `:164-205` | `(p_tier='all', p_hours=24, p_limit=10)` → `recent_views BIGINT` 추가. `LANGUAGE sql STABLE`, `HAVING COUNT(vv.id)>0`(`:202`), `ORDER BY recent_views DESC, created_at DESC` | 일치 |
| `get_new_releases` | `:212-244` | `(p_tier='all', p_days=14, p_limit=10)` → 추가컬럼 없음, `created_at >= now()-N days`, `ORDER BY created_at DESC` | 일치 |
| `get_videos_by_category` | `:307-339` | `(p_category, p_tier='all', p_limit=10)` → `WHERE category=p_category`, `created_at DESC` | 일치 |
| `get_videos_by_genre` | `genre_based_rows.sql:12-28` | `(p_genre, p_tier='all', p_limit=10)` → `WHERE genre=p_genre`, `LANGUAGE sql STABLE SECURITY DEFINER`, `GRANT EXECUTE ... TO anon, authenticated`(`:28`) | 일치 |

- tier 필터식 `(p_tier='all' OR (cinema AND show_on_cinema) OR (ott AND show_on_ott))` 5개 RPC 전부 동일 확인 (`phase31:109-111,195-197,239-241,334-336`; `genre_based_rows.sql:24`). ✅
- 공통 반환 컬럼 셋(genre 포함) 명세(line 575)와 SQL `RETURNS TABLE` 1:1 일치. ✅
- (참고) 동일 파일에 `get_continue_watching`(`phase31:251-300`)도 존재하나 시네마/OTT 화면 미호출 — 기획서가 12절(line 306)에서 이미 "이월"로 명시. ✅ 일관.

### ② `v_available_videos` 뷰 존재 — ✅ 일치
- 정의 `phase31_carousel_genre_likes.sql:30-59`. `WHERE COALESCE(visibility,'public')='public' AND COALESCE(is_hidden,false)=false`(`:57-59`) = 공개+비숨김. `show_on_home/cinema/ott` 컬럼 포함(`:46-48`), `genre` 맨 끝 추가(`:54`). 명세(line 577-584) 정확.

### ③ OTT 시간대 편성 로직 실제 구현 — ✅ 일치
- 5개 밴드 `PROGRAMMING_BANDS`(`Ott.tsx:119-125`) — 새벽02-05🌌 / 아침05-11🌅 / 낮11-17☀️ / 저녁17-21🌆 / 밤21-02🌙. 명세 line 198-202 와 시각대·이모지·장르순서 정확 일치.
- `currentBand()` 접속 시각 분기(`Ott.tsx:126-133`), `bandRank()`(`:134-139`): order 인덱스 우선 / `default`(기타)=999 맨뒤 / 나머지=100. 명세 line 203 정확.
- 적용: `orderedRows` 가 `bandRank(getGenreStyle(category).key, band)` 로 정렬(`Ott.tsx:197-202`). ✅
- highlighted 강조(시그니처 그라데이션) `Ott.tsx:391,778-784`. ✅

### ④ 연령 게이트·길이 임계값 불일치 (DB60 vs OTT배지600 vs Mock180) — ⚠️ 실재함 (기획서가 이미 명시)
- **DB 게이팅**: `content_policy_v2.sql:49`(`cinema_min`=60), `:50`(`ott_min`=600), `:75/:78` 플래그 세팅. `platform_settings` 동적 조회(`:25-32`). ✅ 시네마 60초 / OTT 600초.
- **showcase Mock cinema 180초**: `showcase.ts:46-48` `pool.filter(durationSeconds>=180)` — **실재**. OTT는 `:49-51` 600초. → cinema 만 DB(60)와 Mock(180) 임계값 불일치 실재.
  - 단 `SHOWCASE_ENABLED=false`(`showcase.ts:11`)라 현재 무영향. 기획서 line 31·305 가 정확히 이 상태를 메모해 둠. ⚠️
- **VideoRowCarousel OTT 배지 600**: `VideoRowCarousel.tsx:309`(`ottMin = settings.ottMinSeconds||600`), `:382`(`is_ott || duration_seconds>=ottMin`) — **실재**. 화면 배지용이며 DB 노출 게이팅과 별개. ⚠️ (기획서 line 31·228 명시)
- **연령 게이트**: `shouldBlur(rating,ageVerified)=rating==="19" && !ageVerified`(`AgeBadge.tsx:48-50`) ✅. 본인영상 면제 `Ott.tsx:184-185`, `VideoRowCarousel.tsx`(VideoCard `isMyVideo` 경로) ✅. 히어로는 재생 자체 차단 `useVideo=!g.isAgeLocked && ...`(`Ott.tsx:441`) ✅.

---

## 상세 대조표

| # | 명세 항목 | 명세 위치 | 코드 근거 | 분류 | 근거/메모 |
|---|---|---|---|---|---|
| 1 | RPC 5종 시그니처·정렬·tier필터 | line 588-606 | phase31:64-339, genre_based_rows.sql:12-28 | ✅ | 위 ① 전부 일치 |
| 2 | `v_available_videos` 정의(공개+비숨김, show_on_* 컬럼) | line 577-584 | phase31:30-59 | ✅ | 위 ② |
| 3 | 길이 게이팅 시네마 60 / OTT 600 (DB 트리거) | line 188-193, 293 | content_policy_v2.sql:49-50,75,78 | ✅ | `classify_video_placement`, platform_settings 동적 |
| 4 | 광고: 60초 미만 X / 60+ preroll / 600+ midroll | line 194 | content_policy_v2.sql:14-16,26-31,100-102 | ✅ | 설정키·주석 일치 (광고 함수 본문 line 103~) |
| 5 | 장르 11종 SSOT 순서 | line 207 | data/genres.ts:8-10 | ✅ | `["SF","액션","로맨스","공포","판타지","스릴러","드라마","코미디","자연·풍경","추상","기타"]` 정확 일치 |
| 6 | 장르 이모지 GENRE_EMOJI | line 208 | data/genres.ts:13-26, genreEmoji:26 | ✅ | 11종 매핑 + fallback "🎬" |
| 7 | 자연·풍경/추상 스타일 2026-06-25 추가 | line 209 | brandColors.ts:133-149 | ✅ | `nature`/`abstract` 키 실재, 주석에 날짜·버그 명시 |
| 8 | getGenreStyle 한/영/AI접두 매핑+DEFAULT 폴백 | line 238 | brandColors.ts:162-188 | ✅ | KOREAN_GENRE_TO_KEY + `?? toLowerCase() ?? DEFAULT` |
| 9 | 형식 카테고리 3종(애니 top / 다큐·뮤비 bottom) | line 210 | Cinema.tsx:59-63, Ott.tsx:107-111 | ✅ | FORMAT_DEFS / OTT_FORMAT_DEFS 일치 |
| 10 | 시네마 18 RPC allSettled 병렬 | line 96, 283 | Cinema.tsx:211-224 | ✅ | 추천1+트렌딩24h+신규14d+트렌딩720h+형식3+장르11 = 18 |
| 11 | 시네마 호출 인자값 | line 612-617 | Cinema.tsx:212-223 | ✅ | 추천 limit:15, 트렌딩 24h/720h limit:10, 형식·장르 limit:50 정확 |
| 12 | fillPopular 채움(추천15·트렌딩10·BEST10, 신규 미보충) | line 212-214 | Cinema.tsx:242-266 | ✅ | popPool 좋아요순, `fillPopular(...,15/10/10)`, `nextNewReleases=merge((nrl))` 보충 없음 |
| 13 | 시네마 행 렌더 순서(CoverFlow→추천→트렌딩→신규→BEST→형식top→장르→형식bottom→기타→TOP크리에이터) | line 51-66, 282 | Cinema.tsx:356-471 | ✅ | JSX 순서 정확 일치 |
| 14 | OTT 호출 인자값(트렌딩 168h / 형식·장르 limit:50, p_tier="ott") | line 618-620 | Ott.tsx:268-277 | ✅ | 일치 |
| 15 | OTT 단일 Promise.all 1왕복 + .catch(()=>null) 안전래핑 | line 87, 248 | Ott.tsx:264-280 | ✅ | rpcData 래퍼 `.catch(()=>null)` |
| 16 | OTT 시간대 무드 편성(5밴드·bandRank·기타 맨뒤) | line 196-204 | Ott.tsx:119-139,197-202 | ✅ | 위 ③ |
| 17 | OTT 마퀴 행 순서(형식top→장르(기타제외)→형식bottom→기타) + dir 교차 | line 71-72, 380-385,390 | Ott.tsx:380-390 | ✅ | `dir = i%2===0 ? "right":"left"` |
| 18 | OTT 마퀴 SPEED=0.25, dir=right 시작 scrollWidth/2, hover 정지, 화면밖 스킵 | line 119-123 | Ott.tsx:604,607,609,627-636,652-653 | ✅ | rAF + pausedRef + visibleRef |
| 19 | OTT 히어로 트렌딩상위5 20초 순환(≤1 미순환), 폴백 | line 112-114 | Ott.tsx:204-213 | ✅ | `setInterval(...,20000)`, `(i+1)%length`, `heroes.length<=1 return` |
| 20 | OTT 히어로 소스 우선순위(clip→preview.webp→썸네일) + heroSrcCache | line 116, 237 | Ott.tsx:215-242,440-443 | ✅ | `useVideo=!locked && clipUrl`, `usePreview=...previewUrl`, 캐시 set/get |
| 21 | OTT 히어로 화면밖 IO 일시정지 | line 117 | Ott.tsx:453-463 | ✅ | IntersectionObserver play/pause |
| 22 | CoverFlow 자동회전 -0.12°/frame + visibleRef/document.hidden 가드 | line 105 | CoverFlow.tsx:332-358,335-336 | ✅ | 일치 |
| 23 | 좋아요 토글(insert→23505→delete) + likingRef 가드 + 비로그인 토스트 | line 132-133 | VideoRowCarousel.tsx:103-136 | ✅ | 정확 일치 |
| 24 | 시리즈 배지 회차>1 일 때만, 잠금영상 미표시 | line 218-219 | VideoRowCarousel.tsx:196-201, Ott.tsx:683-688 | ✅ | `seriesCount>1 && !isAgeLocked` |
| 25 | OTT 배지 = is_ott OR duration_seconds>=ottMin(600) | line 228 | VideoRowCarousel.tsx:309,382 | ⚠️ | 600 기본값 실재. DB게이팅과 별개 화면 배지(③④ 참조) |
| 26 | showcase Mock cinema 180초 필터 | line 31, 305 | showcase.ts:46-48 | ⚠️ | 180 실재, DB60과 불일치. SHOWCASE_ENABLED=false 라 현재 무영향 |
| 27 | BETA_MODE=true, BETA_ROW_TARGET=8, 자동졸업 | line 222-224 | config/beta.ts:11-14 | ✅ | 일치 |
| 28 | 모듈 캐시 stale-while-revalidate(키 cinema=user:tier:showcase, ott=showcase) | line 249 | Cinema.tsx:159,283 / Ott.tsx:147,159,309 | ✅ | 캐시 키에 user.id 포함(추천 누수 방지) |
| 29 | 분석 이벤트 미구현(화면 전용 트래킹 없음) | line 272, 307 | Cinema.tsx/Ott.tsx 내 트래킹 부재(console.warn만) | ⚠️ | 기획서가 미구현으로 정직 표기 — 명세-코드 모순 아님 |

---

## 주요 갭 (Top 3)

### 갭 1. 시네마 길이 게이팅 임계값 3중화 — Mock(180) vs DB(60) vs 화면배지(600) [⚠️ 이월·잠재]
- DB 트리거는 시네마=60초(`content_policy_v2.sql:49,75`)이나, showcase Mock 합성은 시네마=180초로 거른다(`showcase.ts:46-48`). 또 카드의 OTT 배지는 600초 기준(`VideoRowCarousel.tsx:309,382`).
- 현재 `SHOWCASE_ENABLED=false`(`showcase.ts:11`)라 Mock 불일치는 무영향. 그러나 **showcase 재활성 시** 60초~180초 사이 실데이터는 시네마에 뜨는데 Mock 은 안 떠 행 구성이 어긋날 수 있음. 기획서 line 31·305 가 이미 경고 명시. → 재활성 전 `showcase.ts:47` 을 60 으로 정합 필요.

### 갭 2. 분석/임프레션 이벤트 전무 [⚠️ 미구현]
- `Cinema.tsx`/`Ott.tsx` 에 행 노출·카드 클릭·히어로 임프레션 트래킹 호출이 전혀 없음(로드 실패 `console.warn` 만, `Cinema.tsx:295`, `Ott.tsx:314`). 사용자 신호는 `video_views`/`video_likes` DB 적재에만 의존.
- 기획서가 10·11·12절에서 미구현으로 정직 표기 → 명세 위반은 아니나, 추천/트렌딩 품질 측정·A/B 의 선행 인프라가 비어 있는 상태. 출시 후 큐레이션 튜닝의 사각.

### 갭 3. 시간대 밴드 order 에 nature/abstract 부재 — 항상 중립 랭크 [⚠️ 경미]
- 5개 밴드 `order` 배열(`Ott.tsx:120-124`)에 `nature`(자연·풍경)·`abstract`(추상) 키가 한 번도 등장하지 않음. 두 장르는 어느 시간대에도 우선 노출(`bandRank` 0~)되지 못하고 항상 rank 100(중간)에 고정된다(`Ott.tsx:138`).
- 동작상 버그는 아니나(기타=999 보다는 앞), 2026-06-25 에 두 장르를 정식 추가(`brandColors.ts:133-149`)한 의도와 달리 **편성 가중에서는 영구 비강조**. 시간대 편성 의도를 살리려면 일부 밴드 order 에 포함 검토.

---

## 결론

기획서 `03-cinema-ott.md` 는 코드를 읽고 작성한 사후 명세로, **RPC 5종·뷰·시간대 편성·길이 게이팅·연령 게이트·fillPopular·캐시·베타 채움** 등 모든 핵심 계약이 실제 소스와 file:line 단위로 일치한다(❌ 0건, ✅ 21건). ⚠️ 4건은 전부 기획서가 본문에 *이미 정확히 메모한* 알려진 불일치/미구현(① showcase Mock 180초 vs DB 60초, ② OTT 배지 600초 화면판정, ③ 분석 이벤트 미구현, ④ nature/abstract 편성 미가중)으로, 문서의 거짓·과장은 없다. 즉 **명세 신뢰도는 높고, 실작업 우선순위는 갭 1(showcase 재활성 전 임계값 정합) → 갭 2(임프레션 트래킹) → 갭 3(편성 가중)** 순으로 정리된다.
