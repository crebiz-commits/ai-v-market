# Bunny.net 설정 가이드

## 🚨 중요: 403 Forbidden 에러 해결 방법

현재 발생하는 `403 Forbidden` 에러는 **Bunny.net의 보안 설정** 때문입니다. 아래 단계를 따라 설정을 완료해주세요.

---

## 설정 단계

### 1. Bunny.net 패널 접속
1. [https://panel.bunny.net](https://panel.bunny.net) 접속
2. 로그인

### 2. Stream 라이브러리 선택
1. 좌측 메뉴에서 **Stream** 클릭
2. **Library** 선택

### 3. Security 탭 설정
**Security** 탭으로 이동한 후 다음 3가지 옵션을 설정합니다:

#### ✅ Enable CORS → ON
- 브라우저에서 비디오 로딩을 허용합니다.
- **필수 설정입니다.**

#### ❌ Enable Token Authentication → OFF
- 토큰 인증을 비활성화합니다.
- **개발/테스트 환경에서는 OFF로 설정하세요.**

#### ✅ Allowed Referrers → "*" 추가
- 모든 도메인에서 접근을 허용합니다.
- 입력란에 `*` (별표) 를 추가하세요.
- **프로덕션 환경에서는 실제 도메인을 지정하는 것을 권장합니다.**

### 4. Player 탭 설정 (선택사항)
**Player** 탭으로 이동한 후:

#### ✅ Player CORS → ON
- 플레이어의 CORS를 활성화합니다.

### 5. 설정 저장 및 대기
1. **Save** 버튼 클릭
2. **5-10분** 정도 대기 (CDN 캐시 갱신 시간)
3. 브라우저 캐시 삭제 (Ctrl+Shift+Delete 또는 Cmd+Shift+Delete)
4. 페이지 새로고침

---

## 에러 메시지 해석

### "Domain suspended or not configured"
- **원인**: Bunny.net 계정의 도메인 설정이 완료되지 않았거나 정지되었습니다.
- **해결**: Bunny.net 계정 설정에서 도메인 구성을 확인하거나 고객 지원에 문의하세요.

### 403 Forbidden
- **원인**: 위의 보안 설정이 완료되지 않았습니다.
- **해결**: Security 탭의 3가지 설정을 확인하세요.

### 설정 후에도 에러가 계속되는 경우
1. 브라우저 캐시 완전 삭제
2. 5-10분 추가 대기 (CDN 전파 시간)
3. 시크릿/프라이빗 모드에서 테스트
4. 다른 브라우저에서 테스트

---

## 앱 내에서 설정 가이드 확인 방법

1. 앱에서 **업로드** 탭으로 이동
2. 상단의 빨간색 경고 배너에서 **"설정 가이드 보기"** 버튼 클릭
3. 자세한 단계별 가이드를 확인할 수 있습니다.

---

## 보안 주의사항

### 개발 환경
- Allowed Referrers: `*` (모든 도메인 허용)
- Token Authentication: OFF

### 프로덕션 환경
- Allowed Referrers: 실제 도메인 지정 (예: `yourdomain.com`)
- Token Authentication: ON (선택사항)
- IP Whitelist 고려

---

## 문제 해결 체크리스트

- [ ] Bunny.net에 로그인했나요?
- [ ] Stream → Library로 이동했나요?
- [ ] Security 탭에서 CORS를 ON으로 설정했나요?
- [ ] Token Authentication을 OFF로 설정했나요?
- [ ] Allowed Referrers에 `*`를 추가했나요?
- [ ] 설정을 저장했나요?
- [ ] 5-10분 기다렸나요?
- [ ] 브라우저 캐시를 삭제했나요?
- [ ] 페이지를 새로고침했나요?

모든 항목을 확인했는데도 문제가 지속되면 Bunny.net 고객 지원에 문의하세요.

---

## 추가 리소스

- [Bunny.net 공식 문서](https://docs.bunny.net/)
- [Bunny.net Stream 가이드](https://docs.bunny.net/docs/stream)
- [Bunny.net CORS 설정](https://docs.bunny.net/docs/stream-security-settings)
