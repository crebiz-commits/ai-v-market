/**
 * 앱 초기화 스크립트
 * 앱이 로드되기 전에 실행되어 콘솔 필터를 설치합니다.
 */

import { installConsoleFilter } from './utils/consoleFilter';
import { captureRefFromUrl } from './utils/referral';
import './i18n'; // i18n 초기화 (한·영 로드, 언어 감지)

// 즉시 콘솔 필터 설치
installConsoleFilter();

// 초대링크(?ref=CODE) 캡처 — OAuth 리다이렉트로 사라지기 전에 가장 먼저 저장
captureRefFromUrl();

// 초기화 완료 메시지
console.log(
  '%c🚀 CREAITE 초기화',
  'color: #6366f1; font-weight: bold; font-size: 14px;'
);

console.log(
  '%c📝 Bunny.net 설정 안내: 업로드 탭 → "설정 가이드 보기"',
  'color: #8b5cf6; font-size: 11px;'
);
