# 05. 업로드 · 크리에이터 대시보드 — 상세 명세

> 본 문서는 **실제 코드를 읽고** 작성됐다. 모든 동작·계약은 `file:line` 근거를 단다.
> 핵심 파일:
> - 업로드 UI/오케스트레이션: `src/app/components/Upload.tsx`
> - Bunny TUS 업로더: `src/app/utils/bunnyUpload.ts`
> - Edge Function(Hono): `supabase/functions/server/index.ts`
>   - `create-upload` (`index.ts:197`), `save-metadata` (`index.ts:582`), `moderate-video` (`index.ts:1679`), 썸네일 프록시 (`index.ts:358`), 자막 transcribe (`index.ts:502`)
> - 대시보드 UI: `src/app/components/CreatorDashboard.tsx`
> - 대시보드 RPC: `supabase/phase21_creator_dashboard.sql`, `supabase/phase20_creator_analytics.sql`
> - IDOR/통계 보안 RPC: `supabase/high_fixes_20260614.sql`
> - 정지 계정 쓰기 차단: `supabase/block_suspended_writes_20260625.sql`
> - 장르 SSOT: `src/app/data/genres.ts`

---

## 1. 개요 / 목적

### 1.1 업로드
크리에이터가 AI 영상을 CREAITE에 등록하는 3단계 위저드. 핵심 설계 원칙:

- **라이브러리 키 미노출**: 과거 Edge Function이 Bunny 라이브러리 API Key를 클라이언트에 내려 직접 PUT 했으나, 그 키로 라이브러리 전체 영상을 삭제/변조할 수 있어 제거. 현재는 서버가 만든 **TUS presigned 서명**(`SHA256(libraryId+apiKey+expire+videoId)`)으로만 업로드한다 (`bunnyUpload.ts:1-11`, `index.ts:290-300`).
- **2단계 저장**: ① Bunny에 영상 본문 업로드(TUS) → ② Supabase `videos` 테이블 + KV에 메타데이터 저장(`save-metadata`). 둘은 별개 호출이라 "고아 영상"(Bunny엔 있고 DB엔 없음) 방지 로직이 들어있다 (`Upload.tsx:853-877`).
- **콘텐츠 정책 v2**: 30초 미만 업로드 차단, 3분(180초) 미만은 라이선스 판매 불가(무료 광고형으로만 노출).

### 1.2 크리에이터 대시보드 / 애널리틱스
MyPage 판매 탭 최상단에 배치되는 본인 채널 KPI/추세/Top/retention 분석 (`CreatorDashboard.tsx:1-4`). 모든 데이터는 `SECURITY DEFINER` RPC가 `auth.uid()`로 본인 데이터만 집계하므로 IDOR 불가. 두 페이즈로 나뉜다:
- **Phase 21**(`phase21_creator_dashboard.sql`): 누적 KPI 4종 + 일별 수익 + 일별 조회수/좋아요 + 정산 안내.
- **Phase 20**(`phase20_creator_analytics.sql`): 시청자 통계(시청률·완주율·유니크) + Top 영상 + 일별 팔로워 + 길이 구간별 retention.

---

## 2. 사용자 스토리

- **US-1 (무로그인 진입)**: 비로그인 사용자가 업로드 탭에 들어오면 로그인 벽 대신 "3대 수익원(80%/50~60%/50%) + 원클릭 소셜 로그인" 화면을 본다 (`Upload.tsx:475-549`).
- **US-2 (파일 선택)**: 영상을 고르면 길이·해상도 자동측정, 썸네일 후보 3프레임 자동추출, 하이라이트 기본구간이 자동 세팅된다 (`Upload.tsx:298-450`).
- **US-3 (정보 입력)**: 제목/설명/카테고리/장르/시청등급/AI도구/해상도/재생시간을 채우고, 선택적으로 시리즈·AI증빙·시네마 메타·협찬·태그를 입력한다 (`Upload.tsx:1344-1917`).
- **US-4 (가격·공개)**: 공개범위(public/unlisted/private)와 단일가를 정한다. 3분 미만은 가격 입력칸 대신 "라이선스 판매 불가" 안내가 뜬다 (`Upload.tsx:1959-2069`).
- **US-5 (미리보기→게시)**: 마켓 카드 시뮬레이션 모달로 최종 확인 후 업로드한다 (`Upload.tsx:2100-2244`).
- **US-6 (이어쓰기)**: 작성 도중 떠나도 드래프트가 localStorage에 자동저장되고, 재방문 시 "이어서 작성" 토스트가 뜬다 (`Upload.tsx:204-264`).
- **US-7 (채널 분석)**: 크리에이터가 대시보드에서 7/14/30일 토글로 수익·조회수·좋아요·팔로워 추세와 Top 영상, 길이별 완주율을 본다 (`CreatorDashboard.tsx:239-422`).

---

## 3. 화면 & 상태

### 3.1 업로드 — 단계별 폼
진행바는 3스텝(`Upload.tsx:1099-1123`).

**Step 1 — 파일 선택 + 썸네일/하이라이트** (`Upload.tsx:1126-1342`)
- 드래그/클릭 드롭존(`accept="video/*,.mp4,.mov,.avi"`, `Upload.tsx:1128-1166`).
- 썸네일 선택 그리드: 자동추출 3프레임(시작/중간/끝) + 커스텀 이미지 업로드 (`Upload.tsx:1168-1237`).
- 하이라이트 구간 마킹: 미리보기 비디오 + dual-thumb 슬라이더(5~30초 제약) + "하이라이트 미리보기" 버튼 (`Upload.tsx:1239-1325`).
- "다음" 버튼은 `selectedFile` 없으면 disabled (`Upload.tsx:1333-1340`).

**Step 2 — 콘텐츠 정보** (`Upload.tsx:1344-1917`)
- 제목(60자 카운터, `Upload.tsx:1346-1362`), 설명(500자 카운터, `:1364-1381`).
- 카테고리/장르 select (`:1383-1415`), 시리즈 선택(`:1417-1454`), 시청등급 4버튼(`:1456-1489`), AI도구(`:1491-1505`), 해상도/재생시간(`:1507-1536`).
- 접이식 섹션(details): AI 제작 증빙(프롬프트/시드, `:1538-1581`), 시네마 메타데이터(감독/각본/음악/제작연도/출연/언어/자막언어 + .vtt 업로드, `:1583-1719`), 어드민 전용 라이선스·출처(`:1721-1792`), 협찬·후원(`:1794-1853`).
- 태그 칩 입력(최대 10개, `:1855-1897`).

**Step 3 — 가격/공개/진행률/완료** (`Upload.tsx:1919-2097`)
- 업로드 중일 때 진행률 카드: %, 진행/속도/남은시간 3분할(`:1921-1957`).
- 공개 설정 라디오 3종(`:1959-1998`).
- 가격: 3분 미만이면 잠금 안내, 아니면 단일가 입력(₩1,000만 이상은 협의판매 안내, `:2000-2053`).
- 저작권 서약 체크박스(`:2055-2069`), 제출 버튼(`:2081-2094`).

**미리보기 모달**: 마켓 카드 시뮬레이션 + 공개범위/하이라이트/카테고리·장르/가격/크레딧/태그 요약 (`Upload.tsx:2100-2244`).

**완료 화면**: 체크 애니메이션 + "계속 업로드"/"내 상품 보기" (`Upload.tsx:1004-1039`).

### 3.2 대시보드 — KPI/차트/Top/retention
로딩 중 전체 스피너(`CreatorDashboard.tsx:154-160`), 기간 토글 시 차트별 부분 스피너(`chartLoading`).

- **누적 KPI 4종**: 총수익/총조회수/총좋아요/RPM (`CreatorDashboard.tsx:184-189`).
- **시청자 인사이트 4종(기간 기준)**: 평균시청률/완주율/유니크시청자/평균시청시간 (`:192-221`).
- **다음 정산 안내**: `pending_payout > 0`일 때만 (`:224-237`).
- **기간 셀렉터**: 7/14/30일 (`:239-258`, `RANGE_OPTIONS` `:50-54`).
- **일별 수익 LineChart** (`:260-285`), **조회수+좋아요 콤보 LineChart** (`:287-313`), **일별 팔로워(누적+신규) LineChart** (`:315-340`), **길이 구간별 평균 시청률 BarChart** (`:342-374`), **Top 영상(views/likes/watch_ratio 토글)** (`:376-422`).

---

## 4. 동작 흐름

### 4.1 업로드 파이프라인 (`performUpload`, `Upload.tsx:692-942`)

1. **중복 제출 방지** — `isUploading`이면 즉시 return (`:693`). `AbortController` 새로 생성(`:694`).
2. **세션 토큰 최신화** — `supabase.auth.getSession()`로 `access_token` 재확보(`:714-720`).
3. **create-upload 호출** (`:733-757`) — body `{ title }`만 전송. 응답 `{ videoId, libraryId, tusSignature, tusExpire }`.
4. **TUS 업로드** (`uploadToBunny` `:610-636` → `tusUploadToBunny` `bunnyUpload.ts:22-89`):
   - ① `POST https://video.bunnycdn.com/tusupload` (`Upload-Length` 헤더 + 서명 헤더) → `Location` 헤더로 업로드 URL 수신 (`bunnyUpload.ts:36-55`).
   - ② 그 URL에 **단일 PATCH**로 파일 본문 전송(XHR, `Upload-Offset: 0`) — `xhr.upload.progress`로 진행률 보고 (`bunnyUpload.ts:57-88`).
   - 진행률 콜백에서 지수이동평균 속도 + ETA 계산 후 `setUploadProgress`/`setUploadStats` (`Upload.tsx:616-634`).
   - `uploadAbortRef.current.signal`로 취소 가능 (`bunnyUpload.ts:77-79`).
5. **썸네일 업로드(선택, 실패 무해)** (`Upload.tsx:768-778`) — `setBunnyThumbnail`이 이미지를 1280×720 JPEG로 다운스케일(`:561-583`) 후 `POST /server/videos/:videoId/thumbnail` Edge 경유 전송(`:589-607`). 실패 시 Bunny 자동썸네일로 폴백.
6. **자막(.vtt) 업로드(선택, 실패 무해)** (`Upload.tsx:780-793`) — Supabase Storage `video-subtitles/{userId}/{videoId}/subtitle.vtt`에 upsert, publicUrl 확보.
7. **save-metadata 호출(재시도 포함)** (`Upload.tsx:795-877`) — 메타 객체 구성 후 `POST /server/videos/save-metadata`. **최대 3회 재시도**: 성공 또는 4xx면 즉시 중단, 5xx/네트워크 오류만 `800ms×attempt` 백오프 재시도(`:857-871`).
8. **완료 처리** (`:879-881`) — `uploadComplete=true`, 성공 토스트, 드래프트 삭제(`:260-264`).
9. **시리즈 연결(선택)** (`:883-914`) — 새 시리즈면 `create_series` RPC로 생성 후 `set_video_series` RPC 연결. 회차 자동 +1.
10. **자동 모더레이션 (fire-and-forget)** (`:916-935`) — `POST /server/moderate-video` body `{ video_id }`. 실패해도 업로드 흐름과 무관(`.catch`로 흡수).

### 4.2 create-upload 서버 흐름 (`index.ts:197-305`)
인증(`:199-213`) → 정지/rate limit 검사(`:215-236`) → Bunny `POST /library/{id}/videos`로 빈 영상 생성(`:256-275`) → KV `video:{guid}`에 소유자 기록(`status:'creating'`, `:282-288`) → TUS 서명 생성 후 반환(`:290-300`).

### 4.3 save-metadata 서버 흐름 (`index.ts:582-722`)
인증(`:584-597`) → `videoId` 필수(`:602-604`) → **소유권 검증**(`:608-622`) → KV 저장(`:624-633`) → `videos` 테이블 upsert(확장 컬럼 포함, `:641-695`) → 사용자 영상목록 KV 추가(`:703-709`).

### 4.4 moderate-video 서버 흐름 (`index.ts:1679-1816`)
인증(`:1684-1688`) → 영상+소유자 조회(`:1697-1705`) → **소유자/어드민만**(`:1707-1711`) → 썸네일 없으면 pending 유지(`:1713-1722`) → Google Vision SafeSearch 호출(`:1731-1743`) → likelihood 5단계 → 0~100 점수 변환(`:1773-1789`) → `score = max(adult, violence, racy)`(spoof/medical 무시, `:1791-1792`) → `update_video_moderation` RPC가 status·is_hidden 자동 결정(`:1794-1804`).

### 4.5 대시보드 데이터 흐름 (`CreatorDashboard.tsx`)
마운트/의존성 변경 시 `fetchSummary` + `fetchCharts` 병렬 실행(`:146-152`). `fetchCharts`는 6개 RPC를 `Promise.all`로 동시 호출(`:97-104`). 기간 토글(`days`)·Top 지표 토글(`topMetric`)이 `useEffect` 의존성이라 변경 시 재조회(`:152`).

---

## 5. 데이터 / RPC 계약

### 5.1 저장 메타 필드 매핑 (클라 metadata → DB 컬럼)
클라가 만든 `metadata` 객체(`Upload.tsx:802-848`)와 서버 upsert(`index.ts:643-695`)의 매핑:

| 클라 필드 (`Upload.tsx`) | 서버 upsert 컬럼 (`index.ts`) | 비고 |
|---|---|---|
| `videoId` | `id` (`:644`) | Bunny guid |
| `title` (없으면 파일명, `:804`) | `title` (`:645`) | |
| `description` | `description` (`:646`) | |
| — | `creator` (`:647`) | `user_metadata.name` 또는 이메일 앞부분 |
| — | `creator_id` (`:648`) | 인증된 `user.id` 강제 |
| `thumbnailUrl` (`https://{host}/{videoId}/thumbnail.jpg`, `:806`) | `thumbnail` (`:649`) | |
| `hlsUrl` (`.../playlist.m3u8`, `:807`) | `video_url` (`:650`) | |
| `duration` | `duration` (`:651`) | |
| `tags` (challenge 태그 자동부착, `:810-812`) | `tags` (split→배열, `:654`) | |
| `standardPrice` (콤마 제거, `:814`) | `price_standard`/`price_commercial`/`price_exclusive` (`:657-659`) | commercial/exclusive는 stale, standard 동일값 |
| `aiTool`, `aiModelVersion` | `ai_tool`(`:660`), `ai_model_version`(`:669`) | |
| `category`, `genre` | `category`(`:661`), `genre`(`:662`) | |
| `age_rating` (`:819`) | `age_rating` (기본 'all', `:663`) | Phase 31.1 필수 |
| `prompt`, `seed` | `prompt`(`:664`), `seed`(`:670`) | |
| `resolution` | `resolution` (`:666`) | |
| `director`/`writer`/`composer`/`cast`/`productionYear`/`language`/`subtitleLanguage` | `director`/`writer`/`composer`/`cast_credits`/`production_year`/`language`/`subtitle_language` (`:672-678`) | `productionYear`→int(`:637`) |
| `subtitleUrl` | `subtitle_url` (`:679`) | |
| `visibility` | `visibility` (화이트리스트 검증, `:681`) | |
| `licenseType`/`licenseSourceUrl`/`attribution`/`originalCreator` | `license_type`/`license_source_url`/`attribution`/`original_creator` (`:683-686`) | **비관리자는 서버에서 'original'/빈값 강제** |
| `highlightStart`/`highlightEnd` | `highlight_start`/`highlight_end` (parseFloat, 기본 0/15, `:638-639`,`:688-689`) | |
| `sponsorBrand`/`sponsorLogoUrl`/`sponsorDisclosure`/`sponsorLinkUrl` | `sponsor_brand`/`sponsor_logo_url`/`sponsor_disclosure`/`sponsor_link_url` (`:691-694`) | Phase 28 |
| — | `views:"0"`, `likes:0`, `status` (기본 'ready', `:652-653`,`:665`) | |

### 5.2 create-upload 응답 (`index.ts:294-300`)
```
{ videoId, libraryId, title, tusSignature, tusExpire }
```
- `tusSignature = SHA256(libraryId + apiKey + tusExpire + videoId)` (`index.ts:292`).
- `tusExpire = now + 6시간` (`index.ts:291`).
- 클라는 `videoId/libraryId/tusSignature/tusExpire`만 사용(`Upload.tsx:756`), `BunnyTusAuth` 헤더로 전송(`bunnyUpload.ts:29-34`).

### 5.3 save-metadata 응답 (`index.ts:713-717`)
```
{ success: true, videoId, message }
```
오류: 401(토큰), 400(videoId 누락), 403(권한), 500(DB).

### 5.4 대시보드 RPC 계약 (인자 / 반환 / auth.uid 고정 / file:line)

모든 RPC는 `SECURITY DEFINER` + `SET search_path`이고 본인(`auth.uid()`) 데이터만 집계한다.

**Phase 21** (`phase21_creator_dashboard.sql`):

| RPC | 인자 | 반환 | auth 고정 | file:line |
|---|---|---|---|---|
| `get_creator_dashboard_summary()` | 없음 | `total_revenue, total_views, total_likes, rpm, pending_payout, next_settlement_date` | `v_uid := auth.uid()`, NULL이면 예외 | `:18-93` (uid `:33`, 가드 `:44-46`) |
| `get_creator_daily_revenue(p_days int=30)` | 일수 | `day, revenue` (0인 날 포함) | `WHERE seller_id = auth.uid()` | `:101-131` (`:122`) |
| `get_creator_daily_engagement(p_days int=30)` | 일수 | `day, views, likes` | `creator_id = auth.uid()` / videos.creator_id = auth.uid() | `:136-180` (`:158`,`:168`) |

- 수익은 `orders WHERE seller_id=uid AND status='completed'`(refunded 제외, `:49-51`). RPM = 최근30일(수익/시청수)×1000 (`:64-77`). `pending_payout` = 이번달 매출 + 과거 pending `revenue_distributions`(`:79-89`). `next_settlement_date` = 다음달 1일(`:42`).
- 일별 집계는 `AT TIME ZONE 'Asia/Seoul'` 기준 날짜 버킷(`:119`,`:155`,`:164`).

**Phase 20** (`phase20_creator_analytics.sql`):

| RPC | 인자 | 반환 | auth 고정 | file:line |
|---|---|---|---|---|
| `get_creator_audience_stats(p_days=30)` | 일수 | `avg_watch_ratio, completion_rate, unique_viewers, total_views, avg_watch_seconds` | `v_uid:=auth.uid()`, NULL 예외 | `:19-54` (`:33`,`:36-38`) |
| `get_creator_top_videos(p_metric='views', p_days=30, p_limit=5)` | 지표/일수/개수 | `id, title, thumbnail, duration, views_count, likes_count, avg_watch_ratio` | `WHERE v.creator_id = v_uid` | `:62-120` (`:82`,`:103`) |
| `get_creator_daily_followers(p_days=30)` | 일수 | `day, gained, total`(누적 윈도우합) | `creator_id = auth.uid()` | `:128-168` (`:150`,`:157`) |
| `get_creator_retention_by_duration(p_days=30)` | 일수 | `bucket, bucket_order, avg_watch_ratio, view_count` | `WHERE vv.creator_id = v_uid` | `:176-227` (`:189`,`:213`) |

- `completion_rate` = `watch_ratio>=0.9` 비율(`:43-45`). `p_metric`은 `views`/`likes`/`watch_ratio`를 CASE 정렬로 분기(`:106-117`). retention 버킷: `1분 미만/1~5분/5~10분/10분+`(`:199-210`).
- `get_creator_top_videos`는 `is_hidden=false`만(`:104`).

**클라 RPC 호출** (`CreatorDashboard.tsx:81`, `:97-104`): 인자 키는 `p_days`/`p_metric`/`p_limit`로 정확히 일치. 모든 반환을 `Number(...) || 0`로 방어 매핑(`:84-141`).

**IDOR 보안 RPC** (`high_fixes_20260614.sql`) — 대시보드에서 직접 쓰진 않지만 같은 통계 계열:
- `get_creator_view_stats(p_creator_id=auth.uid(), p_since=now()-30d)` — `WHERE creator_id=p_creator_id AND (p_creator_id=auth.uid() OR is_admin())` (`:107-120`).
- `get_creator_ad_stats(p_creator_id=auth.uid())` — 동일 IDOR 가드 + `source_video_id IN (본인 videos)` (`:122-134`).
- `get_creator_ad_stats_by_video(...)` — 영상별 노출/클릭, 동일 가드 (`:136-148`).

---

## 6. 비즈니스 규칙

- **필수 필드(Step 2)** (`validateStep2`, `Upload.tsx:640-674`): 제목, 카테고리, 장르, 시청등급, AI도구, 해상도, 재생시간. 첫 누락에서 toast 후 false. "다음" 이동·최종 제출 공통 게이트(`:687`, `:1910`).
- **길이/형식 검증**:
  - 제목 최대 60자(`maxLength`, `:1359`), 설명 500자(`:1378`), 태그 최대 10개(`addTag` `:178-181`).
  - 재생시간 형식 정규식 `/^\d{1,3}:\d{2}(:\d{2})?$/` (예 `3:45`, `1:03:45`, `:669`).
  - 파일: MIME/확장자 화이트리스트(mp4/mov/avi), 최대 5GB (`:303-318`).
  - 자막: `.vtt`만, 1MB 이하 (`:1697-1698`). 커스텀 썸네일: 이미지, 5MB 이하 (`:456-462`).
- **30초 미만 업로드 차단**: `settings.minUploadSeconds`(기본 30) 미만이면 선택 거부(`:358-369`).
- **3분 미만 판매 불가**: `videoDurationSec < 180`이면 가격칸 대신 잠금 안내(무료 광고형으로만 노출, `:2000-2022`).
- **협의판매(₩1,000만+)**: `isNegotiationOnly(price)`면 "1:1 협의 판매" 안내(`:2037-2043`).
- **시리즈**: 단일/기존선택/새로만들기. 새 시리즈는 `create_series` 후 `set_video_series`, 회차 자동 +1(`:883-914`). 새로 만든 시리즈는 즉시 선택상태로 전환(중복생성 방지, `:893-894`).
- **챌린지 태그**: 챌린지로 진입 시 제출 메타 태그에 `challenge:{tag}` 자동부착(가시 태그칩과 무관, `:809-812`).
- **라이선스 타입**: 어드민만 입력 노출(`:1722`), **비관리자는 서버에서 'original' 강제**(`index.ts:683-686`). 클라도 `profile.is_admin` 아니면 'original' 전송(`Upload.tsx:835-838`) — 이중 방어.
- **드래프트 저장**: 사용자별 키 `creaite_upload_draft_{userId}`(`:201`). 변경 시 localStorage 저장(`:243-257`), 마운트 시 내용 있으면 복원 토스트(`:204-240`), 완료/리셋 시 삭제(`:260-264`,`:1001`).
- **rate limit**: create-upload 비관리자 **시간당 30회**(빈 Bunny 영상 무한생성 차단, `index.ts:223-235`). 어드민 예외.
- **시청등급**: DB CHECK 표준 `'all'/'13'/'15'/'19'`에 맞춰 저장, 기본 'all'(`Upload.tsx:72`, `index.ts:663`). 19+는 본인인증 시청자에만 공개(안내문 `:1486-1488`).

---

## 7. 엣지 케이스 & 에러 처리

- **고아 영상(TUS 성공·메타 실패)**: save-metadata 5xx/네트워크 오류 시 최대 3회 백오프 재시도(`Upload.tsx:857-871`). 4xx(검증오류)는 즉시 중단(재시도 무의미).
- **중복 제출(더블클릭)**: `isUploading` 가드로 영상 2개 생성 차단(`:693`).
- **업로드 중 이탈/언마운트**: `uploadAbortRef`를 unmount cleanup에서 abort(`:160`), TUS XHR이 abort 신호 수신 시 전송 중단(`bunnyUpload.ts:77-79`) — 대용량 백그라운드 전송 방지.
- **측정 실패(메타데이터)**: `video.onerror`면 경고 토스트만, 폼은 진행 가능(`:445-449`).
- **프레임 캡처 실패**: 개별 타임스탬프 5초 타임아웃, 실패해도 `console.warn` 후 계속(`:422-430`). 0개여도 Bunny 자동썸네일 폴백.
- **부분 실패(썸네일/자막)**: 둘 다 실패해도 업로드 흐름 비차단 — 썸네일 실패 시 경고+Bunny폴백(`:774-777`), 자막 실패 시 경고만(`:789-792`).
- **모더레이션 실패**: fire-and-forget, `.catch`로 흡수(`:933-935`). 썸네일 없으면 서버가 pending 유지(`index.ts:1713-1722`).
- **토큰 없음**: 세션·accessToken 둘 다 없으면 에러 토스트 후 중단(`:697-700`,`:717-720`).
- **대시보드 RPC 오류**: 각 결과를 `Array.isArray` 가드 후에만 setState, 실패하면 빈 상태 유지(`CreatorDashboard.tsx:105-142`).

---

## 8. 성능

- **TUS 단일 PATCH**: 파일 본문을 청크 분할 없이 한 번의 PATCH(`Upload-Offset: 0`)로 전송(`bunnyUpload.ts:82-87`). 단순/저오버헤드(단, resume 미지원 — §12).
- **속도/ETA 안정화**: 진행률 콜백에서 지수이동평균(신규 70% / 기존 30%)으로 속도 평활화, 200ms 미만 샘플은 무시(`Upload.tsx:621-630`).
- **썸네일 프레임 캡처**: `<video>` + `<canvas>`로 10%/50%/90% 지점 3프레임만 캡처(`:399-431`), 업로드 전 1280×720 JPEG로 다운스케일해 페이로드 최소화(`:561-583`).
- **드래프트 저장**: `useEffect` 의존성 변경 기반(타이머 디바운스가 아닌 React 리렌더 단위, `:243-257`) — 입력마다 localStorage 직렬화. (주: 명시적 setTimeout 디바운스는 아님.)
- **대시보드 병렬 페치**: 6개 분석 RPC를 `Promise.all` 동시 호출(`CreatorDashboard.tsx:97-104`).
- **광고통계 인덱스**: `idx_ad_video_events_source(source_video_id, event_type)`로 정산/통계 풀스캔 방지(`high_fixes_20260614.sql:168-170`).

---

## 9. 권한 / 보안

- **라이브러리 키 미노출**: 클라엔 TUS presigned 서명만 전달, Bunny AccessKey는 서버에만(`bunnyUpload.ts:1-11`, `index.ts:290-300`). 썸네일/자막도 Edge 프록시 경유(`index.ts:355-433`,`:502-`).
- **소유권 검증(save-metadata)**: 비관리자는 KV `video:{id}.userId` 또는 `videos.creator_id`가 호출자여야 함, 아니면 403(`index.ts:608-622`). 타인 videoId로 메타 덮어쓰기/소유권 탈취 차단.
- **소유권 검증(썸네일/transcribe/moderate)**: KV→videos.creator_id→is_admin 순(`index.ts:377-394`,`:517-534`,`:1707-1711`).
- **creator_id 위조 불가**: upsert의 `creator_id`는 클라 입력이 아닌 인증된 `user.id`로 강제(`index.ts:648`).
- **정지(suspended) 차단**: create-upload Edge에서 `is_suspended` 시 403(`index.ts:220-222`). DB 트리거(`block_suspended_writes_20260625.sql`)는 댓글/팔로우/좋아요 등 사용자 직접쓰기를 차단하나, 영상 업로드는 service_role(save-metadata) 경로라 트리거 미적용 → Edge 403이 유일 방어선(SQL 주석 `:11`).
- **rate limit**: create-upload 시간당 30회, generate-promo 20회(`index.ts:223-235`,`:447-461`).
- **IDOR 불가(통계)**: 대시보드 RPC는 인자 없이 `auth.uid()`로만 본인 데이터 집계(`phase20/21.sql`). 명시적 creator_id 인자를 받는 통계 RPC는 `(p_creator_id=auth.uid() OR is_admin())` 가드(`high_fixes_20260614.sql:118`,`:132`,`:145`).
- **라이선스 비관리자 위조 차단**: 클라가 임의 license_type을 보내도 서버가 비관리자면 'original' 강제(`index.ts:683-686`).
- **VAST 픽셀 위조 차단**(연관): HMAC 서명 트래킹 픽셀(`index.ts:839-844`).

---

## 10. 분석 / 이벤트

- **업로드 진행 로그**: 버전·요청 진단·생성/업로드/저장 각 단계 `console.log`(`Upload.tsx:712-879`).
- **모더레이션 결과 로그**: score/status 또는 실패 사유(`Upload.tsx:929-934`).
- **대시보드 집계 소스(읽기 측)**:
  - 수익: `orders(seller_id, status='completed', amount, created_at)`.
  - 시청: `video_views(creator_id, is_valid, occurred_at, watch_ratio, watch_seconds, viewer_user_id, video_duration)`.
  - 좋아요: `video_likes` JOIN `videos.creator_id`.
  - 팔로워: `creator_followers(creator_id, created_at)`.
  - 광고 이벤트: `ad_video_events(source_video_id, event_type=impression/click/complete/skip)`.
- **RPM** = 최근30일 수익/시청수×1000 (`phase21:64-77`), **완주율** = watch_ratio≥0.9 비율 (`phase20:43-45`).

---

## 11. 수용 기준 (체크리스트)

업로드:
- [ ] 비로그인 진입 시 수익 카드 + 소셜 로그인 화면이 보인다 (`Upload.tsx:491-548`).
- [ ] 30초 미만 영상 선택 시 거부 토스트가 뜨고 파일이 초기화된다 (`:358-369`).
- [ ] 파일 선택 시 해상도·재생시간·하이라이트·썸네일 3프레임이 자동 세팅된다 (`:354-439`).
- [ ] Step 2 필수 7개 중 하나라도 비면 "다음"/제출이 막히고 toast가 뜬다 (`validateStep2`).
- [ ] 3분 미만이면 가격칸 대신 판매 불가 안내가 뜬다 (`:2009-2022`).
- [ ] 더블클릭해도 영상이 1개만 생성된다 (`:693`).
- [ ] create-upload 응답에 Bunny AccessKey가 포함되지 않는다 (TUS 서명만, `index.ts:294-300`).
- [ ] save-metadata가 5xx면 최대 3회 재시도, 4xx면 즉시 실패한다 (`:857-877`).
- [ ] 비관리자가 license_type을 위조해도 DB엔 'original'로 저장된다 (`index.ts:683`).
- [ ] 정지 계정은 create-upload에서 403을 받는다 (`index.ts:220-222`).
- [ ] 업로드 중 탭 이탈 시 TUS 전송이 abort된다 (`:160`, `bunnyUpload.ts:77-79`).
- [ ] 작성 중 이탈 후 재진입 시 "이어서 작성" 토스트가 뜬다 (`:224-235`).
- [ ] 업로드 완료 시 자동 모더레이션이 호출되고, 실패해도 완료 화면이 보인다 (`:916-935`).

대시보드:
- [ ] 누적 KPI 4종 + 시청자 4종이 표시된다 (`CreatorDashboard.tsx:184-221`).
- [ ] 7/14/30일 토글 시 모든 차트가 재조회된다 (`:152`,`:243-256`).
- [ ] Top 영상 지표 토글(views/likes/watch_ratio)이 동작한다 (`:384-398`).
- [ ] `pending_payout=0`이면 정산 안내가 숨겨진다 (`:224`).
- [ ] 다른 사용자의 통계가 절대 노출되지 않는다(auth.uid 고정, IDOR RPC 가드).
- [ ] retention/Top 데이터가 없으면 빈 상태/안내가 보인다 (`:343`,`:400-401`).

---

## 12. 알려진 제약 / 이월

- **TUS resume 미지원**: 현재 단일 PATCH(offset 0)라 중단 시 처음부터 재전송. 부분 재개(Upload-Offset 기반 resume)는 미구현 (`bunnyUpload.ts:82-87`).
- **재생시간 자유 입력**: `duration`은 자동측정되지만 input이 read-only가 아니라 사용자가 임의 수정 가능 → 정규식 형식검증만 존재(`Upload.tsx:1527-1534`,`:669`). 측정값과 표시값 불일치 가능.
- **price_commercial/exclusive stale 컬럼**: All-in-One 단일가 전환 후에도 NOT NULL 안전을 위해 standard와 동일값으로 유지, schema cleanup 시 DROP 예정(`index.ts:655-659`).
- **KV ↔ DB 이중 저장**: save-metadata가 KV와 `videos` 테이블에 동시 기록(하위호환, `index.ts:624-633`). KV는 점진 폐기 대상.
- **rate limit 분산 정확도**: KV 기반 best-effort 윈도우라 동시성 경합 시 정확한 카운트는 보장 안 됨(`index.ts:216`,`:226-234`).
- **드래프트 디바운스 부재**: 드래프트는 리렌더 단위로 즉시 localStorage 직렬화(명시적 setTimeout 디바운스 아님). 대용량 폼에서 빈번한 저장 발생 가능(`Upload.tsx:243-257`).
- **모더레이션 = 썸네일 단일 프레임**: Google Vision SafeSearch가 썸네일 1장만 검사(`index.ts:1731-1743`). 영상 본문 프레임 샘플링은 미구현 → 우회 여지.
- **자막 하드섭 안내만**: 번인 자막은 끌 수 없음 — UI 경고로만 안내(`Upload.tsx:1714-1716`), 강제 검출은 없음.
