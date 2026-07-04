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

export function saveGpsTargetMemory(
  target: Omit<GpsTargetMemory, "savedAt"> & {
    savedAt?: string;
  },
): boolean {
  if (!isBrowser()) return false;

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
    window.localStorage.setItem(
      GPS_TARGET_MEMORY_KEY,
      JSON.stringify(nextTarget),
    );
    window.sessionStorage.setItem(
      GPS_TARGET_MEMORY_KEY,
      JSON.stringify(nextTarget),
    );
    return true;
  } catch {
    return false;
  }
}

export function readGpsTargetMemory(): GpsTargetMemory | null {
  if (!isBrowser()) return null;

  try {
    const raw =
      window.localStorage.getItem(GPS_TARGET_MEMORY_KEY) ??
      window.sessionStorage.getItem(GPS_TARGET_MEMORY_KEY);
    if (!raw) return null;

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
