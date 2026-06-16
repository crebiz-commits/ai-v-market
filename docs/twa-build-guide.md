# 📱 CREAITE Android 앱 빌드 가이드 (TWA — Trusted Web Activity)

> 목적: PWA(웹앱)를 **그대로 감싸는** 안드로이드 앱을 만들어 Google Play에 출시.
> 결제는 **리더앱 방식**(앱 내 구독 버튼 → 외부 브라우저로 결제) → 인앱결제 30% 수수료 회피.
> 코드는 이미 완료(`appWrapper.ts` 감지 → 외부 브라우저 라우팅). **이 문서는 "앱 껍데기 빌드 + 출시" 절차.**

---

## 0. 사전 정보 (이미 확정됨)

| 항목 | 값 |
|---|---|
| 앱 도메인(호스트) | `www.creaite.net` |
| 패키지명(Package ID) | `net.creaite.app` |
| Web Manifest | `https://www.creaite.net/manifest.json` |
| 시작 URL | `/?source=pwa` |
| 앱 이름 | CREAITE |
| 테마/배경색 | `#0a0a0a` |
| 방향 | portrait (영상 전체화면만 가로 잠금) |

> ⚠️ 패키지명 `net.creaite.app` 은 `public/.well-known/assetlinks.json` 과 **반드시 일치**해야 합니다(이미 그렇게 작성됨).

---

## 1. 빌드 방법 — 두 갈래 (하나만 택일)

### 방법 A. PWABuilder (권장 — CLI·개발환경 불필요, 웹에서 클릭)

1. https://www.pwabuilder.com 접속
2. URL 입력: `https://www.creaite.net` → **Start**
3. PWA 점수 확인(매니페스트·서비스워커 이미 있어 통과). → **Package For Stores** → **Android**
4. 옵션 설정:
   - Package ID: `net.creaite.app`
   - App name: `CREAITE`
   - Launcher name: `CREAITE`
   - Start URL: `/?source=pwa`
   - Display mode: `standalone`
   - (Signing key) **"Create new"** 선택 → PWABuilder가 서명키 생성
5. **Download** → `.zip` 안에 다음이 들어있음:
   - `app-release-signed.aab` (Play 업로드용)
   - `signing.keystore` + `signing-key-info.txt` (**절대 분실 금지** — 이후 업데이트에 필요)
   - **`assetlinks.json`** ← 여기에 들어있는 SHA-256 핑거프린트가 핵심 (3단계 참고)

> PWABuilder는 내부적으로 Bubblewrap을 씁니다. CLI가 부담되면 이 방법이 가장 빠릅니다.

### 방법 B. Bubblewrap CLI (개발자용)

```bash
# 선행: Node.js LTS + JDK 17 (Bubblewrap이 Android SDK는 자동 설치)
npm i -g @bubblewrap/cli

# 초기화 — web manifest에서 자동으로 twa-manifest.json 생성
bubblewrap init --manifest https://www.creaite.net/manifest.json
#   - Package name: net.creaite.app
#   - 나머지는 기본값(매니페스트에서 자동 추출) 확인 후 진행
#   - 서명키(keystore) 생성 → 비밀번호/별칭 기록·백업 (분실 시 업데이트 불가)

bubblewrap build
#   → app-release-signed.aab 생성 + assetlinks.json 출력(핑거프린트 포함)
```

참고용 `twa-manifest.json` 핵심 값(자동 생성되지만 확인용):
```json
{
  "packageId": "net.creaite.app",
  "host": "www.creaite.net",
  "name": "CREAITE",
  "launcherName": "CREAITE",
  "display": "standalone",
  "orientation": "portrait",
  "themeColor": "#0a0a0a",
  "backgroundColor": "#0a0a0a",
  "startUrl": "/?source=pwa",
  "iconUrl": "https://www.creaite.net/icon-512.png",
  "maskableIconUrl": "https://www.creaite.net/icon-512.png",
  "webManifestUrl": "https://www.creaite.net/manifest.json",
  "appVersionName": "1.0.0",
  "appVersionCode": 1,
  "fallbackType": "customtabs",
  "enableNotifications": true
}
```

---

## 2. Google Play Console 등록·업로드

1. https://play.google.com/console → **개발자 계정 등록**($25, 1회) — 신원확인에 며칠 걸릴 수 있으니 미리.
2. **앱 만들기** → 이름 `CREAITE`, 무료, 카테고리: 엔터테인먼트.
3. **프로덕션 → 새 버전 만들기** → 위에서 받은 **`.aab`** 업로드.
4. **앱 서명(Play App Signing)** 사용에 동의 → Google이 앱을 재서명함.
   - ⚠️ **이게 3단계의 핵심**: 사용자가 받는 앱은 Google이 재서명하므로, 검증에 필요한 핑거프린트가 **업로드 키가 아니라 "Play 앱 서명 키"의 SHA-256** 입니다.

---

## 3. ⭐ Digital Asset Links — assetlinks.json 채우기 (가장 중요·실수 1순위)

앱과 사이트를 연결해 **브라우저 주소창·하단바 없이 풀스크린 앱**으로 뜨게 하는 검증입니다. 잘못되면 앱 상단에 URL 바가 남습니다.

**현재 상태(2026-06-16)**: PWABuilder가 만든 **로컬 서명키 지문**(`6D:90:DA:…:3D:85`)은 이미 [`public/.well-known/assetlinks.json`](../public/.well-known/assetlinks.json) 에 기입·배포됨 → **직접 설치한 APK는 검증 통과**. 아래는 Play 업로드 후 **두 번째 지문(Play 앱서명 키)** 추가 절차.

1. **Play Console → 앱 → 테스트 및 출시 → 앱 무결성(App integrity) → 앱 서명** 으로 이동.
2. **"앱 서명 키 인증서"의 SHA-256 인증서 지문**을 복사 (예: `AB:CD:12:...`).
3. `public/.well-known/assetlinks.json` 의 `sha256_cert_fingerprints` **배열에 그 값을 한 줄 더 추가**(기존 로컬키 지문은 그대로 둠) → 커밋 → Vercel 배포.
   ```json
   "sha256_cert_fingerprints": [
     "6D:90:DA:89:E5:DC:20:F4:90:89:8A:BE:48:A4:5B:05:27:D8:43:EA:3A:61:BE:68:30:92:6E:4F:C8:CF:3D:85",
     "여기에_Play_앱서명_SHA256_추가"
   ]
   ```
4. 배포 후 확인: `https://www.creaite.net/.well-known/assetlinks.json` 가 그 JSON을 그대로 반환하는지 브라우저로 확인.
5. 검증 점검 도구: https://developers.google.com/digital-asset-links/tools/generator

> 핑거프린트가 비어있거나 틀리면 — 앱은 동작하지만 **상단에 도메인 표시줄**이 남습니다. 채우면 사라집니다.

---

## 4. 출시 전 체크 (스토어 심사 대비)

- [ ] 개인정보처리방침 URL: `https://www.creaite.net/?info=privacy` (스토어 등록 폼에 입력)
- [ ] 데이터 보안 설문(Data safety) — 수집 항목: 이메일·결제(외부)·콘텐츠. 솔직히 기입.
- [ ] 콘텐츠 등급 설문(IARC) — 영상 플랫폼, 19+ 콘텐츠 게이트 있으면 명시.
- [ ] 결제: **앱 내 구독 버튼이 외부 브라우저로 라우팅**됨을 인지(리더앱). 인앱결제(Google Billing) 미사용.
  - 근거: 전기통신사업법(인앱결제 강제금지, 2021) + 한국 OTT 리더앱 관행. 리젝 시 "외부 결제는 한국 법령 준수" 소명.
- [ ] 스크린샷(폰 2~8장)·아이콘 512·피처그래픽 1024×500 준비([로고/](../로고/) 활용).

---

## 5. iOS (나중에 — 베타 안정화 후)

- iOS는 TWA 동급 기능이 없음 → **Capacitor**(WebView 래퍼)로 PWA를 감싸 App Store 제출.
- Apple "리더앱(Reader App)" 가이드라인으로 외부 결제 허용 신청(넷플릭스·스포티파이 방식).
- Apple Developer Program $99/년.
- 별도 작업량이 크므로 Android(TWA) 출시·안정화 후 진행 권장.

---

## 요약 한 줄
**PWABuilder로 .aab 받기 → Play 업로드(앱 서명 동의) → Play 앱서명 SHA-256을 assetlinks.json에 넣고 배포 → 심사 제출.** 결제 코드는 이미 리더앱으로 완료돼 손댈 것 없음.
