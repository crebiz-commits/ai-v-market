import { motion } from "motion/react";
import { useId } from "react";

interface CreaiteLogoProps {
  className?: string; // 예: "w-9 h-9"
}

/**
 * CREAITE 로고 (디자인 3: Wave Bars + Play ▶)
 * - 5개 이퀄라이저 막대가 위아래로 움직임
 * - 오른쪽 끝 플레이 삼각형이 부드럽게 펄스
 * - 오로라 그라디언트 (보라 → 핑크 → 시안)
 */
export function CreaiteLogo({ className = "w-9 h-9" }: CreaiteLogoProps) {
  const id = useId().replace(/:/g, "_");
  const gradId = `creaite-aurora-${id}`;
  const bars = [30, 60, 80, 50, 70];

  return (
    <svg viewBox="0 0 100 100" className={className} aria-label="CREAITE">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      {bars.map((h, i) => (
        <motion.rect
          key={i}
          x={12 + i * 14}
          width="8"
          rx="4"
          fill={`url(#${gradId})`}
          animate={{
            y: [50 - h / 2, 50 - (h + 15) / 2, 50 - h / 2],
            height: [h, h + 15, h],
          }}
          transition={{
            duration: 1.2 + i * 0.15,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * 0.1,
          }}
        />
      ))}
      <motion.polygon
        points="82,28 82,72 96,50"
        fill={`url(#${gradId})`}
        animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformOrigin: "89px 50px" }}
      />
    </svg>
  );
}
