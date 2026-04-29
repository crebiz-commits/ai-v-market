# 🚀 CREAITE 배포 가이드 (GitHub & Vercel)

현재 로컬에서 작업한 내용을 전 세계 어디서든 (모바일 포함) 접속 가능하게 만드는 과정입니다.

---

## 1단계: GitHub에 코드 올리기

이 과정은 본인의 PC에 있는 코드를 안전한 클라우드(GitHub)에 백업하고 전송하는 단계입니다.

1.  **PC 터미널(CMD)에서 아래 명령어를 차례로 입력하세요:**
    ```bash
    git add .
    git commit -m "영상 하이라이트 및 모바일 레이아웃 최적화 완료"
    ```
2.  **GitHub 사이트에 접속하세요:**
    - [github.com](https://github.com) 로그인 후 **[New repository]** 버튼을 누릅니다.
    - Repository name에 `ai-v-market`이라고 입력하고 **[Create repository]**를 누릅니다.
3.  **화면에 뜨는 주소를 복사해서 터미널에 입력하세요:**
    *(화면에 보이는 주소를 아래 `<주소>` 자리에 넣으세요)*
    ```bash
    git remote add origin <본인의_깃허브_주소>
    git branch -M main
    git push -u origin main
    ```

---

## 2단계: Vercel(버셀)로 실시간 배포하기

GitHub에 코드가 올라갔다면, 이제 실제 웹사이트로 만드는 단계입니다.

1.  **Vercel 사이트에 접속하세요:** [vercel.com](https://vercel.com) 로그인 (GitHub 계정으로 로그인 추천).
2.  **[Add New] -> [Project]**를 클릭합니다.
3.  방금 만든 `ai-v-market` 저장소 옆의 **[Import]**를 누릅니다.
4.  **가장 중요한 환경 변수 설정!**
    `Environment Variables` 섹션에 아래 정보를 하나씩 추가하세요:
    - `VITE_SUPABASE_URL`: (Supabase 프로젝트 URL)
    - `VITE_SUPABASE_ANON_KEY`: (Supabase Anon Key)
    - `BUNNY_API_KEY`: (버니넷 API 키)
    - `BUNNY_LIBRARY_ID`: (버니넷 라이브러리 ID)
    - `BUNNY_HOSTNAME`: (버니넷 호스트네임)
5.  **[Deploy]** 버튼을 누르면 약 1~2분 후 주소가 생성됩니다!

---

## 3단계: Supabase 인증 설정 (구글 & 카카오)

소셜 로그인이 정상적으로 작동하려면 Supabase 대시보드에서 추가 설정이 필요합니다.

1.  **소셜 로그인 활성화:**
    - [Supabase Dashboard](https://supabase.com/dashboard) -> **Authentication** -> **Providers**로 이동합니다.
    - **Google**과 **Kakao**를 각각 찾아 **Enabled**로 변경합니다.
    - 각 서비스의 Developers 사이트에서 발급받은 `Client ID`와 `Client Secret`을 입력합니다.

2.  **Redirect URL 설정:**
    - **Authentication** -> **URL Configuration**으로 이동합니다.
    - `Redirect URLs` 섹션에 아래 주소를 추가합니다:
      - `https://ai-v-market.vercel.app`
    - `Site URL`도 위 주소로 변경하는 것이 좋습니다.

---

## 📱 배포 후 확인 사항
- 생성된 `https://...vercel.app` 주소로 스마트폰에서 바로 접속해 보세요.
- **최신 코드 반영:** 만약 화면에 카카오 로그인 버튼이 보이지 않는다면, 터미널에서 아래 명령어를 입력해 다시 푸시하세요:
  ```bash
  git add .
  git commit -m "인증 기능 업데이트"
  git push origin main
  ```
- 이제는 **터널 비밀번호/IP 입력이 필요 없고**, 캐시 문제도 없어 바로 최신 화면이 뜹니다.

가이드를 보시면서 진행하시다가 막히는 부분이 있으면 언제든 말씀해 주세요! 😃
