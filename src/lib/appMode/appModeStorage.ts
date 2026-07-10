export type AppMode = "public" | "advanced";

export const APP_MODE_STORAGE_KEY = "sabahlot_app_mode";

export function getStoredAppMode(): AppMode {
  if (typeof window === "undefined") {
    return "public";
  }

  try {
    return window.localStorage.getItem(APP_MODE_STORAGE_KEY) === "advanced"
      ? "advanced"
      : "public";
  } catch {
    return "public";
  }
}

export function setStoredAppMode(mode: AppMode): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(APP_MODE_STORAGE_KEY, mode);
  } catch {
    // If storage is blocked, the preference simply won't persist across visits.
  }
}
