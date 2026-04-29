import { motion } from "motion/react";

interface CreaiteTextProps {
  className?: string; // 폰트 크기/굵기 등 (예: "text-[17px] font-extrabold")
}

/**
 * CREAITE 브랜드 텍스트 컴포넌트 (조합 D 스타일)
 * - 전체 오로라 그라디언트 (살아 움직임)
 * - A와 I 글자 위에 깜박이는 점 액센트
 */
export function CreaiteText({ className = "text-xl font-extrabold" }: CreaiteTextProps) {
  const auroraStyle = {
    background: "linear-gradient(110deg, #6366f1 0%, #ec4899 50%, #06b6d4 100%)",
    backgroundSize: "200% 200%",
    backgroundClip: "text" as const,
    WebkitBackgroundClip: "text" as const,
    WebkitTextFillColor: "transparent" as const,
    animation: "aurora-text 4s ease infinite",
  };
  return (
    <span className={`relative inline-block tracking-tight leading-none ${className}`}>
      <span style={auroraStyle}>CREAITE</span>
      <span className="absolute top-0 left-0 flex pointer-events-none" aria-hidden="true">
        <span className="invisible">CRE</span>
        <span className="relative">
          <span className="invisible">A</span>
          <motion.span
            className="absolute w-[3px] h-[3px] rounded-full bg-[#06b6d4] left-1/2 -translate-x-1/2"
            style={{ top: "-5px" }}
            animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.5, 1] }}
            transition={{ duration: 1.8, repeat: Infinity }}
          />
        </span>
        <span className="relative">
          <span className="invisible">I</span>
          <motion.span
            className="absolute w-[3px] h-[3px] rounded-full bg-[#ec4899] left-1/2 -translate-x-1/2"
            style={{ top: "-5px" }}
            animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.5, 1] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: 0.4 }}
          />
        </span>
        <span className="invisible">TE</span>
      </span>
      <style>{`
        @keyframes aurora-text {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </span>
  );
}
