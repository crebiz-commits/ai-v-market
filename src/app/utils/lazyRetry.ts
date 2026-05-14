// ════════════════════════════════════════════════════════════════════════════
// lazyRetry — React.lazy 래퍼 (Vite SPA 청크 로드 실패 자동 복구)
//
// 문제:
//   - 새 Vercel 배포 → 청크 파일명 해시 변경 (MyPage-abc.js → MyPage-xyz.js)
//   - 사용자가 옛 페이지 열어둔 상태에서 lazy 로드 시도
//   - "Failed to fetch dynamically imported module" 에러 발생
//
// 해결:
//   1. import 실패 시 짧은 간격으로 N회 재시도 (일시 네트워크 문제 해결)
//   2. 모두 실패하면 페이지 자동 새로고침 (옛 청크 → 새 청크)
//      단, 무한 새로고침 방지 위해 sessionStorage 가드
// ════════════════════════════════════════════════════════════════════════════
import { lazy, ComponentType } from "react";

const RELOAD_KEY = "creaite_chunk_reload_attempted";
const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported",
  "Loading chunk",
  "ChunkLoadError",
  "Importing a module script failed",
];

function isChunkLoadError(err: any): boolean {
  const msg = err?.message || String(err);
  return CHUNK_ERROR_PATTERNS.some((p) => msg.includes(p)) || err?.name === "ChunkLoadError";
}

function reloadOnce() {
  if (typeof window === "undefined") return;
  if (sessionStorage.getItem(RELOAD_KEY)) return;  // 이미 한 번 새로고침함 — 무한 루프 방지
  sessionStorage.setItem(RELOAD_KEY, "true");
  window.location.reload();
}

/**
 * React.lazy 래퍼.
 * 청크 로드 실패 시 자동 재시도 + 마지막 수단으로 페이지 새로고침.
 *
 * 사용법:
 *   const MyPage = lazyRetry(() => import("./MyPage").then(m => ({ default: m.MyPage })));
 */
export function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
  attempts: number = 3,
): ReturnType<typeof lazy<T>> {
  return lazy(async () => {
    let lastError: any;

    for (let i = 0; i < attempts; i++) {
      try {
        const result = await factory();
        // 성공 → 새로고침 가드 해제 (다음 배포 시 다시 한 번 새로고침 허용)
        if (typeof window !== "undefined") {
          sessionStorage.removeItem(RELOAD_KEY);
        }
        return result;
      } catch (err: any) {
        lastError = err;

        if (!isChunkLoadError(err)) {
          // 청크 에러 아니면 재시도 무의미 → 즉시 throw
          throw err;
        }

        // 지수 백오프 (300ms, 600ms, 1200ms…)
        if (i < attempts - 1) {
          await new Promise((r) => setTimeout(r, 300 * Math.pow(2, i)));
        }
      }
    }

    // 모든 재시도 실패 — 새 배포 가능성 → 페이지 강제 새로고침
    reloadOnce();
    throw lastError;
  });
}
