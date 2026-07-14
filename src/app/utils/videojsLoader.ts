// ════════════════════════════════════════════════════════════════════════════
// video.js 지연 로더 — 685KB(gzip 204KB) 라이브러리를 첫 페인트 경로에서 분리 (2026-07-14)
//
//   기존엔 DiscoveryFeed(홈)·VideoFullscreen·AdMidrollPlayer 가 정적 import 해
//   video.js 가 홈 피드 청크의 선행 의존성이 됨 → 피드 행 렌더가 video.js
//   다운로드+파싱(모바일 CPU 수백 ms)을 기다렸다.
//   이 로더는 플레이어가 "실제로 마운트되는 순간" 1회만 로드하고 이후엔 모듈
//   캐시로 즉시 resolve. CSS(video-js.css)도 함께 지연 주입된다.
//
//   사용: const videojs = await loadVideojs();  // effect 안에서, cancelled 가드와 함께
// ════════════════════════════════════════════════════════════════════════════
let vjsPromise: Promise<any> | null = null;

export function loadVideojs(): Promise<any> {
  if (!vjsPromise) {
    vjsPromise = Promise.all([
      import("video.js"),
      import("video.js/dist/video-js.css"),
    ]).then(([m]) => m.default);
  }
  return vjsPromise;
}
