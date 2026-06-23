// 긴 "사용한 프롬프트"를 3줄로 접고 더보기/접기 토글 (상세페이지 ProductDetail에서 사용)
import { useState } from "react";

export function CollapsiblePrompt({ label, text }: { label: string; text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 140;
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p
        className={`text-xs font-mono bg-background/50 p-2 rounded leading-relaxed text-foreground/80 whitespace-pre-wrap ${
          !open && long ? "line-clamp-3" : ""
        }`}
      >
        {text}
      </p>
      {long && (
        <button
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          {open ? "접기 ▲" : "더보기 ▼"}
        </button>
      )}
    </div>
  );
}
