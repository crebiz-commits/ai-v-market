# 🔐 Google 로그인 설정 가이드

## ✅ 구현 완료
- [x] Supabase 클라이언트 설치
- [x] AuthContext에 Google 로그인 함수 추가
- [x] AuthModal에 Google 로그인 버튼 추가
- [x] OAuth 콜백 처리 로직 구현

## 🚀 Supabase에서 Google Provider 설정하기

### 1단계: Supabase 대시보드 접속

```
https://supabase.com/dashboard/project/tvbpiuwmvrccfnplhwer/auth/providers
```

### 2단계: Google Provider 활성화

1. **"Google"** 항목 찾기
2. **"Enable"** 토글 ON
3. 설정 화면이 나타남

---

## 🔧 Google Cloud Console 설정

### 1단계: Google Cloud Console 프로젝트 생성

```
https://console.cloud.google.com
```

1. **새 프로젝트 만들기** 또는 기존 프로젝트 선택
2. 프로젝트 이름: `CREAITE` (원하는 이름)

### 2단계: OAuth 동의 화면 구성

**경로:** APIs & Services → OAuth consent screen

1. **User Type**: External 선택
2. **Create** 클릭

**앱 정보 입력:**
```
- App name: CREAITE
- User support email: your-email@gmail.com
- Developer contact email: your-email@gmail.com
```

3. **Scopes** 단계는 기본값으로 넘어가기
4. **Test users** 추가 (개발 중에는 본인 이메일만 추가)
5. **저장 및 계속**

### 3단계: OAuth 클라이언트 ID 생성

**경로:** APIs & Services → Credentials

1. **Create Credentials** 클릭
2. **OAuth client ID** 선택
3. Application type: **Web application**

**웹 클라이언트 구성:**

```
이름: CREAITE Web Client

승인된 JavaScript 원본 (Authorized JavaScript origins):
- https://tvbpiuwmvrccfnplhwer.supabase.co

승인된 리디렉션 URI (Authorized redirect URIs):
- https://tvbpiuwmvrccfnplhwer.supabase.co/auth/v1/callback
```

4. **Create** 클릭

### 4단계: Client ID와 Secret 복사

생성 완료 후 표시되는 정보:
```
Client ID: 구글_클라이언트_ID (복사)
Client Secret: 구글_클라이언트_시크릿 (복사)
```

⚠️ **이 정보를 안전하게 보관하세요!**

---

## 📝 Supabase에 Google 인증 정보 입력

### Supabase Dashboard로 돌아가기

```
https://supabase.com/dashboard/project/tvbpiuwmvrccfnplhwer/auth/providers
```

**Google 설정:**

1. **Enable Google provider** 토글 ON
2. 다음 정보 입력:

```
Client ID (for OAuth): [Google Cloud Console에서 복사한 Client ID]
Client Secret (for OAuth): [Google Cloud Console에서 복사한 Client Secret]
```

3. **Authorized Client IDs** (선택사항)
   - 여러 플랫폼 사용 시 추가 설정

4. **Skip nonce check** (선택사항)
   - 기본값 유지 권장

5. **Save** 클릭

---

## 🧪 테스트하기

### 1. 앱에서 로그인 테스트

```
1. "로그인" 버튼 클릭
2. "Google로 계속하기" 버튼 클릭
3. Google 계정 선택 화면으로 리디렉트
4. 계정 선택 및 권한 승인
5. 앱으로 자동 리디렉트되며 로그인 완료!
```

### 2. Supabase에서 확인

```
https://supabase.com/dashboard/project/tvbpiuwmvrccfnplhwer/auth/users

→ Google 계정으로 생성된 사용자 확인
→ Provider: google
→ Email: Google 계정 이메일
```

---

## 🎯 앱에서 확인할 사항

### ✅ 정상 작동 시

1. **로그인 모달에서:**
   - "이메일/비밀번호" 입력란
   - "또는" 구분선
   - "Google로 계속하기" 버튼 (Google 로고 표시)

2. **Google 버튼 클릭 시:**
   - Google 로그인 페이지로 리디렉트
   - 계정 선택 화면
   - 권한 요청 화면

3. **로그인 성공 시:**
   - 앱으로 자동 리디렉트
   - 우측 상단에 사용자 이름 표시
   - 마이페이지 접근 가능

### ⚠️ 에러가 발생한다면

**"Provider is not enabled" 에러:**
```
→ Supabase Dashboard에서 Google Provider가 활성화되었는지 확인
→ Client ID와 Secret이 올바르게 입력되었는지 확인
```

**"Redirect URI mismatch" 에러:**
```
→ Google Cloud Console에서 Redirect URI 확인:
  https://tvbpiuwmvrccfnplhwer.supabase.co/auth/v1/callback
→ 정확히 일치해야 함 (trailing slash 주의)
```

**"Access blocked: This app's request is invalid" 에러:**
```
→ OAuth 동의 화면 구성 확인
→ Test users에 본인 이메일 추가했는지 확인
```

---

## 🔐 보안 설정 (프로덕션 배포 전)

### 1. OAuth 동의 화면 Publishing

**개발 중:**
- Testing 모드 (최대 100명의 Test users)
- 본인 및 팀만 로그인 가능

**실제 서비스:**
```
1. OAuth consent screen → Publishing status
2. "Publish App" 클릭
3. Google 검토 요청 (수일 소요)
4. 승인 후 모든 사용자 로그인 가능
```

### 2. Redirect URI 업데이트

**프로덕션 도메인 추가:**
```
Google Cloud Console → Credentials → Web client

Authorized JavaScript origins:
- https://yourdomain.com
- https://tvbpiuwmvrccfnplhwer.supabase.co

Authorized redirect URIs:
- https://yourdomain.com/auth/callback (커스텀 도메인 사용 시)
- https://tvbpiuwmvrccfnplhwer.supabase.co/auth/v1/callback
```

---

## 💡 추가 기능 (선택사항)

### 다른 소셜 로그인 추가

Supabase는 다음 Provider도 지원합니다:

- **GitHub**: 개발자 커뮤니티용
- **Facebook**: 일반 사용자용
- **Apple**: iOS 사용자용
- **Discord**: 게임/커뮤니티용
- **Twitter/X**: 크리에이터용

**설정 방법:**
각 Provider마다 비슷한 과정:
1. 해당 플랫폼 Developer Console에서 앱 등록
2. Client ID/Secret 생성
3. Redirect URI 설정
4. Supabase에 인증 정보 입력

---

## 📚 참고 자료

- [Supabase Auth 공식 문서](https://supabase.com/docs/guides/auth)
- [Google OAuth 설정 가이드](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google Cloud Console](https://console.cloud.google.com)

---

## 🎉 완료!

Google 로그인 설정이 완료되면:

1. ✅ 사용자는 Google 계정으로 간편 로그인
2. ✅ 별도 비밀번호 관리 불필요
3. ✅ 더 안전한 인증 프로세스
4. ✅ 더 높은 사용자 전환율

**지금 바로 테스트해보세요!** 🚀
