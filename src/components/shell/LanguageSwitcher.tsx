"use client";

import { useEffect, useRef, useState } from "react";

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
  const [compactOpen, setCompactOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!compactOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setCompactOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () =>
      document.removeEventListener("pointerdown", handlePointerDown);
  }, [compactOpen]);

  return (
    <div
      ref={rootRef}
      className={`sl-language-switcher ${
        compactOpen ? "is-compact-open" : ""
      }`}
      role="group"
      aria-label={text.languagePickerTitle}
    >
      {/* Compact trigger: only rendered visible by CSS on narrow viewports,
          where the full row below doesn't fit next to the search bar. */}
      <button
        type="button"
        className="sl-language-compact-trigger"
        onClick={() => setCompactOpen((value) => !value)}
        aria-expanded={compactOpen}
        aria-label={text.languagePickerTitle}
      >
        {LANGUAGE_LABELS[language]}
      </button>

      <div className="sl-language-options">
        {LANGUAGE_ORDER.map((option) => (
          <button
            key={option}
            type="button"
            className={`sl-language-option ${
              option === language ? "is-selected" : ""
            }`}
            aria-pressed={option === language}
            onClick={() => {
              onLanguageChange(option);
              setCompactOpen(false);
            }}
          >
            {LANGUAGE_LABELS[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
