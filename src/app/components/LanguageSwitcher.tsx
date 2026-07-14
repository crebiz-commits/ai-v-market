// ════════════════════════════════════════════════════════════════════════════
// Phase 35 — 언어 선택기 (헤더에 위치)
// ════════════════════════════════════════════════════════════════════════════

import { Globe, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, ensureLanguageResources, type LanguageCode } from "../i18n";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

interface Props {
  variant?: "icon" | "compact";
}

export function LanguageSwitcher({ variant = "icon" }: Props) {
  const { i18n, t } = useTranslation();
  const current = (i18n.language?.split("-")[0] || "ko") as LanguageCode;

  const changeLanguage = (code: LanguageCode) => {
    // en 번역 번들은 엔트리에서 분리(지연 로드) — 리소스 확보 후 전환(순간 fallback ko 노출 방지)
    void ensureLanguageResources(code).then(() => i18n.changeLanguage(code));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-white/10 text-sm transition-colors"
          aria-label={t("header.selectLanguage")}
        >
          <Globe className="w-4 h-4" />
          {variant === "compact" && (
            <span className="text-xs uppercase">{current}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuLabel>{t("header.selectLanguage")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SUPPORTED_LANGUAGES.map(lang => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => changeLanguage(lang.code)}
            className="flex items-center justify-between cursor-pointer"
          >
            <span>{lang.nativeLabel}</span>
            {current === lang.code && <Check className="w-4 h-4 text-indigo-500" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
