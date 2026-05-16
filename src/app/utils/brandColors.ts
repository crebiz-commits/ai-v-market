// ════════════════════════════════════════════════════════════════════════════
// CREAITE 브랜드 컬러 시스템
// 2026-05-16 OTT 페이지 디자인 채택과 함께 토큰화
// ════════════════════════════════════════════════════════════════════════════

/**
 * 메인 시그니처 그라데이션 (보라 → 핑크 → 황색)
 * OTT 페이지의 "AI가 만든 영화의 시대" 제목에서 채택.
 * 메인 제목/대표 강조 텍스트에 일관 적용.
 */
export const BRAND_GRADIENT = "from-[#a78bfa] via-[#ec4899] to-[#f59e0b]";

/** 메인 그라데이션 적용 텍스트 클래스 (그대로 className에 추가) */
export const BRAND_GRADIENT_TEXT = `bg-gradient-to-r ${BRAND_GRADIENT} bg-clip-text text-transparent`;

/** 보조 그라데이션 (인디고 → 보라) — 버튼/배지 등 */
export const BRAND_GRADIENT_PRIMARY = "from-[#6366f1] to-[#8b5cf6]";
export const BRAND_GRADIENT_PRIMARY_BG = `bg-gradient-to-r ${BRAND_GRADIENT_PRIMARY}`;

/** AI 시네마 배지 (반투명) */
export const BRAND_BADGE_BG = "bg-gradient-to-r from-[#6366f1]/20 to-[#ec4899]/20 border border-[#a78bfa]/30";

// ────────────────────────────────────────────────────────────────────────────
// 장르별 색감 매핑 — OTT 페이지 장르 캐러셀에서 사용
// 각 장르의 무드에 맞는 그라데이션
// ────────────────────────────────────────────────────────────────────────────

export interface GenreStyle {
  /** DB의 category 값 */
  key: string;
  /** 사용자에게 보이는 한국어 라벨 */
  label: string;
  /** 짧은 설명 (캐러셀 헤더 부제) */
  subtitle: string;
  /** Tailwind 그라데이션 클래스 (from-XXX to-XXX) */
  gradient: string;
  /** 이모지 또는 아이콘 식별자 */
  emoji: string;
}

export const GENRE_STYLES: Record<string, GenreStyle> = {
  drama: {
    key: "drama",
    label: "드라마",
    subtitle: "삶을 비추는 깊은 이야기",
    gradient: "from-amber-700 to-orange-900",
    emoji: "🎭",
  },
  action: {
    key: "action",
    label: "액션",
    subtitle: "심장이 뛰는 순간들",
    gradient: "from-red-700 to-rose-900",
    emoji: "💥",
  },
  thriller: {
    key: "thriller",
    label: "스릴러",
    subtitle: "긴장감 가득한 작품",
    gradient: "from-slate-700 to-zinc-900",
    emoji: "🔍",
  },
  romance: {
    key: "romance",
    label: "로맨스",
    subtitle: "마음을 흔드는 사랑 이야기",
    gradient: "from-rose-700 via-pink-600 to-fuchsia-700",
    emoji: "💕",
  },
  comedy: {
    key: "comedy",
    label: "코미디",
    subtitle: "유쾌한 한 편의 시간",
    gradient: "from-yellow-600 to-amber-700",
    emoji: "😂",
  },
  horror: {
    key: "horror",
    label: "호러",
    subtitle: "서늘한 공포의 미학",
    gradient: "from-gray-900 via-slate-900 to-zinc-950",
    emoji: "👻",
  },
  documentary: {
    key: "documentary",
    label: "다큐멘터리",
    subtitle: "진실의 기록",
    gradient: "from-blue-700 to-indigo-900",
    emoji: "🎬",
  },
  animation: {
    key: "animation",
    label: "애니메이션",
    subtitle: "상상력의 캔버스",
    gradient: "from-teal-600 to-emerald-800",
    emoji: "🎨",
  },
  music: {
    key: "music",
    label: "음악",
    subtitle: "선율과 영상의 만남",
    gradient: "from-violet-700 to-purple-900",
    emoji: "🎵",
  },
  // SF 카테고리는 우리 enum에 없지만 sci-fi 추가 가능 — 일단 fantasy로
  fantasy: {
    key: "fantasy",
    label: "판타지",
    subtitle: "마법과 환상의 세계",
    gradient: "from-violet-700 via-purple-700 to-fuchsia-900",
    emoji: "🌌",
  },
};

/** 알 수 없는 장르 fallback */
export const DEFAULT_GENRE_STYLE: GenreStyle = {
  key: "default",
  label: "기타",
  subtitle: "다양한 작품",
  gradient: "from-gray-700 to-gray-900",
  emoji: "🎞️",
};

export function getGenreStyle(category: string | null | undefined): GenreStyle {
  if (!category) return DEFAULT_GENRE_STYLE;
  return GENRE_STYLES[category.toLowerCase()] ?? DEFAULT_GENRE_STYLE;
}
