// 쿠팡파트너스 다이나믹 배너 (보조 수익) — 격리 iframe(/coupang.html)로 렌더.
//   env 로 위젯 ID·트래킹코드가 있을 때만 노출. 없으면 null(빈 슬롯 없음).
//   ※ 필수: 공정위 대가성 고지 문구를 배너와 함께 노출(다이나믹 배너=일괄 고지로 충분).
//
// 환경변수(.env / Vercel):
//   VITE_COUPANG_ID=1234567           # 쿠팡파트너스 다이나믹 배너 위젯 id(숫자)
//   VITE_COUPANG_TRACKING=AF1234567   # 배너 트래킹코드
import { useTranslation } from "react-i18next";

const ENV: any = (import.meta as any).env ?? {};
// id·trackingCode 는 페이지에 공개 노출되는 값이라 기본값으로 박아둠(env 로 덮어쓰기 가능).
//   위젯: 다이나믹 배너(캐러셀, 고객관심기반) — 2026-07-01 생성.
const CP_ID = (ENV.VITE_COUPANG_ID as string | undefined) || "1002079";
const CP_TRACKING = (ENV.VITE_COUPANG_TRACKING as string | undefined) || "AF1384938";

export const COUPANG_ACTIVE = !!(CP_ID && CP_TRACKING);

interface CoupangBannerProps {
  height?: number;      // 배너 높이(px). 캐러셀 기본 140
  className?: string;
  compact?: boolean;    // 고지 문구/라벨 최소화
}

export function CoupangBanner({ height = 140, className = "", compact = false }: CoupangBannerProps) {
  const { t } = useTranslation();
  if (!COUPANG_ACTIVE) return null;
  const src = `/coupang.html?id=${encodeURIComponent(CP_ID)}&tc=${encodeURIComponent(CP_TRACKING)}&h=${height}`;
  return (
    <div className={`w-full ${className}`}>
      {!compact && (
        <div className="flex items-center justify-between mb-1 px-0.5">
          <span className="text-[10px] font-bold text-white/45">{t("coupang.label")}</span>
          <span className="text-[9px] font-bold text-white/30 border border-white/15 rounded px-1 py-0.5">AD</span>
        </div>
      )}
      <iframe
        src={src}
        title={t("coupang.label")}
        scrolling="no"
        loading="lazy"
        style={{ width: "100%", height, border: 0, overflow: "hidden", display: "block" }}
      />
      {/* 공정위 대가성 고지 (필수) */}
      <p className="text-[10px] text-white/35 leading-relaxed mt-1.5 px-0.5">
        {t("coupang.disclosure")}
      </p>
    </div>
  );
}
