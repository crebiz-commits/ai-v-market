// ════════════════════════════════════════════════════════════════════════════
// 영상 시청 기록 클라이언트 헬퍼 (Phase 8)
//
// 목적:
//   영상 플레이어가 재생 중 주기적으로 Supabase RPC `track_video_view` 를 호출한다.
//   서버가 어뷰징 필터(셀프시청·IP중복·30%미만)를 적용하고, 중복창 내 같은 세션이면
//   기존 행을 갱신해 실제 시청시간을 누적한다(행이 늘지 않음).
//
//   ⚠️ 2026-07-22 이전엔 "30% 도달 시 1회"만 보고했다. 그래서 완주해도 시청시간이
//   30%에서 멈췄고, 정산(SUM(watch_seconds) pro-rata)이 실제 시청을 반영하지 못했다.
//   지금은 주기 보고 + 서버 GREATEST 누적이라 실제 재생시간이 반영된다.
//
// 사용 예:
//   import { trackVideoView } from "../utils/viewTracking";
//   trackVideoView(product.id, watchedSeconds);
//
// 중복 호출 방지 계층:
//   1. 컴포넌트 내부 `tracked` 플래그(useRef/local) — 한 번 마운트 중 1회만 호출
//   2. 같은 video_id에 대해 "직전 호출보다 더 길게 시청한 경우만" 재호출 허용
//      (10초만 보고 닫았다가 다시 와서 90초 보면 유효 기록 가능 — low_ratio → valid 업그레이드)
//   3. 서버 SQL — 동일 IP·동일 영상 24h 내 valid 1회만 (그 이후는 ip_dup로 자동 invalid)
//
// IP 캡처:
//   - ipify로 1회 fetch 후 모듈 캐시. 실패 시 null 전달 (서버에서 IP 중복 차단 스킵)
//
// 실패 정책:
//   - 호출 실패는 콘솔 경고만, 사용자 UX 비차단
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabaseClient";

// IP 모듈 캐시 (undefined = 미조회, null = 조회 실패, string = 성공)
let cachedIp: string | null | undefined = undefined;
let ipFetchPromise: Promise<string | null> | null = null;

async function getClientIp(): Promise<string | null> {
  if (cachedIp !== undefined) return cachedIp;
  if (ipFetchPromise) return ipFetchPromise;

  ipFetchPromise = (async () => {
    try {
      // 3초 타임아웃 (시청 추적이 IP 조회 때문에 지연되지 않도록)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("https://api.ipify.org?format=json", {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      cachedIp = (data?.ip as string) || null;
    } catch {
      cachedIp = null;
    } finally {
      ipFetchPromise = null;
    }
    return cachedIp ?? null;
  })();

  return ipFetchPromise;
}

// 영상별 마지막 호출 시 watch_seconds — "더 길게 봤을 때만" 재호출 허용
const lastWatchedByVideo = new Map<string, number>();

/**
 * 영상 시청 기록.
 * - 같은 video_id는 직전 호출 watch_seconds보다 크게 증가한 경우만 RPC 재호출.
 * - 실패 시 lastWatchedByVideo에서 제거해 재시도 허용.
 *
 * @param videoId - public.videos.id
 * @param watchSeconds - **실제 재생된 초**. 앞으로 건너뛴 구간은 포함하면 안 된다
 *   (정산이 SUM(watch_seconds) pro-rata 라, 시킹으로 부풀면 남의 배분액을 가져간다).
 *   호출부는 timeupdate 간 정상 진행분만 누적해서 넘긴다.
 * @param positionSeconds - 마지막 재생 지점(이어보기용). 시청시간과 달리 시킹을 반영한다.
 *   생략하면 서버가 watchSeconds 를 위치로 간주한다.
 */
export async function trackVideoView(
  videoId: string,
  watchSeconds: number,
  positionSeconds?: number,
): Promise<void> {
  if (!videoId || watchSeconds <= 0) return;
  const previous = lastWatchedByVideo.get(videoId) ?? 0;
  if (watchSeconds <= previous) return;
  lastWatchedByVideo.set(videoId, watchSeconds);

  try {
    const ip = await getClientIp();
    const { error } = await supabase.rpc("track_video_view", {
      p_video_id: videoId,
      p_watch_seconds: Math.floor(watchSeconds),
      p_ip: ip,
      p_position_seconds:
        positionSeconds != null ? Math.floor(positionSeconds) : null,
    });
    if (error) {
      console.warn("[viewTracking] track_video_view RPC 실패:", error.message);
      lastWatchedByVideo.delete(videoId);
    }
  } catch (err) {
    console.warn("[viewTracking] track_video_view 예외:", err);
    lastWatchedByVideo.delete(videoId);
  }
}

/** 테스트/디버그용 — 세션 캐시 초기화 */
export function resetViewTrackingSession() {
  lastWatchedByVideo.clear();
}

/**
 * 이어보기 지점(초) 조회. 로그인 사용자 본인 기록만 — 없으면 null.
 * 실패해도 재생을 막지 않는다(처음부터 재생).
 */
export async function getMyWatchPosition(videoId: string): Promise<number | null> {
  if (!videoId) return null;
  try {
    const { data, error } = await supabase.rpc("get_my_watch_position", {
      p_video_id: videoId,
    });
    if (error) return null;
    const n = Number(data);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}
