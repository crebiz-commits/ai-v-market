import type { TFunction } from "i18next";

// 2026-05-27 카테고리/장르 통일:
//   카테고리 = 콘텐츠 형식 (6종): 영화/드라마/애니메이션/다큐멘터리/뮤직비디오/기타
//   장르 = 작품 분위기·테마 (11종): SF/액션/로맨스/공포/판타지/스릴러/드라마/코미디/자연·풍경/추상/기타
// 구 카테고리(AI영화/AI드라마/SF/액션 등 혼재)는 마이그레이션 SQL 로 새 분류에 매핑됨
const CATEGORY_KEY_MAP: Record<string, string> = {
  "전체": "category.all",
  "영화": "category.movie",
  "드라마": "category.drama",
  "애니메이션": "category.animation",
  "다큐멘터리": "category.documentary",
  "뮤직비디오": "category.musicVideo",
  "기타": "category.other",
  // 구 카테고리 호환 (마이그레이션 누락 영상 대비)
  "AI영화": "category.movie",
  "AI드라마": "category.drama",
  "AI애니메이션": "category.animation",
  "AI다큐멘터리": "category.documentary",
  "AI뮤직비디오": "category.musicVideo",
};

const GENRE_KEY_MAP: Record<string, string> = {
  "전체": "genre.all",
  "SF": "genre.scifi",
  "액션": "genre.action",
  "로맨스": "genre.romance",
  "공포": "genre.horror",
  "판타지": "genre.fantasy",
  "스릴러": "genre.thriller",
  "드라마": "genre.drama",
  "코미디": "genre.comedy",
  "자연·풍경": "genre.nature",
  "추상": "genre.abstract",
  "기타": "genre.other",
  // 구 표기 호환
  "자연/풍경": "genre.nature",
};

const AI_TOOL_KEY_MAP: Record<string, string> = {
  "전체": "aiTool.all",
  "기타": "aiTool.other",
};

export function getCategoryLabel(category: string | null | undefined, t: TFunction): string {
  if (!category) return "";
  const key = CATEGORY_KEY_MAP[category];
  return key ? t(key) : category;
}

export function getGenreLabel(genre: string | null | undefined, t: TFunction): string {
  if (!genre) return "";
  const key = GENRE_KEY_MAP[genre];
  return key ? t(key) : genre;
}

export function getAiToolLabel(tool: string | null | undefined, t: TFunction): string {
  if (!tool) return "";
  const key = AI_TOOL_KEY_MAP[tool];
  return key ? t(key) : tool;
}

const LANGUAGE_KEY_MAP: Record<string, string> = {
  "한국어": "language.korean",
  "영어": "language.english",
  "일본어": "language.japanese",
  "중국어": "language.chinese",
  "스페인어": "language.spanish",
  "프랑스어": "language.french",
  "독일어": "language.german",
  "무음/instrumental": "language.instrumental",
  "기타": "language.other",
};

export function getLanguageLabel(lang: string | null | undefined, t: TFunction): string {
  if (!lang) return "";
  const key = LANGUAGE_KEY_MAP[lang];
  return key ? t(key) : lang;
}
