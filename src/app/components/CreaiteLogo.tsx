import { motion } from "motion/react";
import { useId } from "react";

interface CreaiteLogoProps {
  className?: string; // 예: "w-9 h-9"
  still?: boolean;    // true면 애니메이션 없는 정적 렌더 (하단 nav 등에 사용)
}

/**
 * CREAITE 로고 (디자인 3: Wave Bars + Play ▶)
 * - 5개 이퀄라이저 막대가 위아래로 움직임
 * - 오른쪽 끝 플레이 삼각형이 부드럽게 펄스
 * - 오로라 그라디언트 (보라 → 핑크 → 시안)
 * - still=true: 애니메이션 비활성 (시야 피로 방지용 정적 렌더)
 */
export function CreaiteLogo({ className = "w-9 h-9", still = false }: CreaiteLogoProps) {
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
      {bars.map((h, i) =>
        still ? (
          <rect
            key={i}
            x={12 + i * 14}
            y={50 - h / 2}
            width="8"
            height={h}
            rx="4"
            fill={`url(#${gradId})`}
          />
        ) : (
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
        )
      )}
      {still ? (
        <polygon
          points="82,28 82,72 96,50"
          fill={`url(#${gradId})`}
        />
      ) : (
        <motion.polygon
          points="82,28 82,72 96,50"
          fill={`url(#${gradId})`}
          animate={{ scale: [1, 1.08, 1], opacity: [0.85, 1, 0.85] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "89px 50px" }}
        />
      )}
    </svg>
  );
}
