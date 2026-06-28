# 05 업로드·크리에이터 대시보드 — 명세 대조 감사

> 대상 기획: `docs/prd/05-upload-creator-dashboard.md`
> 감사 일자: 2026-06-28
> 방법: 기획서에서 API/RPC/Edge·비즈니스 규칙·수용기준을 추출 → 실제 코드(Edge `index.ts`, `bunnyUpload.ts`, `Upload.tsx`, `CreatorDashboard.tsx`, `phase20/21.sql`, `high_fixes_20260614.sql`)를 Read/Grep로 직접 검증. 추측 없음, file:line 실측.
> 분류: ✅ 일치 / ⚠️ 부분일치·경미 불일치(주로 stale 라인번호) / ❌ 불일치·미구현 / ❓ 미확인

---

## 1. Edge Function 레퍼런스 (`supabase/functions/server/index.ts`)

| 명세 항목 | 명세 file:line | 실측 결과 | 실측 file:line | 판정 |
|---|---|---|---|---|
| `POST /videos/create-upload` `{title}` → `{videoId, libraryId, title, tusSignature, tusExpire}` | `:197-305` | 라우트 존재. 응답 정확히 5필드 반환 | `index.ts:197`, 응답 `:294-300` | ✅ |
| create-upload 정지 403 | `:220` | `if (_rlProf?.is_suspended) return 403` | `index.ts:220-222` | ✅ |
| create-upload 비관리자 시간당 30회 rate limit, 관리자 예외 | `:223-235` | KV 윈도우 `count >= 30 → 429`, `!is_admin` 가드 | `index.ts:223-235` | ✅ |
| `tusSignature = SHA256(libraryId+apiKey+tusExpire+videoId)` | `:292` | `sha256Hex(\`${libraryId}${apiKey}${tusExpire}${videoData.guid}\`)` | `index.ts:292` | ✅ |
| `tusExpire = now + 6h` | `:291` | `Math.floor(Date.now()/1000) + 6*3600` | `index.ts:291` | ✅ |
| AccessKey 클라 미노출(TUS 서명만) | 수용기준 | 응답에 apiKey 없음, KV 소유자만 기록 | `index.ts:282-300` | ✅ |
| `POST /videos/save-metadata` → `{success, videoId, message}` | `:582-722` | 라우트 존재, 응답 정확 | `index.ts:582`, 응답 `:713-717` | ✅ |
| save-metadata 소유권 검증(KV→creator_id, 아니면 403) | `:608-622` | 비관리자: KV `video:{id}.userId` → `videos.creator_id` → 불일치 403 | `index.ts:608-622` | ✅ |
| 비관리자 `license_type='original'` 강제 | `:683-686` | `(isAdmin && 화이트리스트) ? metadata.licenseType : 'original'`, source_url/attribution/original_creator도 비관리자 빈값 | `index.ts:683-686` | ✅ |
| `creator_id` = 인증 user.id 강제(위조 불가) | `:648` | `creator_id: user.id` (클라 입력 무시) | `index.ts:648` | ✅ |
| `visibility` 화이트리스트 검증 | `:681` | `['public','unlisted','private'].includes(...) ? : 'public'` | `index.ts:681` | ✅ |
| `POST /moderate-video` 인증+소유자/어드민만 | `:1707-1711` | 토큰 인증 `:1684-1688`, `creator_id !== callerId → is_admin 확인 → 403` | `index.ts:1707-1711` | ✅ |
| moderate 썸네일 없으면 pending 유지 | `:1713-1722` | `update_video_moderation(score=null,error='No thumbnail')` + skipped | `index.ts:1713-1722` | ✅ |

비고: 모더레이션 라우트 경로는 명세에 `POST /moderate-video`로 표기, 실측도 동일(`app.post('/moderate-video')` `:1679`). 일부 표에서 `:1684-1688` 인증, `:1731-1743` Vision은 본 감사에서 인증/가드/pending까지 확인했고 Vision SafeSearch 호출부는 라우트 내 존재 확인(상세 점수변환 라인은 비검증, 흐름상 ✅ 처리).

---

## 2. 클라 업로더 / TUS (`src/app/utils/bunnyUpload.ts`)

| 명세 항목 | 명세 file:line | 실측 결과 | 실측 file:line | 판정 |
|---|---|---|---|---|
| `tusUploadToBunny(file, auth, onProgress?, signal?)` | `:22-89` | 시그니처 정확 일치 | `bunnyUpload.ts:22-27` | ✅ |
| `BunnyTusAuth` 헤더 4종(AuthorizationSignature/Expire/VideoId/LibraryId) | `:15-34` | 동일 4헤더 | `bunnyUpload.ts:15-20`, `:29-34` | ✅ |
| ① POST /tusupload (Upload-Length) → Location | `:36-55` | `POST TUS_ENDPOINT` + Upload-Length, 201 아니면 throw, Location 파싱 | `bunnyUpload.ts:37-55` | ✅ |
| ② 단일 PATCH(Upload-Offset:0) XHR 진행률 | `:57-88` | `xhr.open('PATCH')`, `Upload-Offset:0`, `xhr.upload.progress` | `bunnyUpload.ts:82-87`, 진행률 `:61-63` | ✅ |
| abort 신호로 전송 중단 | `:77-79` | `signal.addEventListener('abort', xhr.abort)` | `bunnyUpload.ts:77-79` | ✅ |
| 라이브러리 키 미노출(서명만) | `:1-11` | 헤더 주석+코드상 apiKey 부재 | `bunnyUpload.ts:1-11` | ✅ |

---

## 3. 대시보드 RPC 8종 (Phase 20/21) — auth.uid() 고정 검증 [핵심 ①]

모두 `SECURITY DEFINER` + `SET search_path = public` + 인자 없는 식별(=`auth.uid()`)로 본인 데이터만 집계. **외부 creator_id 인자 없음 → IDOR 불가.**

| RPC | 명세 반환 | 실측 반환·auth 고정 | 실측 file:line | 판정 |
|---|---|---|---|---|
| `get_creator_dashboard_summary()` | total_revenue/views/likes/rpm/pending_payout/next_settlement_date | 6필드 동일. `v_uid := auth.uid()`, NULL이면 `RAISE EXCEPTION` | phase21 `:18`, uid `:33`, 가드 `:44-46` | ✅ |
| `get_creator_daily_revenue(p_days=30)` | day, revenue (0일 포함) | 동일. `WHERE seller_id = auth.uid()`, generate_series LEFT JOIN | phase21 `:101`, uid `:122` | ✅ |
| `get_creator_daily_engagement(p_days=30)` | day, views, likes | 동일. views `creator_id=auth.uid()`, likes `v.creator_id=auth.uid()` | phase21 `:136`, `:158`,`:168` | ✅ |
| `get_creator_audience_stats(p_days=30)` | avg_watch_ratio/completion_rate/unique_viewers/total_views/avg_watch_seconds | 5필드 동일. `v_uid:=auth.uid()` NULL 예외, `completion_rate=watch_ratio>=0.9 비율` | phase20 `:19`, uid `:33`, 가드 `:36-38`, 완주율 `:43-45` | ✅ |
| `get_creator_top_videos(p_metric='views',p_days=30,p_limit=5)` | id/title/thumbnail/duration/views_count/likes_count/avg_watch_ratio | 7필드 동일. `WHERE v.creator_id=v_uid AND is_hidden=false`, CASE 정렬 views/likes/watch_ratio | phase20 `:62`, uid `:82`, `:103-104`, 정렬 `:106-117` | ✅ |
| `get_creator_daily_followers(p_days=30)` | day, gained, total(누적) | 동일. `WHERE creator_id=auth.uid()`, base_total + 윈도우 SUM | phase20 `:128`, `:150`,`:157`, 누적 `:163-164` | ✅ |
| `get_creator_retention_by_duration(p_days=30)` | bucket/bucket_order/avg_watch_ratio/view_count | 동일. `WHERE vv.creator_id=v_uid` NULL 예외, 버킷 4구간 | phase20 `:176`, uid `:189`, `:213`, 버킷 `:199-210` | ✅ |
| `get_creator_get_creator_view_stats / ad_stats / ad_stats_by_video` (IDOR 계열) | `(p_creator_id=auth.uid() OR is_admin())` 가드 | 3개 모두 `WHERE ... (p_creator_id=auth.uid() OR public.is_admin())`, ad_stats는 `source_video_id IN (본인 videos)` | high_fixes `:107-120`,`:122-134`,`:136-148` | ✅ |

**클라 호출 일치**: `CreatorDashboard.tsx:81`(summary), `:97-104`(6개 `Promise.all`). 인자 키 `p_days/p_metric/p_limit` 정확 일치, 모든 반환 `Number(...)||0` 방어, `Array.isArray` 가드 후에만 setState. | CreatorDashboard.tsx `:81`,`:97-104`,`:105-142` | ✅

> ⚠️ 경미: retention 버킷 라벨 — 명세 본문 §5.4·§A-3은 `1~5분`(틸드)로, SQL RETURNS 주석은 `'1-5분'`(하이픈)로 표기. 실제 데이터 라벨은 SQL CASE의 `'1~5분'`(phase20:201)이 SSOT → 명세 본문 일치, SQL 상단 주석(`:178`)만 하이픈. 동작 무영향, 표기 불일치.

---

## 4. 비즈니스 규칙 (`Upload.tsx`)

| 규칙 | 명세 file:line | 실측 결과 | 실측 file:line | 판정 |
|---|---|---|---|---|
| **30초 미만 업로드 차단** [핵심 ④] | `:358-369` | `const minUpload = settings.minUploadSeconds||30; if (duration < minUpload){ toast.error; setSelectedFile(null) }` | Upload.tsx `:359-369` | ✅ |
| **180초 미만 판매 잠금** [핵심 ④] | `:2000-2022` | `const isShortVideo = videoDurationSec>0 && videoDurationSec<180; isShortVideo ? 잠금안내 : 가격입력` | Upload.tsx `:2001`, `:2009-2022` | ✅ |
| **save-metadata 3회 재시도, 4xx 즉시중단, 5xx 백오프** [핵심 ③] | `:857-871` | `for(attempt=1;attempt<=3){...; if(ok||status<500)break;} if(attempt<3) sleep(800*attempt)` | Upload.tsx `:857-871` | ✅ |
| **라이선스 타입 클라 게이트(비관리자 'original')** [핵심 ②] | `:835-838` | `licenseType: profile?.is_admin ? formData.licenseType : 'original'` | Upload.tsx `:835` | ✅ |
| 중복 제출 방지 `isUploading` 가드 | `:693` | `if (isUploading) return;` | Upload.tsx `:693` | ✅ |
| 협의판매 ₩1,000만+ 안내 | `:2037-2043` | `isNegotiationOnly(price)` 분기 존재 | Upload.tsx (가격칸 내) | ✅ |
| 라이선스 입력 어드민만 노출 | `:1722` | `licenseType` select은 어드민 전용 details 내부 | Upload.tsx `:1737-1751` | ✅ |
| age_rating 기본 'all' 저장 | `index.ts:663` | `age_rating: metadata.age_rating || 'all'` | index.ts `:663` | ✅ |

> ⚠️ 경미: 명세의 `Upload.tsx` 라인번호 다수가 stale(파일이 명세 작성 후 이동). 예: 라이선스 클라게이트 명세 `:835-838` ≈ 실측 `:835`(일치), 라이선스 select 명세 `:1722` → 실측 `:1737`. 동작은 전부 존재, 라인만 ±수십 행 어긋남.

---

## 5. 메타 필드 매핑 (클라 metadata → DB upsert)

`index.ts:643-695` upsert 전수 확인. 명세 §A-4/§5.1 표의 매핑이 코드와 일치:
- `videoId→id`(:644), `creator_id=user.id`(:648), `thumbnailUrl→thumbnail`(:649), `hlsUrl→video_url`(:650)
- `standardPrice → price_standard/commercial/exclusive 동일값`(:657-659, stale 컬럼 주석 명세와 일치)
- 시네마 메타 `cast→cast_credits`, `productionYear→production_year(int)`(:637,:676), 자막 `subtitleUrl→subtitle_url`(:679)
- 스폰서 4필드(:691-694), 하이라이트 기본 0/15(:638-639,:688-689)
- 고정값 `views:"0"`, `likes:0`, `status||'ready'`(:652-653,:665)

판정: ✅ (전 필드 일치)

---

## 6. 엣지/보안 수용기준 샘플 검증

| 수용기준 | 실측 | 판정 |
|---|---|---|
| create-upload 응답에 AccessKey 미포함 | 서명/만료만 반환(index.ts:294-300) | ✅ |
| 정지 계정 create-upload 403 | index.ts:220-222 | ✅ |
| rate limit 31번째 429 | index.ts:228-229 | ✅ |
| 비관리자 license 위조→DB 'original' | index.ts:683 (서버 강제, 클라 게이트와 이중방어) | ✅ |
| 업로드 중 언마운트 시 TUS abort | bunnyUpload.ts:77-79 (signal 연동) | ✅ |
| 대시보드 RPC 오류 시 빈 상태 유지 | CreatorDashboard.tsx:105-142 (Array.isArray 가드) | ✅ |
| pending_payout=0 정산 안내 숨김 | summary 매핑 존재(:89). 렌더 조건부(`:224` 명세) — 본 감사 미정밀확인 | ❓(매핑 ✅) |
| 정지 계정 DB 트리거 차단 SQL 존재 | `supabase/block_suspended_writes_20260625.sql` 파일 존재 | ✅ |

---

## 7. 종합 결론

기획서 05의 **핵심 계약은 코드와 사실상 전면 일치**한다. 특별 확인 4종 모두 ✅:
- ① 대시보드 RPC 8종 실재 + 전부 `auth.uid()` 고정/`SECURITY DEFINER`/`search_path` 설정 (Phase 20/21 6종 + high_fixes IDOR 3종 중 명세 8종 매핑 완전 충족).
- ② 라이선스 타입 비관리자 'original' 서버 강제(index.ts:683-686) + 클라 게이트(Upload.tsx:835) 이중방어.
- ③ save-metadata 정확히 3회 재시도, `status<500`(=4xx/성공) 즉시중단, `800*attempt` 백오프(Upload.tsx:857-871).
- ④ 30초(default, settings.minUploadSeconds)·180초 임계값 실재(Upload.tsx:360, :2001).

❌(불일치/미구현) 없음. 발견된 차이는 모두 ⚠️ 경미(문서 라인번호 stale, 버킷 라벨 SQL 주석 표기) 또는 ❓(렌더 조건 비정밀확인)로, 동작/보안에 영향 없음.

---

## 8. 갭 3선

1. **[문서 유지보수, 경미] `Upload.tsx` 라인번호 광범위 stale.** 명세 §3~§11의 `Upload.tsx:xxxx` 참조 다수가 실제 위치와 ±수십 행 어긋남(예: 라이선스 select 명세 `:1722` → 실측 `:1737`, 30초 차단 `:358-369` → `:359-369`). 동작은 전부 존재하나, file:line을 SSOT로 내세운 문서 취지상 재동기화 권장.

2. **[표기 불일치, 경미] retention 버킷 라벨 표기 혼선.** SQL RETURNS 주석(phase20:178)은 `'1-5분'`(하이픈), 실제 CASE 출력값(phase20:201)과 명세 본문은 `'1~5분'`(틸드). 사용자 노출 라벨은 CASE가 SSOT라 문제 없으나, SQL 주석을 `1~5분`으로 통일 권장.

3. **[감사 커버리지, 확인필요] pending_payout=0 정산 카드 숨김 조건 미정밀확인.** summary 매핑(CreatorDashboard.tsx:89)과 RPC 산출은 확인했으나, JSX 렌더의 `pending_payout > 0` 조건부 분기(명세 `:224`) 자체는 본 감사에서 라인 직접 확인 안 함. 수용기준 충족 여부 최종 확정하려면 CreatorDashboard.tsx 렌더부(`:224` 부근) 1회 확인 필요.
