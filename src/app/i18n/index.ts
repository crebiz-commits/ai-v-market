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
// ⚡ en.json(92KB, gzip 30KB)은 엔트리 번들에서 분리(2026-07-14) — 대다수(한국) 사용자는
//   다운로드·파싱 자체를 하지 않음. 영어 감지/전환 시에만 동적 로드(ensureLanguageResources).
//   fallbackLng=ko 라 로드 완료 전 잠깐 한국어가 보이는 게 최악(키 노출·깨짐 없음).

export const SUPPORTED_LANGUAGES = [
  { code: "ko", label: "한국어", nativeLabel: "한국어" },
  { code: "en", label: "English", nativeLabel: "English" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

/** 해당 언어의 번역 리소스가 로드돼 있음을 보장(en 은 동적 import). 멱등. */
export async function ensureLanguageResources(code: string): Promise<void> {
  const base = (code || "ko").split("-")[0];
  if (base === "en" && !i18n.hasResourceBundle("en", "translation")) {
    const en = (await import("./locales/en.json")).default;
    i18n.addResourceBundle("en", "translation", en, true, true);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ko: { translation: ko },
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

// 감지된 언어가 영어(저장값 en 또는 영어권 브라우저 첫 방문)면 번들을 뒤늦게 로드하고
//   changeLanguage 재호출로 리렌더 — 그 사이엔 fallback(ko)이 표시됨.
if ((i18n.language || "").split("-")[0] === "en") {
  void ensureLanguageResources("en").then(() => i18n.changeLanguage(i18n.language));
}

export default i18n;
