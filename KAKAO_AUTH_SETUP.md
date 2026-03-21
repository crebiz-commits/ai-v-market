# 🔐 Kakao 로그인 설정 가이드

## ✅ 구현 완료
- [x] AuthContext에 `signInWithKakao` 함수 추가
- [x] AuthModal에 카카오 로그인 버튼 추가 및 디자인 적용
- [x] OAuth 리다이렉트 처리 로직 검증

## 🚀 단계별 설정 방법

### 1단계: Kakao Developers 설정

1. **[카카오 개발자 센터](https://developers.kakao.com/)**에 접속하여 로그인합니다.
2. **내 애플리케이션** -> **애플리케이션 추가하기**를 클릭합니다.
   - 앱 이름: `AI-V-Market`
   - 사업자명: 본인 이름 또는 회사명
3. **제품 설정** -> **카카오 로그인**:
   - **활성화 설정**: `ON`으로 변경
4. **제품 설정** -> **카카오 로그인** -> **Redirect URI**:
   - 아래 주소를 추가합니다:
     ```
     https://tvbpiuwmvrccfnplhwer.supabase.co/auth/v1/callback
     ```
   - (Vercel 배포 주소도 함께 등록하는 것이 좋습니다: `https://your-app.vercel.app/auth/v1/callback`)
5. **제품 설정** -> **카카오 로그인** -> **동의항목**:
   - `닉네임` (필수), `카카오계정(이메일)` (필수) 등을 설정합니다. (비즈니스 채널 연결 시 필요할 수 있음)
6. **앱 설정** -> **앱 키**:
   - **REST API 키**를 복사해둡니다. (이것이 Supabase의 `Client ID`가 됩니다.)
7. **제품 설정** -> **카카오 로그인** -> **보안**:
   - **Client Secret**을 생성하고 활성화(`ON`)한 뒤 코드를 복사해둡니다.

---

### 2단계: Supabase 대시보드 설정

1. **[Supabase Dashboard](https://supabase.com/dashboard/project/tvbpiuwmvrccfnplhwer/auth/providers)**에 접속합니다.
2. **Auth** -> **Providers** -> **Kakao** 항목을 찾습니다.
3. **Enable Kakao** 토글을 `ON`으로 켭니다.
4. 아래 정보를 입력합니다:
   - **Kakao Client ID**: (위에서 복사한 **REST API 키**)
   - **Kakao Client Secret**: (위에서 생성한 **Client Secret**)
5. **Save**를 클릭합니다.

---

### 3단계: Vercel 환경 설정 (선택 사항)

1. Vercel 배포 환경에서 로그인이 원활하게 작동하려면, Supabase의 **Auth Settings** -> **Redirect URLs**에 아래 주소들을 추가해야 합니다:
   - `https://ai-v-market.vercel.app` (본인의 실제 Vercel 주소)

---

## 🧪 테스트하기
1. 앱의 로그인 화면에서 **[카카오]** 버튼을 클릭합니다.
2. 카카오 로그인 및 동의 화면이 나타나면 성공입니다!
3. 로그인이 완료되면 자동으로 앱으로 돌아오며 사용자 이름이 표시됩니다.

오늘 이 설정을 마치시면 구글과 카카오 두 가지 방식으로 모든 사용자가 간편하게 로그인할 수 있게 됩니다! 😃✨
