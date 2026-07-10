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
    nonExplicitSupportedLngs: true,  // 'en-US'/'en-GB' 등 지역태그를 'en' 지원으로 인정(영어권 첫 방문이 영어로 시작)
    interpolation: {
      escapeValue: false, // React 가 이미 XSS 처리
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "creaite_lang",
      caches: ["localStorage"],
    },
  });

// <html lang> 동기화 — 스크린리더 음성엔진·검색크롤러·브라우저 번역이 올바른 언어를 인식하도록.
//   index.html 은 lang="ko" 하드코딩이라, 감지/전환 결과를 런타임에 반영해야 함.
if (typeof document !== "undefined") {
  const applyLang = (lng?: string) => { document.documentElement.lang = (lng || "ko").split("-")[0]; };
  applyLang(i18n.language);
  i18n.on("languageChanged", applyLang);
}

export default i18n;
