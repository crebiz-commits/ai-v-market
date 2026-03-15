/**
 * 콘솔 출력 필터링 유틸리티
 * Bunny.net 관련 중복 에러 메시지를 필터링하고 깔끔한 사용자 안내를 제공합니다.
 */

// 원본 콘솔 메서드 저장
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

// Bunny.net 에러가 이미 출력되었는지 추적
let bunnyErrorShown = false;
let lastBunnyErrorTime = 0;
const BUNNY_ERROR_COOLDOWN = 5000; // 5초 쿨다운

/**
 * 문자열이 Bunny.net 관련 에러인지 확인
 */
function isBunnyError(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    (msg.includes('bunny') || msg.includes('b-cdn') || msg.includes('vz-')) &&
    (msg.includes('403') || msg.includes('forbidden') || msg.includes('error'))
  );
}

/**
 * 필터링해야 할 Bunny.net 세부 정보인지 확인
 */
function isBunnyDetails(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes('<html>') ||
    msg.includes('response headers:') ||
    msg.includes('error body:') ||
    msg.includes('domain suspended or not configured') ||
    msg.includes('player 탭:') ||
    msg.includes('security 탭:') ||
    msg.includes('enable cors') ||
    msg.includes('enable token authentication') ||
    msg.includes('allowed referrers') ||
    msg.includes('cdn 캐시 갱신') ||
    msg.includes('https://panel.bunny.net') ||
    msg.includes('stream → library') ||
    msg.includes('===== bunny.net 설정') ||
    msg.includes('다음 설정을 확인해주세요') ||
    (msg.includes('bunnycdn') && msg.includes('cdn-requestid')) ||
    (msg.includes('bunny.net') && msg.includes('보안 설정'))
  );
}

/**
 * 콘솔 에러 필터 설치
 */
export function installConsoleFilter() {
  // console.error 필터링
  console.error = function (...args: any[]) {
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object') return JSON.stringify(arg);
      return String(arg);
    }).join(' ');

    // Bunny.net 세부 정보 필터링 (HTML 응답, headers 등)
    if (isBunnyDetails(message)) {
      return; // 완전히 무시
    }

    // Bunny.net 403 에러 중복 필터링
    if (isBunnyError(message)) {
      const now = Date.now();
      
      // 쿨다운 기간 내에는 중복 출력 방지
      if (now - lastBunnyErrorTime < BUNNY_ERROR_COOLDOWN) {
        return;
      }
      
      lastBunnyErrorTime = now;
      
      // 첫 번째 에러일 때만 자세한 안내 출력
      if (!bunnyErrorShown) {
        bunnyErrorShown = true;
        console.group('%c🚨 Bunny.net 설정이 필요합니다', 'color: #ef4444; font-weight: bold; font-size: 14px;');
        console.log('%c403 Forbidden 에러가 감지되었습니다.', 'color: #f97316;');
        console.log('%c해결 방법:', 'font-weight: bold;');
        console.log('  1. 앱에서 "업로드" 탭으로 이동');
        console.log('  2. "설정 가이드 보기" 버튼 클릭');
        console.log('  3. 단계별 안내에 따라 Bunny.net 설정 완료');
        console.log('%c자세한 문서: /BUNNY_SETUP_GUIDE.md', 'color: #6366f1;');
        console.groupEnd();
        return;
      }
      
      // 이후에는 간단한 메시지만 출력
      console.log('%c⚠️ Bunny.net 설정을 완료해주세요 (업로드 탭 → 설정 가이드 보기)', 'color: #f59e0b;');
      return;
    }

    // 일반 에러는 그대로 출력
    originalConsoleError.apply(console, args);
  };

  // console.warn 필터링
  console.warn = function (...args: any[]) {
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object') return JSON.stringify(arg);
      return String(arg);
    }).join(' ');

    // Bunny.net 관련 세부 정보 필터링
    if (isBunnyDetails(message)) {
      return;
    }

    // Bunny.net 관련 중복 경고 필터링
    if (isBunnyError(message) && bunnyErrorShown) {
      return; // 이미 에러를 표시했으므로 중복 경고 무시
    }

    originalConsoleWarn.apply(console, args);
  };

  // console.log 필터링 (추가)
  console.log = function (...args: any[]) {
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (typeof arg === 'object') return JSON.stringify(arg);
      return String(arg);
    }).join(' ');

    // Bunny.net 관련 세부 정보 필터링
    if (isBunnyDetails(message)) {
      return;
    }

    // Bunny.net 에러 관련 로그 필터링
    if (message.includes('===== BUNNY.NET 설정이 필요합니다 =====')) {
      return; // 중복 메시지 필터링
    }

    originalConsoleLog.apply(console, args);
  };
}

/**
 * 콘솔 필터 제거 (원래대로 복원)
 */
export function uninstallConsoleFilter() {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
}

/**
 * Bunny.net 에러 표시 상태 초기화
 */
export function resetBunnyErrorState() {
  bunnyErrorShown = false;
  lastBunnyErrorTime = 0;
}