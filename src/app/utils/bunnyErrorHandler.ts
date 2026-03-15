/**
 * Bunny.net 에러 핸들링 유틸리티
 * 403 Forbidden 및 기타 Bunny.net 관련 에러를 감지하고 사용자 친화적인 메시지를 제공합니다.
 */

export interface BunnyError {
  type: 'forbidden' | 'cors' | 'domain_config' | 'auth' | 'unknown';
  message: string;
  actionRequired: string;
  guideUrl?: string;
}

export function detectBunnyError(error: any): BunnyError | null {
  const errorString = String(error).toLowerCase();
  const errorMessage = error?.message?.toLowerCase() || '';
  const status = error?.status || error?.response?.status;

  // 403 Forbidden 에러
  if (status === 403 || errorString.includes('403') || errorString.includes('forbidden')) {
    if (errorString.includes('domain suspended') || errorString.includes('not configured')) {
      return {
        type: 'domain_config',
        message: 'Bunny.net 도메인이 설정되지 않았거나 정지되었습니다.',
        actionRequired: 'Bunny.net 계정 설정을 확인하거나 고객 지원에 문의하세요.',
        guideUrl: '/BUNNY_SETUP_GUIDE.md'
      };
    }

    return {
      type: 'forbidden',
      message: 'Bunny.net 접근이 차단되었습니다. 보안 설정이 필요합니다.',
      actionRequired: '업로드 탭 → "설정 가이드 보기" 버튼을 클릭하여 Bunny.net 설정을 완료하세요.',
      guideUrl: '/BUNNY_SETUP_GUIDE.md'
    };
  }

  // CORS 에러
  if (errorString.includes('cors') || errorMessage.includes('cross-origin')) {
    return {
      type: 'cors',
      message: 'Bunny.net CORS 설정이 필요합니다.',
      actionRequired: 'Bunny.net Security 탭에서 "Enable CORS"를 ON으로 설정하세요.',
      guideUrl: '/BUNNY_SETUP_GUIDE.md'
    };
  }

  // Token Authentication 에러
  if (errorString.includes('token') || errorString.includes('unauthorized') || status === 401) {
    return {
      type: 'auth',
      message: 'Bunny.net 인증 설정 문제입니다.',
      actionRequired: 'Bunny.net Security 탭에서 "Enable Token Authentication"을 OFF로 설정하세요.',
      guideUrl: '/BUNNY_SETUP_GUIDE.md'
    };
  }

  // Bunny.net 관련 URL이 포함된 에러
  if (errorString.includes('bunny') || errorString.includes('b-cdn') || errorString.includes('vz-')) {
    return {
      type: 'unknown',
      message: 'Bunny.net 관련 알 수 없는 에러가 발생했습니다.',
      actionRequired: 'Bunny.net 설정 가이드를 확인하세요.',
      guideUrl: '/BUNNY_SETUP_GUIDE.md'
    };
  }

  return null;
}

export function logBunnyError(error: BunnyError): void {
  console.group('🚨 Bunny.net 설정 필요');
  console.error(`타입: ${error.type}`);
  console.error(`메시지: ${error.message}`);
  console.warn(`조치 필요: ${error.actionRequired}`);
  if (error.guideUrl) {
    console.info(`가이드 문서: ${error.guideUrl}`);
  }
  console.groupEnd();
  
  // 추가 디버깅 정보
  console.log('%c📖 설정 가이드를 보려면 업로드 탭 → "설정 가이드 보기" 버튼을 클릭하세요.', 
    'color: #6366f1; font-weight: bold; font-size: 14px;');
}

/**
 * Bunny.net 에러를 자동으로 감지하고 로깅합니다.
 */
export function handleBunnyError(error: any): boolean {
  const bunnyError = detectBunnyError(error);
  
  if (bunnyError) {
    logBunnyError(bunnyError);
    return true;
  }
  
  return false;
}
