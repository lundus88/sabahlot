export type GpsTargetMemory = {
  lat: number;
  lng: number;
  label?: string;
  source: "key-in" | "map" | "ar";
  savedAt: string;
};

export const GPS_TARGET_MEMORY_KEY = "sabahlot:gps-target:v1";

function isBrowser() {
  return typeof window !== "undefined";
}

export function isValidGpsTarget(value: unknown): value is GpsTargetMemory {
  if (!value || typeof value !== "object") return false;

  const target = value as Partial<GpsTargetMemory>;

  return (
    typeof target.lat === "number" &&
    typeof target.lng === "number" &&
    Number.isFinite(target.lat) &&
    Number.isFinite(target.lng) &&
    target.lat >= -90 &&
    target.lat <= 90 &&
    target.lng >= -180 &&
    target.lng <= 180
  );
}

export function saveGpsTargetMemory(
  target: Omit<GpsTargetMemory, "savedAt"> & { savedAt?: string }
): boolean {
  if (!isBrowser()) return false;

  const nextTarget: GpsTargetMemory = {
    ...target,
    savedAt: target.savedAt ?? new Date().toISOString(),
  };

  if (!isValidGpsTarget(nextTarget)) return false;

  try {
    window.sessionStorage.setItem(
      GPS_TARGET_MEMORY_KEY,
      JSON.stringify(nextTarget)
    );
    return true;
  } catch {
    return false;
  }
}

export function readGpsTargetMemory(): GpsTargetMemory | null {
  if (!isBrowser()) return null;

  try {
    const raw = window.sessionStorage.getItem(GPS_TARGET_MEMORY_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!isValidGpsTarget(parsed)) return null;

    return parsed;
  } catch {
    return null;
  }
}
