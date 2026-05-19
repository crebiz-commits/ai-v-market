// Phase 28 — 광고 다변화: format별 공용 fetch / impression / click 유틸
// AdminDashboard에 등록된 광고 중 ads.format / target_tiers / target_categories /
// min_video_duration_sec / 활성 상태 / 예산 잔액으로 필터링한 1개를 RPC로 받음.
import { supabase } from "./supabaseClient";

export type AdFormat = "feed" | "preroll" | "midroll" | "overlay" | "postroll" | "bumper";

export interface AdRpcResult {
  ad_id: string;
  title: string;
  advertiser: string | null;
  image_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  link_url: string | null;
  cta_text: string | null;
  duration_seconds: number | null;
  skip_after_seconds: number | null;
  trigger_position_pct: number | null;
}

// 광고 1개 매칭 (없으면 null)
export async function fetchAdForVideo(videoId: string, format: AdFormat): Promise<AdRpcResult | null> {
  if (!videoId) return null;
  try {
    const { data, error } = await supabase.rpc("get_ad_for_video", {
      p_video_id: videoId,
      p_format: format,
    });
    if (error) {
      console.warn(`[ad ${format}] fetch error:`, error.message);
      return null;
    }
    if (!data || data.length === 0) return null;
    return data[0] as AdRpcResult;
  } catch (err) {
    console.warn(`[ad ${format}] fetch exception:`, err);
    return null;
  }
}

export async function recordAdImpression(
  adId: string,
  videoId: string,
  format: AdFormat,
  opts?: { positionSeconds?: number; completed?: boolean; skipped?: boolean },
) {
  if (!adId || !videoId) return;
  try {
    await supabase.rpc("record_ad_impression", {
      p_ad_id: adId,
      p_video_id: videoId,
      p_format: format,
      p_position_seconds: opts?.positionSeconds ?? null,
      p_completed: opts?.completed ?? false,
      p_skipped: opts?.skipped ?? false,
    });
  } catch (err) {
    console.warn(`[ad ${format}] impression error:`, err);
  }
}

export async function recordAdClick(adId: string, videoId: string, format: AdFormat) {
  if (!adId || !videoId) return;
  try {
    await supabase.rpc("record_ad_click", {
      p_ad_id: adId,
      p_video_id: videoId,
      p_format: format,
    });
  } catch (err) {
    console.warn(`[ad ${format}] click error:`, err);
  }
}
