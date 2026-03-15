# 📧 Supabase 이메일 확인 설정 가이드

## 현재 상태
✅ "Confirm email" 활성화됨
✅ 코드 수정 완료 (이메일 확인 프로세스 활성화)

## 🎯 이메일 발송 방법 2가지

### 옵션 1: Supabase 기본 이메일 서비스 (권장 - 개발/테스트용)

Supabase는 기본적으로 제한적인 이메일 발송 서비스를 제공합니다.

**장점:**
- 별도 설정 불필요
- 즉시 사용 가능

**단점:**
- 시간당 발송 제한 있음 (약 3-4개)
- "via supabase.io" 표시
- 커스터마이징 제한적

**사용 방법:**
1. 그냥 회원가입하면 자동으로 이메일 발송됨!
2. 스팸 폴더 확인 필요

---

### 옵션 2: 외부 SMTP 서버 연동 (실제 서비스용)

실제 서비스 운영 시 권장하는 방법입니다.

#### A. Gmail SMTP 사용하기

**1단계: Google App Password 생성**
```
1. Google 계정 → 보안
2. "2단계 인증" 활성화
3. "앱 비밀번호" 생성
4. "메일" 선택 → 비밀번호 생성
5. 16자리 비밀번호 복사
```

**2단계: Supabase 설정**
```
Supabase 대시보드 접속:
https://supabase.com/dashboard/project/tvbpiuwmvrccfnplhwer/settings/auth

Authentication → Email Templates → SMTP Settings

다음 정보 입력:
- SMTP Host: smtp.gmail.com
- SMTP Port: 587
- Sender Email: your-email@gmail.com
- Sender Name: AI-V-Market
- Username: your-email@gmail.com
- Password: [16자리 앱 비밀번호]
```

**3단계: 이메일 템플릿 커스터마이징 (선택)**
```
Authentication → Email Templates

- Confirm signup: 회원가입 확인 이메일
- Invite user: 초대 이메일
- Magic Link: 매직 링크 로그인
- Change Email Address: 이메일 변경 확인
- Reset Password: 비밀번호 재설정
```

---

#### B. SendGrid 사용하기 (대량 발송 시 권장)

**1단계: SendGrid 계정 생성**
```
https://sendgrid.com
→ 무료 플랜: 하루 100통 발송 가능
```

**2단계: API Key 생성**
```
SendGrid Dashboard → Settings → API Keys
→ "Create API Key" → Full Access 선택
```

**3단계: Supabase 설정**
```
SMTP Host: smtp.sendgrid.net
SMTP Port: 587
Username: apikey (그대로 입력)
Password: [SendGrid API Key]
```

---

## 🧪 테스트 방법

### 1. 회원가입 테스트
```
1. 앱에서 "로그인" 버튼 클릭
2. "회원가입" 탭 선택
3. 실제 이메일 주소 입력
4. 회원가입 클릭
5. "이메일로 발송된 확인 링크를 클릭해주세요" 메시지 확인
```

### 2. 이메일 확인
```
1. 이메일 수신함 확인 (스팸 폴더도 확인!)
2. 제목: "Confirm Your Email" 또는 "이메일 확인"
3. "Confirm Email" 버튼 클릭
4. 자동으로 이메일 확인 완료
```

### 3. 로그인 테스트
```
1. 이메일 확인 후 앱으로 돌아오기
2. "로그인" 클릭
3. 이메일/비밀번호 입력
4. 로그인 성공!
```

---

## 🔍 Supabase에서 확인하기

### 사용자 상태 확인
```
Supabase Dashboard → Authentication → Users

각 사용자의 상태:
- Email Confirmed: ✅ = 이메일 확인 완료
- Email Confirmed: ❌ = 이메일 확인 대기 중
```

### 이메일 발송 로그 확인
```
Authentication → Logs

이메일 발송 내역 및 에러 확인 가능
```

---

## ⚠️ 주의사항

### 개발 환경에서
- Supabase 기본 이메일 서비스로 충분
- 시간당 3-4개 제한 있음
- 스팸 폴더 확인 필수

### 실제 서비스에서
- **반드시** 외부 SMTP 설정 권장
- Gmail: 개인 프로젝트용
- SendGrid/AWS SES: 대규모 서비스용

---

## 🚀 현재 설정

### ✅ 이미 완료된 것
- [x] "Confirm email" 활성화
- [x] 서버 코드 수정 (이메일 확인 프로세스)
- [x] 프론트엔드 처리 (확인 메시지 표시)

### ⏳ 해야 할 것
- [ ] SMTP 설정 (옵션 1 또는 옵션 2 선택)
- [ ] 회원가입 테스트
- [ ] 이메일 수신 확인

---

## 💡 FAQ

**Q: 이메일이 안 와요!**
```
1. 스팸 폴더 확인
2. Supabase Dashboard → Authentication → Logs 에서 에러 확인
3. SMTP 설정이 올바른지 확인
```

**Q: "Email rate limit exceeded" 에러가 나요**
```
Supabase 기본 서비스는 시간당 3-4개 제한이 있습니다.
→ 외부 SMTP 서버 설정 권장
```

**Q: 개발 중에는 이메일 확인 건너뛰고 싶어요**
```
옵션 A: Authentication → Settings에서 "Enable email confirmations" OFF
옵션 B: 서버 코드에 email_confirm: true 추가 (이전 상태로 복원)
```

---

## 📚 참고 자료

- [Supabase Auth 공식 문서](https://supabase.com/docs/guides/auth)
- [SMTP 설정 가이드](https://supabase.com/docs/guides/auth/auth-smtp)
- [이메일 템플릿 커스터마이징](https://supabase.com/docs/guides/auth/auth-email-templates)
