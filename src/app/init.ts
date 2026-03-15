/**
 * 앱 초기화 스크립트
 * 앱이 로드되기 전에 실행되어 콘솔 필터를 설치합니다.
 */

import { installConsoleFilter } from './utils/consoleFilter';

// 즉시 콘솔 필터 설치
installConsoleFilter();

// 초기화 완료 메시지
console.log(
  '%c🚀 AI-V-Market 초기화',
  'color: #6366f1; font-weight: bold; font-size: 14px;'
);

console.log(
  '%c📝 Bunny.net 설정 안내: 업로드 탭 → "설정 가이드 보기"',
  'color: #8b5cf6; font-size: 11px;'
);
