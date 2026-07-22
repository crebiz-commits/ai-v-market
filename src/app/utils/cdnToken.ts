// ════════════════════════════════════════════════════════════════════════════
// Bunny CDN 직접 URL 서명 (2026-07-22)
//
//   Bunny 라이브러리에서 `CDN token authentication` 을 켜면 mp4·HLS·썸네일 등
//   **직접 URL 전부**가 토큰을 요구한다. (영상 상세페이지의 iframe 임베드는 Bunny 가
//   자동 서명하므로 무관 — 라이브 확인함)
//
//   ▣ 디렉터리 토큰이라 **영상 1개당 토큰 1개**로 그 영상의 모든 파일이 커버된다:
//     playlist.m3u8 · 중첩 렌디션(360p/video.m3u8) · play_*.mp4 · thumbnail.jpg
//     → HLS 세그먼트마다 서명할 필요가 없어 video.js 훅도 불필요(실측 확인).
//
//   ▣ **토큰이 없으면 원본 URL 을 그대로 돌려준다.** 서버 키 미설정·발급 실패·
//     토글 OFF 어느 경우든 지금과 똑같이 동작한다(무중단 전환). 즉 이 코드를 먼저
//     배포해도 아무 변화가 없고, Bunny 토글을 켜는 순간부터 효력이 생긴다.
//
//   ▣ 권한 검증은 서버가 한다(19금 연령게이트·검수대기/비공개 차단). 차단 대상이면
//     토큰을 발급하지 않으므로, 토글이 켜진 뒤에는 CDN 이 직접 거부한다.
// ════════════════════════════════════════════════════════════════════════════
import { supabase } from "./supabaseClient";

const ENDPOINT =
  "https://tvbpiuwmvrccfnplhwer.supabase.co/functions/v1/server/video-cdn-token";
const SUPABASE_ANON_KEY = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";

type Tok = { token: string | null; expires: number | null; tokenPath: string | null };

// 영상별 토큰 캐시 — 피드처럼 같은 영상이 여러 번 그려져도 발급은 1회
const cache = new Map<string, Tok>();
const inflight = new Map<string, Promise<Tok>>();
const EMPTY: Tok = { token: null, expires: null, tokenPath: null };

/** 만료 60초 전부터는 새로 받는다(재생 중 끊김 방지) */
function fresh(t: Tok | undefined): t is Tok {
  return !!t?.token && !!t.expires && t.expires - 60 > Math.floor(Date.now() / 1000);
}

/** 이 영상의 CDN 토큰. 실패·미설정·권한없음이면 token=null */
export async function getCdnToken(videoId: string): Promise<Tok> {
  if (!videoId) return EMPTY;
  const hit = cache.get(videoId);
  if (fresh(hit)) return hit;
  const pending = inflight.get(videoId);
  if (pending) return pending;

  const p = (async (): Promise<Tok> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ videoId }),
      });
      const body = await res.json().catch(() => ({}));
      const tok: Tok = {
        token: body?.token ?? null,
        expires: body?.expires ?? null,
        tokenPath: body?.tokenPath ?? null,
      };
      if (tok.token) cache.set(videoId, tok);
      return tok;
    } catch {
      return EMPTY;   // 발급 실패 시 원본 URL 로 폴백(현행 유지)
    } finally {
      inflight.delete(videoId);
    }
  })();
  inflight.set(videoId, p);
  return p;
}

/** 이미 받아둔 토큰으로 URL 서명 (동기) */
export function applyCdnToken(url: string, tok: Tok): string {
  if (!url || !tok.token || !tok.expires || !tok.tokenPath) return url;
  if (url.includes("token=")) return url;                     // 이미 서명됨
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}token=${tok.token}&expires=${tok.expires}&token_path=${encodeURIComponent(tok.tokenPath)}`;
}

/**
 * Bunny 직접 URL 에 서명을 붙인다. 토큰을 못 받으면 **원본을 그대로** 돌려준다.
 * @param url     https://vz-....b-cdn.net/{videoId}/... 형태
 * @param videoId 그 URL 이 가리키는 영상 id (토큰은 이 디렉터리 전체를 커버)
 */
export async function signCdnUrl(url: string, videoId: string): Promise<string> {
  if (!url || !videoId) return url;
  if (!url.includes("b-cdn.net")) return url;                 // Bunny CDN 아님 → 그대로
  return applyCdnToken(url, await getCdnToken(videoId));
}

/** 로그아웃·계정 전환 시 남은 토큰 폐기(권한이 바뀌므로) */
export function clearCdnTokenCache() {
  cache.clear();
  inflight.clear();
}
