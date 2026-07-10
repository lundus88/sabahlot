"use client";

import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import { getAppText } from "@/lib/i18n/appText";

const LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: "EN",
  ms: "BM",
  zh: "中文",
};

const LANGUAGE_ORDER: readonly AppLanguage[] = ["en", "ms", "zh"];

export default function LanguageSwitcher({
  language,
  onLanguageChange,
}: {
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
}) {
  const text = getAppText(language);

  return (
    <div
      className="sl-language-switcher"
      role="group"
      aria-label={text.languagePickerTitle}
    >
      {LANGUAGE_ORDER.map((option) => (
        <button
          key={option}
          type="button"
          className={`sl-language-option ${
            option === language ? "is-selected" : ""
          }`}
          aria-pressed={option === language}
          onClick={() => onLanguageChange(option)}
        >
          {LANGUAGE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
