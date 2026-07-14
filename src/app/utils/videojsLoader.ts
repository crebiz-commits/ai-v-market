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
    ]).then(([m]) => m.default)
      .catch((e) => {
        // ⚠️ 실패 프라미스를 캐시하면 이후 모든 플레이어(피드 자동재생·호버·영상광고·
        //   전체화면·미드롤)가 같은 거부를 받아 세션 내내 영상 전면 불능이 된다
        //   (Vercel 재배포 직후 stale 해시 청크 404·모바일 네트워크 순단 1회로 마비).
        //   → 캐시를 비워 다음 플레이어 마운트가 재시도하게 함(정적 import 시절엔 불가했던 회귀).
        vjsPromise = null;
        throw e;
      });
  }
  return vjsPromise;
}
