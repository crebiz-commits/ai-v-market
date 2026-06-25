// ════════════════════════════════════════════════════════════════════════════
// CREAITE 브랜드 컬러 시스템
// 2026-05-16 OTT 페이지 디자인 채택과 함께 토큰화
// ════════════════════════════════════════════════════════════════════════════
import { Drama, Swords, Fingerprint, Heart, Laugh, Ghost, Globe, Palette, Music, Wand2, Orbit, Clapperboard, type LucideIcon } from "lucide-react";

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
  /** i18n 키 (`t(labelKey)` 로 표시) */
  labelKey: string;
  /** 부제 i18n 키 (`t(subtitleKey)` 로 표시) */
  subtitleKey: string;
  /** Tailwind 그라데이션 클래스 (from-XXX to-XXX) */
  gradient: string;
  /** 이모지 (레거시 — 일부 화면에서 사용) */
  emoji: string;
  /** Lucide 라인 아이콘 (OTT 카테고리 라벨에서 사용) */
  Icon: LucideIcon;
}

export const GENRE_STYLES: Record<string, GenreStyle> = {
  drama: {
    key: "drama",
    labelKey: "category.drama",
    subtitleKey: "genreSubtitle.drama",
    gradient: "from-amber-700 to-orange-900",
    emoji: "🎭",
    Icon: Drama,
  },
  action: {
    key: "action",
    labelKey: "category.action",
    subtitleKey: "genreSubtitle.action",
    gradient: "from-red-700 to-rose-900",
    emoji: "💥",
    Icon: Swords,
  },
  thriller: {
    key: "thriller",
    labelKey: "category.thriller",
    subtitleKey: "genreSubtitle.thriller",
    gradient: "from-slate-700 to-zinc-900",
    emoji: "🔍",
    Icon: Fingerprint,
  },
  romance: {
    key: "romance",
    labelKey: "category.romance",
    subtitleKey: "genreSubtitle.romance",
    gradient: "from-rose-700 via-pink-600 to-fuchsia-700",
    emoji: "💕",
    Icon: Heart,
  },
  comedy: {
    key: "comedy",
    labelKey: "category.comedy",
    subtitleKey: "genreSubtitle.comedy",
    gradient: "from-yellow-600 to-amber-700",
    emoji: "😂",
    Icon: Laugh,
  },
  horror: {
    key: "horror",
    labelKey: "category.horror",
    subtitleKey: "genreSubtitle.horror",
    gradient: "from-gray-900 via-slate-900 to-zinc-950",
    emoji: "👻",
    Icon: Ghost,
  },
  documentary: {
    key: "documentary",
    labelKey: "category.documentary",
    subtitleKey: "genreSubtitle.documentary",
    gradient: "from-blue-700 to-indigo-900",
    emoji: "🎬",
    Icon: Globe,
  },
  animation: {
    key: "animation",
    labelKey: "category.animation",
    subtitleKey: "genreSubtitle.animation",
    gradient: "from-teal-600 to-emerald-800",
    emoji: "🎨",
    Icon: Palette,
  },
  music: {
    key: "music",
    labelKey: "category.music",
    subtitleKey: "genreSubtitle.music",
    gradient: "from-violet-700 to-purple-900",
    emoji: "🎵",
    Icon: Music,
  },
  fantasy: {
    key: "fantasy",
    labelKey: "category.fantasy",
    subtitleKey: "genreSubtitle.fantasy",
    gradient: "from-violet-700 via-purple-700 to-fuchsia-900",
    emoji: "🌌",
    Icon: Wand2,
  },
  "sci-fi": {
    key: "sci-fi",
    labelKey: "category.scifi",
    subtitleKey: "genreSubtitle.scifi",
    gradient: "from-cyan-700 via-blue-700 to-indigo-900",
    emoji: "🚀",
    Icon: Orbit,
  },
  // 2026-06-25: 자연·풍경/추상 누락 → DEFAULT(기타) 라벨·아이콘으로 표시되고 맨뒤 정렬되던 버그 수정
  "nature": {
    key: "nature",
    labelKey: "genre.nature",
    subtitleKey: "genreSubtitle.other",
    gradient: "from-emerald-700 via-green-700 to-teal-900",
    emoji: "🌄",
    Icon: Globe,
  },
  "abstract": {
    key: "abstract",
    labelKey: "genre.abstract",
    subtitleKey: "genreSubtitle.other",
    gradient: "from-fuchsia-700 via-pink-700 to-rose-900",
    emoji: "🌀",
    Icon: Palette,
  },
};

/** 알 수 없는 장르 fallback */
export const DEFAULT_GENRE_STYLE: GenreStyle = {
  key: "default",
  labelKey: "category.other",
  subtitleKey: "genreSubtitle.other",
  gradient: "from-gray-700 to-gray-900",
  emoji: "🎞️",
  Icon: Clapperboard,
};

// 한글 카테고리명 → GENRE_STYLES 키 매핑 (DB가 한글로 저장됨)
const KOREAN_GENRE_TO_KEY: Record<string, string> = {
  "드라마": "drama",
  "액션": "action",
  "스릴러": "thriller",
  "로맨스": "romance",
  "코미디": "comedy",
  "호러": "horror",
  "공포": "horror",
  "다큐멘터리": "documentary",
  "AI다큐멘터리": "documentary",
  "애니메이션": "animation",
  "AI애니메이션": "animation",
  "음악": "music",
  "뮤직비디오": "music",
  "AI뮤직비디오": "music",
  "판타지": "fantasy",
  "SF": "sci-fi",
  "자연·풍경": "nature",
  "추상": "abstract",
};

export function getGenreStyle(category: string | null | undefined): GenreStyle {
  if (!category) return DEFAULT_GENRE_STYLE;
  const key = KOREAN_GENRE_TO_KEY[category] ?? category.toLowerCase();
  return GENRE_STYLES[key] ?? DEFAULT_GENRE_STYLE;
}
