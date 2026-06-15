import { ArrowLeft } from "lucide-react";

// 공용 뒤로가기/돌아가기 버튼 — 흐린 텍스트 대신 눈에 띄는 칩 스타일(배경+테두리).
// label 미지정 시 "뒤로". margin 등은 className 으로 보강.
export function BackButton({
  onClick,
  label = "뒤로",
  className = "",
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/25 border border-white/15 text-sm font-semibold text-white shadow-sm transition-colors ${className}`}
    >
      <ArrowLeft className="w-4 h-4 shrink-0" />
      {label}
    </button>
  );
}
