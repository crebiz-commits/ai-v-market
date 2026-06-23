// ════════════════════════════════════════════════════════════════════════════
// 연령 등급 배지 공용 컴포넌트 (Phase 26)
// 영상 카드/상세에서 등급 표시
// ════════════════════════════════════════════════════════════════════════════
import { Lock } from "lucide-react";
import { useTranslation } from "react-i18next";

export type AgeRating = "all" | "13" | "15" | "19";

interface AgeBadgeProps {
  rating: string | null | undefined;
  size?: "xs" | "sm" | "md";
  showAll?: boolean; // 'all'(전체관람가)도 표시할지
}

const RATING_STYLES: Record<string, { labelKey: string; bg: string; text: string }> = {
  all: { labelKey: "ageBadge.all", bg: "bg-emerald-500/80", text: "text-white" },
  "13": { labelKey: "ageBadge.age13", bg: "bg-amber-500/90", text: "text-white" },
  "15": { labelKey: "ageBadge.age15", bg: "bg-orange-500/90", text: "text-white" },
  "19": { labelKey: "ageBadge.age19", bg: "bg-red-600", text: "text-white" },
};

export function AgeBadge({ rating, size = "sm", showAll = true }: AgeBadgeProps) {
  const { t } = useTranslation();
  const r = rating || "all";
  if (!showAll && r === "all") return null;
  const style = RATING_STYLES[r] || RATING_STYLES.all;

  const sizeClass =
    size === "xs"
      ? "text-[9px] px-1.5 py-0.5"
      : size === "md"
      ? "text-sm px-2.5 py-1"
      : "text-[10px] px-2 py-0.5";

  return (
    <span className={`inline-flex items-center gap-0.5 rounded font-black ${style.bg} ${style.text} ${sizeClass} shadow-sm`}>
      {r === "19" && <Lock className="w-2.5 h-2.5" />}
      {t(style.labelKey)}
    </span>
  );
}

export function isAgeRestricted(rating: string | null | undefined): boolean {
  return rating === "19";
}

export function shouldBlur(rating: string | null | undefined, ageVerified: boolean | null | undefined): boolean {
  return rating === "19" && !ageVerified;
}
