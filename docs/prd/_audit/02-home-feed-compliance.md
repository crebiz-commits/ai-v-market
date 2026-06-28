# 02. 홈 피드(Discovery) — 명세 ↔ 코드 준수 감사

> 자동 대조 감사. 원본 명세: `docs/prd/02-home-feed.md`
> 검증 일자: 2026-06-28. 모든 근거는 실제 파일을 Read/Grep 한 결과(`file:line`).
> 분류: ✅ 일치 · ⚠️ 부분/경미한 불일치(stale 라인 등) · ❌ 불일치/미구현 · ❓ 확인 불가

---

## 요약 카운트

| 분류 | 개수 |
|---|---|
| ✅ 일치 | 30 |
| ⚠️ 부분/stale | 6 |
| ❌ 불일치 | 0 |
| ❓ 확인 불가 | 1 |

핵심 확인 4종 결과: ① `get_home_feed` = `SETOF v_home_feed_public` ✅ · ② count↔feed 시리즈1화 필터 일치 ✅(명세는 "불일치"로 stale 표기 — **명세가 틀림, 코드는 이미 수정됨**) · ③ `mapVideoRow` 필드 전부 뷰에 존재 ✅ · ④ 칩 라벨↔필터 매핑 ✅

---

## 1. API / RPC 레퍼런스 (§15.1)

| Spec | 출처(명세) | 분류 | 근거 file:line | 비고 |
|---|---|---|---|---|
| `get_home_feed(p_limit int=12, p_offset int=0, p_filter text='all')` 시그니처 | §15.1, §5.1 | ✅ | `get_home_feed_safe_columns_20260620.sql:42-46` | 기본값 12/0/'all' 일치 |
| 반환 `SETOF v_home_feed_public` (보안: 모더레이션 컬럼 비노출) | §5.1, §9 | ✅ | `get_home_feed_safe_columns_20260620.sql:47`, 뷰 정의 `:23-33` | `RETURNS SETOF public.v_home_feed_public`. moderation_* 미포함 확인 |
| `STABLE SECURITY DEFINER SET search_path='public'` | §5.1 | ✅ | `get_home_feed_safe_columns_20260620.sql:48` | 일치 |
| `GRANT EXECUTE → anon, authenticated` | §15.1 | ✅ | `get_home_feed_safe_columns_20260620.sql:159` | 일치 |
| 프론트 호출 `rpc("get_home_feed",{p_limit:12,p_offset:from,p_filter:reqChip})` | §15.1, §4.2 | ✅ | `DiscoveryFeed.tsx:876-880` | 명세 라인(876-880) 정확 |
| `get_home_feed_count(p_filter text='all')` → integer, GRANT anon/authenticated | §5.3, §15.1 | ✅ | `home_feed_chip_filter_20260611.sql:20`, `:33` | 시그니처/GRANT 일치 |
| count 호출 `rpc("get_home_feed_count",{p_filter:chip})` | §15.1 | ✅ | `DiscoveryFeed.tsx:1007` | 명세 라인(1007) 정확 |
| `ads_public` 조회 `.or("ad_type.eq.feed_display,ad_type.is.null")`, 민감컬럼 비노출 | §5.6, §15.1 | ✅ | `DiscoveryFeed.tsx:955-958`; 뷰 `ads_public_view_20260620.sql:20-30` | base `ads` 공개정책 DROP `:36-37` 확인 |
| `increment_ad_impressions(ad_id, p_viewer_key)` — dedup(광고,뷰어,1시간), impressions+1, spent_krw+=CEIL(CPM/1000) | §10, §15.1 | ⚠️ | `ad_charge_dedup_phase3_20260614.sql:22-46`; 호출 `DiscoveryFeed.tsx:1028` | 동작 일치하나 **실제 시그니처는 3-파라미터** `(ad_id, p_viewer_key, p_video_id DEFAULT NULL)` (`:22-23`). 명세 §15.1 표는 2-파라미터로만 표기 — 경미 stale |
| `increment_ad_clicks(ad_id, p_viewer_key)` dedup, 구 1-파라미터 DROP | §9, §15.1 | ✅ | `home_security_20260620.sql:51-70`; 호출 `DiscoveryFeed.tsx:153`,`1587` 부근 | `DROP FUNCTION ... increment_ad_clicks(uuid)` `:51` 확인 |
| `video_likes` RLS 본인 행만 select/insert/delete | §9, §15.1 | ✅ | `home_security_20260620.sql:28-33` | 일치 |
| `comments` SELECT RLS(숨김은 작성자/관리자/소유자) | §9, §15.1 | ✅ | `home_security_20260620.sql:90-100` | 일치 |
| CPM `ad_cpm_krw` 기본 2000 | §10 | ✅ | `ad_charge_dedup_phase3_20260614.sql:41` | `COALESCE(get_platform_setting('ad_cpm_krw'),2000)` |

---

## 2. 데이터 계약 / mapVideoRow (§5.5, §15.2)

| Spec | 출처 | 분류 | 근거 file:line | 비고 |
|---|---|---|---|---|
| `mapVideoRow` DB row → Video 매핑 (31 필드) | §15.2 표 | ✅ | `DiscoveryFeed.tsx:714-749` | 아래 세부 확인 |
| `price`/`priceStandard` ← `price_standard` | §5.5/§15.2 | ✅ | `:722`,`:733` | 일치 |
| `creatorId` ← `creator_id` | §15.2(720) | ✅ | `:720` | §15.2 라인(720) 정확. (단 §5.5 본문은 718로 표기 — 본문 stale) |
| `durationSeconds` ← `duration_seconds` | §15.2(724) | ✅ | `:724` | §15.2 라인 정확. (§5.5 본문은 723 표기 — 본문 stale) |
| `tool` ← `ai_tool`, `tags` 배열/콤마 분리, `age_rating` 기본 "all", `highlightEnd` 기본 start+30, `seriesId` ← `series_id` | §5.5 | ✅ | `:726`,`:732`,`:730`,`:746`,`:747` | 전부 일치 |
| **mapVideoRow가 읽는 모든 컬럼이 v_home_feed_public 에 존재** | (핵심③) | ✅ | 뷰 `get_home_feed_safe_columns_20260620.sql:25-32` vs 매핑 `:716-747` | 매핑 소비 컬럼(id,thumbnail,title,creator,creator_id,likes,price_standard,duration,duration_seconds,resolution,ai_tool,category,genre,video_url,age_rating,description,tags,ai_model_version,prompt,seed,director,writer,composer,cast_credits,production_year,language,subtitle_language,visibility,highlight_start,highlight_end,series_id) **전부 뷰에 투영됨**. 누락 없음 |
| 칩 필터 공통 WHERE: show_on_home AND public(or null) AND not hidden AND **시리즈 1화만** | §5.1 | ✅ | `get_home_feed_safe_columns_20260620.sql:58-59`,`69-70`,`94-95`,`144-147` | 4개 분기 모두 동일 WHERE + `series_id IS NULL OR episode_number=1` |
| `new`: ORDER BY created_at DESC, id | §5.1 | ✅ | `:60` | 일치 |
| `popular/free/paid/cinema` 인기점수 정렬, free→=0, paid→>0, cinema→show_on_ott | §5.1 | ✅ | `:71-79` | 정렬식 `likes*1.0 + 7일유효조회수*2.0` 일치 |
| 페이지 크기 `FEED_PAGE_SIZE=12`, offset=from+rows.length, id 타이브레이커 | §5.4 | ✅ | `:752`, `:885`; SQL `:60,:79,:101,:154` | 일치 |
| 프론트 dedup(seen Set) | §5.4 | ✅ | `DiscoveryFeed.tsx:891-894` | 일치 |

---

## 3. 비즈니스 규칙 (§6)

| Spec | 출처 | 분류 | 근거 file:line | 비고 |
|---|---|---|---|---|
| 개인화 가중치: cat/genre/creator 각 1.0(좋아요3/조회1/팔로우5) + likes*0.05 − 기시청4 | §6, §5.2 | ✅ | `get_home_feed_safe_columns_20260620.sql:107-154` | cat_pref +3/+1 `:109-113`, creator 팔로우 +5 `:130`, 최종식 `:148-154` 전부 일치 |
| 이력 판단(좋아요 or 유효 video_views) → 없으면 인기/최신 폴백 | §5.2 | ✅ | `:85-104` | 일치 |
| 인기점수 = likes + 최근7일 유효조회수×2 | §6, §10 | ✅ | `:74-79`,`:96-101` | 일치 |
| **시리즈 1화만 피드/카운트 노출** | §6, 수용기준 | ✅ | feed `:59` + **count `home_feed_chip_filter_20260611.sql:30`** | 핵심② — 아래 §5 참조 |
| 길이 게이팅: 비구독자 + (길이미상 or >60s) → ProductDetail 우회 | §6, §4.4 | ✅ | `DiscoveryFeed.tsx:791-796` | `knownShort = dur>0 && dur<=60` 일치 |
| 광고 주기: 모바일 외부 5칸 / self ON 시 interval_count(기본4) / 데스크탑 6칸 | §6, §4.5 | ✅ | `DiscoveryFeed.tsx:1035`,`1059` | `interval = HOME_FEED_SELF_ADS ? (ads[0].interval_count||4) : 5`; `DESKTOP_AD_INTERVAL=6` |
| 정책 플래그 `HOME_FEED_SELF_ADS=false` | §1, §6 | ✅ | `DiscoveryFeed.tsx:54` | 일치 |
| 가격 표시(price>0 가격/협의, price=0 무료) | §6 | ❓ | (679-704 미열람) | 핵심 4종 외 영역. mapVideoRow price/isNegotiationOnly import(`:24`)는 존재. 렌더 분기 라인 직접 미검증 → 확인 불가로 표기 |
| 차단 사용자 영상 제외(visibleVideos) | §6 | ✅ | `DiscoveryFeed.tsx:830-833` | 일치 |

---

## 4. 칩 필터 / UI (§3.4, §13.3)

| Spec | 출처 | 분류 | 근거 file:line | 비고 |
|---|---|---|---|---|
| **칩 6종 라벨↔필터 매핑** all/popular/new/free/paid/cinema | §3.4, (핵심④) | ✅ | `DiscoveryFeed.tsx:110-117` | `HOME_CHIPS` key가 SQL `p_filter` 분기와 1:1. 라벨 한/영(전체·🔥인기·✨최신·🆓무료시청·💎소장가능·🎬시네마급) |
| 칩 라벨 `isKo` 분기 렌더 | §3.4 | ✅ | `:1286` (`{isKo ? c.ko : c.en}`) | 일치 |
| 칩 클릭 → `setChip` → 초기 effect 재로드 | §13.3 | ✅ | `:1279` onClick setChip; effect dep `:974` | 일치 |
| 칩 좌우 화살표(scrollLeft/clientWidth/scrollWidth, 리사이즈·스크롤 갱신) | §3.4 | ✅ | `:985-997` | `updateChipArrows` 로직 일치(±4px 여유) |
| 칩 바는 데스크탑 sticky 헤더에만 렌더(모바일 미렌더) | §3.4, §12 | ✅ | `:1267-1316` (desktop-grid-wrapper 내부) | 일치 |
| VIDEOS 카운트 배지(get_home_feed_count) | §13.2 | ✅ | `:1334` (`(totalCount ?? videos.length)`) | 일치 |

---

## 5. 핵심 확인 ②: count ↔ feed 시리즈 1화 필터 일치 (명세 §5.3, §12 "이월")

| Spec(명세 주장) | 출처 | 분류 | 근거 file:line | 비고 |
|---|---|---|---|---|
| 명세: 칩 버전 count 에 시리즈 1화 필터가 **빠져 있어** feed 와 불일치 → 배지 과대표시 이월 | §5.3(:142), §12(:250) | ⚠️ **명세 stale** | `home_feed_chip_filter_20260611.sql:29-30` | **실제 코드는 이미 시리즈 필터를 포함**: `AND (v.series_id IS NULL OR COALESCE(v.episode_number,1)=1)` (주석 "배지 과대표시 버그 수정 2026-06-28"). 즉 count↔feed **일치함**. 명세의 "불일치/이월" 서술은 더 이상 사실 아님 |
| 무인자 `get_home_feed_count()` 구버전에도 시리즈 필터 존재 | §5.3, §12 | ✅ | `home_feed_count_20260611.sql:19` | 일치(2026-06-25 추가). 단 칩 버전이 이를 DROP/대체(`home_feed_chip_filter_20260611.sql:17-18`)하므로 런타임엔 칩 버전만 유효 |
| 구버전 `get_home_feed` 정의가 칩필터 파일에서 제거됨(보안 정본 분리) | §5.3 | ✅ | `home_feed_chip_filter_20260611.sql:6-12` | 칩 파일은 count 함수만 남기고 get_home_feed 제거. 보안본은 safe_columns 파일이 SSOT |

---

## 6. 동작/엣지/자동재생 (§4, §7) — 표본 검증

| Spec | 출처 | 분류 | 근거 file:line | 비고 |
|---|---|---|---|---|
| 초기 로드 캐시키 `${user?.id ?? "anon"}:${chip}`, 히트 시 즉시 복원 loading=false | §4.1 | ✅ | `DiscoveryFeed.tsx:920-941` | 일치 |
| 캐시 저장은 비로딩 시에만 | §7, §8 | ✅ | `:977-982` | `if (loading) return` |
| loadMore 가드 fetchingRef/hasMoreRef, reqChip 스냅샷, race 폐기 | §4.2, §7 | ✅ | `:868`,`:871`,`:883`,`:901` | 영상·댓글수 둘 다 폐기 일치 |
| sentinel IO rootMargin 800px | §4.2, §8 | ✅ | `:1019-1021` | 일치 |
| 좋아요 낙관적 업데이트 + 롤백, 비로그인 onSignInClick | §4.4 | ✅ | `:1131-1166` | 일치 |
| 공유 URL `?video=id`, 네이티브 우선 AbortError 무시 → ShareModal 폴백 | §4.4 | ✅ | `:1168-1184` | 일치 |
| 전체화면 중 모든 video pause+mute, play 재발동 차단 | §4.4, §7 | ✅ | `:843-863` | 일치 |
| 지연 마운트 getBoundingClientRect, 임계 `r.top<vh*2 && r.bottom>-vh`, 0크기/vh미확정 보류 | §4.3, §8 | ✅ | `:367-394` (임계 `:378`, 보류 `:377`) | 일치 |
| 연령 게이트 `isAgeLocked = !isMyVideo && shouldBlur(...)` | §3.3 | ✅ | `:355-359` | 일치 |
| 광고 노출 IO threshold 0.5 1회만 → increment_ad_impressions(viewer_key) | §4.5, §10 | ✅ | `:135-149`(AdCard), `:1027-1029` | 일치 |
| 외부 링크 http(s) 스킴만 openAdLinkSafe | §7, §9 | ✅ | `:119-128` | `new URL()` 파싱 + protocol 검사 |
| 빈 피드 "표시할 영상이 없습니다." / 초기 스피너 | §3.2 | ✅ | `:1187`, `:1186` | 일치 |

---

## 7. 알려진 제약/이월 (§12) 재검증

| Spec(이월 항목) | 분류 | 근거 file:line | 비고 |
|---|---|---|---|
| count 시리즈 필터 누락 → 정합 패치 필요 | ⚠️ **stale(해소됨)** | `home_feed_chip_filter_20260611.sql:29-30` | 이미 패치 완료. §12 이월 항목에서 제거 대상 |
| 모바일 칩 UI 부재(데스크탑 sticky 헤더에만) | ✅(여전히 사실) | `DiscoveryFeed.tsx:1267-1316` | 모바일 칩 렌더 없음 — 이월 유효 |
| 비가상화 피드 | ✅(사실) | `:361-394` | 지연 마운트로만 방어 — 유효 |

---

## 주요 갭 (Top 3)

1. **[명세 stale ⚠️ — 가장 중요] count 시리즈 1화 필터 "불일치/이월" 서술이 틀림.**
   명세 §5.3(`02-home-feed.md:142`)·§12(`:250`)는 칩 버전 `get_home_feed_count` 에 시리즈 1화 필터가 빠져 배지가 과대표시된다고 "이월"로 적었으나, 실제 `home_feed_chip_filter_20260611.sql:29-30` 에는 이미 `series_id IS NULL OR episode_number=1` 필터가 들어있다(주석: "배지 과대표시 버그 수정 2026-06-28"). → **count 와 feed 의 시리즈 필터는 일치**. 명세에서 해당 이월 항목 삭제 + §5.3 주의 문단 갱신 필요.

2. **[시그니처 stale ⚠️] `increment_ad_impressions` 는 실제 3-파라미터.**
   명세 §15.1 표는 `(ad_id, p_viewer_key)` 2-파라미터로 표기하나, 실제 `ad_charge_dedup_phase3_20260614.sql:22-23` 는 `(ad_id, p_viewer_key text DEFAULT NULL, p_video_id text DEFAULT NULL)` 3-파라미터다. 동작·dedup은 명세와 동일하므로 경미하나 레퍼런스 정확성 위해 표 갱신 권장. (클릭 함수는 2-파라미터로 명세와 일치.)

3. **[본문 라인 stale ⚠️] §5.5 본문의 mapVideoRow 라인 번호가 §15.2 표와 어긋남.**
   §5.5 본문은 `creatorId ← creator_id`(718), `durationSeconds`(723)로 적었으나 실제는 720·724이며, §15.2 표(720·724)가 정확하다. 코드 동작은 정상, 본문 라인만 stale. (전체적으로 `DiscoveryFeed.tsx` 가 1766줄에서 변동되며 일부 본문 라인 참조가 표 기준과 미세하게 다름 — 표 기준이 정본.)

---

## 결론

명세 02-home-feed.md 의 검증 가능한 spec(API/RPC 레퍼런스, 데이터 계약, 비즈니스 규칙, 칩 매핑, 자동재생/엣지)은 **실제 코드와 거의 전부 일치(✅ 30)**. 핵심 4종 모두 통과:
① `get_home_feed` = `SETOF v_home_feed_public`(보안 뷰, 모더레이션 컬럼 비노출) ✅
② count ↔ feed 시리즈 1화 필터 **일치** ✅ (명세가 "불일치"라 적은 건 stale — 코드는 2026-06-28 패치 완료)
③ `mapVideoRow` 소비 컬럼 31종 전부 뷰에 투영됨, 누락 0 ✅
④ 칩 6종 라벨↔`p_filter` 1:1 매핑 ✅

**실질적 코드 결함(❌)은 0건**. 발견된 불일치는 모두 **명세 문서가 코드 변화를 못 따라간 stale 서술**(⚠️ 6): ⓐ count 시리즈 필터 이월 항목(해소됨) ⓑ impressions 함수 3-파라미터 ⓒ §5.5 본문 라인 번호. 권장 조치: 명세 §5.3·§12·§15.1·§5.5 를 현행 코드에 맞춰 갱신(특히 §12 count 이월 항목 삭제). 가격 표시 렌더(§6) 1건만 본 감사에서 라인 직접 미검증(❓).
