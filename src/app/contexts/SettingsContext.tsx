// ════════════════════════════════════════════════════════════════════════════
// SettingsContext (2026-05-26)
//
// 콘텐츠 정책·페이월·광고 임계값을 platform_settings 테이블에서 동적 fetch.
// 어드민이 정책 변경 시 다음 마운트(새로고침)부터 자동 반영.
//
// 사용:
//   const settings = useSettings();
//   if (durationSec < settings.minUploadSeconds) { ... }
// ════════════════════════════════════════════════════════════════════════════

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "../utils/supabaseClient";

export interface ContentSettings {
  /** 영상 업로드 최소 길이 (초). 미만이면 차단 */
  minUploadSeconds: number;
  /** 시네마 코너 노출 최소 길이 (초) */
  cinemaMinSeconds: number;
  /** OTT 코너 노출 최소 길이 (초) */
  ottMinSeconds: number;
  /** 비구독자 영상 상세 미리보기 시간 (초) */
  cinemaPreviewSeconds: number;
  /** Pre-roll·Overlay·Post-roll·Bumper 광고 적용 최소 영상 길이 */
  minDurationForPreroll: number;
  /** Mid-roll 광고 적용 최소 영상 길이 */
  minDurationForMidroll: number;
  /** 같은 콘텐츠 신고 N건 누적 시 자동 숨김 임계값 */
  autoHideThreshold: number;
}

const DEFAULTS: ContentSettings = {
  minUploadSeconds: 30,
  cinemaMinSeconds: 60,
  ottMinSeconds: 600,
  cinemaPreviewSeconds: 60,
  minDurationForPreroll: 60,
  minDurationForMidroll: 600,
  autoHideThreshold: 3,
};

const SettingsContext = createContext<ContentSettings>(DEFAULTS);

export function useSettings(): ContentSettings {
  return useContext(SettingsContext);
}

const KEY_MAP: Record<string, keyof ContentSettings> = {
  min_upload_duration_seconds:      "minUploadSeconds",
  cinema_min_duration_seconds:      "cinemaMinSeconds",
  ott_min_duration_seconds:         "ottMinSeconds",
  cinema_preview_seconds:           "cinemaPreviewSeconds",
  min_duration_for_preroll_seconds: "minDurationForPreroll",
  min_duration_for_midroll_seconds: "minDurationForMidroll",
  auto_hide_threshold:              "autoHideThreshold",
};

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ContentSettings>(DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("platform_settings")
          .select("key, value")
          .is("effective_to", null)
          .in("key", Object.keys(KEY_MAP));

        if (cancelled || error || !data) return;

        const next: ContentSettings = { ...DEFAULTS };
        for (const row of data as Array<{ key: string; value: number | string }>) {
          const tsKey = KEY_MAP[row.key];
          if (tsKey) {
            const num = Number(row.value);
            if (Number.isFinite(num)) (next[tsKey] as number) = num;
          }
        }
        if (!cancelled) setSettings(next);
      } catch (err) {
        // 무시 — DEFAULTS 사용 (UX 비차단)
        console.warn("[SettingsContext] platform_settings fetch 실패:", err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <SettingsContext.Provider value={settings}>
      {children}
    </SettingsContext.Provider>
  );
}
