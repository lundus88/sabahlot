export const BETA_NOTICE_STORAGE_KEY = "sabahlot_beta_notice_accepted";

export function hasAcceptedBetaNotice(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.localStorage.getItem(BETA_NOTICE_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

export function acceptBetaNotice(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(BETA_NOTICE_STORAGE_KEY, "true");
  } catch {
    // If storage is blocked, the notice will simply show again next visit.
  }
}
