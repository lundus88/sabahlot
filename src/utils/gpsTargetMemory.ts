export type GpsTargetMemory = {
  lat: number;
  lng: number;
  label?: string;
  source: "key-in" | "map" | "ar";
  savedAt: string;
};

export const GPS_TARGET_MEMORY_KEY = "sabahlot:gps-target:v1";

type TargetStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isBrowser() {
  return typeof window !== "undefined";
}

function isValidLatLng(
  lat: number,
  lng: number,
) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function normalizeGpsTarget(raw: string | null): GpsTargetMemory | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as GpsTargetMemory;
    const lat = Number(parsed.lat);
    const lng = Number(parsed.lng);

    if (!isValidLatLng(lat, lng)) return null;

    return {
      lat,
      lng,
      label: parsed.label,
      source: parsed.source,
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function saveGpsTargetMemoryToStorage(
  target: Omit<GpsTargetMemory, "savedAt"> & {
    savedAt?: string;
  },
  localStorageRef: TargetStorage,
  sessionStorageRef?: TargetStorage,
): boolean {
  const lat = Number(target.lat);
  const lng = Number(target.lng);

  if (!isValidLatLng(lat, lng)) return false;

  const nextTarget: GpsTargetMemory = {
    lat,
    lng,
    label: target.label,
    source: target.source,
    savedAt: target.savedAt ?? new Date().toISOString(),
  };

  try {
    localStorageRef.setItem(
      GPS_TARGET_MEMORY_KEY,
      JSON.stringify(nextTarget),
    );

    // Older builds duplicated this value into sessionStorage. That copy is
    // not account-scoped and can leak across A -> logout -> B transitions.
    // The account-scoped localStorage value is the single source of truth.
    sessionStorageRef?.removeItem(GPS_TARGET_MEMORY_KEY);
    return true;
  } catch {
    return false;
  }
}

export function readGpsTargetMemoryFromStorage(
  localStorageRef: TargetStorage,
  sessionStorageRef?: TargetStorage,
): GpsTargetMemory | null {
  try {
    // Never fall back to sessionStorage: it is tab-scoped, not account-scoped.
    // Clear any legacy duplicate left by pre-fix builds while preserving the
    // account-scoped localStorage copy managed by account-local-storage.ts.
    sessionStorageRef?.removeItem(GPS_TARGET_MEMORY_KEY);
    return normalizeGpsTarget(
      localStorageRef.getItem(GPS_TARGET_MEMORY_KEY),
    );
  } catch {
    return null;
  }
}

export function saveGpsTargetMemory(
  target: Omit<GpsTargetMemory, "savedAt"> & {
    savedAt?: string;
  },
): boolean {
  if (!isBrowser()) return false;

  return saveGpsTargetMemoryToStorage(
    target,
    window.localStorage,
    window.sessionStorage,
  );
}

export function readGpsTargetMemory(): GpsTargetMemory | null {
  if (!isBrowser()) return null;

  return readGpsTargetMemoryFromStorage(
    window.localStorage,
    window.sessionStorage,
  );
}
