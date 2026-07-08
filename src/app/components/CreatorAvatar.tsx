import { useState } from "react";

interface CreatorAvatarProps {
  avatarUrl?: string | null;
  name?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const SIZE_PX: Record<NonNullable<CreatorAvatarProps["size"]>, string> = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-base",
  xl: "w-20 h-20 text-xl",
};

// 이름 첫 글자 (한글 1자 또는 영문 1자) — 아바타 URL이 없을 때 fallback
function initial(name?: string | null): string {
  if (!name) return "?";
  const ch = name.trim().charAt(0).toUpperCase();
  return ch || "?";
}

/**
 * 공용 크리에이터 아바타 컴포넌트.
 *
 * - avatarUrl 있으면 이미지 표시
 * - 없거나 로드 실패 시 이름 첫 글자 + 보라색 그라데이션 fallback
 * - 모든 곳에서 동일한 디자인을 사용해 일관성 확보 (Phase 6.6)
 */
export function CreatorAvatar({
  avatarUrl,
  name,
  size = "md",
  className = "",
  onClick,
}: CreatorAvatarProps) {
  const [failed, setFailed] = useState(false);
  const sizeClass = SIZE_PX[size];
  const baseClass = `rounded-full flex items-center justify-center overflow-hidden shrink-0 ${sizeClass} ${className}`;

  const showImage = avatarUrl && !failed;

  if (showImage) {
    return (
      <div className={`${baseClass} bg-[#1c1c1e] border border-white/10`} onClick={onClick}>
        <img
          src={avatarUrl!}
          alt={name || "creator"}
          className="w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${baseClass} bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] text-white font-bold`}
      onClick={onClick}
    >
      {initial(name)}
    </div>
  );
}
