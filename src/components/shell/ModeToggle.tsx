"use client";

import type { AppMode } from "@/lib/appMode/appModeStorage";
import type { AppLanguage } from "@/lib/i18n/appLanguageStorage";
import { getAppText } from "@/lib/i18n/appText";

export default function ModeToggle({
  mode,
  onModeChange,
  language,
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  language: AppLanguage;
}) {
  const text = getAppText(language);
  const isAdvanced = mode === "advanced";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isAdvanced}
      className={`sl-mode-toggle ${isAdvanced ? "is-advanced" : ""}`}
      onClick={() => onModeChange(isAdvanced ? "public" : "advanced")}
      title={
        isAdvanced
          ? text.modeToggle.advancedLabel
          : text.modeToggle.publicLabel
      }
    >
      <span className="sl-mode-toggle-track">
        <span className="sl-mode-toggle-thumb" />
      </span>
      <span className="sl-mode-toggle-label">
        {isAdvanced
          ? text.modeToggle.advancedLabel
          : text.modeToggle.publicLabel}
      </span>
    </button>
  );
}
