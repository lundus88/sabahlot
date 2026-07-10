export type AppLanguage = "en" | "ms" | "zh";

export const APP_LANGUAGE_STORAGE_KEY = "sabahlot_app_language";

const VALID_LANGUAGES: readonly AppLanguage[] = ["en", "ms", "zh"];

export function getStoredLanguage(): AppLanguage {
  if (typeof window === "undefined") {
    return "en";
  }

  try {
    const stored = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
    if (stored && (VALID_LANGUAGES as string[]).includes(stored)) {
      return stored as AppLanguage;
    }
    return "en";
  } catch {
    return "en";
  }
}

export function setStoredLanguage(language: AppLanguage): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // If storage is blocked, the preference simply won't persist across visits.
  }
}
