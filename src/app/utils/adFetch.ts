// Phase 28 — 광고 다변화: format별 공용 fetch / impression / click 유틸
// AdminDashboard에 등록된 광고 중 ads.format / target_tiers / target_categories /
// min_video_duration_sec / 활성 상태 / 예산 잔액으로 필터링한 1개를 RPC로 받음.
import { supabase } from "./supabaseClient";
import { getViewerSessionKey } from "./sessionKey";

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

// Tier 2.3 — 광고 매칭 결과 캐시 (1분 TTL, module-level)
// get_ad_for_video RPC 호출 감소 (영상 재시청 시 중복 호출 방지)
// 트레이드오프: 1분간 같은 광고 노출. 베타 단계엔 광고 풀 작아 어차피 비슷.
const AD_CACHE_TTL_MS = 60_000;
const adCache = new Map<string, { ad: AdRpcResult | null; expires: number }>();

// 광고 1개 매칭 (없으면 null)
export async function fetchAdForVideo(videoId: string, format: AdFormat): Promise<AdRpcResult | null> {
  if (!videoId) return null;

  // 캐시 hit (같은 영상 + 같은 형식, 1분 안)
  const cacheKey = `${videoId}:${format}`;
  const cached = adCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached.ad;
  }

  try {
    const { data, error } = await supabase.rpc("get_ad_for_video", {
      p_video_id: videoId,
      p_format: format,
    });
    if (error) {
      console.warn(`[ad ${format}] fetch error:`, error.message);
      return null;
    }
    const ad = (data && data.length > 0) ? (data[0] as AdRpcResult) : null;
    // 결과 캐시 (null도 캐시해서 "광고 없음" 케이스도 RPC 호출 안 함)
    adCache.set(cacheKey, { ad, expires: Date.now() + AD_CACHE_TTL_MS });
    return ad;
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
      p_viewer_key: getViewerSessionKey(),   // 예산광고 dedup·과금 정합용
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
