// GpsQualityGrade and createFieldGpsId are intentionally duplicated
// (not imported from @/lib/field-gps / @/lib/field-gps.types) -- both of
// those files carry a type-only import from @/app/components/Map for an
// unrelated type (PolygonResult), which this small, standalone utility
// has no reason to pull in. Kept in sync manually; both are small and
// stable (a 4-value grade union, and a UUID-with-fallback generator).
type GpsQualityGrade = "A" | "B" | "C" | "D";

function createFoundPointId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `field-gps-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Must match FieldGpsLite.tsx's own FIELD_GPS_STORAGE_KEY exactly --
// intentionally duplicated rather than imported, since FieldGpsLite.tsx
// does not export it and this constant is small/stable enough that
// duplicating it here is safer than reaching into a component file's
// internals from an unrelated route.
const FIELD_GPS_STORAGE_KEY = "sabahlot:field-gps-lite:v1";

export interface FoundPointRecordInput {
  targetName: string;
  targetLatitude: number;
  targetLongitude: number;
  foundLatitude: number;
  foundLongitude: number;
  distanceDifferenceMeters: number;
  bearingDegrees: number;
  accuracyMeters?: number | null;
  gpsQualityGrade: GpsQualityGrade;
  gpsSignalLabel: string;
  note?: string;
}

function isBrowser() {
  return typeof window !== "undefined";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Appends one found-point record into FieldGpsLite's own persisted state
 * blob (localStorage key FIELD_GPS_STORAGE_KEY), without touching any
 * other field already in that blob (points/foundPoints/trackLog/
 * targetPoint/generatedPolygon all pass through untouched).
 *
 * Exists so a fully separate route with no shared React state with
 * FieldGpsLite -- today, /ar-stakeout -- can contribute a found point
 * that survives navigating back to the map, mirroring gpsTargetMemory.ts's
 * established pattern for carrying the *target* point across the same
 * navigation boundary (bug found 2026-08-18: /ar-stakeout's own
 * "Save Found Point" previously wrote only to a page-local React state
 * with zero persistence, silently losing every captured point the moment
 * the user navigated back to the map).
 *
 * Safe against a stale overwrite race: FieldGpsLite fully unmounts (so
 * its own localStorage-write effect cannot fire) while a separate route
 * like /ar-stakeout is being shown, and re-reads this key fresh on its
 * next mount -- same reasoning gpsTargetMemory.ts already relies on.
 *
 * The written record's shape matches FieldGpsLite.tsx's own
 * sanitizeFoundPointRecord() exactly (verified against its source before
 * writing this file), so it survives that function's round-trip
 * unmodified on the next mount -- `mode` is hardcoded to
 * "AR Find Point Lite" since every caller of this function today is the
 * standalone AR stakeout page, never the phone-GPS-only flow.
 */
export function appendFoundPointToFieldGpsStorage(
  input: FoundPointRecordInput,
): boolean {
  if (!isBrowser()) return false;

  try {
    const raw = window.localStorage.getItem(FIELD_GPS_STORAGE_KEY);
    // Malformed existing JSON (corrupted storage, a future incompatible
    // schema, etc.) must not block this append -- fall back to an empty
    // base and still write a fresh, valid blob, same tolerant posture as
    // FieldGpsLite.tsx's own readPersistedFieldGpsState().
    let parsed: unknown = {};
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
    }
    const base = isRecord(parsed) ? parsed : {};

    const existingRecords = Array.isArray(base.foundPointRecords)
      ? base.foundPointRecords
      : [];

    const now = new Date().toISOString();

    const record = {
      id: createFoundPointId(),
      fieldNoteLabel: "Preliminary Field Assist" as const,
      targetName: input.targetName,
      targetLatitude: input.targetLatitude,
      targetLongitude: input.targetLongitude,
      foundLatitude: input.foundLatitude,
      foundLongitude: input.foundLongitude,
      distanceDifferenceMeters: input.distanceDifferenceMeters,
      bearingDegrees: input.bearingDegrees,
      accuracyMeters: input.accuracyMeters ?? undefined,
      gpsQualityGrade: input.gpsQualityGrade,
      gpsSignalLabel: input.gpsSignalLabel,
      capturedAt: now,
      timestamp: now,
      note: input.note ?? "",
      mode: "AR Find Point Lite" as const,
    };

    const nextState = {
      ...base,
      schemaVersion: 1,
      foundPointRecords: [...existingRecords, record],
      savedAt: now,
    };

    window.localStorage.setItem(
      FIELD_GPS_STORAGE_KEY,
      JSON.stringify(nextState),
    );

    return true;
  } catch {
    return false;
  }
}
