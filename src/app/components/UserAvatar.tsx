// ════════════════════════════════════════════════════════════════════════════
// 공용 사용자 아바타 — 프로필 사진 표시 (2026-07-03)
//
// 왜: 구글 프로필 사진(lh3.googleusercontent.com)은 referrerPolicy="no-referrer"
//     가 없으면 핫링크가 차단돼 "깨진 이미지" 아이콘이 뜬다. URL이 죽어도 폴백이
//     없으면 깨져 보인다. 이 컴포넌트가 둘 다 처리(referrer 정책 + onError 폴백)하므로
//     아바타는 어디서든 이걸 쓰면 안전하다. (shadcn ui/avatar 와 별개 — 이름 충돌 회피)
//
// 사용: <UserAvatar src={u.avatar_url} name={u.display_name} className="w-12 h-12" />
//   · className 으로 크기 지정(기본 원형·shrink-0 내장).
//   · fallback 미지정 시 이름 첫 글자 → 이름 없으면 사람 아이콘.
// ════════════════════════════════════════════════════════════════════════════
import { useState, useEffect, ReactNode } from "react";
import { User } from "lucide-react";

interface UserAvatarProps {
  src?: string | null;
  name?: string | null;
  /** 크기 등 (예: "w-12 h-12", 테두리 포함 가능). 기본 원형·shrink-0 은 내장 */
  className?: string;
  /** 배경(빈 상태) 클래스. 기본 보라 그라디언트. 채널 등 다른 톤이면 덮어씀 */
  bgClassName?: string;
  /** 폴백 커스텀(아이콘 등). 미지정 시 이름 첫 글자 → 사람 아이콘 */
  fallback?: ReactNode;
  /** 폴백 글자/아이콘 색·크기 조정용 클래스 */
  fallbackClassName?: string;
}

const DEFAULT_BG = "bg-gradient-to-br from-[#6366f1] to-[#8b5cf6]";

export function UserAvatar({ src, name, className = "w-10 h-10", bgClassName = DEFAULT_BG, fallback, fallbackClassName = "" }: UserAvatarProps) {
  const [errored, setErrored] = useState(false);
  useEffect(() => { setErrored(false); }, [src]);  // 다른 유저로 재사용 시 에러상태 초기화

  const initial = name?.trim()?.[0]?.toUpperCase();
  const showImg = !!src && !errored;

  return (
    <div className={`relative rounded-full flex items-center justify-center shrink-0 overflow-hidden ${bgClassName} ${className}`}>
      {/* 폴백(이미지 아래 항상 렌더 → 로드 실패 시 자연스럽게 드러남) */}
      {fallback ?? (
        initial
          ? <span className={`font-bold text-white ${fallbackClassName}`}>{initial}</span>
          : <User className={`text-white ${fallbackClassName || "w-1/2 h-1/2"}`} />
      )}
      {showImg && (
        <img
          src={src as string}
          referrerPolicy="no-referrer"
          alt=""
          loading="lazy"
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}
