# 영상 일괄 업로드 가이드 (bulk-upload)

카테고리/장르 폴더에 영상을 넣고 **명령 한 번**으로 Bunny 업로드 + DB 등록까지. 웹 업로드와
동일한 경로(Edge Function)를 그대로 타므로 Bunny 키는 필요 없음(서버에 보관됨).

스크립트: [scripts/bulk-upload.mjs](../scripts/bulk-upload.mjs)

---

## 1. 1회 설정

```powershell
# 1) 설정 파일 만들기
Copy-Item .env.bulk.example .env.bulk
# 2) .env.bulk 열어서 SUPABASE_ANON_KEY 와 BULK_PASSWORD 채우기
#    - anon key: Supabase 대시보드 → Project Settings → API → anon public
#    - 로그인: CREAITE 가입 이메일/비번 (crebizlogistics@gmail.com)
#      ※ 구글로만 가입했다면 비번이 없을 수 있음 → 그땐 BULK_ACCESS_TOKEN 사용(아래)
```

(권장) **ffmpeg** 설치 — 영상 길이/해상도를 읽어 OTT 자동분류·길이배지에 사용.
없어도 업로드는 되지만 길이가 0으로 들어감. `winget install Gyan.FFmpeg` 또는 ffmpeg.org.

### 구글 로그인만 쓴다면 (비번 없음)
1. 브라우저로 www.creaite.net 로그인
2. F12 → Application → Local Storage → `sb-...-auth-token` 의 `access_token` 복사
3. `.env.bulk` 에 `BULK_ACCESS_TOKEN=...` 붙여넣기 (약 1시간 유효 → 소량씩)

---

## 2. 폴더 구조

```
videos/
  영화/
    SF/
      도시침몰.mp4
      도시침몰.txt        ← TopView 프롬프트(선택). 제목/설명 단서로 사용
      유성우.mp4
  드라마/
    스릴러/
      마지막증인_1화.mp4
  manifest.json           ← Claude가 .txt 보고 생성(제목·설명·태그·등급·시리즈)
```

- **카테고리(형식 6)**: 영화 · 드라마 · 애니메이션 · 다큐멘터리 · 뮤직비디오 · 기타
- **장르(분위기 11)**: SF · 액션 · 로맨스 · 공포 · 판타지 · 스릴러 · 드라마 · 코미디 · 자연·풍경 · 추상 · 기타
- 폴더명이 곧 분류값이라 **정확히** 위 단어로. (예: `자연·풍경` — 가운뎃점)

`videos/` 와 `.env.bulk` 는 git에서 제외됨(대용량·시크릿).

---

## 3. 제목·설명은 누가?

영상 내용을 스크립트가 볼 수 없으므로 **Claude가 작성**합니다.

1. 영상 옆에 TopView 프롬프트를 `같은이름.txt` 로 저장
2. Claude에게 **"manifest 만들어줘"** → `videos/manifest.json` 생성
   - .txt를 읽어 영상별 한글 **제목·설명·태그·연령등급**(+시리즈면 회차) 작성
3. manifest가 없으면 폴백: 파일명=제목, 옆 .txt 첫 줄=설명

### manifest.json 형식

```json
{
  "items": [
    {
      "file": "영화/SF/도시침몰.mp4",
      "title": "도시가 잠긴 날",
      "description": "거대한 해일이 메트로폴리스를 삼키는 순간, 한 가족의 생존기.",
      "tags": "재난, SF, 도시, 생존",
      "age_rating": "13",
      "aiTool": "Seedance 2.0",
      "prompt": "원본 프롬프트 전문(증빙용)",
      "series": { "title": "재난 연대기", "season": 1, "episode": 1 }
    }
  ]
}
```

- `file`: `videos/` 기준 상대경로(슬래시 `/`). category/genre는 폴더에서 자동 → manifest에 없어도 됨.
- `age_rating`: `all` `13`(화면표기 12+) `15` `19`
- `series`: 연속물일 때만. 같은 `title`이면 자동으로 한 시리즈로 묶임.

---

## 4. 실행

```powershell
# 미리보기 (네트워크 X — 분류·제목 확인용)
npm run bulk-upload -- --dry-run

# 실제 업로드
npm run bulk-upload
```

- **멱등**: 완료분은 `videos/.uploaded.json` 에 기록 → 재실행 시 자동 건너뜀. 중간에 끊겨도 다시 돌리면 됨.
- 가격은 0(무료 광고형)으로 등록. 판매는 나중에 사이트 수정화면에서.
- 업로드 후 Bunny 인코딩 몇 분 → 사이트엔 즉시 카드가 뜨고, 재생은 인코딩 완료 후 가능.

---

## 5. 자주 나는 문제

| 증상 | 원인/해결 |
|---|---|
| `인증 정보 없음` | `.env.bulk` 에 BULK_EMAIL+BULK_PASSWORD 또는 BULK_ACCESS_TOKEN |
| `로그인 실패` | 구글 전용 계정 → 토큰 방식 사용 |
| `건너뜀(분류 오류)` | 폴더명이 위 카테고리/장르 단어와 정확히 일치하는지 |
| 길이 0 / OTT 분류 안 됨 | ffmpeg(ffprobe) 미설치 |
| `create-upload 401` | 토큰 만료 → 비번 방식으로 바꾸거나 토큰 재복사 |
