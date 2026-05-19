import type { TFunction } from "i18next";

// DB에 한글로 저장된 카테고리/장르를 i18n 키로 매핑.
// DB 데이터 형식을 유지하면서 표시할 때만 언어 변환.
const CATEGORY_KEY_MAP: Record<string, string> = {
  "전체": "category.all",
  "AI영화": "category.aiMovie",
  "AI드라마": "category.aiDrama",
  "AI애니메이션": "category.aiAnimation",
  "AI다큐멘터리": "category.aiDocumentary",
  "AI뮤직비디오": "category.aiMusicVideo",
  "SF": "category.scifi",
  "액션": "category.action",
  "로맨스": "category.romance",
  "공포": "category.horror",
  "판타지": "category.fantasy",
  "드라마": "category.drama",
  "코미디": "category.comedy",
  "스릴러": "category.thriller",
  "음악": "category.music",
  "다큐멘터리": "category.documentary",
  "애니메이션": "category.animation",
  "자연/풍경": "category.nature",
  "추상": "category.abstract",
  "쇼츠": "category.shorts",
  "광고": "category.ad",
  "튜토리얼": "category.tutorial",
  "기타": "category.other",
  // SearchPage CATEGORY_OPTIONS 영문 코드 호환
  "drama": "category.drama",
  "action": "category.action",
  "comedy": "category.comedy",
  "thriller": "category.thriller",
  "romance": "category.romance",
  "horror": "category.horror",
  "documentary": "category.documentary",
  "animation": "category.animation",
  "music": "category.music",
  "shorts": "category.shorts",
  "ad": "category.ad",
  "tutorial": "category.tutorial",
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
