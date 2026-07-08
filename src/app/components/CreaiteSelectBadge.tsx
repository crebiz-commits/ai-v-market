// CREAITE 셀렉트 배지 — 공식 선정작 인장. isCreaiteSelect(videoId) 로 판별해 노출.
//   variant: "pill"(상세·큰 화면) / "corner"(카드 좌상단 오버레이)
import { Award } from "lucide-react";

export function CreaiteSelectBadge({ variant = "pill", className = "" }: { variant?: "pill" | "corner"; className?: string }) {
  if (variant === "corner") {
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-gradient-to-r from-[#f59e0b] to-[#ec4899] text-white text-[9px] font-black shadow-md ${className}`}
        title="CREAITE 셀렉트 — 공식 선정작"
      >
        <Award className="w-2.5 h-2.5" /> SELECT
      </span>
    );
  }
  return (
    <a
      href="?info=collections&c=creaite-select"
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-[#f59e0b] to-[#ec4899] text-white text-xs font-black shadow-md hover:opacity-90 transition-opacity ${className}`}
      title="CREAITE 셀렉트 — 공식 선정작"
    >
      <Award className="w-3.5 h-3.5" /> CREAITE 셀렉트
    </a>
  );
}
