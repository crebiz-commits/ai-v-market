// ════════════════════════════════════════════════════════════════════════════
// 베타 선점 카드 (Land-grab) — BETA_MODE 전용
//   · 영상 카드와 동일한 너비/16:9 비율. 차분한 점선 placeholder (도배돼도 안 거슬리게).
//   · 작은 "BETA" 태그 + "이 칸을 선점하세요" + 옅은 "+ 영상 등록" 텍스트.
//   · 클릭 → 업로드 페이지로 이동 (onUpload).
//
// variant:
//   · "carousel" (기본) — VideoRowCarousel/Cinema 카드와 동일 크기. 메타는 카드 외부.
//   · "ott"            — OTT 마퀴 카드와 동일 크기(w-80 md:w-[30rem]). 정보는 썸네일 내부.
// ════════════════════════════════════════════════════════════════════════════
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface BetaCardProps {
  onUpload: () => void;
  variant?: "carousel" | "ott";
}

export function BetaCard({ onUpload, variant = "carousel" }: BetaCardProps) {
  const { t } = useTranslation();
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onUpload();
  };

  // ── OTT 마퀴 카드와 동일 크기/구조 (정보는 썸네일 내부) ──
  if (variant === "ott") {
    return (
      <button onClick={handleClick} className="flex-shrink-0 w-80 md:w-[30rem] text-left group/card">
        <div className="relative aspect-video rounded-xl overflow-hidden border border-dashed border-white/10 bg-white/[0.03] transition-colors group-hover/card:border-white/25 group-hover/card:bg-white/[0.05]">
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-white/10 text-white/50 text-[10px] font-semibold tracking-wide z-10">BETA</div>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 gap-1.5">
            <p className="text-sm md:text-base font-semibold text-white/70">{t("betaCard.claimSlot")}</p>
            <span className="inline-flex items-center gap-1 text-xs text-white/40 group-hover/card:text-white/75 transition-colors">
              <Plus className="w-3.5 h-3.5" /> {t("betaCard.uploadVideo")}
            </span>
          </div>
        </div>
      </button>
    );
  }

  // ── 캐러셀(시네마) 카드와 동일 크기/구조 (메타는 카드 외부) ──
  return (
    <button onClick={handleClick} className="flex-shrink-0 snap-start w-[42vw] md:w-[15vw] text-left group/card">
      <div className="relative aspect-video rounded-lg overflow-hidden border border-dashed border-white/10 bg-white/[0.03] transition-colors group-hover/card:border-white/25 group-hover/card:bg-white/[0.05]">
        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-white/10 text-white/45 text-[9px] font-semibold tracking-wide z-10">BETA</div>
        <div className="absolute inset-0 flex items-center justify-center text-center px-2">
          <p className="text-xs md:text-sm font-semibold text-white/55 leading-tight">{t("betaCard.claimSlot")}</p>
        </div>
      </div>
      {/* 메타 영역 (카드 외부) — 영상 카드의 제목 자리에 옅은 "+ 영상 등록" 텍스트 */}
      <div className="mt-1.5 px-0.5">
        <span className="inline-flex items-center gap-1 text-[11px] md:text-xs text-white/40 group-hover/card:text-white/70 transition-colors">
          <Plus className="w-3 h-3" /> {t("betaCard.uploadVideo")}
        </span>
      </div>
    </button>
  );
}
