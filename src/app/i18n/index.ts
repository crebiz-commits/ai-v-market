// ════════════════════════════════════════════════════════════════════════════
// Phase 35 — i18n 설정 (react-i18next)
//
// 지원 언어: 한국어 (ko, 기본값), 영어 (en)
// 추후 추가: 일본어 (ja), 중국어 간체 (zh-CN)
//
// 감지 우선순위: localStorage → 브라우저 navigator.language → fallback ko
// 사용자가 헤더 LanguageSwitcher 로 선택하면 localStorage 에 저장됨
// ════════════════════════════════════════════════════════════════════════════

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import ko from "./locales/ko.json";
import en from "./locales/en.json";

export const SUPPORTED_LANGUAGES = [
  { code: "ko", label: "한국어", nativeLabel: "한국어" },
  { code: "en", label: "English", nativeLabel: "English" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
      en: { translation: en },
    },
    fallbackLng: "ko",
    supportedLngs: SUPPORTED_LANGUAGES.map(l => l.code),
    interpolation: {
      escapeValue: false, // React 가 이미 XSS 처리
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "creaite_lang",
      caches: ["localStorage"],
    },
  });

export default i18n;
