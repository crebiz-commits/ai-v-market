import * as Sentry from "@sentry/react";

/**
 * Sentry 에러 모니터링 초기화 (env 게이트).
 *
 * - `VITE_SENTRY_DSN` 이 설정된 경우에만 활성화. 미설정 시 아무 동작 안 함.
 * - localhost/127.0.0.1 은 제외 (로컬 개발 노이즈 방지).
 * - DSN 미설정 상태에서도 captureError() 는 무해한 no-op (Sentry SDK 기본 동작).
 *
 * 활성화 방법: Vercel 환경변수에 VITE_SENTRY_DSN = https://...@...ingest.sentry.io/... 추가 후 재배포.
 */
export function initSentry() {
  const dsn = (import.meta as any).env?.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return; // DSN 미설정 → 비활성 (베타 전 안전)

  const host = typeof location !== "undefined" ? location.hostname : "";
  if (host === "localhost" || host === "127.0.0.1") return; // 로컬 제외

  Sentry.init({
    dsn,
    environment: (import.meta as any).env?.MODE || "production",
    integrations: [Sentry.browserTracingIntegration()],
    // 성능 트레이스는 10%만 샘플 (비용·노이즈 절감). 에러는 전량 수집.
    tracesSampleRate: 0.1,
    // 흔한 무해 노이즈 제거 (청크 로드 실패는 ErrorBoundary가 자동 새로고침으로 복구)
    ignoreErrors: [
      "Failed to fetch dynamically imported module",
      "Loading chunk",
      "Importing a module script failed",
      "ChunkLoadError",
      "ResizeObserver loop",
      "Non-Error promise rejection captured",
    ],
  });
}

/**
 * 에러 수동 캡처 (ErrorBoundary 등에서 호출). DSN 미설정 시 no-op.
 */
export function captureError(error: unknown, context?: Record<string, any>) {
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
