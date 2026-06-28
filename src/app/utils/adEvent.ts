// 광고 노출/클릭 집계 — raw RPC 대신 Edge /ad-event 경유 (위조/키회전 방어, ad-fraud #2).
// raw RPC(increment_ad_*, record_ad_*)는 anon 회수됨(ad_fraud_hardening_edge_20260628.sql)
// → 클라는 반드시 이 경로 사용. Edge 가 신뢰 IP + 로그인 식별(auth.uid) + IP다양성 가드 후 집계.
import { supabase, supabaseAnonKey, supabaseUrl } from "./supabaseClient";
import { getViewerSessionKey } from "./sessionKey";

const AD_EVENT_ENDPOINT = `${supabaseUrl}/functions/v1/server/ad-event`;

export type AdEventType = "feed_impression" | "feed_click" | "video_impression" | "video_click";

export async function sendAdEvent(
  type: AdEventType,
  adId: string,
  opts?: {
    videoId?: string | null;
    format?: string | null;
    positionSeconds?: number | null;
    completed?: boolean;
    skipped?: boolean;
  },
): Promise<void> {
  if (!adId) return;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch(AD_EVENT_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session?.access_token || supabaseAnonKey}`,
      },
      body: JSON.stringify({
        ad_id: adId,
        type,
        viewer_key: getViewerSessionKey(),   // 익명 식별(서버가 로그인 시 auth.uid 우선)
        video_id: opts?.videoId ?? null,
        format: opts?.format ?? null,
        position_seconds: opts?.positionSeconds ?? null,
        completed: opts?.completed ?? false,
        skipped: opts?.skipped ?? false,
      }),
      keepalive: true,   // 페이지 이탈 중에도 전송(노출/클릭 유실 방지)
    });
  } catch {
    /* 집계 실패는 UX 에 영향 없음 — 무시 */
  }
}
