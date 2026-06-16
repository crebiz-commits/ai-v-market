# 📢 CREAITE 광고 수익화 신청 가이드 (애드핏 + AdSense)

> 코드 인프라는 완료([ExternalAdSlot.tsx](../src/app/components/ExternalAdSlot.tsx)): 광고 ID(env)만 넣으면 자동 노출.
> 이 문서는 **계정 신청 → 승인 → ID를 어디에 넣는지** 절차.
> 토스와 무관 — **무료 광고형 티어는 결제 없이 수익화 가능.**

---

## 핵심 순서 (승인 난이도순)

```
① 카카오 애드핏 신청 (한국·쉬움) → ② Google AdSense 신청 (까다로움) → ③ 승인분 env 등록 → ④ 재배포
```

---

## ① 카카오 애드핏 (권장 — 먼저, 승인 쉬움)

1. https://adfit.kakao.com → 카카오 계정 로그인 → **매체 등록**
2. 매체 정보: 사이트 `https://www.creaite.net`, 카테고리 = 엔터테인먼트/동영상
3. **광고단위 만들기** → **PC/모바일 배너 300×250** (미디엄 렉탱글) 생성
4. 발급된 **광고단위 ID** (`DAN-xxxxxxxx`) 복사
5. 심사(보통 1~2일) 통과 후 노출 가능
6. → Vercel env 에 등록:
   ```
   VITE_ADFIT_UNIT_ID=DAN-xxxxxxxx
   ```

> ads.txt 불필요. 사업자 정보 있으면 통과 수월.

---

## ② Google AdSense (수익 큼, 심사 까다로움)

### ⚠️ 먼저 알 점 — 반려 리스크
AdSense는 **"독창적 가치가 충분한 콘텐츠"** 를 요구합니다. 외부에서 **끌어온(저작권 무료) 영상이 대부분이면** *"가치가 낮은 콘텐츠 / 집계형 사이트"* 로 반려될 수 있습니다.
- **유리하게 만드는 법**: 커뮤니티 글(팁·튜토리얼·리뷰), 작품별 **원본 설명·크리에이터 코멘터리**, 본인 AI 원본 작품을 함께 노출 → "단순 영상 모음"이 아닌 **편집·큐레이션·창작 가치**가 보이게.
- 한 번에 안 되면: 콘텐츠 보강 후 **재신청**(횟수 제한 없음).

### 절차
1. https://adsense.google.com → 가입 → 사이트 `https://www.creaite.net` 등록
2. AdSense가 주는 **소유권 확인 방법** 중 택1:
   - **(권장) ads.txt 방식**: 발급된 `pub-xxxxxxxxxxxxxxxx` 를 [`public/ads.txt`](../public/ads.txt) 에 기입(주석 해제) → 커밋·배포.
   - 또는 `<head>` 메타: `<meta name="google-adsense-account" content="ca-pub-xxxx">` 를 [index.html](../index.html) head 에 추가.
3. 심사(며칠~2주). 승인되면 광고 슬롯 ID(`슬롯 숫자`) 발급.
4. → Vercel env 에 등록:
   ```
   VITE_ADSENSE_CLIENT=ca-pub-xxxxxxxxxxxxxxxx
   VITE_ADSENSE_SLOT=xxxxxxxxxx
   ```
5. **ads.txt 채우기**(승인 후 필수): `public/ads.txt` 의
   `google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0` 줄 주석 해제 + 본인 pub-ID 로 교체 → 배포.

---

## ③ 공통 — 승인분 활성화 스위치

광고는 env 스위치로 켜집니다. **승인된 네트워크 ID를 넣은 뒤**:
```
VITE_EXTERNAL_ADS_ENABLED=1
```
→ Vercel 재배포. (이 값이 없거나 ID 미설정이면 광고 슬롯은 **빈 자리(null)** 로 안전하게 비표시.)

| env 변수 | 출처 | 비고 |
|---|---|---|
| `VITE_EXTERNAL_ADS_ENABLED` | 수동 `1` | 마스터 스위치 |
| `VITE_ADFIT_UNIT_ID` | 애드핏 광고단위 | `DAN-...` |
| `VITE_ADSENSE_CLIENT` | AdSense 게시자 | `ca-pub-...` |
| `VITE_ADSENSE_SLOT` | AdSense 광고슬롯 | 숫자 |

> 둘 다 설정되면 슬롯마다 **번갈아(로테이션)** 노출됩니다(`ExternalAdSlot` index 기준).

---

## ④ 노출 위치 (현재 코드)
- **커뮤니티 피드** 상단(비프리미엄 사용자만) — [Community.tsx](../src/app/components/Community.tsx)
- 규격: **300×250** 고정(미디엄 렉탱글). 프리미엄 구독자는 광고 제거.
- 확장 시 `<ExternalAdSlot index={n} />` 를 원하는 피드 위치에 추가.

---

## 정책 주의 (반려·정지 예방)
- **클릭 유도 금지**("광고를 눌러주세요" 등) — 즉시 정지 사유.
- 광고 라벨("AD") 유지 — 콘텐츠와 구분(이미 표시됨).
- 19+/선정적 영상 옆 광고 노출 주의 — AdSense는 성인 콘텐츠 페이지 광고 금지. (연령 게이트로 분리돼 있으면 OK)
- 자기 광고 클릭 금지.

---

## 요약
**애드핏 먼저(쉬움) → AdSense(콘텐츠 보강 후) → 승인 ID를 Vercel env에 + `VITE_EXTERNAL_ADS_ENABLED=1` → 재배포.** 토스 없이 무료 광고형 수익이 바로 돕니다.
